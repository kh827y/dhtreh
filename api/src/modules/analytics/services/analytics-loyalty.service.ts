import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import { AnalyticsTimezoneService } from '../analytics-timezone.service';
import type {
  DashboardPeriod,
  LoyaltyMetrics,
  TimeGrouping,
} from '../analytics.service';
import type { RussiaTimezone } from '../../../shared/timezone/russia-timezones';
import {
  advanceDate,
  formatDateLabel,
  resolveGrouping,
  truncateForTimezone,
} from '../analytics-time.util';

@Injectable()
export class AnalyticsLoyaltyService {
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
   * Метрики программы лояльности
   */
  async getLoyaltyMetrics(
    merchantId: string,
    period: DashboardPeriod,
    grouping?: TimeGrouping,
    timezone?: string | RussiaTimezone,
  ): Promise<LoyaltyMetrics> {
    const tz = await this.timezone.getTimezoneInfo(merchantId, timezone);
    const cacheKey = this.cacheKey('loyalty', [
      merchantId,
      tz.code,
      grouping,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<LoyaltyMetrics>(cacheKey);
    if (cached) return cached;
    const effectiveGrouping = resolveGrouping(period, grouping);

    const [earnedRows, redeemedRows, balances, activeWallets, pointsSeries] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{ total: Prisma.Decimal | number | null }>
        >(Prisma.sql`
          SELECT COALESCE(SUM(t."amount"), 0)::numeric AS total
          FROM "Transaction" t
          WHERE t."merchantId" = ${merchantId}
            AND t."createdAt" >= ${period.from}
            AND t."createdAt" <= ${period.to}
            AND t."canceledAt" IS NULL
            AND t."type" = 'EARN'
            AND (
              t."orderId" IS NULL
              OR NOT EXISTS (
                SELECT 1
                FROM "Transaction" refund
                WHERE refund."merchantId" = t."merchantId"
                  AND refund."orderId" = t."orderId"
                  AND refund."type" = 'REFUND'
                  AND refund."canceledAt" IS NULL
              )
            )
        `),
        this.prisma.$queryRaw<
          Array<{ total: Prisma.Decimal | number | null }>
        >(Prisma.sql`
          SELECT COALESCE(SUM(t."amount"), 0)::numeric AS total
          FROM "Transaction" t
          WHERE t."merchantId" = ${merchantId}
            AND t."createdAt" >= ${period.from}
            AND t."createdAt" <= ${period.to}
            AND t."canceledAt" IS NULL
            AND t."type" = 'REDEEM'
            AND (
              t."orderId" IS NULL
              OR NOT EXISTS (
                SELECT 1
                FROM "Transaction" refund
                WHERE refund."merchantId" = t."merchantId"
                  AND refund."orderId" = t."orderId"
                  AND refund."type" = 'REFUND'
                  AND refund."canceledAt" IS NULL
              )
            )
        `),
        this.prisma.wallet.aggregate({
          where: { merchantId },
          _avg: { balance: true },
        }),
        this.prisma.wallet.count({
          where: { merchantId, balance: { gt: 0 } },
        }),
        this.getPointsSeries(merchantId, period, effectiveGrouping, tz),
      ]);

    const totalPointsIssued = Math.abs(Number(earnedRows?.[0]?.total || 0));
    const totalPointsRedeemed = Math.abs(Number(redeemedRows?.[0]?.total || 0));
    const redemptionRate =
      totalPointsIssued > 0
        ? (totalPointsRedeemed / totalPointsIssued) * 100
        : 0;

    const roi = await this.calculateLoyaltyROI(merchantId, period);
    const conversionRate = await this.calculateLoyaltyConversion(
      merchantId,
      period,
    );

    const result = {
      totalPointsIssued,
      totalPointsRedeemed,
      pointsRedemptionRate: Math.round(redemptionRate * 10) / 10,
      averageBalance: Math.round(balances._avg.balance || 0),
      activeWallets,
      programROI: Math.round(roi * 10) / 10,
      conversionRate: Math.round(conversionRate * 10) / 10,
      pointsSeries,
      pointsGrouping: effectiveGrouping,
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  private async getPointsSeries(
    merchantId: string,
    period: DashboardPeriod,
    grouping: TimeGrouping,
    timezone: RussiaTimezone,
  ): Promise<LoyaltyMetrics['pointsSeries']> {
    const groupingFragment =
      grouping === 'month'
        ? Prisma.sql`'month'`
        : grouping === 'week'
          ? Prisma.sql`'week'`
          : Prisma.sql`'day'`;
    const offsetInterval = Prisma.sql`${timezone.utcOffsetMinutes} * interval '1 minute'`;

    const [rawSeries, initialBalanceRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          bucket: Date;
          accrued: Prisma.Decimal | bigint | number | null;
          redeemed: Prisma.Decimal | bigint | number | null;
          burned: Prisma.Decimal | bigint | number | null;
          net: Prisma.Decimal | bigint | number | null;
        }>
      >(Prisma.sql`
        SELECT
          date_trunc(${groupingFragment}, t."createdAt" + ${offsetInterval}) - ${offsetInterval} AS bucket,
          SUM(
            CASE
              WHEN t."type" IN ('EARN', 'CAMPAIGN', 'REFERRAL', 'ADJUST') AND t."amount" > 0
                THEN t."amount"
              ELSE 0
            END
          )::numeric AS accrued,
          SUM(
            CASE
              WHEN t."type" = 'REDEEM'
                THEN -t."amount"
              ELSE 0
            END
          )::numeric AS redeemed,
          SUM(
            CASE
              WHEN t."type" = 'ADJUST' AND t."amount" < 0
                THEN -t."amount"
              ELSE 0
            END
          )::numeric AS burned,
          SUM(t."amount")::numeric AS net
        FROM "Transaction" t
        WHERE t."merchantId" = ${merchantId}
          AND t."createdAt" >= ${period.from}
          AND t."createdAt" <= ${period.to}
          AND t."canceledAt" IS NULL
          AND t."type" <> 'REFUND'
          AND (
            t."orderId" IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM "Transaction" refund
              WHERE refund."merchantId" = t."merchantId"
                AND refund."orderId" = t."orderId"
                AND refund."type" = 'REFUND'
                AND refund."canceledAt" IS NULL
            )
          )
        GROUP BY 1
        ORDER BY 1
      `),
      this.prisma.$queryRaw<
        Array<{ balance: Prisma.Decimal | number | null }>
      >(Prisma.sql`
        SELECT
          COALESCE(SUM(t."amount"), 0)::numeric AS balance
        FROM "Transaction" t
        WHERE t."merchantId" = ${merchantId}
          AND t."createdAt" < ${period.from}
          AND t."canceledAt" IS NULL
          AND t."type" <> 'REFUND'
          AND (
            t."orderId" IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM "Transaction" refund
              WHERE refund."merchantId" = t."merchantId"
                AND refund."orderId" = t."orderId"
                AND refund."type" = 'REFUND'
                AND refund."canceledAt" IS NULL
            )
          )
      `),
    ]);

    const initialBalance = Number(initialBalanceRows?.[0]?.balance || 0);
    const byLabel = new Map<
      string,
      { accrued: number; redeemed: number; burned: number; net: number }
    >();

    for (const row of rawSeries) {
      const label = formatDateLabel(new Date(row.bucket), timezone);
      byLabel.set(label, {
        accrued: Math.round(Number(row.accrued ?? 0)),
        redeemed: Math.round(Number(row.redeemed ?? 0)),
        burned: Math.round(Number(row.burned ?? 0)),
        net: Number(row.net ?? 0),
      });
    }

    const start = truncateForTimezone(period.from, grouping, timezone);
    const end = truncateForTimezone(period.to, grouping, timezone);
    const result: LoyaltyMetrics['pointsSeries'] = [];
    let cursor = new Date(start);
    let balance = initialBalance;

    while (cursor.getTime() <= end.getTime()) {
      const label = formatDateLabel(cursor, timezone);
      const entry = byLabel.get(label) || {
        accrued: 0,
        redeemed: 0,
        burned: 0,
        net: 0,
      };
      balance += entry.net;
      result.push({
        date: label,
        accrued: entry.accrued,
        redeemed: entry.redeemed,
        burned: entry.burned,
        balance: Math.round(balance),
      });
      cursor = advanceDate(cursor, grouping, timezone);
    }

    return result;
  }

  private async calculateLoyaltyROI(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<number> {
    const [loyaltyStats, programCost] = await Promise.all([
      this.getLoyaltyReceiptStats(merchantId, period),
      this.prisma.transaction.aggregate({
        where: {
          merchantId,
          type: { in: ['EARN', 'CAMPAIGN', 'REFERRAL'] },
          createdAt: { gte: period.from, lte: period.to },
          canceledAt: null,
        },
        _sum: { amount: true },
      }),
    ]);

    const revenue = Math.max(0, loyaltyStats.loyaltyRevenue);
    const cost = Math.abs(programCost._sum.amount || 0);
    return cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
  }

  private async calculateLoyaltyConversion(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<number> {
    const loyaltyStats = await this.getLoyaltyReceiptStats(merchantId, period);
    return loyaltyStats.totalReceipts > 0
      ? (loyaltyStats.loyaltyReceipts / loyaltyStats.totalReceipts) * 100
      : 0;
  }

  private async getLoyaltyReceiptStats(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<{
    loyaltyRevenue: number;
    totalReceipts: number;
    loyaltyReceipts: number;
  }> {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        loyaltyRevenue: Prisma.Decimal | number | null;
        totalReceipts: bigint | number | null;
        loyaltyReceipts: bigint | number | null;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN COALESCE(r."earnApplied", 0) > 0
              OR COALESCE(r."redeemApplied", 0) > 0
            THEN r."total"
            ELSE 0
          END
        ), 0)::numeric AS "loyaltyRevenue",
        COUNT(*)::bigint AS "totalReceipts",
        SUM(
          CASE
            WHEN COALESCE(r."earnApplied", 0) > 0
              OR COALESCE(r."redeemApplied", 0) > 0
            THEN 1
            ELSE 0
          END
        )::bigint AS "loyaltyReceipts"
      FROM "Receipt" r
      WHERE r."merchantId" = ${merchantId}
        AND r."createdAt" >= ${period.from}
        AND r."createdAt" <= ${period.to}
        AND r."canceledAt" IS NULL
        AND r."total" > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "Transaction" refund
          WHERE refund."merchantId" = r."merchantId"
            AND refund."orderId" = r."orderId"
            AND refund."type" = 'REFUND'
            AND refund."canceledAt" IS NULL
        )
    `);

    return {
      loyaltyRevenue: Number(row?.loyaltyRevenue || 0),
      totalReceipts: Number(row?.totalReceipts || 0),
      loyaltyReceipts: Number(row?.loyaltyReceipts || 0),
    };
  }
}
