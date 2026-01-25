import { Injectable } from '@nestjs/common';
import { Prisma, type LoyaltyTier } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import {
  computeLevelState,
  DEFAULT_LEVELS_METRIC,
  DEFAULT_LEVELS_PERIOD_DAYS,
  normalizeLevelsPeriodDays,
  type LevelRule,
} from '../utils/levels.util';
import { toLevelRule } from '../utils/tier-defaults.util';
import { getRulesRoot } from '../../../shared/rules-json.util';

type PrismaClientLike = Prisma.TransactionClient | PrismaService;
type OptionalModelsClient = PrismaClientLike & {
  merchantSettings?: PrismaService['merchantSettings'];
};

@Injectable()
export class LoyaltyTierService {
  constructor(private readonly prisma: PrismaService) {}

  private logIgnored(err: unknown, context: string) {
    logIgnoredError(err, `LoyaltyTierService ${context}`, undefined, 'debug');
  }

  async resolveTierRatesForCustomer(
    merchantId: string,
    customerId: string,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    try {
      try {
        await this.refreshTierAssignmentIfExpired(
          prisma,
          merchantId,
          customerId,
        );
      } catch (err) {
        this.logIgnored(err, 'refresh assignment');
      }
      let assignment = await prisma.loyaltyTierAssignment.findFirst({
        where: {
          merchantId,
          customerId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { assignedAt: 'desc' },
      });
      if (assignment?.source === 'promocode' && !assignment.expiresAt) {
        const promoCodeIdRaw =
          assignment.metadata &&
          typeof assignment.metadata === 'object' &&
          !Array.isArray(assignment.metadata)
            ? (assignment.metadata as Record<string, unknown>).promoCodeId
            : null;
        const promoCodeId =
          typeof promoCodeIdRaw === 'string' && promoCodeIdRaw.trim()
            ? promoCodeIdRaw
            : null;
        let expiresInDays: number | null = null;
        if (promoCodeId) {
          try {
            const promo = await prisma.promoCode.findUnique({
              where: { id: promoCodeId },
              select: { metadata: true },
            });
            const meta =
              promo?.metadata &&
              typeof promo.metadata === 'object' &&
              !Array.isArray(promo.metadata)
                ? (promo.metadata as Record<string, unknown>)
                : null;
            const level =
              meta &&
              typeof meta.level === 'object' &&
              meta.level !== null &&
              !Array.isArray(meta.level)
                ? (meta.level as Record<string, unknown>)
                : null;
            const raw = level?.expiresInDays;
            if (
              (typeof raw === 'string' || typeof raw === 'number') &&
              Number.isFinite(Number(raw)) &&
              Number(raw) >= 0
            ) {
              expiresInDays = Math.floor(Number(raw));
            }
          } catch (err) {
            this.logIgnored(err, 'promo metadata');
          }
        }
        if (expiresInDays == null) {
          expiresInDays = DEFAULT_LEVELS_PERIOD_DAYS;
        }
        if (expiresInDays > 0) {
          const assignedBase = assignment.assignedAt ?? new Date();
          const promoExpiresAt = new Date(
            assignedBase.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
          );
          try {
            await prisma.loyaltyTierAssignment.update({
              where: {
                merchantId_customerId: {
                  merchantId,
                  customerId,
                },
              },
              data: { expiresAt: promoExpiresAt },
            });
          } catch (err) {
            this.logIgnored(err, 'promo expires update');
          }
          if (promoExpiresAt.getTime() <= Date.now()) {
            try {
              await this.recomputeTierProgress(prisma, {
                merchantId,
                customerId,
              });
            } catch (err) {
              this.logIgnored(err, 'recompute progress');
            }
            assignment = await prisma.loyaltyTierAssignment.findFirst({
              where: {
                merchantId,
                customerId,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              orderBy: { assignedAt: 'desc' },
            });
          } else {
            assignment = { ...assignment, expiresAt: promoExpiresAt };
          }
        }
      }
      let tier: LoyaltyTier | null = null;
      if (assignment) {
        tier = await prisma.loyaltyTier.findUnique({
          where: { id: assignment.tierId },
        });
      }
      if (!tier) {
        tier = await prisma.loyaltyTier.findFirst({
          where: { merchantId, isInitial: true },
          orderBy: { thresholdAmount: 'asc' },
        });
      }
      if (!tier) {
        return { earnBps: 0, redeemLimitBps: 0, tierMinPayment: null };
      }
      const earnBps =
        typeof tier.earnRateBps === 'number' ? tier.earnRateBps : 0;
      const redeemLimitBps =
        typeof tier.redeemRateBps === 'number' ? tier.redeemRateBps : 0;
      let tierMinPayment: number | null = null;
      try {
        const meta = tier.metadata;
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
          const record = meta as Record<string, unknown>;
          const raw = record.minPaymentAmount ?? record.minPayment;
          if (raw != null) {
            const mp = Number(raw);
            if (Number.isFinite(mp) && mp >= 0) {
              tierMinPayment = Math.round(mp);
            }
          }
        }
      } catch (err) {
        this.logIgnored(err, 'tier metadata');
      }
      return { earnBps, redeemLimitBps, tierMinPayment };
    } catch (err) {
      this.logIgnored(err, 'resolve tier rates');
      return { earnBps: 0, redeemLimitBps: 0, tierMinPayment: null };
    }
  }

  async isAllowSameReceipt(merchantId: string): Promise<boolean> {
    let allowSame = false;
    try {
      const settings = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { rulesJson: true },
      });
      const rules = getRulesRoot(settings?.rulesJson);
      if (rules) allowSame = Boolean(rules.allowEarnRedeemSameReceipt);
    } catch (err) {
      this.logIgnored(err, 'same receipt rules');
    }
    return allowSame;
  }

  async refreshTierAssignmentIfExpired(
    tx: PrismaClientLike,
    merchantId: string,
    customerId: string,
  ) {
    const expired = await tx.loyaltyTierAssignment.findFirst({
      where: {
        merchantId,
        customerId,
        expiresAt: { lte: new Date() },
      },
    });
    if (expired) {
      await this.recomputeTierProgress(tx, { merchantId, customerId });
    }
  }

  async recomputeTierProgress(
    tx: PrismaClientLike,
    params: { merchantId: string; customerId: string },
  ) {
    let periodDays = DEFAULT_LEVELS_PERIOD_DAYS;
    try {
      const settingsClient = tx as OptionalModelsClient;
      const settings = await (
        settingsClient.merchantSettings ?? this.prisma.merchantSettings
      ).findUnique({
        where: { merchantId: params.merchantId },
        select: { rulesJson: true },
      });
      const rules = getRulesRoot(settings?.rulesJson);
      periodDays = normalizeLevelsPeriodDays(
        rules?.levelsPeriodDays,
        DEFAULT_LEVELS_PERIOD_DAYS,
      );
    } catch (err) {
      this.logIgnored(err, 'load settings');
    }
    const metric: 'earn' | 'redeem' | 'transactions' = DEFAULT_LEVELS_METRIC;
    const tiers = await tx.loyaltyTier.findMany({
      where: { merchantId: params.merchantId },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
    });
    const visibleTiers = tiers.filter((tier) => !tier.isHidden);
    if (!visibleTiers.length) return;
    const levelRules = visibleTiers.map((tier) => toLevelRule(tier));
    const { value } = await computeLevelState({
      prisma: tx,
      merchantId: params.merchantId,
      customerId: params.customerId,
      config: {
        periodDays,
        metric,
        levels: levelRules,
      },
      includeCanceled: false,
      includeRefunds: true,
    });
    await this.promoteTierIfEligible(tx, {
      merchantId: params.merchantId,
      customerId: params.customerId,
      progress: value,
      levelRules,
      tiers: visibleTiers,
      periodDays,
    });
  }

  private async promoteTierIfEligible(
    tx: PrismaClientLike,
    params: {
      merchantId: string;
      customerId: string;
      progress: number;
      levelRules?: LevelRule[];
      tiers?: LoyaltyTier[];
      periodDays?: number;
    },
  ) {
    const tiers =
      params.tiers ??
      (await tx.loyaltyTier.findMany({
        where: { merchantId: params.merchantId },
        orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
      }));
    if (!tiers.length) return;
    const visibleTiers = tiers.filter((tier) => !tier.isHidden);
    if (!visibleTiers.length) return;
    const levelRules =
      params.levelRules ?? visibleTiers.map((tier) => toLevelRule(tier));
    const targetIndex = (() => {
      let idx = -1;
      for (let i = 0; i < levelRules.length; i += 1) {
        if (params.progress >= levelRules[i].threshold) idx = i;
        else break;
      }
      return idx;
    })();
    const target =
      targetIndex >= 0 ? (visibleTiers[targetIndex] ?? null) : null;
    if (!target) return;
    const currentAssign = await tx.loyaltyTierAssignment.findFirst({
      where: {
        merchantId: params.merchantId,
        customerId: params.customerId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { assignedAt: 'desc' },
    });
    const currentTierId = currentAssign?.tierId ?? null;
    if (currentTierId === target.id) return;
    if (currentAssign?.source === 'manual') return;
    await tx.loyaltyTierAssignment.upsert({
      where: {
        merchantId_customerId: {
          merchantId: params.merchantId,
          customerId: params.customerId,
        },
      },
      update: {
        tierId: target.id,
        source: 'auto',
        assignedAt: new Date(),
        expiresAt: params.periodDays
          ? new Date(Date.now() + params.periodDays * 24 * 60 * 60 * 1000)
          : null,
      },
      create: {
        merchantId: params.merchantId,
        customerId: params.customerId,
        tierId: target.id,
        source: 'auto',
        assignedAt: new Date(),
        expiresAt: params.periodDays
          ? new Date(Date.now() + params.periodDays * 24 * 60 * 60 * 1000)
          : null,
      },
    });
  }
}
