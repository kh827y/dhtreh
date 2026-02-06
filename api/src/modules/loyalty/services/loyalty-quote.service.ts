import { BadRequestException } from '@nestjs/common';
import { HoldMode, HoldStatus, WalletType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { safeExecAsync } from '../../../shared/safe-exec';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { getRulesRoot } from '../../../shared/rules-json.util';
import { Mode, QuoteDto } from '../dto/dto';
import { ensureBaseTier } from '../utils/tier-defaults.util';
import { LoyaltyOpsBase } from './loyalty-ops-base.service';
import { allocateByWeight } from './loyalty-ops-math.util';
import type {
  PositionInput,
  QrMeta,
  ResolvedPosition,
} from './loyalty-ops.types';

export class LoyaltyQuoteService extends LoyaltyOpsBase {
  // ===== Levels integration (Wave 2) =====
  // ————— вспомогалки для идемпотентности по существующему hold —————
  private quoteFromExistingHold(
    mode: Mode,
    hold: {
      id: string;
      redeemAmount?: number | null;
      total?: number | null;
      earnPoints?: number | null;
    },
  ) {
    if (mode === Mode.REDEEM) {
      const discountToApply = hold.redeemAmount ?? 0;
      const total = hold.total ?? 0;
      const finalPayable = Math.max(0, total - discountToApply);
      return {
        canRedeem: discountToApply > 0,
        discountToApply,
        pointsToBurn: discountToApply,
        finalPayable,
        holdId: hold.id,
        message:
          discountToApply > 0
            ? `Списываем ${discountToApply} ₽, к оплате ${finalPayable} ₽`
            : 'Недостаточно баллов для списания.',
      };
    }
    // EARN
    const points = hold.earnPoints ?? 0;
    return {
      canEarn: points > 0,
      pointsToEarn: points,
      holdId: hold.id,
      message:
        points > 0
          ? `Начислим ${points} баллов после оплаты.`
          : 'Сумма слишком мала для начисления.',
    };
  }

  // ————— основной расчёт — анти-replay вне транзакции + идемпотентность —————
  async quote(
    dto: QuoteDto & { customerId: string },
    qr?: QrMeta,
    opts?: { dryRun?: boolean; operationDate?: Date | null },
  ) {
    const customer = await this.context.ensureCustomerId(dto.customerId);
    const accrualsBlocked = Boolean(customer.accrualsBlocked);
    const redemptionsBlocked = Boolean(customer.redemptionsBlocked);
    const dryRun = opts?.dryRun ?? false;
    const operationDate = opts?.operationDate ?? null;
    // Ensure the merchant exists to satisfy FK constraints for wallet/holds
    await this.bestEffort(
      'quote: ensure merchant stub',
      async () => {
        await this.prisma.merchant.upsert({
          where: { id: dto.merchantId },
          update: {},
          create: {
            id: dto.merchantId,
            name: dto.merchantId,
            initialName: dto.merchantId,
          },
        });
      },
      'debug',
    );
    await ensureBaseTier(this.prisma, dto.merchantId).catch((err) => {
      logIgnoredError(
        err,
        'LoyaltyQuoteService ensureBaseTier',
        this.logger,
        'debug',
        { merchantId: dto.merchantId },
      );
      return null;
    });
    const {
      redeemCooldownSec,
      earnCooldownSec,
      redeemDailyCap,
      earnDailyCap,
      rulesJson,
    } = await this.getSettings(dto.merchantId);
    const rulesConfig = getRulesRoot(rulesJson) ?? {};
    const allowSameReceipt = Boolean(rulesConfig.allowEarnRedeemSameReceipt);
    const allowSameReceiptForCustomer = allowSameReceipt && !accrualsBlocked;
    const modeUpper = String(dto.mode).toUpperCase();

    let effectiveOutletId = dto.outletId ?? null;
    const deviceCtx = await this.context.resolveDeviceContext(
      dto.merchantId,
      dto.deviceId ?? null,
      effectiveOutletId,
    );
    if (deviceCtx && !effectiveOutletId) {
      effectiveOutletId = deviceCtx.outletId;
    }
    const outletCtx = await this.context.resolveOutletContext(dto.merchantId, {
      outletId: effectiveOutletId,
    });
    effectiveOutletId = outletCtx.outletId ?? effectiveOutletId ?? null;
    const resolvedDeviceId = deviceCtx?.id ?? null;

    let resolvedPositions: ResolvedPosition[] = [];
    const rawPositions = this.sanitizePositions(
      dto.positions as PositionInput[] | undefined,
    );
    if (rawPositions.length) {
      resolvedPositions = await this.resolvePositions(
        dto.merchantId,
        rawPositions,
        customer.id,
      );
    }
    const { total: sanitizedTotal, eligibleAmount } =
      this.computeTotalsFromPositions(
        Math.max(0, Math.floor(Number(dto.total ?? 0))),
        resolvedPositions,
      );
    const { earnBps, redeemLimitBps, tierMinPayment } =
      await this.tiers.resolveTierRatesForCustomer(dto.merchantId, customer.id);

    if (modeUpper === 'REDEEM' && redemptionsBlocked) {
      return {
        canRedeem: false,
        discountToApply: 0,
        pointsToBurn: 0,
        finalPayable: sanitizedTotal,
        holdId: undefined,
        message: 'Списания заблокированы администратором',
      };
    }
    if (modeUpper !== 'REDEEM' && accrualsBlocked) {
      return {
        canEarn: false,
        pointsToEarn: 0,
        holdId: undefined,
        message: 'Начисления заблокированы администратором',
      };
    }
    // 0) если есть qr — сначала смотрим, не существует ли hold с таким qrJti
    if (qr && !dryRun) {
      const existing = await this.prisma.hold.findUnique({
        where: { qrJti: qr.jti },
      });
      if (existing) {
        if (existing.status === HoldStatus.PENDING) {
          if (effectiveOutletId && existing.outletId !== effectiveOutletId) {
            if (
              await this.tryUpdateHoldOutlet(
                existing.id,
                effectiveOutletId,
                'existing-hold',
              )
            ) {
              existing.outletId = effectiveOutletId;
            }
          }
          // идемпотентно отдадим тот же расчёт/holdId
          return this.quoteFromExistingHold(dto.mode, existing);
        }
        // уже зафиксирован или отменён — QR повторно использовать нельзя
        throw new BadRequestException(
          'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
        );
      }

      const isShortCode = qr.kind === 'short';
      const now = new Date();
      if (isShortCode) {
        const nonce = await this.prisma.qrNonce.findUnique({
          where: { jti: qr.jti },
        });
        if (!nonce) {
          throw new BadRequestException('Bad QR token');
        }
        if (nonce.expiresAt && nonce.expiresAt.getTime() <= now.getTime()) {
          await this.bestEffort(
            'quote: cleanup expired qr nonce',
            async () => {
              await this.prisma.qrNonce.delete({ where: { jti: qr.jti } });
            },
            'debug',
          );
          throw new BadRequestException(
            'JWTExpired: "exp" claim timestamp check failed',
          );
        }
        if (nonce.usedAt) {
          const again = await this.prisma.hold.findUnique({
            where: { qrJti: qr.jti },
          });
          if (again) {
            if (again.status === HoldStatus.PENDING) {
              if (effectiveOutletId && again.outletId !== effectiveOutletId) {
                if (
                  await this.tryUpdateHoldOutlet(
                    again.id,
                    effectiveOutletId,
                    'short-qr-nonce-used',
                  )
                ) {
                  again.outletId = effectiveOutletId;
                }
              }
              return this.quoteFromExistingHold(dto.mode, again);
            }
          }
          throw new BadRequestException(
            'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
          );
        }
        const updated = await this.prisma.qrNonce.updateMany({
          where: { jti: qr.jti, usedAt: null },
          data: { usedAt: now },
        });
        if (!updated.count) {
          const again = await this.prisma.hold.findUnique({
            where: { qrJti: qr.jti },
          });
          if (again) {
            if (again.status === HoldStatus.PENDING) {
              if (effectiveOutletId && again.outletId !== effectiveOutletId) {
                if (
                  await this.tryUpdateHoldOutlet(
                    again.id,
                    effectiveOutletId,
                    'short-qr-updated',
                  )
                ) {
                  again.outletId = effectiveOutletId;
                }
              }
              return this.quoteFromExistingHold(dto.mode, again);
            }
            throw new BadRequestException(
              'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
            );
          }
          throw new BadRequestException(
            'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
          );
        }
      } else {
        // 1) «помечаем» QR как использованный ВНЕ транзакции (чтобы метка не откатывалась)
        const marked = await safeExecAsync<unknown>(
          () =>
            this.prisma.qrNonce.create({
              data: {
                jti: qr.jti,
                customerId: customer.id,
                merchantId: dto.merchantId,
                issuedAt: new Date(qr.iat * 1000),
                expiresAt: new Date(qr.exp * 1000),
                usedAt: new Date(),
              },
            }),
          () => null,
          { warn: (msg: string) => this.logger.debug(msg) },
          'quote: mark qr nonce used',
        );
        if (!marked) {
          // гонка: пока мы шли сюда, кто-то другой успел использовать QR — проверим hold ещё раз
          const again = await this.prisma.hold.findUnique({
            where: { qrJti: qr.jti },
          });
          if (again) {
            if (again.status === HoldStatus.PENDING) {
              if (effectiveOutletId && again.outletId !== effectiveOutletId) {
                if (
                  await this.tryUpdateHoldOutlet(
                    again.id,
                    effectiveOutletId,
                    'qr-marked',
                  )
                ) {
                  again.outletId = effectiveOutletId;
                }
              }
              return this.quoteFromExistingHold(dto.mode, again);
            }
            throw new BadRequestException(
              'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
            );
          }
          // иначе считаем, что QR использован
          throw new BadRequestException(
            'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
          );
        }
      }
    }

    if (modeUpper === 'REDEEM') {
      if (!allowSameReceipt && dto.orderId) {
        const [existingEarnHold, existingReceipt] = await Promise.all([
          this.prisma.hold.findFirst({
            where: {
              merchantId: dto.merchantId,
              customerId: customer.id,
              orderId: dto.orderId,
              status: HoldStatus.PENDING,
              mode: 'EARN' as HoldMode,
            },
          }),
          this.prisma.receipt
            .findUnique({
              where: {
                merchantId_orderId: {
                  merchantId: dto.merchantId,
                  orderId: dto.orderId,
                },
              },
            })
            .catch((err) => {
              logIgnoredError(
                err,
                'LoyaltyQuoteService redeem receipt lookup',
                this.logger,
                'debug',
                { merchantId: dto.merchantId, orderId: dto.orderId },
              );
              return null;
            }),
        ]);
        if (
          existingEarnHold ||
          (existingReceipt && Math.max(0, existingReceipt.earnApplied || 0) > 0)
        ) {
          return {
            canRedeem: false,
            discountToApply: 0,
            pointsToBurn: 0,
            finalPayable: sanitizedTotal,
            holdId: undefined,
            message:
              'Нельзя одновременно начислять и списывать баллы в одном чеке.',
          };
        }
      }
      // антифрод: кулдаун и дневной лимит списаний
      if (redeemCooldownSec && redeemCooldownSec > 0) {
        const last = await this.prisma.transaction.findFirst({
          where: {
            merchantId: dto.merchantId,
            customerId: customer.id,
            type: 'REDEEM',
          },
          orderBy: { createdAt: 'desc' },
        });
        if (last) {
          const diffSec = Math.floor(
            (Date.now() - last.createdAt.getTime()) / 1000,
          );
          if (diffSec < redeemCooldownSec) {
            const wait = redeemCooldownSec - diffSec;
            return {
              canRedeem: false,
              discountToApply: 0,
              pointsToBurn: 0,
              finalPayable: sanitizedTotal,
              holdId: undefined,
              message: `Кулдаун на списание: подождите ${wait} сек.`,
            };
          }
        }
      }
      let dailyRedeemLeft: number | null = null;
      if (redeemDailyCap && redeemDailyCap > 0) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const txns = await this.prisma.transaction.findMany({
          where: {
            merchantId: dto.merchantId,
            customerId: customer.id,
            type: 'REDEEM',
            createdAt: { gte: since },
          },
        });
        const used = txns.reduce((sum, t) => sum + Math.max(0, -t.amount), 0);
        dailyRedeemLeft = Math.max(0, redeemDailyCap - used);
        if (dailyRedeemLeft <= 0) {
          return {
            canRedeem: false,
            discountToApply: 0,
            pointsToBurn: 0,
            finalPayable: sanitizedTotal,
            holdId: undefined,
            message: 'Дневной лимит списаний исчерпан.',
          };
        }
      }
      // Проверка: если указан orderId, учитываем уже применённое списание по этому заказу
      let priorRedeemApplied = 0;
      if (dto.orderId) {
        const rcp = await safeExecAsync<{
          redeemApplied?: number | null;
        } | null>(
          () =>
            this.prisma.receipt.findUnique({
              where: {
                merchantId_orderId: {
                  merchantId: dto.merchantId,
                  orderId: dto.orderId,
                },
              },
            }),
          () => null,
          { warn: (msg: string) => this.logger.debug(msg) },
          'quote: load receipt for prior redeem',
        );
        if (rcp) priorRedeemApplied = Math.max(0, rcp.redeemApplied || 0);
      }
      const limit = Math.floor((sanitizedTotal * redeemLimitBps) / 10000);
      const remainingByOrder = Math.max(0, limit - priorRedeemApplied);
      if (dto.orderId && remainingByOrder <= 0) {
        return {
          canRedeem: false,
          discountToApply: 0,
          pointsToBurn: 0,
          finalPayable: sanitizedTotal,
          holdId: undefined,
          message: 'По этому заказу уже списаны максимальные баллы.',
        };
      }
      const capLeft =
        dailyRedeemLeft != null ? dailyRedeemLeft : Number.MAX_SAFE_INTEGER;
      const allowedByMinPayment =
        tierMinPayment != null
          ? Math.max(
              0,
              sanitizedTotal - tierMinPayment - Math.max(0, priorRedeemApplied),
            )
          : Number.MAX_SAFE_INTEGER;
      const manualRedeemAmount = this.sanitizeManualAmount(
        dto.redeemAmount ?? null,
      );
      const manualRedeemCap =
        manualRedeemAmount != null && manualRedeemAmount > 0
          ? manualRedeemAmount
          : Number.MAX_SAFE_INTEGER;
      const computeRedeemQuote = (walletBalance: number) => {
        const discountToApply = Math.min(
          walletBalance,
          remainingByOrder || limit,
          capLeft,
          allowedByMinPayment,
          manualRedeemCap,
        );
        const itemsForCalc = resolvedPositions.map((item) => ({
          ...item,
          earnPoints: 0,
          redeemAmount: 0,
        }));
        let appliedRedeem = Math.max(
          0,
          Math.floor(Number(discountToApply) || 0),
        );
        let postEarnPoints = 0;
        let postEarnOnAmount = 0;
        if (itemsForCalc.length) {
          postEarnPoints = this.applyEarnAndRedeemToItems(
            itemsForCalc,
            allowSameReceiptForCustomer ? earnBps : 0,
            discountToApply,
            { allowEarn: allowSameReceiptForCustomer },
          );
          appliedRedeem = itemsForCalc.reduce(
            (sum, item) => sum + Math.max(0, item.redeemAmount || 0),
            0,
          );
          postEarnOnAmount = itemsForCalc.reduce(
            (sum, item) =>
              sum +
              Math.max(0, item.amount - Math.max(0, item.redeemAmount || 0)),
            0,
          );
        } else if (allowSameReceiptForCustomer) {
          appliedRedeem = Math.max(0, Math.floor(Number(discountToApply) || 0));
          const finalPayable = Math.max(0, sanitizedTotal - appliedRedeem);
          const earnBaseOnCash = Math.min(finalPayable, eligibleAmount);
          const eligibleByMin = !(
            tierMinPayment != null && finalPayable < tierMinPayment
          );
          if (eligibleByMin && earnBaseOnCash > 0) {
            postEarnOnAmount = earnBaseOnCash;
            postEarnPoints = Math.floor((earnBaseOnCash * earnBps) / 10000);
          }
        } else {
          appliedRedeem = Math.max(0, Math.floor(Number(discountToApply) || 0));
        }
        const finalPayable = Math.max(0, sanitizedTotal - appliedRedeem);
        return {
          canRedeem: appliedRedeem > 0,
          discountToApply: appliedRedeem,
          pointsToBurn: appliedRedeem,
          finalPayable,
          message:
            appliedRedeem > 0
              ? `Списываем ${appliedRedeem} ₽, к оплате ${finalPayable} ₽`
              : 'Недостаточно баллов для списания.',
          postEarnPoints,
          postEarnOnAmount,
          positions: itemsForCalc.length ? itemsForCalc : resolvedPositions,
        };
      };

      if (dryRun) {
        const walletBalance =
          (
            await this.prisma.wallet.findFirst({
              where: {
                customerId: customer.id,
                merchantId: dto.merchantId,
                type: WalletType.POINTS,
              },
            })
          )?.balance ?? 0;
        const calc = computeRedeemQuote(walletBalance);
        return { ...calc, holdId: undefined };
      }

      // 2) дальше — обычный расчёт в транзакции и создание нового hold (уникальный qrJti не даст дубликат)
      return this.prisma.$transaction(async (tx) => {
        // Ensure merchant exists within the same transaction/connection (FK safety)
        await this.bestEffort(
          'quote: ensure merchant stub (tx)',
          async () => {
            await tx.merchant.upsert({
              where: { id: dto.merchantId },
              update: {},
              create: {
                id: dto.merchantId,
                name: dto.merchantId,
                initialName: dto.merchantId,
              },
            });
          },
          'debug',
        );
        let wallet = await tx.wallet.findFirst({
          where: {
            customerId: customer.id,
            merchantId: dto.merchantId,
            type: WalletType.POINTS,
          },
        });
        if (!wallet) {
          wallet = await tx.wallet.create({
            data: {
              customerId: customer.id,
              merchantId: dto.merchantId,
              type: WalletType.POINTS,
              balance: 0,
            },
          });
        }

        const calc = computeRedeemQuote(wallet.balance);
        const positionsForHold = calc.positions ?? resolvedPositions;

        const hold = await tx.hold.create({
          data: {
            id: randomUUID(),
            customerId: customer.id,
            merchantId: dto.merchantId,
            mode: 'REDEEM',
            redeemAmount: calc.discountToApply,
            earnPoints: calc.postEarnPoints ?? 0,
            orderId: dto.orderId,
            total: sanitizedTotal,
            eligibleTotal: eligibleAmount,
            qrJti: qr?.jti ?? null,
            expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
            status: HoldStatus.PENDING,
            outletId: effectiveOutletId,
            staffId: dto.staffId ?? null,
            deviceId: resolvedDeviceId,
            createdAt: operationDate ?? undefined,
          },
        });
        await this.upsertHoldItems(
          tx,
          hold.id,
          dto.merchantId,
          positionsForHold,
        );

        return {
          ...calc,
          holdId: hold.id,
        };
      });
    }

    // ===== EARN =====
    if (!allowSameReceipt && dto.orderId) {
      const [existingRedeemHold, existingReceipt] = await Promise.all([
        this.prisma.hold.findFirst({
          where: {
            merchantId: dto.merchantId,
            customerId: customer.id,
            orderId: dto.orderId,
            status: HoldStatus.PENDING,
            mode: 'REDEEM' as HoldMode,
          },
        }),
        this.prisma.receipt
          .findUnique({
            where: {
              merchantId_orderId: {
                merchantId: dto.merchantId,
                orderId: dto.orderId,
              },
            },
          })
          .catch((err) => {
            logIgnoredError(
              err,
              'LoyaltyQuoteService earn receipt lookup',
              this.logger,
              'debug',
              { merchantId: dto.merchantId, orderId: dto.orderId },
            );
            return null;
          }),
      ]);
      if (
        existingRedeemHold ||
        (existingReceipt && Math.max(0, existingReceipt.redeemApplied || 0) > 0)
      ) {
        return {
          canEarn: false,
          pointsToEarn: 0,
          holdId: undefined,
          message:
            'Нельзя одновременно начислять и списывать баллы в одном чеке.',
        };
      }
    }
    // антифрод: кулдаун и дневной лимит начислений
    if (earnCooldownSec && earnCooldownSec > 0) {
      const last = await this.prisma.transaction.findFirst({
        where: {
          merchantId: dto.merchantId,
          customerId: customer.id,
          type: 'EARN',
          orderId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (last) {
        const diffSec = Math.floor(
          (Date.now() - last.createdAt.getTime()) / 1000,
        );
        if (diffSec < earnCooldownSec) {
          const wait = earnCooldownSec - diffSec;
          return {
            canEarn: false,
            pointsToEarn: 0,
            holdId: undefined,
            message: `Кулдаун на начисление: подождите ${wait} сек.`,
          };
        }
      }
    }
    let dailyEarnLeft: number | null = null;
    if (earnDailyCap && earnDailyCap > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const txns = await this.prisma.transaction.findMany({
        where: {
          merchantId: dto.merchantId,
          customerId: customer.id,
          type: 'EARN',
          orderId: { not: null },
          createdAt: { gte: since },
        },
      });
      const used = txns.reduce((sum, t) => sum + Math.max(0, t.amount), 0);
      dailyEarnLeft = Math.max(0, earnDailyCap - used);
      if (dailyEarnLeft <= 0) {
        return {
          canEarn: false,
          pointsToEarn: 0,
          holdId: undefined,
          message: 'Дневной лимит начислений исчерпан.',
        };
      }
    }
    let points = Math.floor((eligibleAmount * earnBps) / 10000);
    let positionsForHold = resolvedPositions;
    if (resolvedPositions.length) {
      const itemsForCalc = resolvedPositions.map((item) => ({
        ...item,
        earnPoints: 0,
        redeemAmount: 0,
      }));
      const eligibleBps =
        tierMinPayment != null && sanitizedTotal < tierMinPayment ? 0 : earnBps;
      const allowEarn = !(
        tierMinPayment != null && sanitizedTotal < tierMinPayment
      );
      let totalFromItems = this.applyEarnAndRedeemToItems(
        itemsForCalc,
        eligibleBps,
        0,
        { allowEarn },
      );
      if (tierMinPayment != null && sanitizedTotal < tierMinPayment) {
        totalFromItems = 0;
      }
      let cappedTotal = totalFromItems;
      if (dailyEarnLeft != null)
        cappedTotal = Math.min(cappedTotal, dailyEarnLeft);
      if (cappedTotal !== totalFromItems) {
        const weights = itemsForCalc.map((item) =>
          Math.max(
            1,
            Math.floor(
              item.earnPoints != null && Number.isFinite(item.earnPoints)
                ? Math.max(0, item.earnPoints)
                : Math.max(0, item.amount || 0) *
                    Math.max(1, item.promotionMultiplier || 1),
            ),
          ),
        );
        const redistributed = allocateByWeight(weights, cappedTotal);
        redistributed.forEach((value, idx) => {
          itemsForCalc[idx].earnPoints = value;
        });
        totalFromItems = cappedTotal;
      }
      points = totalFromItems;
      positionsForHold = itemsForCalc;
    } else {
      if (tierMinPayment != null && sanitizedTotal < tierMinPayment) {
        points = 0;
      }
      if (dailyEarnLeft != null) points = Math.min(points, dailyEarnLeft);
      if (points < 0) points = 0;
    }

    if (dryRun) {
      return {
        canEarn: points > 0,
        pointsToEarn: points,
        holdId: undefined,
        message:
          points > 0
            ? `Начислим ${points} баллов после оплаты.`
            : 'Сумма слишком мала для начисления.',
      };
    }

    return this.prisma.$transaction(async (tx) => {
      // Ensure merchant exists within the same transaction/connection (FK safety)
      await this.bestEffort(
        'quote: ensure merchant stub (earn tx)',
        async () => {
          await tx.merchant.upsert({
            where: { id: dto.merchantId },
            update: {},
            create: {
              id: dto.merchantId,
              name: dto.merchantId,
              initialName: dto.merchantId,
            },
          });
        },
        'debug',
      );
      let wallet = await tx.wallet.findFirst({
        where: {
          customerId: customer.id,
          merchantId: dto.merchantId,
          type: WalletType.POINTS,
        },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            customerId: customer.id,
            merchantId: dto.merchantId,
            type: WalletType.POINTS,
            balance: 0,
          },
        });
      }

      const hold = await tx.hold.create({
        data: {
          id: randomUUID(),
          customerId: customer.id,
          merchantId: dto.merchantId,
          mode: 'EARN',
          earnPoints: points,
          orderId: dto.orderId,
          total: sanitizedTotal,
          eligibleTotal: eligibleAmount,
          qrJti: qr?.jti ?? null,
          expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
          status: HoldStatus.PENDING,
          outletId: effectiveOutletId,
          staffId: dto.staffId ?? null,
          deviceId: resolvedDeviceId,
          createdAt: operationDate ?? undefined,
        },
      });
      await this.upsertHoldItems(tx, hold.id, dto.merchantId, positionsForHold);

      return {
        canEarn: points > 0,
        pointsToEarn: points,
        holdId: hold.id,
        message:
          points > 0
            ? `Начислим ${points} баллов после оплаты.`
            : 'Сумма слишком мала для начисления.',
      };
    });
  }
}
