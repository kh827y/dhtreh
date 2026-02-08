import { LedgerAccount, Prisma, TxnType, WalletType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { VALID_RECEIPT_NO_REFUND_SQL } from '../../../shared/common/valid-receipt-sql.util';
import type { PrismaTx } from './loyalty-ops.types';

export class LoyaltyReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly config: AppConfigService,
  ) {}

  async applyReferralRewards(
    tx: PrismaTx,
    ctx: {
      merchantId: string;
      buyerId: string;
      purchaseAmount: number;
      receiptId: string;
      orderId: string;
      outletId: string | null;
      staffId: string | null;
      deviceId: string | null;
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
    type LevelRewardConfig = {
      level?: number | null;
      reward?: number | null;
      enabled?: boolean | null;
    };
    const lvCfgArr: LevelRewardConfig[] = Array.isArray(program.levelRewards)
      ? (program.levelRewards as LevelRewardConfig[])
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
          await tx.wallet.update({
            where: { id: w.id },
            data: { balance: { increment: points } },
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
              deviceId: ctx.deviceId ?? null,
              metadata: {
                source: 'REFERRAL_BONUS',
                referralLevel: level,
                receiptId: ctx.receiptId,
                buyerId: ctx.buyerId,
              } as Prisma.JsonObject,
            },
          });
          if (this.config.isLedgerEnabled()) {
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
                deviceId: ctx.deviceId ?? null,
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
      if (!parent) break;
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

  async rollbackReferralRewards(
    tx: PrismaTx,
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
          AND ${VALID_RECEIPT_NO_REFUND_SQL}
          AND r."total" >= ${minPurchaseAmount}
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
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });
      const rewardMeta = reward?.metadata;
      let rollbackBuyerId: string | null = null;
      if (
        rewardMeta &&
        typeof rewardMeta === 'object' &&
        !Array.isArray(rewardMeta)
      ) {
        const rawBuyerId = (rewardMeta as Record<string, unknown>).buyerId;
        if (typeof rawBuyerId === 'string') {
          const trimmed = rawBuyerId.trim();
          if (trimmed) rollbackBuyerId = trimmed;
        } else if (
          typeof rawBuyerId === 'number' ||
          typeof rawBuyerId === 'bigint'
        ) {
          rollbackBuyerId = String(rawBuyerId);
        }
      }
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
            buyerId: rollbackBuyerId,
          } as Prisma.JsonObject,
        },
      });
      if (this.config.isLedgerEnabled()) {
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

  async loadReferralRewardsForCustomer(
    tx: PrismaTx,
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

  async reopenReferralAfterRefund(
    tx: PrismaTx,
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
    const trigger = String(
      referral.program?.rewardTrigger || 'first',
    ).toLowerCase();
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
}
