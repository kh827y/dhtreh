import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  HoldStatus,
  LedgerAccount,
  Prisma,
  PromotionRewardType,
  TxnType,
  WalletType,
} from '@prisma/client';
import type { PromoCodeApplyResult } from '../../promocodes/promocodes.service';
import type { StaffMotivationSettingsNormalized } from '../../staff-motivation/staff-motivation.engine';
import type { StaffNotificationPayload } from '../../telegram/staff-notifications.service';
import { safeExecAsync } from '../../../shared/safe-exec';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { getRulesRoot } from '../../../shared/rules-json.util';
import { LoyaltyOpsBase } from './loyalty-ops-base.service';
import { allocateByWeight, allocateProRata } from './loyalty-ops-math.util';
import type {
  OptionalModelsClient,
  PositionInput,
  ResolvedPosition,
} from './loyalty-ops.types';

export class LoyaltyCommitService extends LoyaltyOpsBase {
  async commit(
    holdId: string,
    orderId: string,
    receiptNumber: string | undefined,
    requestId: string | undefined,
    opts?: {
      promoCode?: { promoCodeId: string; code?: string | null };
      operationDate?: Date | null;
      manualEarnPoints?: number | null;
      manualRedeemAmount?: number | null;
      positions?: PositionInput[] | null;
      expectedMerchantId?: string | null;
    },
  ) {
    const hold = await this.prisma.hold.findUnique({
      where: { id: holdId },
      include: { items: true },
    });
    if (!hold) throw new BadRequestException('Hold not found');
    const expectedMerchantId = opts?.expectedMerchantId
      ? String(opts.expectedMerchantId).trim()
      : '';
    if (expectedMerchantId && hold.merchantId !== expectedMerchantId) {
      throw new ForbiddenException('Hold belongs to another merchant');
    }
    if (hold.expiresAt && hold.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Код истёк по времени. Попросите клиента обновить его в приложении и попробуйте ещё раз.',
      );
    }
    const context = await this.context.ensureCustomerContext(
      hold.merchantId,
      hold.customerId,
    );
    const accrualsBlocked = Boolean(context.accrualsBlocked);
    const redemptionsBlocked = Boolean(context.redemptionsBlocked);
    const operationDate = opts?.operationDate ?? null;
    const operationDateObj = operationDate ?? new Date();
    const operationTimestamp = operationDateObj.getTime();
    const manualRedeemOverride =
      opts?.manualRedeemAmount == null
        ? null
        : Math.max(0, Math.floor(Number(opts.manualRedeemAmount ?? 0) || 0));
    const manualEarnOverride =
      opts?.manualEarnPoints == null
        ? null
        : Math.max(0, Math.floor(Number(opts.manualEarnPoints ?? 0) || 0));

    if (hold.status !== HoldStatus.PENDING) {
      // Идемпотентность: если чек уже есть по этому заказу — возвращаем успех
      const existing = await this.prisma.receipt.findUnique({
        where: { merchantId_orderId: { merchantId: hold.merchantId, orderId } },
      });
      if (existing) {
        return {
          ok: true,
          customerId: context.customerId,
          alreadyCommitted: true,
          receiptId: existing.id,
          redeemApplied: existing.redeemApplied,
          earnApplied: existing.earnApplied,
        };
      }
      throw new ConflictException('Hold already finished');
    }
    if (hold.orderId && hold.orderId !== orderId) {
      throw new ConflictException('Hold already bound to another order');
    }

    if (accrualsBlocked && hold.mode === 'EARN') {
      throw new BadRequestException('Начисления заблокированы администратором');
    }
    if (redemptionsBlocked && hold.mode === 'REDEEM') {
      throw new BadRequestException('Списания заблокированы администратором');
    }
    if (
      accrualsBlocked &&
      manualEarnOverride != null &&
      manualEarnOverride > 0
    ) {
      throw new BadRequestException('Начисления заблокированы администратором');
    }
    if (
      redemptionsBlocked &&
      manualRedeemOverride != null &&
      manualRedeemOverride > 0
    ) {
      throw new BadRequestException('Списания заблокированы администратором');
    }

    const positionsOverrideInput = this.sanitizePositions(
      (opts?.positions as PositionInput[]) ?? [],
    );
    const positionsOverrideResolved = positionsOverrideInput.length
      ? await this.resolvePositions(
          hold.merchantId,
          positionsOverrideInput,
          hold.customerId,
        )
      : [];
    const fallbackHoldTotal = Math.max(0, Math.floor(Number(hold.total ?? 0)));
    let effectiveTotal = fallbackHoldTotal;
    let effectiveEligible = Math.max(
      0,
      Math.floor(
        Number(
          hold.eligibleTotal != null ? hold.eligibleTotal : (hold.total ?? 0),
        ),
      ),
    );
    if (positionsOverrideResolved.length) {
      const totals = this.computeTotalsFromPositions(
        fallbackHoldTotal,
        positionsOverrideResolved,
      );
      effectiveTotal = totals.total;
      effectiveEligible = totals.eligibleAmount;
    } else if (effectiveTotal > 0) {
      effectiveEligible = Math.min(effectiveEligible, effectiveTotal);
    }

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId: hold.customerId,
        merchantId: hold.merchantId,
        type: WalletType.POINTS,
      },
    });
    if (!wallet) throw new BadRequestException('Wallet not found');

    try {
      return await this.prisma.$transaction(async (tx) => {
        let staffMotivationSettings: StaffMotivationSettingsNormalized | null =
          null;
        let staffMotivationIsFirstPurchase = false;
        if (hold.staffId) {
          try {
            staffMotivationSettings = await this.staffMotivation.getSettings(
              tx,
              hold.merchantId,
            );
            if (staffMotivationSettings.enabled) {
              const previousPurchases = await tx.receipt.count({
                where: {
                  merchantId: hold.merchantId,
                  customerId: hold.customerId,
                  canceledAt: null,
                },
              });
              staffMotivationIsFirstPurchase = previousPurchases === 0;
            }
          } catch (err) {
            logIgnoredError(
              err,
              'LoyaltyCommitService staff motivation',
              this.logger,
              'debug',
            );
            staffMotivationSettings = null;
            staffMotivationIsFirstPurchase = false;
          }
        }
        // Идемпотентность: если чек уже есть — ничего не делаем
        const existing = await tx.receipt.findUnique({
          where: {
            merchantId_orderId: { merchantId: hold.merchantId, orderId },
          },
        });
        if (existing) {
          return {
            ok: true,
            customerId: context.customerId,
            alreadyCommitted: true,
            receiptId: existing.id,
            redeemApplied: existing.redeemApplied,
            earnApplied: existing.earnApplied,
          };
        }
        const claim = await tx.hold.updateMany({
          where: {
            id: hold.id,
            status: HoldStatus.PENDING,
            OR: [{ orderId: null }, { orderId }],
          },
          data: { status: HoldStatus.COMMITTED, orderId },
        });
        if (claim.count === 0) {
          const current = await tx.hold.findUnique({
            where: { id: hold.id },
            select: { status: true, orderId: true },
          });
          if (current?.orderId && current.orderId !== orderId) {
            throw new ConflictException('Hold already bound to another order');
          }
          if (current?.status && current.status !== HoldStatus.PENDING) {
            const committed = await tx.receipt.findUnique({
              where: {
                merchantId_orderId: { merchantId: hold.merchantId, orderId },
              },
            });
            if (committed) {
              return {
                ok: true,
                customerId: context.customerId,
                alreadyCommitted: true,
                receiptId: committed.id,
                redeemApplied: committed.redeemApplied,
                earnApplied: committed.earnApplied,
              };
            }
            throw new ConflictException('Hold already finished');
          }
        }

        // Накапливаем применённые суммы для чека
        let appliedRedeem = 0;
        let appliedEarn = 0;
        let redeemTxId: string | null = null;
        let earnTxId: string | null = null;
        const createdEarnLotIds: string[] = [];
        let promoResult: PromoCodeApplyResult | null = null;
        if (opts?.promoCode && hold.customerId && manualEarnOverride == null) {
          if (accrualsBlocked) {
            throw new BadRequestException(
              'Начисления заблокированы администратором',
            );
          }
          promoResult = await this.promoCodes.apply(tx, {
            promoCodeId: opts.promoCode.promoCodeId,
            merchantId: hold.merchantId,
            customerId: hold.customerId,
            staffId: hold.staffId ?? null,
            outletId: hold.outletId ?? null,
            orderId,
          });
          if (!promoResult) {
            throw new BadRequestException('Промокод недоступен');
          }
        }
        const holdItemsRaw = (hold as { items?: unknown }).items;
        const hasSavedItems =
          Array.isArray(holdItemsRaw) && holdItemsRaw.length > 0;
        const shouldOverrideItems =
          positionsOverrideResolved.length > 0 && !hasSavedItems;
        const holdItemsSource: unknown[] = Array.isArray(holdItemsRaw)
          ? holdItemsRaw
          : [];

        const holdItemsResolved: ResolvedPosition[] = shouldOverrideItems
          ? positionsOverrideResolved.map((item) => ({
              ...item,
              earnPoints:
                item.earnPoints != null
                  ? Math.max(0, Math.floor(Number(item.earnPoints)))
                  : 0,
              redeemAmount:
                item.redeemAmount != null
                  ? Math.max(0, Math.floor(Number(item.redeemAmount)))
                  : 0,
            }))
          : holdItemsSource.map((item) => {
              const record =
                item && typeof item === 'object' && !Array.isArray(item)
                  ? (item as Record<string, unknown>)
                  : {};
              const metaValue = record.metadata;
              const meta =
                metaValue &&
                typeof metaValue === 'object' &&
                !Array.isArray(metaValue)
                  ? (metaValue as Record<string, unknown>)
                  : {};
              const promoIds = Array.isArray(meta.promotionIds)
                ? meta.promotionIds.filter(
                    (value): value is string =>
                      typeof value === 'string' && value.trim().length > 0,
                  )
                : undefined;
              const basePriceRaw = Number(meta.basePrice ?? NaN);
              const basePrice =
                Number.isFinite(basePriceRaw) && basePriceRaw >= 0
                  ? basePriceRaw
                  : undefined;
              const pointPromotionId =
                typeof meta.pointPromotionId === 'string'
                  ? meta.pointPromotionId
                  : null;
              const promoBonusRaw = Number(meta.promotionPointsBonus ?? NaN);
              const promotionPointsBonus = Number.isFinite(promoBonusRaw)
                ? promoBonusRaw
                : undefined;
              const productId =
                typeof record.productId === 'string'
                  ? record.productId
                  : undefined;
              const categoryId =
                typeof record.categoryId === 'string'
                  ? record.categoryId
                  : undefined;
              const externalId =
                typeof record.externalId === 'string'
                  ? record.externalId
                  : undefined;
              const name =
                typeof record.name === 'string' ? record.name : undefined;
              const promotionId =
                typeof record.promotionId === 'string'
                  ? record.promotionId
                  : null;
              const promoMultiplierRaw = record.promotionMultiplier;
              const promotionMultiplier =
                promoMultiplierRaw &&
                Number.isFinite(Number(promoMultiplierRaw))
                  ? Number(promoMultiplierRaw) / 10000
                  : 1;
              return {
                productId,
                categoryId,
                resolvedProductId: productId ?? null,
                resolvedCategoryId: categoryId ?? null,
                externalId,
                name,
                qty: Number(record.qty ?? 0),
                price: Number(record.price ?? 0),
                amount: Math.max(0, Number(record.amount ?? 0)),
                promotionId,
                promotionMultiplier,
                appliedPromotionIds: promoIds,
                appliedPointPromotionId: pointPromotionId,
                promotionPointsBonus,
                accruePoints:
                  record.accruePoints != null
                    ? Boolean(record.accruePoints)
                    : true,
                earnPoints:
                  record.earnPoints != null
                    ? Math.max(0, Math.floor(Number(record.earnPoints)))
                    : 0,
                redeemAmount:
                  record.redeemAmount != null
                    ? Math.max(0, Math.floor(Number(record.redeemAmount)))
                    : 0,
                basePrice,
              };
            });

        if (shouldOverrideItems) {
          await this.upsertHoldItems(
            tx,
            hold.id,
            hold.merchantId,
            holdItemsResolved,
          );
        }

        // REDEEM
        const redeemTarget = manualRedeemOverride ?? hold.redeemAmount;
        if (hold.mode === 'REDEEM' && redeemTarget > 0) {
          const fresh = await tx.wallet.findUnique({
            where: { id: wallet.id },
          });
          let amount = Math.min(fresh!.balance, redeemTarget);
          appliedRedeem = amount;
          if (amount > 0) {
            let updated = await tx.wallet.updateMany({
              where: { id: wallet.id, balance: { gte: amount } },
              data: { balance: { decrement: amount } },
            });
            if (!updated.count) {
              const retryFresh = await tx.wallet.findUnique({
                where: { id: wallet.id },
              });
              amount = Math.min(retryFresh?.balance ?? 0, redeemTarget);
              appliedRedeem = amount;
              if (amount > 0) {
                updated = await tx.wallet.updateMany({
                  where: { id: wallet.id, balance: { gte: amount } },
                  data: { balance: { decrement: amount } },
                });
              }
            }
            if (!updated.count) {
              throw new BadRequestException('Insufficient points');
            }
          }
          const redeemTx = await tx.transaction.create({
            data: {
              customerId: hold.customerId,
              merchantId: hold.merchantId,
              type: TxnType.REDEEM,
              amount: -amount,
              orderId,
              outletId: hold.outletId,
              staffId: hold.staffId,
              deviceId: hold.deviceId ?? null,
              createdAt: operationDateObj,
            },
          });
          redeemTxId = redeemTx.id;
          // Earn lots consumption (optional)
          if (this.config.isEarnLotsEnabled() && amount > 0) {
            await this.consumeLots(
              tx,
              hold.merchantId,
              hold.customerId,
              amount,
              { orderId },
            );
          }
          // Ledger mirror (optional)
          if (this.config.isLedgerEnabled() && amount > 0) {
            await tx.ledgerEntry.create({
              data: {
                merchantId: hold.merchantId,
                customerId: hold.customerId,
                debit: LedgerAccount.CUSTOMER_BALANCE,
                credit: LedgerAccount.MERCHANT_LIABILITY,
                amount,
                orderId,
                outletId: hold.outletId ?? null,
                staffId: hold.staffId ?? null,
                deviceId: hold.deviceId ?? null,
                meta: { mode: 'REDEEM' },
                createdAt: operationDateObj,
              },
            });
            this.metrics.inc('loyalty_ledger_entries_total', {
              type: 'redeem',
            });
          }
        }
        const baseEarnFromHold = accrualsBlocked
          ? 0
          : manualEarnOverride != null
            ? manualEarnOverride
            : Math.max(0, Math.floor(Number(hold.earnPoints || 0)));
        const promoBonus =
          accrualsBlocked || manualEarnOverride != null
            ? 0
            : promoResult
              ? Math.max(0, Math.floor(Number(promoResult.pointsIssued || 0)))
              : 0;
        // Доп. начисление при списании, если включено allowEarnRedeemSameReceipt
        let extraEarn = 0;
        if (!accrualsBlocked) {
          const msRules = await safeExecAsync(
            () =>
              tx.merchantSettings.findUnique({
                where: { merchantId: hold.merchantId },
              }),
            async () => null,
            { warn: this.logger.debug.bind(this.logger) },
            'commit: load merchant settings for extra earn',
          );
          const rules = getRulesRoot(msRules?.rulesJson) ?? {};
          const allowSame = Boolean(rules.allowEarnRedeemSameReceipt);
          if (
            manualEarnOverride == null &&
            hold.mode === 'REDEEM' &&
            allowSame &&
            baseEarnFromHold === 0
          ) {
            const { earnDailyCap } = await this.getSettings(hold.merchantId);
            let earnBpsEff = 0;
            let tierMinPaymentLocal: number | null = null;
            const tierRates = await safeExecAsync(
              () =>
                this.tiers.resolveTierRatesForCustomer(
                  hold.merchantId,
                  hold.customerId,
                  tx,
                ),
              async () => null,
              { warn: this.logger.debug.bind(this.logger) },
              'commit: resolve tier rates for extra earn',
            );
            if (tierRates) {
              earnBpsEff = tierRates.earnBps;
              tierMinPaymentLocal = tierRates.tierMinPayment;
            }
            const appliedRedeemAmt = Math.max(0, appliedRedeem);
            const total = effectiveTotal;
            const eligible = effectiveEligible;
            const finalPayable = Math.max(0, total - appliedRedeemAmt);
            const earnBaseOnCash = Math.min(finalPayable, eligible);
            if (
              !(
                tierMinPaymentLocal != null &&
                finalPayable < tierMinPaymentLocal
              ) &&
              earnBaseOnCash > 0
            ) {
              let pts = Math.floor((earnBaseOnCash * earnBpsEff) / 10000);
              if (pts > 0 && earnDailyCap && earnDailyCap > 0) {
                const since = new Date(
                  operationTimestamp - 24 * 60 * 60 * 1000,
                );
                const txns = await tx.transaction.findMany({
                  where: {
                    merchantId: hold.merchantId,
                    customerId: hold.customerId,
                    type: 'EARN',
                    orderId: { not: null },
                    createdAt: { gte: since },
                  },
                });
                const used = txns.reduce(
                  (sum, t) => sum + Math.max(0, t.amount),
                  0,
                );
                const left = Math.max(0, earnDailyCap - used);
                pts = Math.min(pts, left);
              }
              extraEarn = Math.max(0, pts);
            }
          }
        }
        const appliedEarnTotal = baseEarnFromHold + promoBonus + extraEarn;

        if (appliedEarnTotal > 0) {
          // Проверяем, требуется ли задержка начисления. В юнит-тестах tx может не иметь merchantSettings — делаем fallback на this.prisma.
          const settingsClient = tx as OptionalModelsClient;
          const settings = await (
            settingsClient.merchantSettings ?? this.prisma.merchantSettings
          ).findUnique({
            where: { merchantId: hold.merchantId },
          });
          const delayDays = Number(settings?.earnDelayDays || 0) || 0;
          const ttlDays = Number(settings?.pointsTtlDays || 0) || 0;
          appliedEarn = appliedEarnTotal;
          const promoExpireDays = promoResult?.pointsExpireInDays ?? null;

          if (delayDays > 0) {
            // Откладываем начисление: создаём PENDING lot и событие, баланс не трогаем до созревания
            if (this.config.isEarnLotsEnabled() && appliedEarn > 0) {
              const maturesAt = new Date(
                operationTimestamp + delayDays * 24 * 60 * 60 * 1000,
              );
              const earnLot =
                (tx as OptionalModelsClient).earnLot ??
                (this.prisma as OptionalModelsClient).earnLot;
              if (earnLot?.create) {
                if (baseEarnFromHold > 0) {
                  const expiresAtStd =
                    ttlDays > 0
                      ? new Date(
                          maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                        )
                      : null;
                  const createdLot = await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: baseEarnFromHold,
                      consumedPoints: 0,
                      earnedAt: maturesAt,
                      maturesAt,
                      expiresAt: expiresAtStd,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'PENDING',
                      createdAt: operationDateObj,
                    },
                    select: { id: true },
                  });
                  if (createdLot?.id) createdEarnLotIds.push(createdLot.id);
                }
                if (promoBonus > 0) {
                  const promoExpiresAt = promoExpireDays
                    ? new Date(
                        maturesAt.getTime() +
                          promoExpireDays * 24 * 60 * 60 * 1000,
                      )
                    : null;
                  const createdPromoLot = await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: promoBonus,
                      consumedPoints: 0,
                      earnedAt: maturesAt,
                      maturesAt,
                      expiresAt: promoExpiresAt,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'PENDING',
                      createdAt: operationDateObj,
                    },
                    select: { id: true },
                  });
                  if (createdPromoLot?.id)
                    createdEarnLotIds.push(createdPromoLot.id);
                }
                if (extraEarn > 0) {
                  const expiresAtStd =
                    ttlDays > 0
                      ? new Date(
                          maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                        )
                      : null;
                  const createdExtraLot = await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: extraEarn,
                      consumedPoints: 0,
                      earnedAt: maturesAt,
                      maturesAt,
                      expiresAt: expiresAtStd,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'PENDING',
                      createdAt: operationDateObj,
                    },
                    select: { id: true },
                  });
                  if (createdExtraLot?.id)
                    createdEarnLotIds.push(createdExtraLot.id);
                }
              }
            }
            const scheduledPayload: Record<string, unknown> = {
              holdId: hold.id,
              orderId,
              customerId: hold.customerId,
              merchantId: hold.merchantId,
              points: appliedEarn,
              maturesAt: new Date(
                operationTimestamp + delayDays * 24 * 60 * 60 * 1000,
              ).toISOString(),
              outletId: hold.outletId ?? null,
              staffId: hold.staffId ?? null,
              deviceId: hold.deviceId ?? null,
            };
            if (promoResult && opts?.promoCode) {
              scheduledPayload.promoCode = {
                promoCodeId: opts.promoCode.promoCodeId,
                code: opts.promoCode.code ?? null,
                points: promoBonus,
                expiresInDays: promoExpireDays,
              };
            }
            await tx.eventOutbox.create({
              data: {
                merchantId: hold.merchantId,
                eventType: 'loyalty.earn.scheduled',
                createdAt: operationDateObj,
                payload: scheduledPayload as Prisma.InputJsonValue,
              },
            });
          } else {
            // Немедленное начисление
            if (appliedEarn > 0) {
              await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: appliedEarn } },
              });
            }
            const earnTx = await tx.transaction.create({
              data: {
                customerId: hold.customerId,
                merchantId: hold.merchantId,
                type: TxnType.EARN,
                amount: appliedEarn,
                orderId,
                outletId: hold.outletId,
                staffId: hold.staffId,
                deviceId: hold.deviceId ?? null,
                createdAt: operationDateObj,
              },
            });
            earnTxId = earnTx.id;
            // Ledger mirror (optional)
            if (this.config.isLedgerEnabled() && appliedEarn > 0) {
              await tx.ledgerEntry.create({
                data: {
                  merchantId: hold.merchantId,
                  customerId: hold.customerId,
                  debit: LedgerAccount.MERCHANT_LIABILITY,
                  credit: LedgerAccount.CUSTOMER_BALANCE,
                  amount: appliedEarn,
                  orderId,
                  outletId: hold.outletId ?? null,
                  staffId: hold.staffId ?? null,
                  deviceId: hold.deviceId ?? null,
                  meta: { mode: 'EARN' },
                  createdAt: operationDateObj,
                },
              });
              this.metrics.inc('loyalty_ledger_entries_total', {
                type: 'earn',
              });
              this.metrics.inc(
                'loyalty_ledger_amount_total',
                { type: 'earn' },
                appliedEarn,
              );
            }
            // Earn lots (optional)
            if (this.config.isEarnLotsEnabled() && appliedEarn > 0) {
              const earnLot =
                (tx as OptionalModelsClient).earnLot ??
                (this.prisma as OptionalModelsClient).earnLot;
              if (earnLot?.create) {
                if (baseEarnFromHold > 0) {
                  let expires: Date | null = null;
                  if (ttlDays > 0)
                    expires = new Date(
                      operationTimestamp + ttlDays * 24 * 60 * 60 * 1000,
                    );
                  const createdLot = await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: baseEarnFromHold,
                      consumedPoints: 0,
                      earnedAt: operationDateObj,
                      maturesAt: null,
                      expiresAt: expires,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'ACTIVE',
                      createdAt: operationDateObj,
                    },
                    select: { id: true },
                  });
                  if (createdLot?.id) createdEarnLotIds.push(createdLot.id);
                }
                if (promoBonus > 0) {
                  const expiresPromo = promoExpireDays
                    ? new Date(
                        operationTimestamp +
                          promoExpireDays * 24 * 60 * 60 * 1000,
                      )
                    : null;
                  const createdPromoLot = await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: promoBonus,
                      consumedPoints: 0,
                      earnedAt: operationDateObj,
                      maturesAt: null,
                      expiresAt: expiresPromo,
                      orderId: null,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'ACTIVE',
                      createdAt: operationDateObj,
                    },
                    select: { id: true },
                  });
                  if (createdPromoLot?.id)
                    createdEarnLotIds.push(createdPromoLot.id);
                }
                if (extraEarn > 0) {
                  let expires: Date | null = null;
                  if (ttlDays > 0)
                    expires = new Date(
                      operationTimestamp + ttlDays * 24 * 60 * 60 * 1000,
                    );
                  const createdExtraLot = await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: extraEarn,
                      consumedPoints: 0,
                      earnedAt: operationDateObj,
                      maturesAt: null,
                      expiresAt: expires,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'ACTIVE',
                      createdAt: operationDateObj,
                    },
                    select: { id: true },
                  });
                  if (createdExtraLot?.id)
                    createdEarnLotIds.push(createdExtraLot.id);
                }
              }
            }
          }
        }

        await tx.hold.update({
          where: { id: hold.id },
          data: {
            status: HoldStatus.COMMITTED,
            orderId,
            total: effectiveTotal,
            eligibleTotal: effectiveEligible,
          },
        });

        let redeemShares: number[] = [];
        if (holdItemsResolved.length > 0) {
          const plannedRedeem = holdItemsResolved.map((item) =>
            Math.max(0, Math.floor(Number(item.redeemAmount || 0))),
          );
          const plannedTotal = plannedRedeem.reduce(
            (sum, value) => sum + value,
            0,
          );
          const targetRedeem = Math.min(
            Math.max(0, Math.floor(Number(appliedRedeem) || 0)),
            plannedTotal > 0 ? plannedTotal : Number.MAX_SAFE_INTEGER,
          );
          redeemShares =
            plannedTotal > 0
              ? allocateProRata(plannedRedeem, targetRedeem)
              : allocateProRata(
                  holdItemsResolved.map((item) => item.amount),
                  targetRedeem,
                );
        }
        const earnWeights =
          holdItemsResolved.length > 0
            ? holdItemsResolved.map((item, idx) => {
                const explicitEarn =
                  item.earnPoints != null && Number.isFinite(item.earnPoints)
                    ? Math.max(0, Math.floor(item.earnPoints))
                    : null;
                if (explicitEarn && explicitEarn > 0) return explicitEarn;
                return Math.max(
                  0,
                  Math.floor(
                    Math.max(0, item.amount - (redeemShares[idx] ?? 0)) *
                      Math.max(1, item.promotionMultiplier || 1),
                  ),
                );
              })
            : [];
        const earnShares =
          holdItemsResolved.length > 0
            ? allocateByWeight(earnWeights, appliedEarnTotal)
            : [];

        const created = await tx.receipt.create({
          data: {
            merchantId: hold.merchantId,
            customerId: hold.customerId,
            orderId,
            receiptNumber: receiptNumber ?? null,
            total: effectiveTotal,
            eligibleTotal: effectiveEligible,
            redeemApplied: appliedRedeem,
            earnApplied: appliedEarn,
            outletId: hold.outletId ?? null,
            staffId: hold.staffId ?? null,
            deviceId: hold.deviceId ?? null,
            createdAt: operationDateObj,
          },
        });
        if (createdEarnLotIds.length > 0) {
          await tx.earnLot.updateMany({
            where: { id: { in: createdEarnLotIds } },
            data: { receiptId: created.id },
          });
        }

        const receiptItemsCreated: Array<{
          id: string;
          redeemApplied: number;
          earnApplied: number;
          item: ResolvedPosition;
        }> = [];
        for (let idx = 0; idx < holdItemsResolved.length; idx++) {
          const item = holdItemsResolved[idx];
          const redeemAppliedItem = redeemShares[idx] ?? 0;
          const earnAppliedItem = earnShares[idx] ?? 0;
          const receiptItem = await tx.receiptItem.create({
            data: {
              receiptId: created.id,
              merchantId: hold.merchantId,
              productId: item.resolvedProductId ?? null,
              categoryId: item.resolvedCategoryId ?? null,
              externalProvider: null,
              externalId: item.externalId ?? null,
              name: item.name ?? null,
              sku: null,
              barcode: null,
              qty: new Prisma.Decimal(item.qty ?? 0),
              price: new Prisma.Decimal(item.price ?? 0),
              amount: item.amount ?? 0,
              earnApplied: earnAppliedItem,
              redeemApplied: redeemAppliedItem,
              promotionId: item.promotionId ?? null,
              promotionMultiplier:
                item.promotionMultiplier && item.promotionMultiplier > 0
                  ? Math.round(item.promotionMultiplier * 10000)
                  : null,
              metadata:
                item.basePrice != null ||
                item.appliedPromotionIds?.length ||
                item.appliedPointPromotionId ||
                item.promotionPointsBonus != null
                  ? {
                      basePrice: item.basePrice ?? null,
                      promotionIds:
                        item.appliedPromotionIds ??
                        (item.promotionId ? [item.promotionId] : []),
                      pointPromotionId: item.appliedPointPromotionId ?? null,
                      promotionPointsBonus: item.promotionPointsBonus ?? null,
                    }
                  : Prisma.JsonNull,
            },
          });
          receiptItemsCreated.push({
            id: receiptItem.id,
            redeemApplied: redeemAppliedItem,
            earnApplied: earnAppliedItem,
            item,
          });
        }

        const promotionIds = new Set<string>();
        for (const item of holdItemsResolved) {
          const fromMeta = item.appliedPromotionIds ?? [];
          if (fromMeta.length) {
            fromMeta.forEach((id) => promotionIds.add(id));
          } else if (item.promotionId) {
            promotionIds.add(item.promotionId);
          }
        }
        if (promotionIds.size > 0) {
          const promos = await tx.loyaltyPromotion.findMany({
            where: {
              merchantId: hold.merchantId,
              id: { in: Array.from(promotionIds) },
            },
            select: { id: true, rewardType: true },
          });
          const promoTypeMap = new Map(
            promos.map((promo) => [promo.id, promo.rewardType]),
          );
          const metrics = new Map<
            string,
            {
              revenue: number;
              paidAmount: number;
              discountCost: number;
              pointsCost: number;
              purchases: number;
            }
          >();
          for (const item of holdItemsResolved) {
            const qty = Math.max(0, Number(item.qty ?? 0));
            if (!qty) continue;
            const basePrice =
              item.basePrice != null
                ? Math.max(0, Number(item.basePrice))
                : Math.max(0, Number(item.price ?? 0));
            const baseAmount = Math.max(0, Math.round(basePrice * qty));
            const paidAmount = Math.max(
              0,
              Math.floor(Number(item.amount ?? 0)),
            );
            const discountAmount = Math.max(0, baseAmount - paidAmount);
            const appliedIds = item.appliedPromotionIds?.length
              ? item.appliedPromotionIds
              : item.promotionId
                ? [item.promotionId]
                : [];
            const pointPromoId =
              item.appliedPointPromotionId ?? item.promotionId ?? null;
            for (const promoId of appliedIds) {
              const rewardType = promoTypeMap.get(promoId);
              if (!rewardType) continue;
              if (
                rewardType === PromotionRewardType.POINTS &&
                pointPromoId &&
                promoId !== pointPromoId
              ) {
                continue;
              }
              const entry = metrics.get(promoId) ?? {
                revenue: 0,
                paidAmount: 0,
                discountCost: 0,
                pointsCost: 0,
                purchases: 0,
              };
              entry.revenue += paidAmount;
              entry.paidAmount += paidAmount;
              if (rewardType === PromotionRewardType.POINTS) {
                entry.pointsCost += Math.max(
                  0,
                  Math.floor(Number(item.promotionPointsBonus ?? 0)),
                );
              } else {
                entry.discountCost += discountAmount;
              }
              metrics.set(promoId, entry);
            }
          }
          for (const promoId of metrics.keys()) {
            const entry = metrics.get(promoId);
            if (entry) entry.purchases = 1;
          }
          for (const [promoId, entry] of metrics.entries()) {
            await tx.loyaltyPromotionMetric.upsert({
              where: { promotionId: promoId },
              create: {
                promotionId: promoId,
                merchantId: hold.merchantId,
                participantsCount: entry.purchases,
                revenueGenerated: entry.revenue,
                pointsIssued: entry.pointsCost,
                pointsRedeemed: entry.discountCost,
              },
              update: {
                participantsCount: { increment: entry.purchases },
                revenueGenerated: { increment: entry.revenue },
                pointsIssued: { increment: entry.pointsCost },
                pointsRedeemed: { increment: entry.discountCost },
              },
            });
            if (hold.customerId) {
              await tx.promotionParticipant.upsert({
                where: {
                  promotionId_customerId: {
                    promotionId: promoId,
                    customerId: hold.customerId,
                  },
                },
                create: {
                  promotionId: promoId,
                  merchantId: hold.merchantId,
                  customerId: hold.customerId,
                  outletId: hold.outletId ?? null,
                  joinedAt: operationDateObj,
                  firstPurchaseAt: operationDateObj,
                  lastPurchaseAt: operationDateObj,
                  purchasesCount: entry.purchases,
                  totalSpent: entry.paidAmount,
                  pointsIssued: entry.pointsCost,
                  pointsRedeemed: entry.discountCost,
                },
                update: {
                  lastPurchaseAt: operationDateObj,
                  purchasesCount: { increment: entry.purchases },
                  totalSpent: { increment: entry.paidAmount },
                  pointsIssued: { increment: entry.pointsCost },
                  pointsRedeemed: { increment: entry.discountCost },
                },
              });
            }
          }
        }

        if (redeemTxId && appliedRedeem > 0) {
          for (const rec of receiptItemsCreated) {
            await tx.transactionItem.create({
              data: {
                transactionId: redeemTxId,
                receiptItemId: rec.id,
                merchantId: hold.merchantId,
                productId: rec.item.resolvedProductId ?? null,
                categoryId: rec.item.resolvedCategoryId ?? null,
                externalProvider: null,
                externalId: rec.item.externalId ?? null,
                name: rec.item.name ?? null,
                sku: null,
                barcode: null,
                qty: new Prisma.Decimal(rec.item.qty ?? 0),
                price: new Prisma.Decimal(rec.item.price ?? 0),
                amount: rec.item.amount ?? 0,
                earnAmount: null,
                redeemAmount: rec.redeemApplied ?? 0,
                promotionId: rec.item.promotionId ?? null,
                promotionMultiplier:
                  rec.item.promotionMultiplier &&
                  rec.item.promotionMultiplier > 0
                    ? Math.round(rec.item.promotionMultiplier * 10000)
                    : null,
                metadata: Prisma.JsonNull,
              },
            });
          }
        }

        if (earnTxId && appliedEarn > 0) {
          for (const rec of receiptItemsCreated) {
            await tx.transactionItem.create({
              data: {
                transactionId: earnTxId,
                receiptItemId: rec.id,
                merchantId: hold.merchantId,
                productId: rec.item.resolvedProductId ?? null,
                categoryId: rec.item.resolvedCategoryId ?? null,
                externalProvider: null,
                externalId: rec.item.externalId ?? null,
                name: rec.item.name ?? null,
                sku: null,
                barcode: null,
                qty: new Prisma.Decimal(rec.item.qty ?? 0),
                price: new Prisma.Decimal(rec.item.price ?? 0),
                amount: rec.item.amount ?? 0,
                earnAmount: rec.earnApplied ?? 0,
                redeemAmount: null,
                promotionId: rec.item.promotionId ?? null,
                promotionMultiplier:
                  rec.item.promotionMultiplier &&
                  rec.item.promotionMultiplier > 0
                    ? Math.round(rec.item.promotionMultiplier * 10000)
                    : null,
                metadata: Prisma.JsonNull,
              },
            });
          }
        }

        await this.bestEffort(
          'commit: attach receipt to hold',
          async () => {
            await tx.hold.update({
              where: { id: hold.id },
              data: { receiptId: created.id },
            });
          },
          'debug',
        );

        if (hold.staffId && staffMotivationSettings?.enabled) {
          await this.bestEffort(
            'commit: record staff motivation',
            async () => {
              await this.staffMotivation.recordPurchase(tx, {
                merchantId: hold.merchantId,
                staffId: hold.staffId,
                outletId: hold.outletId ?? null,
                customerId: hold.customerId,
                orderId,
                receiptId: created.id,
                eventAt: created.createdAt ?? new Date(),
                isFirstPurchase: staffMotivationIsFirstPurchase,
                settings: staffMotivationSettings,
              });
            },
            'debug',
          );
        }

        // Начисление реферальных бонусов пригласителям (многоуровневая схема, триггеры first/all)
        await this.bestEffort(
          'commit: apply referral rewards',
          async () => {
            await this.applyReferralRewards(tx, {
              merchantId: hold.merchantId,
              buyerId: hold.customerId,
              purchaseAmount: effectiveEligible,
              receiptId: created.id,
              orderId,
              outletId: hold.outletId ?? null,
              staffId: hold.staffId ?? null,
              deviceId: hold.deviceId ?? null,
            });
          },
          'warn',
        );
        // Пишем событие в outbox (минимально)
        const commitPayload: Record<string, unknown> = {
          schemaVersion: 1,
          holdId: hold.id,
          orderId,
          customerId: hold.customerId,
          merchantId: hold.merchantId,
          redeemApplied: appliedRedeem,
          earnApplied: appliedEarn,
          receiptId: created.id,
          createdAt: operationDateObj.toISOString(),
          outletId: hold.outletId ?? null,
          staffId: hold.staffId ?? null,
          requestId: requestId ?? null,
        };
        await tx.eventOutbox.create({
          data: {
            merchantId: hold.merchantId,
            eventType: 'loyalty.commit',
            createdAt: operationDateObj,
            payload: commitPayload as Prisma.InputJsonValue,
          },
        });
        await this.bestEffort(
          'commit: enqueue staff notify',
          async () => {
            await tx.eventOutbox.create({
              data: {
                merchantId: hold.merchantId,
                eventType: 'notify.staff.telegram',
                createdAt: operationDateObj,
                payload: {
                  kind: 'ORDER',
                  receiptId: created.id,
                  at: created.createdAt.toISOString(),
                } satisfies StaffNotificationPayload,
              },
            });
          },
          'debug',
        );
        // ===== Автоповышение уровня по порогу (portal-managed tiers) =====
        await this.bestEffort(
          'commit: recompute tier progress',
          async () => {
            await this.tiers.recomputeTierProgress(tx, {
              merchantId: hold.merchantId,
              customerId: hold.customerId,
            });
          },
          'debug',
        );
        return {
          ok: true,
          customerId: context.customerId,
          receiptId: created.id,
          redeemApplied: appliedRedeem,
          earnApplied: appliedEarn,
        };
      });
    } catch (error) {
      // В редкой гонке уникальный индекс по (merchantId, orderId) может сработать —
      // любая следующая команда в рамках той же транзакции упадёт с 25P02 (transaction aborted).
      // Выполним идемпотентный поиск вне транзакции.
      const existing2 = await safeExecAsync(
        () =>
          this.prisma.receipt.findUnique({
            where: {
              merchantId_orderId: { merchantId: hold.merchantId, orderId },
            },
          }),
        async () => null,
        this.logger,
        'commit: load receipt after txn failure',
      );
      if (existing2) {
        return {
          ok: true,
          customerId: context.customerId,
          alreadyCommitted: true,
          receiptId: existing2.id,
          redeemApplied: existing2.redeemApplied,
          earnApplied: existing2.earnApplied,
        };
      }
      throw error;
    }
  }
}
