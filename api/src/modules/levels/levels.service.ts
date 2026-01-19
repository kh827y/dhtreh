import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import {
  computeLevelState,
  DEFAULT_LEVELS_METRIC,
  DEFAULT_LEVELS_PERIOD_DAYS,
  normalizeLevelsPeriodDays,
  type LevelRule,
} from '../loyalty/levels.util';
import { ensureBaseTier, toLevelRule } from '../loyalty/tier-defaults.util';
import { Prisma, type LoyaltyTier } from '@prisma/client';

type TierAssignmentWithTier = Prisma.LoyaltyTierAssignmentGetPayload<{
  include: { tier: true };
}>;

@Injectable()
export class LevelsService {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  async getLevel(
    merchantId: string,
    customerId: string,
  ): Promise<{
    merchantId: string;
    customerId: string;
    metric: 'earn' | 'redeem' | 'transactions';
    periodDays: number;
    value: number;
    current: LevelRule;
    next: LevelRule | null;
    progressToNext: number;
  }> {
    await ensureBaseTier(this.prisma, merchantId).catch(() => null);
    let tiers: LoyaltyTier[] = [];
    try {
      tiers = await this.prisma.loyaltyTier.findMany({
        where: { merchantId },
        orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
      });
    } catch {}
    const visibleLevels = tiers
      .filter((tier) => !tier?.isHidden)
      .map((tier) => toLevelRule(tier));
    const levels: LevelRule[] =
      visibleLevels.length > 0
        ? visibleLevels
        : [{ name: 'Base', threshold: 0 }];
    let periodDays = DEFAULT_LEVELS_PERIOD_DAYS;
    try {
      const settings = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { rulesJson: true },
      });
      const rules = this.asRecord(settings?.rulesJson);
      periodDays = normalizeLevelsPeriodDays(
        rules?.levelsPeriodDays,
        DEFAULT_LEVELS_PERIOD_DAYS,
      );
    } catch {}
    const cfg = {
      periodDays,
      metric: DEFAULT_LEVELS_METRIC,
      levels,
    };
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, merchantId: true },
    });
    if (!customer || customer.merchantId !== merchantId) {
      throw new NotFoundException('customer not found');
    }

    const assignment: TierAssignmentWithTier | null =
      await this.prisma.loyaltyTierAssignment
        .findFirst({
          where: {
            merchantId,
            customerId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { assignedAt: 'desc' },
          include: {
            tier: true,
          },
        })
        .catch(() => null);

    const { value, current, next, progressToNext } = await computeLevelState({
      prisma: this.prisma,
      metrics: this.metrics,
      merchantId,
      customerId,
      config: cfg,
      includeRefunds: true,
    });
    let effectiveCurrent = current;
    let effectiveNext = next;
    let effectiveProgress = progressToNext;

    if (assignment?.tier) {
      const assignedRule = toLevelRule(assignment.tier);
      effectiveCurrent = assignedRule;
      if (assignedRule.isHidden) {
        effectiveNext = null;
        effectiveProgress = 0;
      } else {
        const ordered = levels;
        const idx = ordered.findIndex(
          (lvl) =>
            lvl.name.toLowerCase().trim() ===
            assignedRule.name.toLowerCase().trim(),
        );
        if (idx >= 0) {
          effectiveNext = ordered[idx + 1] ?? null;
        } else {
          effectiveNext =
            ordered.find((lvl) => lvl.threshold > assignedRule.threshold) ??
            null;
        }
        effectiveProgress = effectiveNext
          ? Math.max(0, effectiveNext.threshold - value)
          : 0;
      }
    }
    return {
      merchantId,
      customerId,
      metric: cfg.metric,
      periodDays: cfg.periodDays,
      value,
      current: effectiveCurrent,
      next: effectiveNext,
      progressToNext: effectiveProgress,
    };
  }
}
