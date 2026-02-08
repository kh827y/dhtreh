import { Injectable } from '@nestjs/common';
import { Prisma, TxnType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import { AnalyticsTimezoneService } from '../analytics-timezone.service';
import { AnalyticsRevenueService } from './analytics-revenue.service';
import type {
  DashboardPeriod,
  OperationalMetrics,
  OutletPerformance,
  OutletUsageStats,
  StaffPerformance,
} from '../analytics.service';
import type { RussiaTimezone } from '../../../shared/timezone/russia-timezones';
import { VALID_RECEIPT_NO_REFUND_SQL } from '../../../shared/common/valid-receipt-sql.util';

@Injectable()
export class AnalyticsOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AnalyticsCacheService,
    private readonly timezone: AnalyticsTimezoneService,
    private readonly revenue: AnalyticsRevenueService,
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

  async getOperationalMetrics(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<OperationalMetrics> {
    const tz = await this.timezone.getTimezoneInfo(merchantId, timezone);
    const cacheKey = this.cacheKey('operations', [
      merchantId,
      tz.code,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<OperationalMetrics>(cacheKey);
    if (cached) return cached;
    const [outletMetrics, staffMetrics, peakHours, outletUsage] =
      await Promise.all([
        this.getOutletMetrics(merchantId, period),
        this.getStaffMetrics(merchantId, period),
        this.getPeakHours(merchantId, period, tz),
        this.getOutletUsage(merchantId, period),
      ]);

    const topOutlets = outletMetrics.slice(0, 5);
    const topStaff = staffMetrics.slice(0, 5);

    const result = {
      topOutlets,
      outletMetrics,
      topStaff,
      staffMetrics,
      peakHours,
      outletUsage,
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  private async getOutletMetrics(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<OutletPerformance[]> {
    const outlets = await this.prisma.outlet.findMany({
      where: { merchantId },
      select: { id: true, name: true },
    });

    const [salesRows, newCustomerRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          outletId: string;
          revenue: Prisma.Decimal | number | null;
          transactions: bigint | number | null;
          customers: bigint | number | null;
          pointsIssued: Prisma.Decimal | number | null;
          pointsRedeemed: Prisma.Decimal | number | null;
        }>
      >(Prisma.sql`
        WITH valid_receipts AS (
          SELECT
            r."outletId",
            r."customerId",
            r."total",
            r."earnApplied",
            r."redeemApplied"
          FROM "Receipt" r
          WHERE r."merchantId" = ${merchantId}
            AND r."createdAt" >= ${period.from}
            AND r."createdAt" <= ${period.to}
            AND r."outletId" IS NOT NULL
            AND ${VALID_RECEIPT_NO_REFUND_SQL}
        )
        SELECT
          vr."outletId" AS "outletId",
          COALESCE(SUM(vr."total"), 0)::numeric AS "revenue",
          COUNT(*)::bigint AS "transactions",
          COUNT(DISTINCT vr."customerId")::bigint AS "customers",
          COALESCE(SUM(GREATEST(COALESCE(vr."earnApplied", 0), 0)), 0)::numeric AS "pointsIssued",
          COALESCE(SUM(ABS(COALESCE(vr."redeemApplied", 0))), 0)::numeric AS "pointsRedeemed"
        FROM valid_receipts vr
        GROUP BY vr."outletId"
      `),
      this.prisma.$queryRaw<
        Array<{ outletId: string; newCustomers: bigint | number | null }>
      >(Prisma.sql`
        WITH base_receipts AS (
          SELECT
            r."id",
            r."customerId",
            r."outletId",
            r."createdAt"
          FROM "Receipt" r
          WHERE r."merchantId" = ${merchantId}
            AND r."customerId" IS NOT NULL
            AND r."outletId" IS NOT NULL
            AND ${VALID_RECEIPT_NO_REFUND_SQL}
        ),
        ranked_receipts AS (
          SELECT
            b.*,
            ROW_NUMBER() OVER (
              PARTITION BY b."customerId"
              ORDER BY b."createdAt" ASC, b."id" ASC
            ) AS rn
          FROM base_receipts b
        ),
        first_purchases AS (
          SELECT
            r."customerId",
            r."outletId",
            r."createdAt"
          FROM ranked_receipts r
          WHERE r.rn = 1
        )
        SELECT
          fp."outletId",
          COUNT(*)::bigint AS "newCustomers"
        FROM first_purchases fp
        WHERE fp."createdAt" >= ${period.from}
          AND fp."createdAt" <= ${period.to}
        GROUP BY fp."outletId"
      `),
    ]);

    const outletIds = new Set<string>();
    for (const outlet of outlets) outletIds.add(outlet.id);
    for (const row of salesRows) if (row.outletId) outletIds.add(row.outletId);
    for (const row of newCustomerRows)
      if (row.outletId) outletIds.add(row.outletId);

    if (!outletIds.size) return [];

    const nameMap = new Map(outlets.map((o) => [o.id, o.name || o.id]));
    const salesMap = new Map<
      string,
      {
        revenue: number;
        transactions: number;
        customers: number;
        pointsIssued: number;
        pointsRedeemed: number;
      }
    >();
    for (const row of salesRows) {
      if (!row.outletId) continue;
      salesMap.set(row.outletId, {
        revenue: Number(row.revenue ?? 0),
        transactions: Number(row.transactions ?? 0),
        customers: Number(row.customers ?? 0),
        pointsIssued: Number(row.pointsIssued ?? 0),
        pointsRedeemed: Number(row.pointsRedeemed ?? 0),
      });
    }
    const newCustomersMap = new Map<string, number>();
    for (const row of newCustomerRows) {
      if (!row.outletId) continue;
      newCustomersMap.set(row.outletId, Number(row.newCustomers ?? 0));
    }

    const metrics: OutletPerformance[] = Array.from(outletIds).map((id) => {
      const stats = salesMap.get(id);
      const revenue = stats?.revenue ?? 0;
      const transactions = stats?.transactions ?? 0;
      const avgCheck =
        transactions > 0 ? revenue / Math.max(1, transactions) : 0;
      return {
        id,
        name: nameMap.get(id) ?? id,
        revenue: Math.round(revenue),
        transactions: Math.round(transactions),
        averageCheck: Math.round(avgCheck),
        pointsIssued: Math.round(stats?.pointsIssued ?? 0),
        pointsRedeemed: Math.round(stats?.pointsRedeemed ?? 0),
        customers: Math.round(stats?.customers ?? 0),
        newCustomers: Math.round(newCustomersMap.get(id) ?? 0),
        growth: 0,
      };
    });

    metrics.sort((a, b) => {
      if (b.revenue === a.revenue) return a.id.localeCompare(b.id);
      return b.revenue - a.revenue;
    });

    return metrics;
  }

  private async getStaffMetrics(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<StaffPerformance[]> {
    const [receiptRows, newCustomerRows, motivationRows, ratingRows] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{
            staffId: string;
            outletId: string | null;
            revenue: Prisma.Decimal | number | null;
            transactions: bigint | number | null;
            pointsIssued: Prisma.Decimal | number | null;
            pointsRedeemed: Prisma.Decimal | number | null;
            customers: bigint | number | null;
          }>
        >(Prisma.sql`
          WITH staff_receipts AS (
            SELECT
              r."staffId",
              r."outletId",
              r."customerId",
              r."total",
              r."earnApplied",
              r."redeemApplied"
          FROM "Receipt" r
          WHERE r."merchantId" = ${merchantId}
            AND r."staffId" IS NOT NULL
            AND r."createdAt" >= ${period.from}
            AND r."createdAt" <= ${period.to}
            AND r."customerId" IS NOT NULL
            AND ${VALID_RECEIPT_NO_REFUND_SQL}
          )
          SELECT
            sr."staffId",
            sr."outletId",
            COALESCE(SUM(sr."total"), 0)::numeric AS "revenue",
            COUNT(*)::bigint AS "transactions",
            COALESCE(SUM(GREATEST(COALESCE(sr."earnApplied", 0), 0)), 0)::numeric AS "pointsIssued",
            COALESCE(SUM(ABS(COALESCE(sr."redeemApplied", 0))), 0)::numeric AS "pointsRedeemed",
            COUNT(DISTINCT sr."customerId")::bigint AS "customers"
          FROM staff_receipts sr
          GROUP BY sr."staffId", sr."outletId"
        `),
        this.prisma.$queryRaw<
          Array<{
            staffId: string;
            outletId: string | null;
            newCustomers: bigint | number | null;
          }>
        >(Prisma.sql`
          WITH base_receipts AS (
            SELECT
              r."id",
              r."customerId",
              r."staffId",
              r."outletId",
              r."createdAt"
          FROM "Receipt" r
          WHERE r."merchantId" = ${merchantId}
            AND r."customerId" IS NOT NULL
            AND ${VALID_RECEIPT_NO_REFUND_SQL}
          ),
          ranked_receipts AS (
            SELECT
              b.*,
              ROW_NUMBER() OVER (
                PARTITION BY b."customerId"
                ORDER BY b."createdAt" ASC, b."id" ASC
              ) AS rn
            FROM base_receipts b
          ),
          first_purchases AS (
            SELECT
              r."customerId",
              r."staffId",
              r."outletId",
              r."createdAt"
            FROM ranked_receipts r
            WHERE r.rn = 1
          )
          SELECT
            fp."staffId",
            fp."outletId",
            COUNT(*)::bigint AS "newCustomers"
          FROM first_purchases fp
          WHERE fp."staffId" IS NOT NULL
            AND fp."createdAt" >= ${period.from}
            AND fp."createdAt" <= ${period.to}
          GROUP BY fp."staffId", fp."outletId"
        `),
        this.prisma.staffMotivationEntry.groupBy({
          by: ['staffId', 'outletId'],
          where: {
            merchantId,
            eventAt: { gte: period.from, lte: period.to },
          },
          _sum: { points: true },
        }),
        this.prisma.$queryRaw<
          Array<{
            staffId: string;
            outletId: string | null;
            avgRating: Prisma.Decimal | number | null;
            reviewsCount: bigint | number | null;
          }>
        >(Prisma.sql`
          SELECT
            t."staffId",
            t."outletId",
            AVG(r."rating")::numeric AS "avgRating",
            COUNT(*)::bigint AS "reviewsCount"
          FROM "Review" r
          JOIN "Transaction" t ON t."id" = r."transactionId"
          WHERE r."merchantId" = ${merchantId}
            AND t."merchantId" = ${merchantId}
            AND r."createdAt" >= ${period.from}
            AND r."createdAt" <= ${period.to}
            AND r."deletedAt" IS NULL
            AND r."rating" BETWEEN 1 AND 5
            AND t."staffId" IS NOT NULL
            AND t."canceledAt" IS NULL
          GROUP BY t."staffId", t."outletId"
        `),
      ]);

    const staffIds = new Set<string>();
    const outletIds = new Set<string>();
    const rowsMap = new Map<string, StaffPerformance>();

    const rememberIds = (staffId?: string | null, outletId?: string | null) => {
      if (!staffId) return;
      staffIds.add(staffId);
      if (outletId) outletIds.add(outletId);
    };
    for (const row of receiptRows) rememberIds(row.staffId, row.outletId);
    for (const row of newCustomerRows) rememberIds(row.staffId, row.outletId);
    for (const row of motivationRows) rememberIds(row.staffId, row.outletId);
    for (const row of ratingRows) rememberIds(row.staffId, row.outletId);

    if (!staffIds.size) return [];

    const staffRecords = await this.prisma.staff.findMany({
      where: { id: { in: Array.from(staffIds) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        login: true,
        email: true,
      },
    });
    const staffMap = new Map(staffRecords.map((s) => [s.id, s]));
    const outletRecords = outletIds.size
      ? await this.prisma.outlet.findMany({
          where: { id: { in: Array.from(outletIds) } },
          select: { id: true, name: true },
        })
      : [];
    const outletMap = new Map(outletRecords.map((o) => [o.id, o.name || o.id]));

    const ensureRow = (staffId: string, outletId: string | null) => {
      const key = `${staffId}|${outletId ?? ''}`;
      if (!rowsMap.has(key)) {
        const staff = staffMap.get(staffId);
        const outletLabel =
          outletId != null ? (outletMap.get(outletId) ?? outletId) : null;
        rowsMap.set(key, {
          id: staffId,
          name: buildStaffLabel(staff, staffId),
          outletId,
          outletName: outletLabel,
          transactions: 0,
          revenue: 0,
          averageCheck: 0,
          pointsIssued: 0,
          pointsRedeemed: 0,
          newCustomers: 0,
          performanceScore: 0,
        });
      }
      return rowsMap.get(key)!;
    };

    for (const row of receiptRows) {
      if (!row.staffId) continue;
      const entry = ensureRow(row.staffId, row.outletId ?? null);
      entry.transactions += Math.round(Number(row.transactions ?? 0));
      const revenue = Number(row.revenue ?? 0);
      entry.revenue += revenue;
      entry.pointsIssued += Number(row.pointsIssued ?? 0);
      entry.pointsRedeemed += Number(row.pointsRedeemed ?? 0);
    }
    for (const row of newCustomerRows) {
      if (!row.staffId) continue;
      const entry = ensureRow(row.staffId, row.outletId ?? null);
      entry.newCustomers += Math.round(Number(row.newCustomers ?? 0));
    }
    for (const row of motivationRows) {
      if (!row.staffId) continue;
      const entry = ensureRow(row.staffId, row.outletId ?? null);
      entry.performanceScore += Math.round(Number(row._sum?.points ?? 0));
    }
    for (const row of ratingRows) {
      if (!row.staffId) continue;
      const entry = ensureRow(row.staffId, row.outletId ?? null);
      entry.averageRating = Number(row.avgRating ?? 0);
      entry.reviewsCount = Math.round(Number(row.reviewsCount ?? 0));
    }

    const metrics = Array.from(rowsMap.values()).map((row) => {
      const tx = row.transactions;
      const avg = tx > 0 ? row.revenue / Math.max(1, tx) : 0;
      return {
        ...row,
        revenue: Math.round(row.revenue),
        averageCheck: Math.round(avg),
        pointsIssued: Math.round(row.pointsIssued),
        pointsRedeemed: Math.round(Math.abs(row.pointsRedeemed)),
        newCustomers: Math.round(row.newCustomers),
        performanceScore: Math.round(row.performanceScore),
      };
    });

    metrics.sort((a, b) => {
      if (b.revenue === a.revenue) {
        if (b.performanceScore === a.performanceScore) {
          return a.id.localeCompare(b.id);
        }
        return b.performanceScore - a.performanceScore;
      }
      return b.revenue - a.revenue;
    });

    return metrics;
  }

  private async getPeakHours(
    merchantId: string,
    period: DashboardPeriod,
    timezone: RussiaTimezone,
  ): Promise<string[]> {
    const hourlyData = await this.revenue.getHourlyDistribution(
      merchantId,
      period,
      timezone,
    );
    const sorted = hourlyData.sort((a, b) => b.transactions - a.transactions);
    const top3 = sorted.slice(0, 3);
    return top3.map((h) => `${h.hour}:00-${h.hour + 1}:00`);
  }

  private async getOutletUsage(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<OutletUsageStats[]> {
    const [outlets, grouped] = await Promise.all([
      this.prisma.outlet.findMany({
        where: { merchantId },
        select: { id: true, name: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['outletId'],
        where: {
          merchantId,
          createdAt: { gte: period.from, lte: period.to },
          outletId: { not: null },
          canceledAt: null,
          type: { in: [TxnType.EARN, TxnType.REDEEM] },
        },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);

    const map = new Map<
      string,
      { transactions: number; lastTxnAt: Date | null }
    >();
    for (const g of grouped) {
      if (!g.outletId) continue;
      map.set(g.outletId, {
        transactions: g._count._all || 0,
        lastTxnAt: (g._max.createdAt as Date) || null,
      });
    }

    const rows: OutletUsageStats[] = outlets.map((outlet) => {
      const aggregate = map.get(outlet.id);
      return {
        outletId: outlet.id,
        name: outlet.name || outlet.id,
        transactions: aggregate?.transactions || 0,
        lastActive: aggregate?.lastTxnAt ?? null,
      };
    });

    rows.sort((a, b) => b.transactions - a.transactions);
    return rows;
  }
}

function buildStaffLabel(
  staff:
    | {
        firstName?: string | null;
        lastName?: string | null;
        login?: string | null;
        email?: string | null;
      }
    | undefined,
  fallback: string,
): string {
  if (staff) {
    const first =
      typeof staff.firstName === 'string' ? staff.firstName.trim() : '';
    const last =
      typeof staff.lastName === 'string' ? staff.lastName.trim() : '';
    const fullName = [first, last].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;
    if (staff.login && staff.login.trim()) return staff.login.trim();
    if (staff.email && staff.email.trim()) return staff.email.trim();
  }
  return fallback;
}
