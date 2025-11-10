import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import {
  TelegramStaffNotificationsService,
  type StaffNotificationPayload,
} from '../telegram/staff-notifications.service';
import {
  PromoCodesService,
  type PromoCodeApplyResult,
} from '../promocodes/promocodes.service';
import { Mode, QuoteDto } from './dto';
import { parseLevelsConfig } from './levels.util';
import {
  StaffMotivationEngine,
  type StaffMotivationSettingsNormalized,
} from '../staff-motivation/staff-motivation.engine';
import {
  HoldStatus,
  TxnType,
  WalletType,
  LedgerAccount,
  HoldMode,
  DeviceType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';

type QrMeta = { jti: string; iat: number; exp: number } | undefined;

type MerchantContext = {
  merchantCustomerId: string;
  customerId: string;
};

@Injectable()
export class LoyaltyService {
  // Simple wrappers for modules that directly earn/redeem points without QR/holds
  async earn(params: {
    customerId: string;
    merchantId: string;
    amount: number;
    orderId?: string;
  }) {
    const { customerId, merchantId, amount, orderId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    // Ensure entities exist
    await this.ensureCustomerId(customerId);
    try {
      await this.prisma.merchant.upsert({
        where: { id: merchantId },
        update: {},
        create: { id: merchantId, name: merchantId },
      });
    } catch {}

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({
        where: { customerId, merchantId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 },
        });
      }
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: fresh!.balance + amount },
      });
      const txn = await tx.transaction.create({
        data: { customerId, merchantId, type: TxnType.EARN, amount, orderId },
      });
      return { ok: true, transactionId: txn.id };
    });
  }

  // ===== Referral rewards awarding =====
  private async applyReferralRewards(
    tx: any,
    ctx: {
      merchantId: string;
      buyerId: string;
      purchaseAmount: number;
      receiptId: string;
      orderId: string;
      outletId: string | null;
      staffId: string | null;
    },
  ) {
    // Активная программа рефералов
    const program = await tx.referralProgram.findFirst({
      where: { merchantId: ctx.merchantId, status: 'ACTIVE', isActive: true },
    });
    if (!program) return;

    const minPurchase = Number(program.minPurchaseAmount || 0) || 0;
    if (ctx.purchaseAmount < minPurchase) return;

    // Находим прямую связь реферала (уровень 1)
    const direct = await tx.referral.findFirst({
      where: { refereeId: ctx.buyerId, programId: program.id },
    });
    if (!direct) return; // покупатель не является приглашённым по активной программе

    const triggerAll =
      String(program.rewardTrigger || 'first').toLowerCase() === 'all';
    const canFirstPayout = direct.status === 'ACTIVATED';
    if (!triggerAll && !canFirstPayout) {
      // Режим только «за первую покупку» уже отработал
      return;
    }

    // Конфигурация уровней
    const rewardType = String(program.rewardType || 'FIXED').toUpperCase();
    const lvCfgArr = Array.isArray(program.levelRewards)
      ? (program.levelRewards as Array<any>)
      : [];

    const getLevelCfg = (lvl: number) =>
      lvCfgArr.find((x) => Number(x?.level) === lvl) || null;

    const enabledForLevel = (lvl: number) => {
      if (lvl === 1) return true; // всегда включаем L1
      if (!program.multiLevel) return false;
      const cfg = getLevelCfg(lvl);
      return cfg ? Boolean(cfg.enabled) : false;
    };

    const rewardValueForLevel = (lvl: number) => {
      const cfg = getLevelCfg(lvl);
      if (cfg && Number.isFinite(Number(cfg.reward))) return Number(cfg.reward);
      if (lvl === 1 && Number.isFinite(Number(program.referrerReward)))
        return Number(program.referrerReward);
      return 0;
    };

    // Обходим цепочку пригласителей вверх по программе
    let current = direct;
    let level = 1;
    const maxLevels = program.multiLevel
      ? Math.max(
          1,
          lvCfgArr.reduce((m, x) => Math.max(m, Number(x?.level || 0) || 0), 1),
        )
      : 1;

    while (level <= maxLevels && current) {
      if (enabledForLevel(level)) {
        const rv = rewardValueForLevel(level);
        let points = 0;
        if (rewardType === 'PERCENT') {
          points = Math.floor((ctx.purchaseAmount * Math.max(0, rv)) / 100);
        } else {
          points = Math.max(0, Math.floor(rv));
        }
        if (points > 0) {
          // Начисляем пригласителю
          let w = await tx.wallet.findFirst({
            where: {
              customerId: current.referrerId,
              merchantId: ctx.merchantId,
              type: WalletType.POINTS,
            },
          });
          if (!w)
            w = await tx.wallet.create({
              data: {
                customerId: current.referrerId,
                merchantId: ctx.merchantId,
                type: WalletType.POINTS,
                balance: 0,
              },
            });
          const fresh = await tx.wallet.findUnique({ where: { id: w.id } });
          await tx.wallet.update({
            where: { id: w.id },
            data: { balance: (fresh?.balance ?? 0) + points },
          });
          await tx.transaction.create({
            data: {
              customerId: current.referrerId,
              merchantId: ctx.merchantId,
              type: TxnType.REFERRAL,
              amount: points,
              orderId: `referral_reward_${ctx.receiptId}_L${level}`,
              outletId: ctx.outletId,
              staffId: ctx.staffId,
              metadata: {
                source: 'REFERRAL_BONUS',
                referralLevel: level,
                receiptId: ctx.receiptId,
                buyerId: ctx.buyerId,
              } as Prisma.JsonObject,
            },
          });
          if (process.env.LEDGER_FEATURE === '1') {
            await tx.ledgerEntry.create({
              data: {
                merchantId: ctx.merchantId,
                customerId: current.referrerId,
                debit: LedgerAccount.MERCHANT_LIABILITY,
                credit: LedgerAccount.CUSTOMER_BALANCE,
                amount: points,
                orderId: ctx.orderId,
                outletId: ctx.outletId ?? null,
                staffId: ctx.staffId ?? null,
                meta: { mode: 'REFERRAL', level },
              },
            });
            this.metrics.inc('loyalty_ledger_entries_total', {
              type: 'earn',
            });
            this.metrics.inc(
              'loyalty_ledger_amount_total',
              { type: 'earn' },
              points,
            );
          }
        }
      }

      // Следующий уровень (пригласитель текущего пригласителя)
      if (!program.multiLevel) break;
      const parent = await tx.referral.findFirst({
        where: { refereeId: current.referrerId, programId: program.id },
      });
      current = parent;
      level += 1;
    }

    // Для триггера «первая покупка» помечаем связь завершённой
    if (!triggerAll && direct.status === 'ACTIVATED') {
      await tx.referral.update({
        where: { id: direct.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          purchaseAmount: ctx.purchaseAmount,
        },
      });
    }
  }

  private async rollbackReferralRewards(
    tx: any,
    params: {
      merchantId: string;
      receipt: {
        id: string;
        orderId: string;
        customerId: string;
        outletId: string | null;
        staffId: string | null;
      };
    },
  ) {
    const prefix = `referral_reward_${params.receipt.id}`;
    let rewards = await tx.transaction.findMany({
      where: {
        merchantId: params.merchantId,
        type: TxnType.REFERRAL,
        orderId: { startsWith: prefix },
        canceledAt: null,
      },
    });

    const programInfo = await tx.referralProgram.findFirst({
      where: { merchantId: params.merchantId },
      orderBy: { createdAt: 'desc' },
      select: { rewardTrigger: true, minPurchaseAmount: true },
    });

    let skipRollback = false;
    if (programInfo && programInfo.rewardTrigger !== 'all') {
      const minPurchaseAmount = Math.max(
        0,
        Math.round(Number(programInfo.minPurchaseAmount ?? 0)),
      );
      const otherValidPurchases = await tx.$queryRaw(
        Prisma.sql`
        SELECT 1
        FROM "Receipt" r
        WHERE r."merchantId" = ${params.merchantId}
          AND r."customerId" = ${params.receipt.customerId}
          AND r."id" <> ${params.receipt.id}
          AND r."canceledAt" IS NULL
          AND r."total" > 0
          AND r."total" >= ${minPurchaseAmount}
          AND NOT EXISTS (
            SELECT 1
            FROM "Transaction" refund
            WHERE refund."merchantId" = r."merchantId"
              AND refund."orderId" = r."orderId"
              AND refund."type" = 'REFUND'
              AND refund."canceledAt" IS NULL
          )
        LIMIT 1`,
      );
      if (
        Array.isArray(otherValidPurchases) &&
        otherValidPurchases.length > 0
      ) {
        skipRollback = true;
      }
    }

    if (!rewards.length && !skipRollback) {
      rewards = await this.loadReferralRewardsForCustomer(
        tx,
        params.merchantId,
        params.receipt.customerId,
      );
    }

    if (!rewards.length || skipRollback) {
      return;
    }

    for (const reward of rewards) {
      const amount = Math.abs(Number(reward.amount ?? 0));
      if (!amount) continue;
      const rollbackOrderId =
        typeof reward.orderId === 'string' && reward.orderId.length
          ? reward.orderId.replace('referral_reward_', 'referral_rollback_')
          : `referral_rollback_${reward.id}`;
      const existingRollback = await tx.transaction.findFirst({
        where: { merchantId: params.merchantId, orderId: rollbackOrderId },
      });
      if (existingRollback) continue;

      const wallet = await tx.wallet.findFirst({
        where: {
          merchantId: params.merchantId,
          customerId: reward.customerId,
          type: WalletType.POINTS,
        },
      });
      if (!wallet) continue;
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: (fresh?.balance ?? 0) - amount },
      });
      await tx.transaction.create({
        data: {
          customerId: reward.customerId,
          merchantId: params.merchantId,
          type: TxnType.REFERRAL,
          amount: -amount,
          orderId: rollbackOrderId,
          outletId: reward.outletId ?? params.receipt.outletId ?? null,
          staffId: reward.staffId ?? params.receipt.staffId ?? null,
          metadata: {
            source: 'REFERRAL_ROLLBACK',
            originalOrderId: reward.orderId ?? null,
            originalTransactionId: reward.id,
            receiptId: params.receipt.id,
          } as Prisma.JsonObject,
        },
      });
      if (process.env.LEDGER_FEATURE === '1') {
        await tx.ledgerEntry.create({
          data: {
            merchantId: params.merchantId,
            customerId: reward.customerId,
            debit: LedgerAccount.CUSTOMER_BALANCE,
            credit: LedgerAccount.MERCHANT_LIABILITY,
            amount,
            orderId: params.receipt.orderId,
            outletId: reward.outletId ?? params.receipt.outletId ?? null,
            staffId: reward.staffId ?? params.receipt.staffId ?? null,
            meta: { mode: 'REFERRAL', kind: 'rollback' },
          },
        });
        this.metrics.inc('loyalty_ledger_entries_total', {
          type: 'referral_rollback',
        });
        this.metrics.inc(
          'loyalty_ledger_amount_total',
          { type: 'referral_rollback' },
          amount,
        );
      }
    }

    await this.reopenReferralAfterRefund(
      tx,
      params.merchantId,
      params.receipt.customerId,
    );
  }

  private async loadReferralRewardsForCustomer(
    tx: any,
    merchantId: string,
    customerId: string,
  ) {
    const receipts = await tx.receipt.findMany({
      where: { merchantId, customerId },
      select: { id: true },
    });
    if (!receipts.length) return [];
    const orderIds: string[] = [];
    for (const receipt of receipts) {
      for (let level = 1; level <= 5; level += 1) {
        orderIds.push(`referral_reward_${receipt.id}_L${level}`);
      }
    }
    if (!orderIds.length) return [];
    return tx.transaction.findMany({
      where: {
        merchantId,
        type: TxnType.REFERRAL,
        orderId: { in: orderIds },
        canceledAt: null,
      },
    });
  }

  private async reopenReferralAfterRefund(
    tx: any,
    merchantId: string,
    customerId: string,
  ) {
    const referral = await tx.referral.findFirst({
      where: {
        refereeId: customerId,
        status: 'COMPLETED',
        program: { merchantId },
      },
      include: { program: true },
      orderBy: { completedAt: 'desc' },
    });
    if (!referral) return;
    const trigger = String(referral.program?.rewardTrigger || 'first').toLowerCase();
    if (trigger === 'all') {
      return;
    }
    await tx.referral.update({
      where: { id: referral.id },
      data: {
        status: 'ACTIVATED',
        completedAt: null,
        purchaseAmount: null,
      },
    });
  }

  async grantRegistrationBonus(params: {
    merchantId?: string;
    customerId?: string;
    outletId?: string | null;
    staffId?: string | null;
  }) {
    const merchantId = String(params?.merchantId || '').trim();
    const customerId = String(params?.customerId || '').trim();
    const outletId =
      typeof params?.outletId === 'string' && params.outletId.trim()
        ? params.outletId.trim()
        : null;
    const staffId =
      typeof params?.staffId === 'string' && params.staffId.trim()
        ? params.staffId.trim()
        : null;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');

    // Read registration mechanic from settings
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const rules =
      settings?.rulesJson && typeof settings.rulesJson === 'object'
        ? (settings.rulesJson as any)
        : null;
    const reg =
      rules && typeof rules.registration === 'object'
        ? rules.registration
        : null;
    const enabled =
      reg && Object.prototype.hasOwnProperty.call(reg, 'enabled')
        ? Boolean(reg.enabled)
        : true;
    const pointsRaw = reg && reg.points != null ? Number(reg.points) : 0;
    const points = Number.isFinite(pointsRaw)
      ? Math.max(0, Math.floor(pointsRaw))
      : 0;
    const ttlDaysRaw =
      reg && reg.ttlDays != null
        ? Number(reg.ttlDays)
        : (settings?.pointsTtlDays ?? null);
    const ttlDays =
      Number.isFinite(ttlDaysRaw as any) &&
      (ttlDaysRaw as any) != null &&
      (ttlDaysRaw as any) > 0
        ? Math.floor(Number(ttlDaysRaw))
        : null;
    const delayDaysRaw =
      reg && reg.delayDays != null
        ? Number(reg.delayDays)
        : (settings?.earnDelayDays ?? 0);
    const delayDays =
      Number.isFinite(delayDaysRaw) && delayDaysRaw != null && delayDaysRaw > 0
        ? Math.floor(Number(delayDaysRaw))
        : 0;

    // Если клиент приглашён по рефералу и у активной программы выключено суммирование с регистрацией — запрещаем выдачу
    try {
      const ref = await this.prisma.referral.findFirst({
        where: {
          refereeId: customerId,
          program: { merchantId, status: 'ACTIVE', isActive: true },
        },
        include: { program: true },
      });
      if (ref?.program && ref.program.stackWithRegistration === false) {
        throw new BadRequestException(
          'Регистрационный бонус не суммируется с реферальным для приглашённых клиентов',
        );
      }
    } catch {}

    if (!enabled || points <= 0) {
      throw new BadRequestException(
        'registration bonus disabled or zero points',
      );
    }

    // Idempotency: if already issued, return existing state
    const existingTxn = await this.prisma.transaction.findFirst({
      where: { merchantId, customerId, orderId: 'registration_bonus' },
    });
    const existingLot = await this.prisma.earnLot.findFirst({
      where: { merchantId, customerId, orderId: 'registration_bonus' },
    });
    if (existingTxn || existingLot) {
      const walletEx = await this.prisma.wallet.findFirst({
        where: { merchantId, customerId, type: WalletType.POINTS },
      });
      return {
        ok: true,
        alreadyGranted: true,
        pointsIssued: 0,
        pending: !!(existingLot && existingLot.status === 'PENDING'),
        maturesAt: existingLot?.maturesAt
          ? existingLot.maturesAt.toISOString()
          : null,
        pointsExpireInDays: ttlDays,
        pointsExpireAt: existingLot?.expiresAt
          ? existingLot.expiresAt.toISOString()
          : null,
        balance: walletEx?.balance ?? 0,
      } as const;
    }

    await this.ensureCustomerId(customerId);

    return this.prisma.$transaction(async (tx) => {
      // Ensure wallet
      let wallet = await tx.wallet.findFirst({
        where: { merchantId, customerId, type: WalletType.POINTS },
      });
      if (!wallet)
        wallet = await tx.wallet.create({
          data: { merchantId, customerId, type: WalletType.POINTS, balance: 0 },
        });

      const now = new Date();
      const lotsEnabled = process.env.EARN_LOTS_FEATURE === '1';

      if (delayDays > 0 && lotsEnabled) {
        // Create pending lot
        const maturesAt = new Date(
          now.getTime() + delayDays * 24 * 60 * 60 * 1000,
        );
        const expiresAt = ttlDays
          ? new Date(maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000)
          : null;
        const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
        if (!earnLot?.create)
          throw new BadRequestException('earn lots not available');
        await earnLot.create({
          data: {
            merchantId,
            customerId,
            points,
            consumedPoints: 0,
            earnedAt: maturesAt,
            maturesAt,
            expiresAt,
            orderId: 'registration_bonus',
            receiptId: null,
            outletId,
            staffId,
            status: 'PENDING',
          },
        });

        await tx.eventOutbox.create({
          data: {
            merchantId,
            eventType: 'loyalty.registration.scheduled',
            payload: {
              merchantId,
              customerId,
              points,
              maturesAt: maturesAt.toISOString(),
              outletId: outletId ?? null,
              staffId: staffId ?? null,
            },
          },
        });

        return {
          ok: true,
          pointsIssued: points,
          pending: true,
          maturesAt: maturesAt.toISOString(),
          pointsExpireInDays: ttlDays,
          pointsExpireAt: expiresAt ? expiresAt.toISOString() : null,
          balance: (await tx.wallet.findUnique({ where: { id: wallet.id } }))!
            .balance,
        } as const;
      } else {
        // Immediate award
        const freshW = await tx.wallet.findUnique({ where: { id: wallet.id } });
        const balance = (freshW?.balance ?? 0) + points;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance } });

        await tx.transaction.create({
          data: {
            merchantId,
            customerId,
            type: TxnType.EARN,
            amount: points,
            orderId: 'registration_bonus',
            outletId,
            staffId,
          },
        });

        if (process.env.LEDGER_FEATURE === '1' && points > 0) {
          await tx.ledgerEntry.create({
            data: {
              merchantId,
              customerId,
              debit: LedgerAccount.MERCHANT_LIABILITY,
              credit: LedgerAccount.CUSTOMER_BALANCE,
              amount: points,
              orderId: 'registration_bonus',
              outletId,
              staffId,
              meta: { mode: 'REGISTRATION' },
            },
          });
          this.metrics.inc('loyalty_ledger_entries_total', { type: 'earn' });
          this.metrics.inc(
            'loyalty_ledger_amount_total',
            { type: 'earn' },
            points,
          );
        }

        if (process.env.EARN_LOTS_FEATURE === '1' && points > 0) {
          const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
          if (earnLot?.create) {
            await earnLot.create({
              data: {
                merchantId,
                customerId,
                points,
                consumedPoints: 0,
                earnedAt: now,
                maturesAt: null,
                expiresAt: ttlDays
                  ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)
                  : null,
                orderId: 'registration_bonus',
                receiptId: null,
                outletId,
                staffId,
                status: 'ACTIVE',
              },
            });
          }
        }

        await tx.eventOutbox.create({
          data: {
            merchantId,
            eventType: 'loyalty.registration.awarded',
            payload: {
              merchantId,
              customerId,
              points,
              outletId: outletId ?? null,
              staffId: staffId ?? null,
            },
          },
        });

        return {
          ok: true,
          pointsIssued: points,
          pending: false,
          maturesAt: null,
          pointsExpireInDays: ttlDays,
          pointsExpireAt: ttlDays
            ? new Date(
                now.getTime() + ttlDays * 24 * 60 * 60 * 1000,
              ).toISOString()
            : null,
          balance,
        } as const;
      }
    });
  }

  async redeem(params: {
    customerId: string;
    merchantId: string;
    amount: number;
    orderId?: string;
  }) {
    const { customerId, merchantId, amount, orderId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    await this.ensureCustomerId(customerId);
    try {
      await this.prisma.merchant.upsert({
        where: { id: merchantId },
        update: {},
        create: { id: merchantId, name: merchantId },
      });
    } catch {}

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({
        where: { customerId, merchantId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 },
        });
      }
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      if (fresh!.balance < amount)
        throw new BadRequestException('Insufficient points');
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: fresh!.balance - amount },
      });
      const txn = await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.REDEEM,
          amount: -amount,
          orderId,
        },
      });
      return { ok: true, transactionId: txn.id };
    });
  }

  async applyPromoCode(params: {
    merchantId?: string;
    customerId?: string;
    code?: string;
  }) {
    const merchantId = String(params?.merchantId || '').trim();
    const customerId = String(params?.customerId || '').trim();
    const code = String(params?.code || '').trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');
    if (!code) throw new BadRequestException('code required');

    await this.ensureCustomerId(customerId);
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) throw new BadRequestException('merchant not found');

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({
        where: { customerId, merchantId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 },
        });
      }

      const promo = await this.promoCodes.findActiveByCode(merchantId, code);
      if (!promo) {
        throw new BadRequestException('Промокод недоступен');
      }

      const result = await this.promoCodes.apply(tx, {
        promoCodeId: promo.id,
        merchantId,
        customerId,
        staffId: null,
        outletId: null,
        orderId: null,
      });
      if (!result) {
        throw new BadRequestException('Промокод недоступен');
      }

      const points = Math.max(0, Math.floor(Number(result.pointsIssued || 0)));
      const promoExpireDays = result.pointsExpireInDays ?? null;
      const expiresAt = promoExpireDays
        ? new Date(Date.now() + promoExpireDays * 24 * 60 * 60 * 1000)
        : null;

      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      const currentBalance = fresh?.balance ?? 0;
      let balance = currentBalance;
      if (points > 0) {
        balance = currentBalance + points;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance } });
      }

      await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.EARN,
          amount: points,
          orderId: null,
          outletId: null,
          staffId: null,
        },
      });

      if (process.env.LEDGER_FEATURE === '1' && points > 0) {
        await tx.ledgerEntry.create({
          data: {
            merchantId,
            customerId,
            debit: LedgerAccount.MERCHANT_LIABILITY,
            credit: LedgerAccount.CUSTOMER_BALANCE,
            amount: points,
            orderId: null,
            receiptId: null,
            outletId: null,
            staffId: null,
            meta: { mode: 'PROMOCODE', promoCodeId: result.promoCode.id },
          },
        });
        this.metrics.inc('loyalty_ledger_entries_total', { type: 'earn' });
        this.metrics.inc(
          'loyalty_ledger_amount_total',
          { type: 'earn' },
          points,
        );
      }

      if (process.env.EARN_LOTS_FEATURE === '1' && points > 0) {
        const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
        if (earnLot?.create) {
          await earnLot.create({
            data: {
              merchantId,
              customerId,
              points,
              consumedPoints: 0,
              earnedAt: new Date(),
              maturesAt: null,
              expiresAt,
              orderId: null,
              receiptId: null,
              outletId: null,
              staffId: null,
              status: 'ACTIVE',
            },
          });
        }
      }

      const messageParts: string[] = [];
      if (points > 0) messageParts.push(`Начислено ${points} баллов`);
      if (promoExpireDays)
        messageParts.push(`Бонус активен ${promoExpireDays} дн.`);
      if (result.promoCode.assignTierId) messageParts.push('Уровень обновлён');
      const message = messageParts.join('. ');

      return {
        ok: true,
        promoCodeId: result.promoCode.id,
        code: result.promoCode.code,
        pointsIssued: points,
        pointsExpireInDays: promoExpireDays,
        pointsExpireAt: expiresAt ? expiresAt.toISOString() : null,
        balance,
        tierAssigned: result.promoCode.assignTierId ?? null,
        message: message || 'Промокод активирован',
      };
    });
  }
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private promoCodes: PromoCodesService,
    private staffNotifications: TelegramStaffNotificationsService,
    private staffMotivation: StaffMotivationEngine,
  ) {}

  // ===== Earn Lots helpers (optional feature) =====
  private async consumeLots(
    tx: any,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null },
  ) {
    const earnLot = tx?.earnLot ?? (this.prisma as any)?.earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return; // в тестовых моках может отсутствовать
    const lots = await earnLot.findMany({
      where: { merchantId, customerId },
      orderBy: { earnedAt: 'asc' },
    });
    const updates = require('./lots.util').planConsume(
      lots.map((l: any) => ({
        id: l.id,
        points: l.points,
        consumedPoints: l.consumedPoints || 0,
        earnedAt: l.earnedAt,
      })),
      amount,
    );
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
      await earnLot.update({
        where: { id: up.id },
        data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.earnlot.consumed',
          payload: {
            merchantId,
            customerId,
            lotId: up.id,
            consumed: up.deltaConsumed,
            orderId: ctx.orderId ?? null,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  private async unconsumeLots(
    tx: any,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null },
  ) {
    const earnLot = tx?.earnLot ?? (this.prisma as any)?.earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return;
    const lots = await earnLot.findMany({
      where: { merchantId, customerId, consumedPoints: { gt: 0 } },
      orderBy: { earnedAt: 'desc' },
    });
    const updates = require('./lots.util').planUnconsume(
      lots.map((l: any) => ({
        id: l.id,
        points: l.points,
        consumedPoints: l.consumedPoints || 0,
        earnedAt: l.earnedAt,
      })),
      amount,
    );
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
      await earnLot.update({
        where: { id: up.id },
        data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.earnlot.unconsumed',
          payload: {
            merchantId,
            customerId,
            lotId: up.id,
            unconsumed: -up.deltaConsumed,
            orderId: ctx.orderId ?? null,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  private async revokeLots(
    tx: any,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null },
  ) {
    const earnLot = tx?.earnLot ?? (this.prisma as any)?.earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return;
    const lots = await earnLot.findMany({
      where: { merchantId, customerId },
      orderBy: { earnedAt: 'desc' },
    });
    const updates = require('./lots.util').planRevoke(
      lots.map((l: any) => ({
        id: l.id,
        points: l.points,
        consumedPoints: l.consumedPoints || 0,
        earnedAt: l.earnedAt,
      })),
      amount,
    );
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
      await earnLot.update({
        where: { id: up.id },
        data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.earnlot.revoked',
          payload: {
            merchantId,
            customerId,
            lotId: up.id,
            revoked: up.deltaConsumed,
            orderId: ctx.orderId ?? null,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  // ====== Кеш правил ======
  private rulesCache = new Map<
    string,
    {
      updatedAt: string;
      baseEarnBps: number;
      baseRedeemLimitBps: number;
      fn: (args: {
        channel: 'VIRTUAL' | 'PC_POS' | 'SMART';
        weekday: number;
        eligibleTotal: number;
        category?: string;
      }) => { earnBps: number; redeemLimitBps: number };
    }
  >();

  private compileRules(
    merchantId: string,
    outletId: string | null,
    base: { earnBps: number; redeemLimitBps: number },
    rulesJson: any,
    updatedAt: Date | null | undefined,
  ) {
    const key = `${merchantId}:${outletId ?? '-'}`;
    const stamp = updatedAt ? updatedAt.toISOString() : '0';
    const cached = this.rulesCache.get(key);
    if (
      cached &&
      cached.updatedAt === stamp &&
      cached.baseEarnBps === base.earnBps &&
      cached.baseRedeemLimitBps === base.redeemLimitBps
    )
      return cached.fn;
    let fn = (args: {
      channel: 'VIRTUAL' | 'PC_POS' | 'SMART';
      weekday: number;
      eligibleTotal: number;
      category?: string;
    }) => ({ earnBps: base.earnBps, redeemLimitBps: base.redeemLimitBps });
    // Support both array root and object with { rules: [...] }
    const rulesArr: any[] | null = Array.isArray(rulesJson)
      ? rulesJson
      : rulesJson && Array.isArray(rulesJson.rules)
        ? rulesJson.rules
        : null;
    if (Array.isArray(rulesArr)) {
      const rules = rulesArr;
      fn = (args) => {
        let earnBps = base.earnBps;
        let redeemLimitBps = base.redeemLimitBps;
        const wd = args.weekday;
        for (const item of rules) {
          try {
            if (!item || typeof item !== 'object' || Array.isArray(item))
              continue;
            const cond = item.if ?? {};
            if (
              Array.isArray(cond.channelIn) &&
              !cond.channelIn.includes(args.channel)
            )
              continue;
            if (Array.isArray(cond.weekdayIn) && !cond.weekdayIn.includes(wd))
              continue;
            if (
              cond.minEligible != null &&
              args.eligibleTotal < Number(cond.minEligible)
            )
              continue;
            if (
              Array.isArray(cond.categoryIn) &&
              !cond.categoryIn.includes(args.category)
            )
              continue;
            const then = item.then ?? {};
            if (then.earnBps != null) earnBps = Number(then.earnBps);
            if (then.redeemLimitBps != null)
              redeemLimitBps = Number(then.redeemLimitBps);
          } catch {}
        }
        return { earnBps, redeemLimitBps };
      };
    }
    this.rulesCache.set(key, {
      updatedAt: stamp,
      baseEarnBps: base.earnBps,
      baseRedeemLimitBps: base.redeemLimitBps,
      fn,
    });
    return fn;
  }

  private async ensureCustomerId(customerId: string) {
    const found = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (found) return found;
    return this.prisma.customer.create({ data: { id: customerId } });
  }

  private async getSettings(merchantId: string) {
    const s = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    return {
      earnBps: s?.earnBps ?? 500,
      redeemLimitBps: s?.redeemLimitBps ?? 5000,
      redeemCooldownSec: s?.redeemCooldownSec ?? 0,
      earnCooldownSec: s?.earnCooldownSec ?? 0,
      redeemDailyCap: s?.redeemDailyCap ?? null,
      earnDailyCap: s?.earnDailyCap ?? null,
      rulesJson: s?.rulesJson ?? null,
      updatedAt: s?.updatedAt ?? null,
    };
  }

  private normalizeChannel(
    raw: DeviceType | null | undefined,
  ): 'VIRTUAL' | 'PC_POS' | 'SMART' {
    if (!raw) return 'VIRTUAL';
    if (raw === DeviceType.SMART) return 'SMART';
    if (raw === DeviceType.PC_POS) return 'PC_POS';
    return 'VIRTUAL';
  }

  private async resolveOutletContext(
    merchantId: string,
    input: { outletId?: string | null },
  ) {
    const { outletId } = input;
    let outlet: { id: string; posType: DeviceType | null } | null = null;
    if (outletId) {
      try {
        outlet = await this.prisma.outlet.findFirst({
          where: { id: outletId, merchantId },
          select: { id: true, posType: true },
        });
      } catch {}
    }
    const channel = this.normalizeChannel(outlet?.posType ?? null);
    return { outletId: outlet?.id ?? null, channel };
  }

  // ===== Levels integration (Wave 2) =====
  // ————— вспомогалки для идемпотентности по существующему hold —————
  private quoteFromExistingHold(mode: Mode, hold: any) {
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
  async quote(dto: QuoteDto & { customerId: string }, qr?: QrMeta) {
    const customer = await this.ensureCustomerId(dto.customerId);
    // Ensure the merchant exists to satisfy FK constraints for wallet/holds
    try {
      await this.prisma.merchant.upsert({
        where: { id: dto.merchantId },
        update: {},
        create: { id: dto.merchantId, name: dto.merchantId },
      });
    } catch {}
    const {
      redeemCooldownSec,
      earnCooldownSec,
      redeemDailyCap,
      earnDailyCap,
      rulesJson,
      earnBps: baseEarnBps,
      redeemLimitBps: baseRedeemLimitBps,
      updatedAt,
    } = await this.getSettings(dto.merchantId);
    const rulesConfig =
      rulesJson && typeof rulesJson === 'object'
        ? (rulesJson as Record<string, any>)
        : {};
    const allowSameReceipt = Object.prototype.hasOwnProperty.call(
      rulesConfig,
      'allowEarnRedeemSameReceipt',
    )
      ? Boolean((rulesConfig as any).allowEarnRedeemSameReceipt)
      : !(rulesConfig as any).disallowEarnRedeemSameReceipt;

    const outletCtx = await this.resolveOutletContext(dto.merchantId, {
      outletId: dto.outletId ?? null,
    });
    const channel = outletCtx.channel;
    const effectiveOutletId = outletCtx.outletId ?? null;

    // Нормализуем суммы (защита от отрицательных/NaN)
    const sanitizedTotal = Math.max(
      0,
      Math.floor(Number((dto as any).total ?? 0)),
    );
    const sanitizedEligibleTotal = Math.max(
      0,
      Math.floor(Number((dto as any).eligibleTotal ?? 0)),
    );
    // применяем правила для earnBps/redeemLimitBps (с кешом)
    const wd = new Date().getDay();
    const rulesFn = this.compileRules(
      dto.merchantId,
      effectiveOutletId,
      { earnBps: baseEarnBps, redeemLimitBps: baseRedeemLimitBps },
      rulesJson,
      updatedAt,
    );
    let { earnBps, redeemLimitBps } = rulesFn({
      channel,
      weekday: wd,
      eligibleTotal: sanitizedEligibleTotal,
      category: dto.category,
    });
    // Уровни управляются через LoyaltyTier, бонусы из локальных настроек не применяем

    // Override by portal-managed LoyaltyTier (per-customer assignment)
    let tierMinPayment: number | null = null;
    try {
      const assignment = await this.prisma.loyaltyTierAssignment.findFirst({
        where: {
          merchantId: dto.merchantId,
          customerId: customer.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { assignedAt: 'desc' },
      });
      let tier: any = null;
      if (assignment) {
        tier = await this.prisma.loyaltyTier.findUnique({
          where: { id: assignment.tierId },
        });
      }
      if (!tier) {
        tier = await this.prisma.loyaltyTier.findFirst({
          where: { merchantId: dto.merchantId, isInitial: true },
          orderBy: { thresholdAmount: 'asc' },
        });
      }
      if (tier) {
        if (typeof tier.earnRateBps === 'number') {
          earnBps = Math.max(0, Math.floor(Number(tier.earnRateBps)));
        }
        if (typeof tier.redeemRateBps === 'number') {
          redeemLimitBps = Math.max(0, Math.floor(Number(tier.redeemRateBps)));
        }
        const meta: any = tier.metadata ?? null;
        if (meta && typeof meta === 'object') {
          const raw = meta.minPaymentAmount ?? meta.minPayment;
          if (raw != null) {
            const mp = Number(raw);
            if (Number.isFinite(mp) && mp >= 0) tierMinPayment = Math.round(mp);
          }
        }
      }
    } catch {}

    // 0) если есть qr — сначала смотрим, не существует ли hold с таким qrJti
    if (qr) {
      const existing = await this.prisma.hold.findUnique({
        where: { qrJti: qr.jti },
      });
      if (existing) {
        if (existing.status === HoldStatus.PENDING) {
          if (effectiveOutletId && existing.outletId !== effectiveOutletId) {
            try {
              await this.prisma.hold.update({
                where: { id: existing.id },
                data: { outletId: effectiveOutletId },
              });
              (existing as any).outletId = effectiveOutletId;
            } catch {}
          }
          // идемпотентно отдадим тот же расчёт/holdId
          return this.quoteFromExistingHold(dto.mode, existing);
        }
        // уже зафиксирован или отменён — QR повторно использовать нельзя
        throw new BadRequestException(
          'QR токен уже использован. Попросите клиента обновить QR.',
        );
      }

      // 1) «помечаем» QR как использованный ВНЕ транзакции (чтобы метка не откатывалась)
      try {
        await this.prisma.qrNonce.create({
          data: {
            jti: qr.jti,
            customerId: customer.id,
            merchantId: dto.merchantId,
            issuedAt: new Date(qr.iat * 1000),
            expiresAt: new Date(qr.exp * 1000),
            usedAt: new Date(),
          },
        });
      } catch (e: any) {
        // гонка: пока мы шли сюда, кто-то другой успел использовать QR — проверим hold ещё раз
        const again = await this.prisma.hold.findUnique({
          where: { qrJti: qr.jti },
        });
        if (again) {
          if (again.status === HoldStatus.PENDING) {
            if (effectiveOutletId && again.outletId !== effectiveOutletId) {
              try {
                await this.prisma.hold.update({
                  where: { id: again.id },
                  data: { outletId: effectiveOutletId },
                });
                (again as any).outletId = effectiveOutletId;
              } catch {}
            }
            return this.quoteFromExistingHold(dto.mode, again);
          }
          throw new BadRequestException(
            'QR токен уже использован. Попросите клиента обновить QR.',
          );
        }
        // иначе считаем, что QR использован
        throw new BadRequestException(
          'QR токен уже использован. Попросите клиента обновить QR.',
        );
      }
    }

    const modeUpper = String(dto.mode).toUpperCase();
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
            .catch(() => null),
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
        try {
          const rcp = await this.prisma.receipt.findUnique({
            where: {
              merchantId_orderId: {
                merchantId: dto.merchantId,
                orderId: dto.orderId,
              },
            },
          });
          if (rcp) priorRedeemApplied = Math.max(0, rcp.redeemApplied || 0);
        } catch {}
      }

      // 2) дальше — обычный расчёт в транзакции и создание нового hold (уникальный qrJti не даст дубликат)
      return this.prisma.$transaction(async (tx) => {
        // Ensure merchant exists within the same transaction/connection (FK safety)
        try {
          await tx.merchant.upsert({
            where: { id: dto.merchantId },
            update: {},
            create: { id: dto.merchantId, name: dto.merchantId },
          });
        } catch {}
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

        const limit = Math.floor(
          (sanitizedEligibleTotal * redeemLimitBps) / 10000,
        );
        // Учитываем уже применённое списание по этому заказу: нельзя превысить лимит
        const remainingByOrder = Math.max(0, limit - priorRedeemApplied);
        if (dto.orderId && remainingByOrder <= 0) {
          return {
            canRedeem: false,
            discountToApply: 0,
            pointsToBurn: 0,
            finalPayable: sanitizedTotal,
            holdId: undefined,
            message: 'По этому заказу уже списаны максимальные баллы.',
          } as any;
        }
        const capLeft =
          dailyRedeemLeft != null ? dailyRedeemLeft : Number.MAX_SAFE_INTEGER;
        const allowedByMinPayment =
          tierMinPayment != null
            ? Math.max(
                0,
                sanitizedTotal -
                  tierMinPayment -
                  Math.max(0, priorRedeemApplied),
              )
            : Number.MAX_SAFE_INTEGER;
        const discountToApply = Math.min(
          wallet.balance,
          remainingByOrder || limit,
          capLeft,
          allowedByMinPayment,
        );
        const finalPayable = Math.max(0, sanitizedTotal - discountToApply);
        // Расчёт будущего начисления на оплачиваемую рублями сумму, если разрешено совместное начисление/списание
        let postEarnPoints = 0;
        let postEarnOnAmount = 0;
        if (allowSameReceipt) {
          const earnBaseOnCash = Math.min(finalPayable, sanitizedEligibleTotal);
          const eligibleByMin = !(
            tierMinPayment != null && finalPayable < tierMinPayment
          );
          if (eligibleByMin && earnBaseOnCash > 0) {
            postEarnOnAmount = earnBaseOnCash;
            postEarnPoints = Math.floor((earnBaseOnCash * earnBps) / 10000);
          }
        }

        const hold = await tx.hold.create({
          data: {
            id: randomUUID(),
            customerId: customer.id,
            merchantId: dto.merchantId,
            mode: 'REDEEM',
            redeemAmount: discountToApply,
            orderId: dto.orderId,
            total: sanitizedTotal,
            eligibleTotal: sanitizedEligibleTotal,
            qrJti: qr?.jti ?? null,
            expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
            status: HoldStatus.PENDING,
            outletId: effectiveOutletId,
            staffId: dto.staffId ?? null,
          },
        });

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
          // Доп. поля для фронта: начисление на оплачиваемую сумму
          postEarnPoints: postEarnPoints,
          postEarnOnAmount: postEarnOnAmount,
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
          .catch(() => null),
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
          orderId: { not: null } as any,
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
          orderId: { not: null } as any,
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
    return this.prisma.$transaction(async (tx) => {
      // Ensure merchant exists within the same transaction/connection (FK safety)
      try {
        await tx.merchant.upsert({
          where: { id: dto.merchantId },
          update: {},
          create: { id: dto.merchantId, name: dto.merchantId },
        });
      } catch {}
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

      let points = Math.floor((sanitizedEligibleTotal * earnBps) / 10000);
      if (tierMinPayment != null && sanitizedTotal < tierMinPayment) {
        points = 0;
      }
      if (dailyEarnLeft != null) points = Math.min(points, dailyEarnLeft);
      if (points < 0) points = 0;

      const hold = await tx.hold.create({
        data: {
          id: randomUUID(),
          customerId: customer.id,
          merchantId: dto.merchantId,
          mode: 'EARN',
          earnPoints: points,
          orderId: dto.orderId,
          total: sanitizedTotal,
          eligibleTotal: sanitizedEligibleTotal,
          qrJti: qr?.jti ?? null,
          expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
          status: HoldStatus.PENDING,
          outletId: effectiveOutletId,
          staffId: dto.staffId ?? null,
        },
      });

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

  async commit(
    holdId: string,
    orderId: string,
    receiptNumber: string | undefined,
    requestId: string | undefined,
    opts?: { promoCode?: { promoCodeId: string; code?: string | null } },
  ) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BadRequestException('Hold not found');
    if (hold.expiresAt && hold.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Hold expired. Обновите QR в мини-аппе и повторите.',
      );
    }
    const context = await this.ensureMerchantCustomerContext(
      hold.merchantId,
      hold.customerId,
    );

    if (hold.status !== HoldStatus.PENDING) {
      // Идемпотентность: если чек уже есть по этому заказу — возвращаем успех
      const existing = await this.prisma.receipt.findUnique({
        where: { merchantId_orderId: { merchantId: hold.merchantId, orderId } },
      });
      if (existing) {
        return {
          ok: true,
          merchantCustomerId: context.merchantCustomerId,
          alreadyCommitted: true,
          receiptId: existing.id,
          redeemApplied: existing.redeemApplied,
          earnApplied: existing.earnApplied,
        };
      }
      throw new ConflictException('Hold already finished');
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
          } catch {
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
            merchantCustomerId: context.merchantCustomerId,
            alreadyCommitted: true,
            receiptId: existing.id,
            redeemApplied: existing.redeemApplied,
            earnApplied: existing.earnApplied,
          };
        }

        // Накапливаем применённые суммы для чека
        let appliedRedeem = 0;
        let appliedEarn = 0;
        let promoResult: PromoCodeApplyResult | null = null;
        if (opts?.promoCode && hold.customerId) {
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

        // REDEEM
        if (hold.mode === 'REDEEM' && hold.redeemAmount > 0) {
          const fresh = await tx.wallet.findUnique({
            where: { id: wallet.id },
          });
          const amount = Math.min(fresh!.balance, hold.redeemAmount);
          appliedRedeem = amount;
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: fresh!.balance - amount },
          });
          await tx.transaction.create({
            data: {
              customerId: hold.customerId,
              merchantId: hold.merchantId,
              type: TxnType.REDEEM,
              amount: -amount,
              orderId,
              outletId: hold.outletId,
              staffId: hold.staffId,
            },
          });
          // Earn lots consumption (optional)
          if (process.env.EARN_LOTS_FEATURE === '1' && amount > 0) {
            await this.consumeLots(
              tx,
              hold.merchantId,
              hold.customerId,
              amount,
              { orderId },
            );
          }
          // Ledger mirror (optional)
          if (process.env.LEDGER_FEATURE === '1' && amount > 0) {
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
                meta: { mode: 'REDEEM' },
              },
            });
            this.metrics.inc('loyalty_ledger_entries_total', {
              type: 'redeem',
            });
          }
        }
        const baseEarnFromHold =
          hold.mode === 'EARN'
            ? Math.max(0, Math.floor(Number(hold.earnPoints || 0)))
            : 0;
        const promoBonus = promoResult
          ? Math.max(0, Math.floor(Number(promoResult.pointsIssued || 0)))
          : 0;
        // Доп. начисление при списании, если включено allowEarnRedeemSameReceipt
        let extraEarn = 0;
        try {
          const msRules = await tx.merchantSettings.findUnique({
            where: { merchantId: hold.merchantId },
          });
          const rules =
            msRules?.rulesJson && typeof msRules.rulesJson === 'object'
              ? (msRules.rulesJson as any)
              : {};
          const allowSame = Object.prototype.hasOwnProperty.call(
            rules,
            'allowEarnRedeemSameReceipt',
          )
            ? Boolean(rules.allowEarnRedeemSameReceipt)
            : !rules.disallowEarnRedeemSameReceipt;
          if (hold.mode === 'REDEEM' && allowSame) {
            const { earnBps: baseEarnBps, earnDailyCap } =
              await this.getSettings(hold.merchantId);
            let earnBpsEff = baseEarnBps;
            let tierMinPaymentLocal: number | null = null;
            try {
              const assignment = await tx.loyaltyTierAssignment.findFirst({
                where: {
                  merchantId: hold.merchantId,
                  customerId: hold.customerId,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                orderBy: { assignedAt: 'desc' },
              });
              let tier: any = null;
              if (assignment)
                tier = await tx.loyaltyTier.findUnique({
                  where: { id: assignment.tierId },
                });
              if (!tier)
                tier = await tx.loyaltyTier.findFirst({
                  where: { merchantId: hold.merchantId, isInitial: true },
                  orderBy: { thresholdAmount: 'asc' },
                });
              if (tier) {
                if (typeof tier.earnRateBps === 'number')
                  earnBpsEff = Math.max(
                    0,
                    Math.floor(Number(tier.earnRateBps)),
                  );
                const meta: any = tier.metadata ?? null;
                if (meta && typeof meta === 'object') {
                  const raw = meta.minPaymentAmount ?? meta.minPayment;
                  if (raw != null) {
                    const mp = Number(raw);
                    if (Number.isFinite(mp) && mp >= 0)
                      tierMinPaymentLocal = Math.round(mp);
                  }
                }
              }
            } catch {}
            const appliedRedeemAmt = Math.max(0, appliedRedeem);
            const total = Math.max(0, Number(hold.total ?? 0));
            const eligible = Math.max(0, Number(hold.eligibleTotal ?? total));
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
                const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const txns = await tx.transaction.findMany({
                  where: {
                    merchantId: hold.merchantId,
                    customerId: hold.customerId,
                    type: 'EARN',
                    orderId: { not: null } as any,
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
        } catch {}
        const appliedEarnTotal = baseEarnFromHold + promoBonus + extraEarn;

        if (appliedEarnTotal > 0) {
          // Проверяем, требуется ли задержка начисления. В юнит-тестах tx может не иметь merchantSettings — делаем fallback на this.prisma.
          let settings: any = null;
          const txHasMs = (tx as any)?.merchantSettings?.findUnique;
          if (txHasMs) {
            settings = await (tx as any).merchantSettings.findUnique({
              where: { merchantId: hold.merchantId },
            });
          } else if ((this.prisma as any)?.merchantSettings?.findUnique) {
            settings = await (this.prisma as any).merchantSettings.findUnique({
              where: { merchantId: hold.merchantId },
            });
          }
          const delayDays = Number(settings?.earnDelayDays || 0) || 0;
          const ttlDays = Number(settings?.pointsTtlDays || 0) || 0;
          appliedEarn = appliedEarnTotal;
          const promoExpireDays = promoResult?.pointsExpireInDays ?? null;

          if (delayDays > 0) {
            // Откладываем начисление: создаём PENDING lot и событие, баланс не трогаем до созревания
            if (process.env.EARN_LOTS_FEATURE === '1' && appliedEarn > 0) {
              const maturesAt = new Date(
                Date.now() + delayDays * 24 * 60 * 60 * 1000,
              );
              const earnLot =
                (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
              if (earnLot?.create) {
                if (baseEarnFromHold > 0) {
                  const expiresAtStd =
                    ttlDays > 0
                      ? new Date(
                          maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                        )
                      : null;
                  await earnLot.create({
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
                      status: 'PENDING',
                    },
                  });
                }
                if (promoBonus > 0) {
                  const promoExpiresAt = promoExpireDays
                    ? new Date(
                        maturesAt.getTime() +
                          promoExpireDays * 24 * 60 * 60 * 1000,
                      )
                    : null;
                  await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: promoBonus,
                      consumedPoints: 0,
                      earnedAt: maturesAt,
                      maturesAt,
                      expiresAt: promoExpiresAt,
                      orderId: null,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      status: 'PENDING',
                    },
                  });
                }
                if (extraEarn > 0) {
                  const expiresAtStd =
                    ttlDays > 0
                      ? new Date(
                          maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                        )
                      : null;
                  await earnLot.create({
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
                      status: 'PENDING',
                    },
                  });
                }
              }
            }
            await tx.eventOutbox.create({
              data: {
                merchantId: hold.merchantId,
                eventType: 'loyalty.earn.scheduled',
                payload: {
                  holdId: hold.id,
                  orderId,
                  customerId: hold.customerId,
                  merchantId: hold.merchantId,
                  points: appliedEarn,
                  maturesAt: new Date(
                    Date.now() + delayDays * 24 * 60 * 60 * 1000,
                  ).toISOString(),
                  outletId: hold.outletId ?? null,
                  staffId: hold.staffId ?? null,
                  promoCode:
                    promoResult && opts?.promoCode
                      ? {
                          promoCodeId: opts.promoCode.promoCodeId,
                          code: opts.promoCode.code ?? null,
                          points: promoBonus,
                          expiresInDays: promoExpireDays,
                        }
                      : undefined,
                } as any,
              },
            });
          } else {
            // Немедленное начисление
            const fresh = await tx.wallet.findUnique({
              where: { id: wallet.id },
            });
            if (appliedEarn > 0) {
              await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: fresh!.balance + appliedEarn },
              });
            }
            await tx.transaction.create({
              data: {
                customerId: hold.customerId,
                merchantId: hold.merchantId,
                type: TxnType.EARN,
                amount: appliedEarn,
                orderId,
                outletId: hold.outletId,
                staffId: hold.staffId,
              },
            });
            // Ledger mirror (optional)
            if (process.env.LEDGER_FEATURE === '1' && appliedEarn > 0) {
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
                  meta: { mode: 'EARN' },
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
            if (process.env.EARN_LOTS_FEATURE === '1' && appliedEarn > 0) {
              const earnLot =
                (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
              if (earnLot?.create) {
                if (baseEarnFromHold > 0) {
                  let expires: Date | null = null;
                  if (ttlDays > 0)
                    expires = new Date(
                      Date.now() + ttlDays * 24 * 60 * 60 * 1000,
                    );
                  await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: baseEarnFromHold,
                      consumedPoints: 0,
                      earnedAt: new Date(),
                      maturesAt: null,
                      expiresAt: expires,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      status: 'ACTIVE',
                    },
                  });
                }
                if (promoBonus > 0) {
                  const expiresPromo = promoExpireDays
                    ? new Date(
                        Date.now() + promoExpireDays * 24 * 60 * 60 * 1000,
                      )
                    : null;
                  await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: promoBonus,
                      consumedPoints: 0,
                      earnedAt: new Date(),
                      maturesAt: null,
                      expiresAt: expiresPromo,
                      orderId: null,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      status: 'ACTIVE',
                    },
                  });
                }
                if (extraEarn > 0) {
                  let expires: Date | null = null;
                  if (ttlDays > 0)
                    expires = new Date(
                      Date.now() + ttlDays * 24 * 60 * 60 * 1000,
                    );
                  await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: extraEarn,
                      consumedPoints: 0,
                      earnedAt: new Date(),
                      maturesAt: null,
                      expiresAt: expires,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      status: 'ACTIVE',
                    },
                  });
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
            receiptId: receiptNumber,
          },
        });

        const created = await tx.receipt.create({
          data: {
            merchantId: hold.merchantId,
            customerId: hold.customerId,
            orderId,
            receiptNumber: receiptNumber ?? null,
            total: hold.total ?? 0,
            eligibleTotal: hold.eligibleTotal ?? hold.total ?? 0,
            redeemApplied: appliedRedeem,
            earnApplied: appliedEarn,
            outletId: hold.outletId ?? null,
            staffId: hold.staffId ?? null,
          },
        });

        if (hold.staffId && staffMotivationSettings?.enabled) {
          try {
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
          } catch {}
        }

        // Начисление реферальных бонусов пригласителям (многоуровневая схема, триггеры first/all)
        try {
          await this.applyReferralRewards(tx, {
            merchantId: hold.merchantId,
            buyerId: hold.customerId,
            purchaseAmount: Math.max(
              0,
              Math.floor(
                Number(
                  (hold.eligibleTotal != null
                    ? hold.eligibleTotal
                    : hold.total) ?? 0,
                ),
              ),
            ),
            receiptId: created.id,
            orderId,
            outletId: hold.outletId ?? null,
            staffId: hold.staffId ?? null,
          });
        } catch {}
        // обновим lastSeen у торговой точки/устройства
        const touchTs = new Date();
        if (hold.outletId) {
          try {
            await tx.outlet.update({
              where: { id: hold.outletId },
              data: { posLastSeenAt: touchTs },
            });
          } catch {}
        }
        // Пишем событие в outbox (минимально)
        await tx.eventOutbox.create({
          data: {
            merchantId: hold.merchantId,
            eventType: 'loyalty.commit',
            payload: {
              schemaVersion: 1,
              holdId: hold.id,
              orderId,
              customerId: hold.customerId,
              merchantId: hold.merchantId,
              redeemApplied: appliedRedeem,
              earnApplied: appliedEarn,
              receiptId: created.id,
              createdAt: new Date().toISOString(),
              outletId: hold.outletId ?? null,
              staffId: hold.staffId ?? null,
              requestId: requestId ?? null,
            } as any,
          },
        });
        try {
          await tx.eventOutbox.create({
            data: {
              merchantId: hold.merchantId,
              eventType: 'notify.staff.telegram',
              payload: {
                kind: 'ORDER',
                receiptId: created.id,
                at:
                  (created as any)?.createdAt?.toISOString?.() ??
                  new Date().toISOString(),
              } satisfies StaffNotificationPayload,
            },
          });
        } catch {}
        // ===== Автоповышение уровня по порогу (portal-managed tiers) =====
        try {
          // период для расчёта прогресса
          let periodDays = 365;
          try {
            const ms = await tx.merchantSettings.findUnique({
              where: { merchantId: hold.merchantId },
            });
            periodDays = parseLevelsConfig(ms).periodDays || 365;
          } catch {}
          const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
          // считаем прогресс по покупкам/чекам (как в levels.util):
          // если метрика в настройках = transactions — считаем количество чеков; иначе — сумму total
          let metric: 'earn' | 'redeem' | 'transactions' = 'earn';
          try {
            const ms2 = await tx.merchantSettings.findUnique({
              where: { merchantId: hold.merchantId },
            });
            metric = parseLevelsConfig(ms2).metric;
          } catch {}
          let progress = 0;
          if (metric === 'transactions') {
            progress = await tx.receipt.count({
              where: {
                merchantId: hold.merchantId,
                customerId: hold.customerId,
                createdAt: { gte: since },
              },
            });
          } else {
            const agg: any = await (tx as any).receipt.aggregate({
              _sum: { total: true },
              where: {
                merchantId: hold.merchantId,
                customerId: hold.customerId,
                createdAt: { gte: since },
              },
            });
            progress = Math.max(
              0,
              Math.round(Number(agg?._sum?.total ?? 0)) || 0,
            );
          }
          // список уровней и текущая привязка
          const tiers = await tx.loyaltyTier.findMany({
            where: { merchantId: hold.merchantId },
            orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
          });
          if (tiers.length) {
            const target =
              tiers
                .filter((t: any) => Number(t.thresholdAmount ?? 0) <= progress)
                .pop() || null;
            if (target) {
              const currentAssign = await tx.loyaltyTierAssignment.findFirst({
                where: {
                  merchantId: hold.merchantId,
                  customerId: hold.customerId,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                orderBy: { assignedAt: 'desc' },
              });
              let currentTier: any = null;
              if (currentAssign)
                currentTier =
                  tiers.find((t: any) => t.id === currentAssign.tierId) || null;
              const curTh = currentTier
                ? Number(currentTier.thresholdAmount ?? 0)
                : -1;
              const tgtTh = Number(target.thresholdAmount ?? 0);
              // повышаем только вверх (без понижения)
              if (tgtTh > curTh) {
                if (currentAssign) {
                  try {
                    await tx.loyaltyTierAssignment.update({
                      where: { id: currentAssign.id },
                      data: { expiresAt: new Date() },
                    });
                  } catch {}
                }
                await tx.loyaltyTierAssignment.create({
                  data: {
                    merchantId: hold.merchantId,
                    customerId: hold.customerId,
                    tierId: target.id,
                    assignedAt: new Date(),
                    expiresAt: null,
                  },
                });
                // событие о повышении уровня
                try {
                  await tx.eventOutbox.create({
                    data: {
                      merchantId: hold.merchantId,
                      eventType: 'loyalty.tier.promoted',
                      payload: {
                        merchantId: hold.merchantId,
                        customerId: hold.customerId,
                        tierId: target.id,
                        at: new Date().toISOString(),
                      },
                    },
                  });
                } catch {}
              }
            }
          }
        } catch {}
        return {
          ok: true,
          merchantCustomerId: context.merchantCustomerId,
          receiptId: created.id,
          redeemApplied: appliedRedeem,
          earnApplied: appliedEarn,
        };
      });
    } catch (e: any) {
      // В редкой гонке уникальный индекс по (merchantId, orderId) может сработать —
      // любая следующая команда в рамках той же транзакции упадёт с 25P02 (transaction aborted).
      // Выполним идемпотентный поиск вне транзакции.
      try {
        const existing2 = await this.prisma.receipt.findUnique({
          where: {
            merchantId_orderId: { merchantId: hold.merchantId, orderId },
          },
        });
        if (existing2) {
          return {
            ok: true,
            merchantCustomerId: context.merchantCustomerId,
            alreadyCommitted: true,
            receiptId: existing2.id,
            redeemApplied: existing2.redeemApplied,
            earnApplied: existing2.earnApplied,
          };
        }
      } catch {}
      throw e;
    }
  }

  async cancel(holdId: string) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BadRequestException('Hold not found');
    if (hold.status !== HoldStatus.PENDING)
      throw new ConflictException('Hold already finished');
    await this.prisma.hold.update({
      where: { id: holdId },
      data: { status: HoldStatus.CANCELED },
    });
    return { ok: true };
  }

  async balance(merchantId: string, merchantCustomerId: string) {
    const merchantCustomer = await (this.prisma as any).merchantCustomer
      ?.findUnique?.({
        where: { id: merchantCustomerId },
        select: { customerId: true },
      })
      .catch(() => null);
    if (!merchantCustomer)
      throw new BadRequestException('merchant customer not found');
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId: merchantCustomer.customerId,
        merchantId,
        type: WalletType.POINTS,
      },
    });
    return {
      merchantId,
      merchantCustomerId,
      balance: wallet?.balance ?? 0,
    };
  }

  async refund(
    merchantId: string,
    orderId: string,
    refundTotal: number,
    refundEligibleTotal?: number,
    requestId?: string,
  ) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { merchantId_orderId: { merchantId, orderId } },
    });
    if (!receipt) throw new BadRequestException('Receipt not found');

    const eligible =
      receipt.eligibleTotal > 0 ? receipt.eligibleTotal : receipt.total;
    const baseForShare =
      refundEligibleTotal != null ? refundEligibleTotal : refundTotal;
    const share = Math.min(
      1,
      Math.max(0, eligible > 0 ? baseForShare / eligible : 0),
    );

    const pointsToRestore = Math.round(receipt.redeemApplied * share);
    const pointsToRevoke = Math.round(receipt.earnApplied * share);

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId: receipt.customerId,
        merchantId,
        type: WalletType.POINTS,
      },
    });
    if (!wallet) throw new BadRequestException('Wallet not found');

    const context = await this.ensureMerchantCustomerContext(
      merchantId,
      receipt.customerId,
    );

    return this.prisma.$transaction(async (tx) => {
      if (pointsToRestore > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: fresh!.balance + pointsToRestore },
        });
        await tx.transaction.create({
          data: {
            customerId: receipt.customerId,
            merchantId,
            type: TxnType.REFUND,
            amount: pointsToRestore,
            orderId,
            outletId: receipt.outletId,
            staffId: receipt.staffId,
          },
        });
        if (process.env.EARN_LOTS_FEATURE === '1') {
          await this.unconsumeLots(
            tx,
            merchantId,
            receipt.customerId,
            pointsToRestore,
            { orderId },
          );
        }
        if (process.env.LEDGER_FEATURE === '1') {
          await tx.ledgerEntry.create({
            data: {
              merchantId,
              customerId: receipt.customerId,
              debit: LedgerAccount.MERCHANT_LIABILITY,
              credit: LedgerAccount.CUSTOMER_BALANCE,
              amount: pointsToRestore,
              orderId,
              outletId: receipt.outletId ?? null,
              staffId: receipt.staffId ?? null,
              meta: { mode: 'REFUND', kind: 'restore' },
            },
          });
          this.metrics.inc('loyalty_ledger_entries_total', {
            type: 'refund_restore',
          });
        }
      }
      if (pointsToRevoke > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: fresh!.balance - pointsToRevoke },
        });
        await tx.transaction.create({
          data: {
            customerId: receipt.customerId,
            merchantId,
            type: TxnType.REFUND,
            amount: -pointsToRevoke,
            orderId,
            outletId: receipt.outletId,
            staffId: receipt.staffId,
          },
        });
        if (process.env.EARN_LOTS_FEATURE === '1') {
          await this.revokeLots(
            tx,
            merchantId,
            receipt.customerId,
            pointsToRevoke,
            { orderId },
          );
        }
        if (process.env.LEDGER_FEATURE === '1') {
          await tx.ledgerEntry.create({
            data: {
              merchantId,
              customerId: receipt.customerId,
              debit: LedgerAccount.CUSTOMER_BALANCE,
              credit: LedgerAccount.MERCHANT_LIABILITY,
              amount: pointsToRevoke,
              orderId,
              outletId: receipt.outletId ?? null,
              staffId: receipt.staffId ?? null,
              meta: { mode: 'REFUND', kind: 'revoke' },
            },
          });
          this.metrics.inc('loyalty_ledger_entries_total', {
            type: 'refund_revoke',
          });
        }
      }
      if (Math.abs(share - 1) < 0.001) {
        await this.rollbackReferralRewards(tx, {
          merchantId,
          receipt: {
            id: receipt.id,
            orderId,
            customerId: receipt.customerId,
            outletId: receipt.outletId ?? null,
            staffId: receipt.staffId ?? null,
          },
        });
      }
      try {
        await this.staffMotivation.recordRefund(tx, {
          merchantId,
          orderId,
          eventAt: new Date(),
          share,
        });
      } catch {}
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.refund',
          payload: {
            schemaVersion: 1,
            orderId,
            customerId: receipt.customerId,
            merchantId,
            share,
            pointsRestored: pointsToRestore,
            pointsRevoked: pointsToRevoke,
            createdAt: new Date().toISOString(),
            outletId: receipt.outletId ?? null,
            staffId: receipt.staffId ?? null,
            requestId: requestId ?? null,
          } as any,
        },
      });
      const context = await this.ensureMerchantCustomerContext(
        merchantId,
        receipt.customerId,
      );
      return {
        ok: true,
        share,
        pointsRestored: pointsToRestore,
        pointsRevoked: pointsToRevoke,
        merchantCustomerId: context.merchantCustomerId,
      };
    });
  }

  async getStaffMotivationConfig(merchantId: string) {
    return this.staffMotivation.getSettings(this.prisma, merchantId);
  }

  async getStaffMotivationLeaderboard(
    merchantId: string,
    options?: { outletId?: string | null; limit?: number },
  ) {
    return this.staffMotivation.getLeaderboard(merchantId, options);
  }

  async transactions(
    merchantId: string,
    merchantCustomerId: string,
    limit = 20,
    before?: Date,
    filters?: { outletId?: string | null; staffId?: string | null },
  ) {
    const merchantCustomer = await (this.prisma as any).merchantCustomer
      ?.findUnique?.({
        where: { id: merchantCustomerId },
        select: { customerId: true },
      })
      .catch(() => null);
    if (!merchantCustomer)
      throw new BadRequestException('merchant customer not found');
    const customerId = merchantCustomer.customerId;
    const hardLimit = Math.min(Math.max(limit, 1), 100);
    const now = new Date();

    // 1) Обычные транзакции
    const whereTx: any = { merchantId, customerId };
    if (before) whereTx.createdAt = { lt: before };
    if (filters?.outletId) whereTx.outletId = filters.outletId;
    if (filters?.staffId) whereTx.staffId = filters.staffId;
    const txItems = await this.prisma.transaction.findMany({
      where: whereTx,
      orderBy: { createdAt: 'desc' },
      take: hardLimit,
      include: {
        outlet: { select: { posType: true, posLastSeenAt: true } },
        reviews: { select: { id: true, rating: true, createdAt: true } },
      },
    });

    // 2) «Отложенные начисления» (EarnLot.status = PENDING)
    const whereLots: any = { merchantId, customerId, status: 'PENDING' };
    if (before) whereLots.createdAt = { lt: before };
    if (filters?.outletId) whereLots.outletId = filters.outletId;
    if (filters?.staffId) whereLots.staffId = filters.staffId;
    const pendingLots = await this.prisma.earnLot.findMany({
      where: whereLots,
      orderBy: { createdAt: 'desc' },
      take: hardLimit,
      select: {
        id: true,
        merchantId: true,
        customerId: true,
        points: true,
        orderId: true,
        outletId: true,
        staffId: true,
        createdAt: true,
        maturesAt: true,
      },
    });
    // Подтянем outlet данные одним запросом
    const outletIds = Array.from(
      new Set(pendingLots.map((l) => l.outletId).filter(Boolean)),
    ) as string[];
    const outletsMap = new Map<
      string,
      { posType: any; posLastSeenAt: Date | null }
    >();
    if (outletIds.length > 0) {
      const outlets = await this.prisma.outlet.findMany({
        where: { id: { in: outletIds } },
        select: { id: true, posType: true, posLastSeenAt: true },
      });
      for (const o of outlets)
        outletsMap.set(o.id, {
          posType: o.posType,
          posLastSeenAt: o.posLastSeenAt ?? null,
        });
    }

    const orderIdsForReceipts = Array.from(
      new Set(
        txItems
          .map((entity) => {
            if (typeof entity.orderId !== 'string') return null;
            const trimmed = entity.orderId.trim();
            return trimmed.length > 0 ? trimmed : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const receiptMetaByOrderId = new Map<
      string,
      { receiptNumber: string | null; createdAt: string }
    >();
    if (orderIdsForReceipts.length > 0) {
      const receipts = await this.prisma.receipt.findMany({
        where: { merchantId, orderId: { in: orderIdsForReceipts } },
        select: { orderId: true, receiptNumber: true, createdAt: true },
      });
      for (const receipt of receipts) {
        if (!receipt.orderId) continue;
        const key = receipt.orderId;
        const normalized =
          typeof receipt.receiptNumber === 'string' &&
          receipt.receiptNumber.trim().length > 0
            ? receipt.receiptNumber.trim()
            : null;
        receiptMetaByOrderId.set(key, {
          receiptNumber: normalized,
          createdAt: receipt.createdAt.toISOString(),
        });
      }
    }

    // 3) Нормализация
    const refundOrderIds = Array.from(
      new Set(
        txItems
          .map((entity) => {
            if (entity.type !== TxnType.REFUND) return null;
            if (typeof entity.orderId !== 'string') return null;
            const trimmed = entity.orderId.trim();
            return trimmed.length > 0 ? trimmed : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const refundOriginsByOrderId = new Map<string, string>();
    for (const order of refundOrderIds) {
      const meta = receiptMetaByOrderId.get(order);
      if (meta?.createdAt) {
        refundOriginsByOrderId.set(order, meta.createdAt);
      }
    }
    const fallbackOriginsByOrderId = new Map<string, string>();
    for (const entity of txItems) {
      if (entity.type === TxnType.REFUND) continue;
      if (typeof entity.orderId !== 'string') continue;
      const trimmed = entity.orderId.trim();
      if (!trimmed) continue;
      const iso = entity.createdAt.toISOString();
      const existing = fallbackOriginsByOrderId.get(trimmed);
      if (!existing || iso < existing) {
        fallbackOriginsByOrderId.set(trimmed, iso);
      }
    }

    const normalizedTxs = txItems.map((entity) => {
      const orderId =
        typeof entity.orderId === 'string' && entity.orderId.trim().length > 0
          ? entity.orderId.trim()
          : null;
      const metadata =
        entity &&
        typeof (entity as any)?.metadata === 'object' &&
        (entity as any)?.metadata
          ? ((entity as any).metadata as Record<string, any>)
          : null;
      const rawSource =
        typeof metadata?.source === 'string' &&
        metadata.source.trim().length > 0
          ? metadata.source.trim()
          : null;
      const source = rawSource ? rawSource.toUpperCase() : null;
      const comment =
        typeof metadata?.comment === 'string' &&
        metadata.comment.trim().length > 0
          ? metadata.comment.trim()
          : null;

      return {
        id: entity.id,
        type:
          entity.orderId === 'registration_bonus'
            ? ('REGISTRATION' as any)
            : entity.type,
        amount: entity.amount,
        orderId,
        receiptNumber: orderId
          ? (receiptMetaByOrderId.get(orderId)?.receiptNumber ?? null)
          : null,
        customerId: entity.customerId,
        createdAt: entity.createdAt.toISOString(),
        outletId: entity.outletId ?? null,
        outletPosType: entity.outlet?.posType ?? null,
        outletLastSeenAt: entity.outlet?.posLastSeenAt
          ? entity.outlet.posLastSeenAt.toISOString()
          : null,
        staffId: entity.staffId ?? null,
        reviewId: entity.reviews?.[0]?.id ?? null,
        reviewRating: entity.reviews?.[0]?.rating ?? null,
        reviewCreatedAt: entity.reviews?.[0]?.createdAt
          ? entity.reviews[0].createdAt.toISOString()
          : null,
        pending: undefined,
        maturesAt: undefined,
        daysUntilMature: undefined,
        source,
        comment,
        canceledAt: entity.canceledAt ? entity.canceledAt.toISOString() : null,
        relatedOperationAt:
          entity.type === TxnType.REFUND && orderId
            ? (refundOriginsByOrderId.get(orderId) ??
              fallbackOriginsByOrderId.get(orderId) ??
              null)
            : null,
      };
    });

    const normalizedPending = pendingLots.map((lot) => {
      const outlet = lot.outletId ? outletsMap.get(lot.outletId) : null;
      const mat = lot.maturesAt ?? null;
      const daysUntil = mat
        ? Math.max(
            0,
            Math.ceil((mat.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
          )
        : null;
      return {
        id: `lot:${lot.id}`,
        type: lot.orderId === 'registration_bonus' ? 'REGISTRATION' : 'EARN',
        amount: lot.points,
        orderId: lot.orderId ?? null,
        customerId: lot.customerId,
        createdAt: lot.createdAt.toISOString(),
        outletId: lot.outletId ?? null,
        outletPosType: outlet?.posType ?? null,
        outletLastSeenAt: outlet?.posLastSeenAt
          ? outlet.posLastSeenAt.toISOString()
          : null,
        staffId: lot.staffId ?? null,
        reviewId: null,
        reviewRating: null,
        reviewCreatedAt: null,
        pending: true,
        maturesAt: mat ? mat.toISOString() : null,
        daysUntilMature: daysUntil,
        source: null,
        comment: null,
        canceledAt: null,
        relatedOperationAt: null,
      };
    });

    // 4) Слияние, сортировка, пагинация
    const merged = [...normalizedTxs, ...normalizedPending].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    const sliced = merged.slice(0, hardLimit);
    const nextBefore =
      sliced.length > 0 ? sliced[sliced.length - 1].createdAt : null;
    return { items: sliced, nextBefore };
  }

  private async ensureMerchantCustomerContext(
    merchantId: string,
    customerId: string,
  ): Promise<MerchantContext> {
    const prismaAny = this.prisma as any;
    const existing = await prismaAny?.merchantCustomer?.findUnique?.({
      where: { merchantId_customerId: { merchantId, customerId } },
      select: { id: true },
    });
    if (existing) return { merchantCustomerId: existing.id, customerId };

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        tgId: true,
        phone: true,
        email: true,
        name: true,
      },
    });
    if (!customer) throw new BadRequestException('customer not found');

    const created = await prismaAny?.merchantCustomer?.create?.({
      data: {
        merchantId,
        customerId,
        tgId: customer.tgId ?? null,
        phone: customer.phone ?? null,
        email: customer.email ?? null,
        name: customer.name ?? null,
      },
      select: { id: true },
    });
    if (!created) throw new Error('failed to create merchant customer');
    return { merchantCustomerId: created.id, customerId };
  }

  private async ensureMerchantCustomerByTelegram(
    merchantId: string,
    tgId: string,
    initData: string,
  ): Promise<{ merchantCustomerId: string }> {
    console.log(
      'ensureMerchantCustomerByTelegram called with merchantId:',
      merchantId,
      'tgId:',
      tgId,
    );
    const existing = await this.prisma.merchantCustomer.findUnique({
      where: { merchantId_tgId: { merchantId, tgId } },
    });
    if (existing) {
      return { merchantCustomerId: existing.id };
    }
    const customer = await this.prisma.customer.create({
      data: { tgId },
      select: { id: true },
    });
    const merchantCustomer = await this.prisma.merchantCustomer.create({
      data: {
        merchantId,
        customerId: customer.id,
        name: null,
        phone: null,
        tgId,
      },
      select: { id: true },
    });
    console.log('merchantCustomer:', merchantCustomer);
    return { merchantCustomerId: merchantCustomer.id };
  }
}
