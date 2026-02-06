import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import { AnalyticsTimezoneService } from '../analytics-timezone.service';
import type {
  DashboardPeriod,
  DailyData,
  RevenueMetrics,
  TimeGrouping,
} from '../analytics.service';
import type { RussiaTimezone } from '../../../shared/timezone/russia-timezones';
import {
  advanceDate,
  formatDateLabel,
  getPreviousPeriod,
  resolveGrouping,
  truncateForTimezone,
} from '../analytics-time.util';

@Injectable()
export class AnalyticsRevenueService {
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

  async getRevenueMetrics(
    merchantId: string,
    period: DashboardPeriod,
    grouping?: TimeGrouping,
    timezone?: string | RussiaTimezone,
  ): Promise<RevenueMetrics> {
    const tz = await this.timezone.getTimezoneInfo(merchantId, timezone);
    const cacheKey = this.cacheKey('revenue', [
      merchantId,
      tz.code,
      grouping,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<RevenueMetrics>(cacheKey);
    if (cached) return cached;
    const effectiveGrouping = resolveGrouping(period, grouping);
    const [currentTotals] = await this.prisma.$queryRaw<
      Array<{
        revenue: Prisma.Decimal | number | null;
        orders: bigint | number | null;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(r."total"), 0)::numeric AS revenue,
        COUNT(*)::bigint AS orders
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

    const totalRevenue = Number(currentTotals?.revenue || 0);
    const transactionCount = Number(currentTotals?.orders || 0);
    const averageCheck =
      transactionCount > 0 ? totalRevenue / transactionCount : 0;

    const previousPeriod = getPreviousPeriod(period);
    const [previousTotals] = await this.prisma.$queryRaw<
      Array<{ revenue: Prisma.Decimal | number | null }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(r."total"), 0)::numeric AS revenue
      FROM "Receipt" r
      WHERE r."merchantId" = ${merchantId}
        AND r."createdAt" >= ${previousPeriod.from}
        AND r."createdAt" <= ${previousPeriod.to}
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

    const previousRevenueTotal = Number(previousTotals?.revenue || 0);

    const revenueGrowth =
      previousRevenueTotal > 0
        ? ((totalRevenue - previousRevenueTotal) / previousRevenueTotal) * 100
        : 0;

    const hourlyDistribution = await this.getHourlyDistribution(
      merchantId,
      period,
      tz,
    );
    const dailyRevenue = await this.getDailyRevenue(
      merchantId,
      period,
      effectiveGrouping,
      tz,
    );

    const result = {
      totalRevenue,
      averageCheck: Math.round(averageCheck),
      transactionCount,
      revenueGrowth: Math.round(revenueGrowth * 10) / 10,
      hourlyDistribution,
      dailyRevenue,
      seriesGrouping: effectiveGrouping,
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  async getHourlyDistribution(
    merchantId: string,
    period: DashboardPeriod,
    timezone: RussiaTimezone,
  ) {
    const offsetInterval = Prisma.sql`${timezone.utcOffsetMinutes} * interval '1 minute'`;
    const rows = await this.prisma.$queryRaw<
      Array<{
        hour: number;
        revenue: Prisma.Decimal | number | null;
        transactions: bigint | number | null;
      }>
    >(Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM (r."createdAt" + ${offsetInterval}))::int AS hour,
        SUM(r."total")::numeric AS revenue,
        COUNT(*)::bigint AS transactions
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
      GROUP BY 1
    `);

    const map = new Map<number, { revenue: number; transactions: number }>();
    for (const row of rows) {
      const hour = Number(row.hour ?? 0);
      if (Number.isNaN(hour)) continue;
      map.set(hour, {
        revenue: Number(row.revenue ?? 0),
        transactions: Number(row.transactions ?? 0),
      });
    }

    return Array.from({ length: 24 }, (_, hour) => {
      const stats = map.get(hour);
      return {
        hour,
        revenue: Math.round(stats?.revenue ?? 0),
        transactions: Number(stats?.transactions ?? 0),
      };
    });
  }

  async getDailyRevenue(
    merchantId: string,
    period: DashboardPeriod,
    grouping: TimeGrouping,
    timezone: RussiaTimezone,
  ): Promise<DailyData[]> {
    const groupingFragment =
      grouping === 'month'
        ? Prisma.sql`'month'`
        : grouping === 'week'
          ? Prisma.sql`'week'`
          : Prisma.sql`'day'`;
    const offsetInterval = Prisma.sql`${timezone.utcOffsetMinutes} * interval '1 minute'`;

    const rawSeries = await this.prisma.$queryRaw<
      Array<{
        bucket: Date;
        revenue: Prisma.Decimal | bigint | number | null;
        orders: bigint | number | null;
        customers: bigint | number | null;
      }>
    >(Prisma.sql`
        SELECT
          date_trunc(${groupingFragment}, r."createdAt" + ${offsetInterval}) - ${offsetInterval} AS bucket,
          SUM(r."total")::numeric AS revenue,
          COUNT(*)::bigint AS orders,
          COUNT(DISTINCT r."customerId")::bigint AS customers
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
        GROUP BY 1
        ORDER BY 1
      `);

    const byLabel = new Map<
      string,
      { revenue: number; orders: number; customers: number }
    >();
    for (const row of rawSeries) {
      const label = formatDateLabel(new Date(row.bucket), timezone);
      const revenue = Number(row.revenue ?? 0);
      const orders = Math.round(Number(row.orders ?? 0));
      const customers = Math.round(Number(row.customers ?? 0));
      byLabel.set(label, { revenue, orders, customers });
    }

    const start = truncateForTimezone(period.from, grouping, timezone);
    const end = truncateForTimezone(period.to, grouping, timezone);
    const result: DailyData[] = [];
    let cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const label = formatDateLabel(cursor, timezone);
      const entry = byLabel.get(label) || {
        revenue: 0,
        orders: 0,
        customers: 0,
      };
      const averageCheck = entry.orders > 0 ? entry.revenue / entry.orders : 0;
      result.push({
        date: label,
        revenue: Math.round(entry.revenue),
        transactions: entry.orders,
        customers: entry.customers,
        averageCheck: Math.round(averageCheck * 100) / 100,
      });
      cursor = advanceDate(cursor, grouping, timezone);
    }

    return result;
  }
}
