import { Injectable } from '@nestjs/common';
import { Prisma, TxnType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import { AnalyticsTimezoneService } from '../analytics-timezone.service';
import type {
  DashboardPeriod,
  ReferralSummary,
  ReferralTimelinePoint,
} from '../analytics.service';
import type { RussiaTimezone } from '../../../shared/timezone/russia-timezones';
import {
  fetchReceiptAggregates,
  type ReceiptAggregateRow,
} from '../../../shared/common/receipt-aggregates.util';
import { formatDateLabel, getPreviousPeriod } from '../analytics-time.util';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AnalyticsCacheService,
    private readonly timezone: AnalyticsTimezoneService,
  ) {}

  private cacheKey(
    prefix: string,
    parts: Array<string | number | null | undefined>,
  ) {
    return [
      prefix,
      ...parts.map((part) => (part == null ? '' : String(part))),
    ].join('|');
  }

  /**
   * Реферальная сводка за период
   */
  async getReferralSummary(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<ReferralSummary> {
    const tz = await this.timezone.getTimezoneInfo(merchantId, timezone);
    const cacheKey = this.cacheKey('referral-summary', [
      merchantId,
      tz.code,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<ReferralSummary>(cacheKey);
    if (cached) return cached;
    const current = await this.computeReferralPeriodStats(
      merchantId,
      period,
      tz,
      { withTimeline: true, withLeaderboard: true },
    );
    const previous = await this.computeReferralPeriodStats(
      merchantId,
      getPreviousPeriod(period),
      tz,
      { withTimeline: false, withLeaderboard: false },
    );

    const result = {
      ...current,
      previous: {
        registeredViaReferral: previous.registeredViaReferral,
        purchasedViaReferral: previous.purchasedViaReferral,
        referralRevenue: previous.referralRevenue,
        bonusesIssued: previous.bonusesIssued,
      },
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  async getReferralLeaderboard(
    merchantId: string,
    period: DashboardPeriod,
    timezone: string | RussiaTimezone | undefined,
    offset = 0,
    limit = 50,
  ): Promise<{ items: ReferralSummary['topReferrers'] }> {
    const tz = await this.timezone.getTimezoneInfo(merchantId, timezone);
    const cacheKey = this.cacheKey('referral-leaderboard', [
      merchantId,
      tz.code,
      period.from.toISOString(),
      period.to.toISOString(),
      offset,
      limit,
    ]);
    const cached = this.cache.get<{ items: ReferralSummary['topReferrers'] }>(
      cacheKey,
    );
    if (cached) return cached;
    const data = await this.computeReferralPeriodStats(merchantId, period, tz, {
      withTimeline: false,
      withLeaderboard: true,
      leaderboardOffset: offset,
      leaderboardLimit: limit,
    });
    const result = { items: data.topReferrers };
    this.cache.set(cacheKey, result);
    return result;
  }

  private async computeReferralPeriodStats(
    merchantId: string,
    period: DashboardPeriod,
    tz: RussiaTimezone,
    opts: {
      withTimeline: boolean;
      withLeaderboard: boolean;
      leaderboardOffset?: number;
      leaderboardLimit?: number;
    },
  ) {
    const bonusRows = await this.prisma.transaction.aggregate({
      where: {
        merchantId,
        type: TxnType.REFERRAL,
        createdAt: { gte: period.from, lte: period.to },
        canceledAt: null,
      },
      _sum: { amount: true },
    });
    const bonusesIssued = Number(bonusRows._sum.amount ?? 0);
    const activations = await this.prisma.referral.findMany({
      where: {
        program: { merchantId },
        status: { in: ['ACTIVATED', 'COMPLETED'] },
        activatedAt: { gte: period.from, lte: period.to },
      },
      select: {
        referrerId: true,
        refereeId: true,
        activatedAt: true,
        completedAt: true,
        purchaseAmount: true,
        program: {
          select: {
            referrerReward: true,
            rewardType: true,
            refereeReward: true,
          },
        },
        ...(opts.withLeaderboard
          ? { referrer: { select: { name: true } } }
          : {}),
      },
    });

    const registeredViaReferral = activations.length;
    const refereeIds: string[] = [];
    const refereeToReferrer = new Map<string, string>();
    const leaderboard = new Map<
      string,
      { name: string; invited: number; conversions: number; revenue: number }
    >();

    for (const activation of activations) {
      const referrerId = activation.referrerId;
      const refereeId = activation.refereeId;
      if (refereeId) {
        refereeIds.push(refereeId);
        refereeToReferrer.set(refereeId, referrerId);
      }
      if (opts.withLeaderboard) {
        if (!leaderboard.has(referrerId)) {
          leaderboard.set(referrerId, {
            name: activation.referrer?.name || 'Без имени',
            invited: 0,
            conversions: 0,
            revenue: 0,
          });
        }
        leaderboard.get(referrerId)!.invited += 1;
      }
    }

    let purchasedViaReferral = 0;
    let referralRevenue = 0;
    let cohortAggregates: ReceiptAggregateRow[] = [];
    if (refereeIds.length > 0) {
      cohortAggregates = await fetchReceiptAggregates(this.prisma, {
        merchantId,
        customerIds: refereeIds,
        period,
      });
      for (const row of cohortAggregates) {
        referralRevenue += Math.max(0, row.totalSpent);
        if (
          row.firstPurchaseAt &&
          row.firstPurchaseAt >= period.from &&
          row.firstPurchaseAt <= period.to
        ) {
          purchasedViaReferral += 1;
        }
      }
    }

    if (opts.withLeaderboard && cohortAggregates.length > 0) {
      for (const row of cohortAggregates) {
        const referrerId = refereeToReferrer.get(row.customerId);
        if (!referrerId || !leaderboard.has(referrerId)) continue;
        leaderboard.get(referrerId)!.revenue += Math.max(0, row.totalSpent);
        if (
          row.firstPurchaseAt &&
          row.firstPurchaseAt >= period.from &&
          row.firstPurchaseAt <= period.to
        ) {
          leaderboard.get(referrerId)!.conversions += 1;
        }
      }
    }

    const timeline: ReferralTimelinePoint[] = [];
    if (opts.withTimeline) {
      const timelineKeys = new Map<string, ReferralTimelinePoint>();
      for (
        let cursor = new Date(period.from.getTime());
        cursor.getTime() <= period.to.getTime();
        cursor = new Date(cursor.getTime() + DAY_MS)
      ) {
        const key = formatDateLabel(cursor, tz);
        if (!timelineKeys.has(key)) {
          timelineKeys.set(key, {
            date: key,
            registrations: 0,
            firstPurchases: 0,
          });
        }
      }

      for (const activation of activations) {
        if (!activation.activatedAt) continue;
        const key = formatDateLabel(activation.activatedAt, tz);
        const point = timelineKeys.get(key);
        if (point) point.registrations += 1;
      }

      if (cohortAggregates.length > 0) {
        for (const row of cohortAggregates) {
          if (
            row.firstPurchaseAt &&
            row.firstPurchaseAt >= period.from &&
            row.firstPurchaseAt <= period.to
          ) {
            const key = formatDateLabel(row.firstPurchaseAt, tz);
            const point = timelineKeys.get(key);
            if (point) point.firstPurchases += 1;
          }
        }
      }
      timeline.push(
        ...Array.from(timelineKeys.values()).sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      );
    }

    const leaderboardOffset = Math.max(0, Number(opts.leaderboardOffset ?? 0));
    const leaderboardLimit =
      typeof opts.leaderboardLimit === 'number'
        ? Math.max(1, Math.min(opts.leaderboardLimit, 200))
        : 20;
    const topReferrers = opts.withLeaderboard
      ? Array.from(leaderboard.entries())
          .map(([customerId, v]) => ({
            customerId,
            name: v.name,
            invited: v.invited,
            conversions: v.conversions,
            revenue: v.revenue,
          }))
          .sort((a, b) => {
            if (b.invited === a.invited) {
              if (b.conversions === a.conversions) {
                return a.customerId.localeCompare(b.customerId);
              }
              return b.conversions - a.conversions;
            }
            return b.invited - a.invited;
          })
          .slice(leaderboardOffset, leaderboardOffset + leaderboardLimit)
          .map((x, i) => ({
            rank: leaderboardOffset + i + 1,
            ...x,
          }))
      : [];

    return {
      registeredViaReferral,
      purchasedViaReferral,
      referralRevenue,
      bonusesIssued: Math.round(bonusesIssued * 100) / 100,
      timeline,
      topReferrers,
    };
  }
}
