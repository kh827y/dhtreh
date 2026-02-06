import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import { AnalyticsRevenueService } from './analytics-revenue.service';
import { AnalyticsTimezoneService } from '../analytics-timezone.service';
import type {
  DashboardPeriod,
  DashboardSummary,
  SummaryMetrics,
  SummaryTimelinePoint,
} from '../analytics.service';
import type { RussiaTimezone } from '../../../shared/timezone/russia-timezones';
import {
  formatDateLabel,
  getPreviousPeriod,
  resolveGrouping,
} from '../analytics-time.util';

type DashboardAggregates = {
  revenue: number;
  orders: number;
  buyers: number;
  pointsRedeemed: number;
};

@Injectable()
export class AnalyticsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AnalyticsCacheService,
    private readonly revenue: AnalyticsRevenueService,
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

  private withCache<T>(key: string, compute: () => Promise<T>): Promise<T> {
    return this.cache.getOrSet(key, compute);
  }

  async getDashboard(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<DashboardSummary> {
    const tz = await this.timezone.getTimezoneInfo(merchantId, timezone);
    const cacheKey = this.cacheKey('dashboard', [
      merchantId,
      tz.code,
      period.type,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    return this.withCache(cacheKey, async () => {
      const grouping = resolveGrouping(period);
      const previousPeriod = getPreviousPeriod(period);

      const [
        currentAggregates,
        previousAggregates,
        currentDailySales,
        previousDailySales,
        currentRegistrationsByDay,
        previousRegistrationsByDay,
        visitFrequency,
        previousVisitFrequency,
        retentionBases,
        composition,
      ] = await Promise.all([
        this.getDashboardAggregates(merchantId, period),
        this.getDashboardAggregates(merchantId, previousPeriod),
        this.revenue.getDailyRevenue(merchantId, period, grouping, tz),
        this.revenue.getDailyRevenue(merchantId, previousPeriod, grouping, tz),
        this.getRegistrationsByDay(merchantId, period, tz),
        this.getRegistrationsByDay(merchantId, previousPeriod, tz),
        this.calculateVisitFrequencyDays(merchantId, period, tz),
        this.calculateVisitFrequencyDays(merchantId, previousPeriod, tz),
        this.getRetentionBases(merchantId, period, previousPeriod),
        this.getCompositionStats(merchantId, period),
      ]);

      const metrics = this.buildDashboardMetrics(
        currentAggregates,
        currentRegistrationsByDay,
        visitFrequency,
      );
      const previousMetrics = this.buildDashboardMetrics(
        previousAggregates,
        previousRegistrationsByDay,
        previousVisitFrequency,
      );

      const timelineCurrent = this.mergeTimeline(
        currentDailySales,
        currentRegistrationsByDay,
      );
      const timelinePrevious = this.mergeTimeline(
        previousDailySales,
        previousRegistrationsByDay,
      );

      const retention = this.calculateRetentionStats(
        retentionBases.current,
        retentionBases.previous,
      );

      return {
        period: {
          from: period.from.toISOString(),
          to: period.to.toISOString(),
          type: period.type,
        },
        previousPeriod: {
          from: previousPeriod.from.toISOString(),
          to: previousPeriod.to.toISOString(),
          type: previousPeriod.type,
        },
        metrics,
        previousMetrics,
        timeline: {
          current: timelineCurrent,
          previous: timelinePrevious,
          grouping,
        },
        composition,
        retention,
      };
    });
  }

  async getBusinessMetrics(
    merchantId: string,
    period: DashboardPeriod,
    minPurchases = 3,
  ) {
    const groups = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: {
        merchantId,
        type: 'EARN',
        createdAt: { gte: period.from, lte: period.to },
      },
      _count: true,
      _sum: { amount: true },
    });
    const filtered = groups.filter((g) => g._count >= minPurchases);
    const transactions = filtered.reduce((s, g) => s + g._count, 0);
    const revenue = filtered.reduce(
      (s, g) => s + Math.abs(g._sum.amount || 0),
      0,
    );
    const customers = filtered.length;
    const averageCheck =
      transactions > 0 ? Math.round(revenue / transactions) : 0;
    return { minPurchases, averageCheck, customers, transactions, revenue };
  }

  async getRetentionCohorts(
    merchantId: string,
    by: 'month' | 'week' = 'month',
    limit = 6,
  ) {
    const cacheKey = this.cacheKey('retention-cohorts', [
      merchantId,
      by,
      limit,
    ]);
    const cached = this.cache.get<
      Array<{
        cohort: string;
        from: string;
        to: string;
        size: number;
        retention: number[];
      }>
    >(cacheKey);
    if (cached) return cached;
    const now = new Date();
    const cohorts: Array<{ label: string; start: Date; end: Date }> = [];
    const makeMonth = (d: Date) => {
      const s = new Date(d);
      s.setDate(1);
      s.setHours(0, 0, 0, 0);
      const e = new Date(s);
      e.setMonth(e.getMonth() + 1);
      e.setMilliseconds(e.getMilliseconds() - 1);
      const label = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}`;
      return { label, start: s, end: e };
    };
    const makeWeek = (d: Date) => {
      const s = new Date(d);
      const day = s.getDay();
      const diff = s.getDate() - day + (day === 0 ? -6 : 1);
      s.setDate(diff);
      s.setHours(0, 0, 0, 0);
      const e = new Date(s);
      e.setDate(e.getDate() + 7);
      e.setMilliseconds(e.getMilliseconds() - 1);
      const y = s.getFullYear();
      const week = Math.floor(
        (((s as any) - (new Date(y, 0, 1) as any)) / 86400000 +
          new Date(y, 0, 1).getDay() +
          1) /
          7,
      );
      const label = `${y}-W${String(week).padStart(2, '0')}`;
      return { label, start: s, end: e };
    };

    let cursor = new Date(now);
    for (let i = 0; i < limit; i++) {
      const c = by === 'week' ? makeWeek(cursor) : makeMonth(cursor);
      cohorts.push({ label: c.label, start: c.start, end: c.end });
      cursor = new Date(c.start);
      if (by === 'week') cursor.setDate(cursor.getDate() - 1);
      else cursor.setDate(0);
    }

    const results: Array<{
      cohort: string;
      from: string;
      to: string;
      size: number;
      retention: number[];
    }> = [];

    for (let i = cohorts.length - 1; i >= 0; i--) {
      const { label, start, end } = cohorts[i];
      const cohortCustomers = await this.prisma.customerStats.findMany({
        where: {
          merchantId,
          firstSeenAt: { gte: start, lte: end },
          customer: { erasedAt: null },
        },
        select: { customerId: true },
      });
      const ids = cohortCustomers.map((c) => c.customerId);
      const size = ids.length;
      const retention: number[] = [];
      const maxShifts = cohorts.length - i;
      for (let s = 0; s < maxShifts; s++) {
        const periodStart = new Date(start);
        const periodEnd = new Date(start);
        if (by === 'week') {
          periodStart.setDate(periodStart.getDate() + 7 * s);
          periodEnd.setDate(periodStart.getDate() + 7);
        } else {
          periodStart.setMonth(periodStart.getMonth() + s);
          periodEnd.setMonth(periodStart.getMonth() + 1);
        }
        let returned = 0;
        if (size > 0) {
          const [row] = await this.prisma.$queryRaw<
            Array<{ count: bigint | number | null }>
          >(Prisma.sql`
            SELECT COUNT(DISTINCT r."customerId")::bigint AS count
            FROM "Receipt" r
            WHERE r."merchantId" = ${merchantId}
              AND r."customerId" IN (${Prisma.join(ids)})
              AND r."createdAt" >= ${periodStart}
              AND r."createdAt" < ${periodEnd}
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
          returned = Number(row?.count || 0);
        }
        retention.push(
          size > 0 ? Math.round((returned / size) * 1000) / 10 : 0,
        );
      }
      results.push({
        cohort: label,
        from: start.toISOString(),
        to: end.toISOString(),
        size,
        retention,
      });
    }

    this.cache.set(cacheKey, results);
    return results;
  }

  private async getRegistrationsByDay(
    merchantId: string,
    period: DashboardPeriod,
    timezone: RussiaTimezone,
  ): Promise<Map<string, number>> {
    const offsetInterval = Prisma.sql`${timezone.utcOffsetMinutes} * interval '1 minute'`;
    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: Date;
        registrations: Prisma.Decimal | bigint | number | null;
      }>
    >(Prisma.sql`
      SELECT
        date_trunc('day', w."createdAt" + ${offsetInterval}) - ${offsetInterval} AS bucket,
        COUNT(*)::bigint AS registrations
      FROM "Wallet" w
      WHERE w."merchantId" = ${merchantId}
        AND w."createdAt" >= ${period.from}
        AND w."createdAt" <= ${period.to}
      GROUP BY 1
      ORDER BY 1
    `);

    const map = new Map<string, number>();
    for (const row of rows) {
      const label = formatDateLabel(new Date(row.bucket), timezone);
      map.set(label, Math.max(0, Math.round(Number(row.registrations ?? 0))));
    }
    return map;
  }

  private async calculateVisitFrequencyDays(
    merchantId: string,
    period: DashboardPeriod,
    timezone: RussiaTimezone,
  ): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<
      Array<{ avgDays: Prisma.Decimal | number | null }>
    >(Prisma.sql`
      WITH purchases AS (
        SELECT
          r."customerId" AS customer_id,
          (r."createdAt" AT TIME ZONE ${timezone.iana})::date AS local_date
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" >= ${period.from}
          AND r."createdAt" <= ${period.to}
          AND r."canceledAt" IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "Transaction" refund
            WHERE refund."merchantId" = r."merchantId"
              AND refund."orderId" = r."orderId"
              AND refund."type" = 'REFUND'
              AND refund."canceledAt" IS NULL
          )
      ),
      ordered AS (
        SELECT
          customer_id,
          local_date,
          LAG(local_date) OVER (PARTITION BY customer_id ORDER BY local_date) AS prev_date
        FROM purchases
      ),
      diffs AS (
        SELECT EXTRACT(EPOCH FROM (local_date - prev_date) * interval '1 day') / 86400.0 AS diff_days
        FROM ordered
        WHERE prev_date IS NOT NULL
      )
      SELECT AVG(diff_days) AS "avgDays"
      FROM diffs
    `);

    if (!row || row.avgDays == null) return null;
    const days = Number(row.avgDays);
    if (!Number.isFinite(days) || days < 0) return null;
    return Math.round(days * 10) / 10;
  }

  private buildDashboardMetrics(
    aggregates: DashboardAggregates,
    registrationsByDay: Map<string, number>,
    visitFrequency: number | null,
  ): SummaryMetrics {
    const salesAmount = Math.max(0, Math.round(aggregates.revenue));
    const orders = Math.max(0, Math.round(aggregates.orders));
    const buyers = Math.max(0, Math.round(aggregates.buyers));
    const totalRegistrations = Array.from(registrationsByDay.values()).reduce(
      (sum, value) => sum + Math.max(0, value),
      0,
    );
    const averageCheck = orders > 0 ? Math.round(salesAmount / orders) : 0;
    const averagePurchasesPerCustomer =
      buyers > 0 ? Math.round((orders / buyers) * 10) / 10 : 0;

    return {
      salesAmount,
      orders,
      averageCheck,
      newCustomers: totalRegistrations,
      activeCustomers: buyers,
      averagePurchasesPerCustomer,
      visitFrequencyDays: visitFrequency,
      pointsBurned: Math.max(0, Math.round(aggregates.pointsRedeemed)),
    };
  }

  private mergeTimeline(
    sales: Array<{
      date: string;
      revenue: number;
      transactions: number;
      customers: number;
      averageCheck: number;
    }>,
    registrationsByDay: Map<string, number>,
  ): SummaryTimelinePoint[] {
    return sales.map((item) => ({
      date: item.date,
      registrations: registrationsByDay.get(item.date) ?? 0,
      salesCount: item.transactions,
      salesAmount: item.revenue,
    }));
  }

  private async getDashboardAggregates(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<DashboardAggregates> {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        revenue: Prisma.Decimal | number | null;
        orders: bigint | number | null;
        buyers: bigint | number | null;
        pointsRedeemed: Prisma.Decimal | number | null;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(r."total"), 0)::numeric AS revenue,
        COUNT(*)::bigint AS orders,
        COUNT(DISTINCT r."customerId")::bigint AS buyers,
        COALESCE(SUM(ABS(COALESCE(r."redeemApplied", 0))), 0)::numeric AS "pointsRedeemed"
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
      revenue: Number(row?.revenue ?? 0),
      orders: Number(row?.orders ?? 0),
      buyers: Number(row?.buyers ?? 0),
      pointsRedeemed: Math.abs(Number(row?.pointsRedeemed ?? 0)),
    };
  }

  private async getRetentionBases(
    merchantId: string,
    current: DashboardPeriod,
    previous: DashboardPeriod,
  ) {
    const [currentRows, previousRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ customerId: string | null }>>(Prisma.sql`
        SELECT DISTINCT r."customerId" AS "customerId"
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" >= ${current.from}
          AND r."createdAt" <= ${current.to}
          AND r."canceledAt" IS NULL
          AND r."total" > 0
          AND r."customerId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "Transaction" refund
            WHERE refund."merchantId" = r."merchantId"
              AND refund."orderId" = r."orderId"
              AND refund."type" = 'REFUND'
              AND refund."canceledAt" IS NULL
          )
      `),
      this.prisma.$queryRaw<Array<{ customerId: string | null }>>(Prisma.sql`
        SELECT DISTINCT r."customerId" AS "customerId"
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" >= ${previous.from}
          AND r."createdAt" <= ${previous.to}
          AND r."canceledAt" IS NULL
          AND r."total" > 0
          AND r."customerId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "Transaction" refund
            WHERE refund."merchantId" = r."merchantId"
              AND refund."orderId" = r."orderId"
              AND refund."type" = 'REFUND'
              AND refund."canceledAt" IS NULL
          )
      `),
    ]);

    const currentSet = new Set(
      currentRows
        .map((row) => String(row.customerId || '').trim())
        .filter(Boolean),
    );
    const previousSet = new Set(
      previousRows
        .map((row) => String(row.customerId || '').trim())
        .filter(Boolean),
    );

    return { current: currentSet, previous: previousSet };
  }

  private calculateRetentionStats(current: Set<string>, previous: Set<string>) {
    let retained = 0;
    for (const id of previous) {
      if (current.has(id)) retained += 1;
    }
    const activePrevious = previous.size;
    const activeCurrent = current.size;
    const retentionRate =
      activePrevious > 0
        ? Math.round((retained / activePrevious) * 1000) / 10
        : 0;
    const churnRate =
      activePrevious > 0
        ? Math.max(0, Math.round((100 - retentionRate) * 10) / 10)
        : 0;

    return {
      activeCurrent,
      activePrevious,
      retained,
      retentionRate,
      churnRate,
    };
  }

  private async getCompositionStats(
    merchantId: string,
    period: DashboardPeriod,
  ) {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        newChecks: bigint | number | null;
        repeatChecks: bigint | number | null;
      }>
    >(Prisma.sql`
      WITH valid_receipts AS (
        SELECT
          r."customerId",
          r."createdAt"
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" >= ${period.from}
          AND r."createdAt" <= ${period.to}
          AND r."canceledAt" IS NULL
          AND r."total" > 0
          AND r."customerId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "Transaction" refund
            WHERE refund."merchantId" = r."merchantId"
              AND refund."orderId" = r."orderId"
              AND refund."type" = 'REFUND'
              AND refund."canceledAt" IS NULL
          )
      ),
      first_purchases AS (
        SELECT
          r."customerId",
          MIN(r."createdAt") AS first_at
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."canceledAt" IS NULL
          AND r."total" > 0
          AND r."customerId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "Transaction" refund
            WHERE refund."merchantId" = r."merchantId"
              AND refund."orderId" = r."orderId"
              AND refund."type" = 'REFUND'
              AND refund."canceledAt" IS NULL
          )
        GROUP BY r."customerId"
      )
      SELECT
        COUNT(*) FILTER (
          WHERE fp.first_at >= ${period.from} AND fp.first_at <= ${period.to}
        )::bigint AS "newChecks",
        COUNT(*) FILTER (
          WHERE fp.first_at < ${period.from}
        )::bigint AS "repeatChecks"
      FROM valid_receipts vr
      JOIN first_purchases fp ON fp."customerId" = vr."customerId"
    `);

    return {
      newChecks: Math.max(0, Math.round(Number(row?.newChecks ?? 0))),
      repeatChecks: Math.max(0, Math.round(Number(row?.repeatChecks ?? 0))),
    };
  }
}
