import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import { Prisma, PromotionStatus, TxnType } from '@prisma/client';
import {
  DEFAULT_TIMEZONE_CODE,
  RussiaTimezone,
  findTimezone,
} from '../timezone/russia-timezones';
import { UpdateRfmSettingsDto } from './dto/update-rfm-settings.dto';
import { fetchReceiptAggregates } from '../common/receipt-aggregates.util';

export interface DashboardPeriod {
  from: Date;
  to: Date;
  type: 'yesterday' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
}

export type TimeGrouping = 'day' | 'week' | 'month';

export interface DashboardMetrics {
  revenue: RevenueMetrics;
  customers: CustomerMetrics;
  loyalty: LoyaltyMetrics;
  campaigns: CampaignMetrics;
  operations: OperationalMetrics;
}

export interface RevenueMetrics {
  totalRevenue: number;
  averageCheck: number;
  transactionCount: number;
  revenueGrowth: number;
  hourlyDistribution: HourlyData[];
  dailyRevenue: DailyData[];
  seriesGrouping: TimeGrouping;
}

export interface CustomerMetrics {
  totalCustomers: number;
  newCustomers: number;
  activeCustomers: number;
  churnRate: number;
  retentionRate: number;
  customerLifetimeValue: number;
  averageVisitsPerCustomer: number;
  topCustomers: TopCustomer[];
}

export interface LoyaltyMetrics {
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  pointsRedemptionRate: number;
  averageBalance: number;
  activeWallets: number;
  programROI: number;
  conversionRate: number;
  pointsSeries: PointsSeriesItem[];
  pointsGrouping: TimeGrouping;
}

export interface CampaignMetrics {
  activeCampaigns: number;
  campaignROI: number;
  totalRewardsIssued: number;
  campaignConversion: number;
  topCampaigns: CampaignPerformance[];
}

export interface OperationalMetrics {
  topOutlets: OutletPerformance[];
  outletMetrics: OutletPerformance[];
  topStaff: StaffPerformance[];
  staffMetrics: StaffPerformance[];
  peakHours: string[];
  outletUsage: OutletUsageStats[];
}

type RfmRange = { min: number | null; max: number | null };
type RfmGroupSummary = {
  score: number;
  recency: RfmRange;
  frequency: RfmRange;
  monetary: RfmRange;
};
type ParsedRfmSettings = {
  recencyDays?: number;
  frequency?: { mode?: 'auto' | 'manual'; threshold?: number | null };
  monetary?: { mode?: 'auto' | 'manual'; threshold?: number | null };
};

type Quantiles = {
  q20: number | null;
  q40: number | null;
  q60: number | null;
  q80: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RECENCY_DAYS = 365;

export interface CustomerPortraitMetrics {
  gender: Array<{
    sex: string;
    customers: number;
    transactions: number;
    revenue: number;
    averageCheck: number;
  }>;
  age: Array<{
    age: number;
    customers: number;
    transactions: number;
    revenue: number;
    averageCheck: number;
  }>;
  sexAge: Array<{
    sex: string;
    age: number;
    customers: number;
    transactions: number;
    revenue: number;
    averageCheck: number;
  }>;
}

export interface RepeatPurchasesMetrics {
  uniqueBuyers: number;
  newBuyers: number;
  repeatBuyers: number;
  histogram: Array<{ purchases: number; customers: number }>;
}

export interface BirthdayItem {
  customerId: string;
  name?: string;
  phone?: string;
  nextBirthday: string;
  age: number;
}

export interface ReferralSummary {
  registeredViaReferral: number;
  purchasedViaReferral: number;
  referralRevenue: number;
  topReferrers: Array<{
    rank: number;
    name: string;
    customerId: string;
    invited: number;
  }>;
}

export interface BusinessMetrics {
  minPurchases: number;
  averageCheck: number;
  customers: number;
  transactions: number;
  revenue: number;
}

export type RecencyGrouping = 'day' | 'week' | 'month';

export interface RecencyBucket {
  index: number;
  value: number;
  label: string;
  customers: number;
}

export interface PurchaseRecencyDistribution {
  group: RecencyGrouping;
  buckets: RecencyBucket[];
  totalCustomers: number;
}

export interface TimeActivityStats {
  orders: number;
  customers: number;
  revenue: number;
  averageCheck: number;
}

export interface TimeActivityDay extends TimeActivityStats {
  day: number;
}

export interface TimeActivityHour extends TimeActivityStats {
  hour: number;
}

export interface TimeHeatmapCell extends TimeActivityStats {
  day: number;
  hour: number;
}

export interface TimeActivityMetrics {
  dayOfWeek: TimeActivityDay[];
  hours: TimeActivityHour[];
  heatmap: TimeHeatmapCell[];
}

// Вспомогательные интерфейсы
interface HourlyData {
  hour: number;
  revenue: number;
  transactions: number;
}

interface DailyData {
  date: string;
  revenue: number;
  transactions: number;
  customers: number;
  averageCheck: number;
}

interface PointsSeriesItem {
  date: string;
  accrued: number;
  redeemed: number;
  burned: number;
  balance: number;
}

interface TopCustomer {
  id: string;
  name?: string;
  phone?: string;
  totalSpent: number;
  visits: number;
  lastVisit: Date;
  loyaltyPoints: number;
}

interface CampaignPerformance {
  id: string;
  name: string;
  type: string;
  usageCount: number;
  totalRewards: number;
  roi: number;
}

interface OutletPerformance {
  id: string;
  name: string;
  revenue: number;
  transactions: number;
  averageCheck: number;
  pointsIssued: number;
  pointsRedeemed: number;
  customers: number;
  newCustomers: number;
  growth: number;
}

interface StaffPerformance {
  id: string;
  name: string;
  outletId?: string | null;
  outletName?: string | null;
  transactions: number;
  revenue: number;
  averageCheck: number;
  pointsIssued: number;
  pointsRedeemed: number;
  newCustomers: number;
  performanceScore: number;
  averageRating?: number | null;
  reviewsCount?: number;
}

interface OutletUsageStats {
  outletId: string;
  name: string;
  transactions: number;
  lastActive: Date | null;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Получить полный дашборд
   */
  async getDashboard(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<DashboardMetrics> {
    const tz = await this.getTimezoneInfo(merchantId, timezone);
    const [revenue, customers, loyalty, campaigns, operations] =
      await Promise.all([
        this.getRevenueMetrics(merchantId, period, undefined, tz),
        this.getCustomerMetrics(merchantId, period),
        this.getLoyaltyMetrics(merchantId, period, undefined, tz),
        this.getCampaignMetrics(merchantId, period),
        this.getOperationalMetrics(merchantId, period, tz),
      ]);

    return { revenue, customers, loyalty, campaigns, operations };
  }

  /**
   * Портрет клиента: пол, возраст, матрица пол×возраст за период
   */
  async getCustomerPortrait(
    merchantId: string,
    period: DashboardPeriod,
    segmentId?: string,
  ): Promise<CustomerPortraitMetrics> {
    const receipts = await this.prisma.receipt.findMany({
      where: {
        merchantId,
        canceledAt: null,
        createdAt: { gte: period.from, lte: period.to },
        ...(segmentId
          ? {
              customer: {
                segments: { some: { segmentId } },
              },
            }
          : {}),
      },
      select: {
        orderId: true,
        total: true,
        createdAt: true,
        customerId: true,
        customer: { select: { id: true, gender: true, birthday: true } },
      },
    });

    const receiptOrderIds = Array.from(
      new Set(
        receipts
          .map((receipt) => receipt.orderId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    let relevantReceipts = receipts;
    if (receiptOrderIds.length > 0) {
      const refundedOrders = await this.prisma.transaction.findMany({
        where: {
          merchantId,
          type: 'REFUND',
          canceledAt: null,
          orderId: { in: receiptOrderIds },
        },
        select: { orderId: true },
      });
      if (refundedOrders.length > 0) {
        const refundSet = new Set(
          refundedOrders
            .map((entry) => entry.orderId)
            .filter((value): value is string => Boolean(value)),
        );
        relevantReceipts = receipts.filter(
          (receipt) => !refundSet.has(receipt.orderId),
        );
      }
    }
    const genderMap = new Map<
      string,
      { customers: Set<string>; transactions: number; revenue: number }
    >();
    const ageMap = new Map<
      number,
      { customers: Set<string>; transactions: number; revenue: number }
    >();
    const sexAgeMap = new Map<
      string,
      { customers: Set<string>; transactions: number; revenue: number }
    >();

    const today = period.to || new Date();
    const normalizeSex = (value: string | null | undefined): string => {
      const v = (value || '').toString().trim().toUpperCase();
      if (
        v === 'M' ||
        v === 'MALE' ||
        v === 'М' ||
        v === 'МУЖ' ||
        v === 'МУЖСКОЙ'
      )
        return 'M';
      if (
        v === 'F' ||
        v === 'FEMALE' ||
        v === 'Ж' ||
        v === 'ЖЕН' ||
        v === 'ЖЕНСКИЙ'
      )
        return 'F';
      return 'U';
    };

    const clampAge = (value: number | null): number | null => {
      if (value == null || Number.isNaN(value)) return null;
      if (value < 0) return 0;
      if (value > 100) return 100;
      return value;
    };

    for (const receipt of relevantReceipts) {
      const customerId = receipt.customerId || receipt.customer?.id || null;
      const sex = normalizeSex(receipt.customer?.gender);
      const bday = receipt.customer?.birthday || null;
      const age = bday
        ? Math.floor(
            (today.getTime() - bday.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
          )
        : null;
      const ageValue = clampAge(age);
      const total = Math.max(0, receipt.total || 0);

      if (!genderMap.has(sex))
        genderMap.set(sex, {
          customers: new Set(),
          transactions: 0,
          revenue: 0,
        });
      const g = genderMap.get(sex)!;
      if (customerId) g.customers.add(customerId);
      g.transactions++;
      g.revenue += total;

      if (ageValue != null) {
        if (!ageMap.has(ageValue))
          ageMap.set(ageValue, {
            customers: new Set(),
            transactions: 0,
            revenue: 0,
          });
        const a = ageMap.get(ageValue)!;
        if (customerId) a.customers.add(customerId);
        a.transactions++;
        a.revenue += total;

        const key = `${sex}:${ageValue}`;
        if (!sexAgeMap.has(key))
          sexAgeMap.set(key, {
            customers: new Set(),
            transactions: 0,
            revenue: 0,
          });
        const sa = sexAgeMap.get(key)!;
        if (customerId) sa.customers.add(customerId);
        sa.transactions++;
        sa.revenue += total;
      }
    }

    const gender = Array.from(genderMap.entries())
      .map(([sex, v]) => ({
        sex,
        customers: v.customers.size,
        transactions: v.transactions,
        revenue: Math.round(v.revenue),
        averageCheck:
          v.transactions > 0 ? Math.round(v.revenue / v.transactions) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const age: Array<{
      age: number;
      customers: number;
      transactions: number;
      revenue: number;
      averageCheck: number;
    }> = [];
    for (let value = 0; value <= 100; value++) {
      const bucket = ageMap.get(value);
      const revenue = bucket ? bucket.revenue : 0;
      const transactions = bucket ? bucket.transactions : 0;
      age.push({
        age: value,
        customers: bucket ? bucket.customers.size : 0,
        transactions,
        revenue: Math.round(revenue),
        averageCheck: transactions > 0 ? Math.round(revenue / transactions) : 0,
      });
    }

    const sexAgeOrder: Record<string, number> = { M: 0, F: 1, U: 2 };
    const sexAge = Array.from(sexAgeMap.entries())
      .map(([key, v]) => {
        const [sex, ageRaw] = key.split(':');
        const ageValue = Number(ageRaw);
        const revenue = v.revenue;
        return {
          sex,
          age: Number.isFinite(ageValue) ? ageValue : 0,
          customers: v.customers.size,
          transactions: v.transactions,
          revenue: Math.round(revenue),
          averageCheck:
            v.transactions > 0 ? Math.round(revenue / v.transactions) : 0,
        };
      })
      .sort((a, b) => {
        if (a.age !== b.age) return a.age - b.age;
        const aOrder = sexAgeOrder[a.sex] ?? 3;
        const bOrder = sexAgeOrder[b.sex] ?? 3;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.sex.localeCompare(b.sex);
      });

    return { gender, age, sexAge };
  }

  /**
   * Повторные продажи и распределение покупок на клиента за период
   */
  async getRepeatPurchases(
    merchantId: string,
    period: DashboardPeriod,
    outletId?: string,
  ): Promise<RepeatPurchasesMetrics> {
    const outletFilter = outletId && outletId !== 'all' ? outletId : null;
    const purchases = await this.prisma.$queryRaw<
      Array<{ customerId: string; purchases: bigint | number | null }>
    >(Prisma.sql`
      SELECT
        r."customerId" AS "customerId",
        COUNT(*)::bigint AS purchases
      FROM "Receipt" r
      WHERE r."merchantId" = ${merchantId}
        AND r."createdAt" >= ${period.from}
        AND r."createdAt" <= ${period.to}
        AND r."canceledAt" IS NULL
        AND r."total" > 0
        ${outletFilter ? Prisma.sql`AND r."outletId" = ${outletFilter}` : Prisma.sql``}
        AND NOT EXISTS (
          SELECT 1
          FROM "Transaction" refund
          WHERE refund."merchantId" = r."merchantId"
            AND refund."orderId" = r."orderId"
            AND refund."type" = 'REFUND'
            AND refund."canceledAt" IS NULL
        )
      GROUP BY r."customerId"
    `);
    const buyers = purchases
      .map((row) => ({
        customerId: row.customerId,
        purchases: Number(row.purchases ?? 0),
      }))
      .filter((row) => Boolean(row.customerId) && row.purchases > 0);
    const uniqueBuyers = buyers.length;
    const repeatBuyers = buyers.filter((row) => row.purchases >= 2).length;
    const histogramMap = new Map<number, number>();
    for (const entry of buyers) {
      histogramMap.set(
        entry.purchases,
        (histogramMap.get(entry.purchases) ?? 0) + 1,
      );
    }
    const histogram = Array.from(histogramMap.entries())
      .map(([count, customers]) => ({
        purchases: count,
        customers,
      }))
      .sort((a, b) => a.purchases - b.purchases);
    const [newBuyersRow] = await this.prisma.$queryRaw<
      Array<{ count: number }>
    >(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT
          r."customerId" AS customer_id,
          MIN(r."createdAt") AS first_purchase
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."total" > 0
          AND r."canceledAt" IS NULL
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
        HAVING MIN(r."createdAt") BETWEEN ${period.from} AND ${period.to}
      ) AS first_orders
    `);
    const newBuyers = Number(newBuyersRow?.count ?? 0);
    return { uniqueBuyers, newBuyers, repeatBuyers, histogram };
  }

  /**
   * Ближайшие дни рождения
   */
  async getBirthdays(
    merchantId: string,
    withinDays = 30,
    limit = 100,
  ): Promise<BirthdayItem[]> {
    const customers = await this.prisma.customer.findMany({
      where: { birthday: { not: null }, wallets: { some: { merchantId } } },
      select: { id: true, name: true, phone: true, birthday: true },
      take: 5000,
    });
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + withinDays);

    const nextDate = (b: Date) => {
      const y = now.getFullYear();
      let d = new Date(y, b.getMonth(), b.getDate());
      if (d < now) d = new Date(y + 1, b.getMonth(), b.getDate());
      return d;
    };

    const items: BirthdayItem[] = [];
    for (const c of customers) {
      const nb = nextDate(c.birthday!);
      if (nb <= end) {
        const age = nb.getFullYear() - c.birthday!.getFullYear();
        items.push({
          customerId: c.id,
          name: c.name || undefined,
          phone: c.phone || undefined,
          nextBirthday: nb.toISOString(),
          age,
        });
      }
    }
    items.sort((a, b) => a.nextBirthday.localeCompare(b.nextBirthday));
    return items.slice(0, limit);
  }

  /**
   * Реферальная сводка за период
   */
  async getReferralSummary(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<ReferralSummary> {
    const [activations, firstPurchaseRows] = await Promise.all([
      this.prisma.referral.findMany({
        where: {
          program: { merchantId },
          activatedAt: { gte: period.from, lte: period.to },
        },
        select: {
          referrerId: true,
          refereeId: true,
          referrer: { select: { name: true } },
        },
      }),
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        WITH referees AS (
          SELECT DISTINCT ref."refereeId" AS customer_id
          FROM "Referral" ref
          JOIN "ReferralProgram" prog ON prog."id" = ref."programId"
          WHERE prog."merchantId" = ${merchantId}
            AND ref."refereeId" IS NOT NULL
            AND ref."status" IN ('ACTIVATED', 'COMPLETED')
        ),
        valid_receipts AS (
          SELECT r."customerId", r."createdAt"
          FROM "Receipt" r
          WHERE r."merchantId" = ${merchantId}
            AND r."total" > 0
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
        first_purchases AS (
          SELECT
            vr."customerId",
            MIN(vr."createdAt") AS first_purchase_at
          FROM valid_receipts vr
          JOIN referees rf ON rf.customer_id = vr."customerId"
          GROUP BY vr."customerId"
        )
        SELECT COUNT(*)::int AS count
        FROM first_purchases fp
        WHERE fp.first_purchase_at BETWEEN ${period.from} AND ${period.to}
      `),
    ]);
    const registeredViaReferral = activations.length;
    const purchasedViaReferral = Number(firstPurchaseRows?.[0]?.count ?? 0);

    const leaderboard = new Map<string, { name: string; invited: number }>();
    for (const entry of activations) {
      if (!entry.referrerId) continue;
      if (!leaderboard.has(entry.referrerId)) {
        leaderboard.set(entry.referrerId, {
          name: entry.referrer?.name || 'Без имени',
          invited: 0,
        });
      }
      leaderboard.get(entry.referrerId)!.invited += 1;
    }

    const top = Array.from(leaderboard.entries())
      .map(([customerId, v]) => ({
        customerId,
        name: v.name,
        invited: v.invited,
      }))
      .sort((a, b) => {
        if (b.invited === a.invited) {
          return a.customerId.localeCompare(b.customerId);
        }
        return b.invited - a.invited;
      })
      .slice(0, 20)
      .map((x, i) => ({ rank: i + 1, ...x }));

    let referralRevenue = 0;
    const newCustomerIds = Array.from(
      new Set(
        activations
          .map((item) => item.refereeId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (newCustomerIds.length > 0) {
      const revenueRows = await fetchReceiptAggregates(this.prisma, {
        merchantId,
        customerIds: newCustomerIds,
        period,
      });
      referralRevenue = revenueRows.reduce(
        (sum, row) => sum + Math.max(0, row.totalSpent),
        0,
      );
    }

    return {
      registeredViaReferral,
      purchasedViaReferral,
      referralRevenue,
      topReferrers: top,
    };
  }

  /**
   * Бизнес‑метрики: средний чек у клиентов, сделавших >= N покупок за период
   */
  async getBusinessMetrics(
    merchantId: string,
    period: DashboardPeriod,
    minPurchases = 3,
  ): Promise<BusinessMetrics> {
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

  /**
   * Когорты удержания (как в GetMeBack): по месяцам или неделям
   * Возвращает массив когорт с размерами и процентами удержания по сдвигам.
   */
  async getRetentionCohorts(
    merchantId: string,
    by: 'month' | 'week' = 'month',
    limit = 6,
  ): Promise<
    Array<{
      cohort: string;
      from: string;
      to: string;
      size: number;
      retention: number[];
    }>
  > {
    // Сформируем периоды когорт от новейших к более старым
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
      const diff = s.getDate() - day + (day === 0 ? -6 : 1); // Пн=1..Вс=0
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
      // Сдвиг на предыдущий период
      cursor = new Date(c.start);
      if (by === 'week') cursor.setDate(cursor.getDate() - 1);
      else cursor.setDate(0);
    }

    // Для каждой когорты найдём клиентов по firstSeenAt в CustomerStats (fallback на wallet.createdAt уже учитывается в агрегаторе)
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
        where: { merchantId, firstSeenAt: { gte: start, lte: end } },
        select: { customerId: true },
      });
      const ids = cohortCustomers.map((c) => c.customerId);
      const size = ids.length;
      const retention: number[] = [];
      // Сдвиги считаем максимум до количества когорт (чтобы красиво отображать таблицу)
      const maxShifts = cohorts.length - i; // включая 0
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
        // Кто вернулся в этот период (есть чек)
        let returned = 0;
        if (size > 0) {
          const visits = await this.prisma.receipt.groupBy({
            by: ['customerId'],
            where: {
              merchantId,
              customerId: { in: ids },
              createdAt: { gte: periodStart, lt: periodEnd },
            },
          });
          returned = visits.length;
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

    return results;
  }

  /**
   * RFM heatmap 5x5: матрица по R и F (или можно по R и M) с количеством клиентов
   */
  async getRfmHeatmap(
    merchantId: string,
  ): Promise<{ grid: number[][]; totals: { count: number } }> {
    const rows = await this.prisma.customerStats.findMany({
      where: { merchantId },
      select: { rfmR: true, rfmF: true },
    });
    const grid: number[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => 0),
    );
    for (const r of rows) {
      const R = Math.min(Math.max(r.rfmR || 1, 1), 5);
      const F = Math.min(Math.max(r.rfmF || 1, 1), 5);
      grid[R - 1][F - 1]++;
    }
    return { grid, totals: { count: rows.length } };
  }

  private toJsonObject(
    value: Prisma.JsonValue | null | undefined,
  ): Prisma.JsonObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private parseRfmSettings(
    rulesJson: Prisma.JsonValue | null | undefined,
  ): ParsedRfmSettings {
    const root = this.toJsonObject(rulesJson);
    if (!root) return {};
    const raw = root.rfm;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const rfm = raw;
    const recencyDays = this.toNumber(rfm.recencyDays);
    const frequencyRaw = this.toJsonObject(rfm.frequency as Prisma.JsonValue);
    const monetaryRaw = this.toJsonObject(rfm.monetary as Prisma.JsonValue);
    return {
      recencyDays:
        recencyDays && recencyDays > 0 ? Math.round(recencyDays) : undefined,
      frequency: frequencyRaw
        ? {
            mode: frequencyRaw.mode === 'manual' ? 'manual' : 'auto',
            threshold: this.toNumber(frequencyRaw.threshold),
          }
        : undefined,
      monetary: monetaryRaw
        ? {
            mode: monetaryRaw.mode === 'manual' ? 'manual' : 'auto',
            threshold: this.toNumber(monetaryRaw.threshold),
          }
        : undefined,
    };
  }

  private mergeRfmRules(
    rulesJson: Prisma.JsonValue | null | undefined,
    rfm: {
      recencyDays: number;
      frequency: { mode: 'auto' | 'manual'; threshold: number | null };
      monetary: { mode: 'auto' | 'manual'; threshold: number | null };
    },
  ): Prisma.JsonObject {
    const root = this.toJsonObject(rulesJson);
    const next: Prisma.JsonObject = root ? { ...root } : {};
    next.rfm = {
      recencyDays: rfm.recencyDays,
      frequency: {
        mode: rfm.frequency.mode,
        ...(rfm.frequency.threshold != null
          ? { threshold: rfm.frequency.threshold }
          : {}),
      },
      monetary: {
        mode: rfm.monetary.mode,
        ...(rfm.monetary.threshold != null
          ? { threshold: rfm.monetary.threshold }
          : {}),
      },
    } as Prisma.JsonObject;
    return next;
  }

  private normalizeScore(value?: number | null): number | null {
    if (value === null || value === undefined) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const rounded = Math.round(num);
    if (rounded < 1 || rounded > 5) return null;
    return rounded;
  }

  private pushToBucket(
    buckets: Map<number, number[]>,
    score: number,
    value: number,
  ) {
    if (!Number.isFinite(value)) return;
    const bucket = buckets.get(score);
    if (bucket) {
      bucket.push(value);
    } else {
      buckets.set(score, [value]);
    }
  }

  private buildRange(values: number[]): RfmRange {
    if (!values.length) return { min: null, max: null };
    let min = values[0];
    let max = values[0];
    for (const value of values) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return { min, max };
  }

  private computeQuantiles(values: number[]) {
    if (!values.length) {
      return { q20: null, q40: null, q60: null, q80: null };
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const pick = (p: number) => {
      if (!sorted.length) return null;
      const idx = Math.floor((sorted.length - 1) * p);
      return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
    };
    return {
      q20: pick(0.2),
      q40: pick(0.4),
      q60: pick(0.6),
      q80: pick(0.8),
    };
  }

  private deriveRecencyScore(
    value: number,
    quantiles: Quantiles,
  ): number | null {
    if (!Number.isFinite(value)) return null;
    const { q20, q40, q60, q80 } = quantiles;
    if (q20 == null || q40 == null || q60 == null || q80 == null) {
      return null;
    }
    if (value <= q20) return 1;
    if (value <= q40) return 2;
    if (value <= q60) return 3;
    if (value <= q80) return 4;
    return 5;
  }

  private deriveDescendingScore(
    value: number,
    quantiles: Quantiles,
  ): number | null {
    if (!Number.isFinite(value)) return null;
    const { q20, q40, q60, q80 } = quantiles;
    if (q20 == null || q40 == null || q60 == null || q80 == null) {
      return null;
    }
    if (value <= q20) return 5;
    if (value <= q40) return 4;
    if (value <= q60) return 3;
    if (value <= q80) return 2;
    return 1;
  }

  private suggestUpperQuantile(
    values: number[],
    options: { minimum?: number } = {},
  ): number | null {
    if (!values.length) return null;
    const { q80, q60, q40 } = this.computeQuantiles(values);
    const candidate =
      q80 ?? q60 ?? q40 ?? values[values.length - 1] ?? values[0];
    if (candidate == null || !Number.isFinite(candidate)) return null;
    const rounded = Math.round(candidate);
    if (options.minimum != null) {
      return Math.max(options.minimum, rounded);
    }
    return rounded;
  }

  private computeRecencyDays(
    lastOrderAt: Date | null | undefined,
    fallback: number,
    now: Date,
  ): number {
    if (!(lastOrderAt instanceof Date) || Number.isNaN(lastOrderAt.getTime())) {
      return fallback + 1;
    }
    const diff = now.getTime() - lastOrderAt.getTime();
    if (diff <= 0) return 0;
    return Math.max(0, Math.floor(diff / DAY_MS));
  }

  async getRfmGroupsAnalytics(merchantId: string) {
    const [settingsRow, stats] = await Promise.all([
      this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { rulesJson: true },
      }),
      this.prisma.customerStats.findMany({
        where: { merchantId },
        select: {
          rfmClass: true,
          rfmR: true,
          rfmF: true,
          rfmM: true,
          lastOrderAt: true,
          visits: true,
          totalSpent: true,
        },
      }),
    ]);
    const storedSettings = this.parseRfmSettings(settingsRow?.rulesJson);
    const recencyHorizon =
      storedSettings.recencyDays && storedSettings.recencyDays > 0
        ? storedSettings.recencyDays
        : DEFAULT_RECENCY_DAYS;
    const now = new Date();
    const recencyBuckets = new Map<number, number[]>();
    const frequencyBuckets = new Map<number, number[]>();
    const monetaryBuckets = new Map<number, number[]>();
    const recencyValues: number[] = [];
    const frequencyValues: number[] = [];
    const monetaryValues: number[] = [];
    const distribution = new Map<string, number>();

    const prepared = stats.map((row) => {
      const daysSince = this.computeRecencyDays(
        row.lastOrderAt,
        recencyHorizon,
        now,
      );
      const visits = Math.max(0, Number(row.visits ?? 0));
      const totalSpent = Math.max(0, Number(row.totalSpent ?? 0));

      const rScore = this.normalizeScore(row.rfmR);
      const fScore = this.normalizeScore(row.rfmF);
      const mScore = this.normalizeScore(row.rfmM);

      recencyValues.push(daysSince);
      frequencyValues.push(visits);
      monetaryValues.push(totalSpent);

      return {
        row,
        daysSince,
        visits,
        totalSpent,
        rScore,
        fScore,
        mScore,
      };
    });

    const recencyQuantiles =
      recencyValues.length > 0 ? this.computeQuantiles(recencyValues) : null;
    const frequencyQuantiles =
      frequencyValues.length > 0
        ? this.computeQuantiles(frequencyValues)
        : null;
    const monetaryQuantiles =
      monetaryValues.length > 0 ? this.computeQuantiles(monetaryValues) : null;

    for (const entry of prepared) {
      const resolvedRScore =
        entry.rScore ??
        (recencyQuantiles
          ? this.deriveRecencyScore(entry.daysSince, recencyQuantiles)
          : null);
      const resolvedFScore =
        entry.fScore ??
        (frequencyQuantiles
          ? this.deriveDescendingScore(entry.visits, frequencyQuantiles)
          : null);
      const resolvedMScore =
        entry.mScore ??
        (monetaryQuantiles
          ? this.deriveDescendingScore(entry.totalSpent, monetaryQuantiles)
          : null);

      if (resolvedRScore)
        this.pushToBucket(recencyBuckets, resolvedRScore, entry.daysSince);
      if (resolvedFScore)
        this.pushToBucket(frequencyBuckets, resolvedFScore, entry.visits);
      if (resolvedMScore)
        this.pushToBucket(monetaryBuckets, resolvedMScore, entry.totalSpent);

      const classKey =
        typeof entry.row.rfmClass === 'string' && entry.row.rfmClass.trim()
          ? entry.row.rfmClass
          : resolvedRScore && resolvedFScore && resolvedMScore
            ? `${resolvedRScore}-${resolvedFScore}-${resolvedMScore}`
            : 'unknown';
      distribution.set(classKey, (distribution.get(classKey) ?? 0) + 1);
    }

    const suggestedFrequency = this.suggestUpperQuantile(frequencyValues, {
      minimum: 1,
    });
    const suggestedMoney = this.suggestUpperQuantile(monetaryValues, {
      minimum: 0,
    });

    const groups: RfmGroupSummary[] = [1, 2, 3, 4, 5].map((score) => ({
      score,
      recency: this.buildRange(recencyBuckets.get(score) ?? []),
      frequency: this.buildRange(frequencyBuckets.get(score) ?? []),
      monetary: this.buildRange(monetaryBuckets.get(score) ?? []),
    }));

    const frequencyMode =
      storedSettings.frequency?.mode === 'manual' ? 'manual' : 'auto';
    const moneyMode =
      storedSettings.monetary?.mode === 'manual' ? 'manual' : 'auto';

    const settingsResponse = {
      recencyDays: recencyHorizon,
      frequencyMode,
      frequencyThreshold:
        frequencyMode === 'manual'
          ? (storedSettings.frequency?.threshold ?? suggestedFrequency ?? null)
          : (suggestedFrequency ?? null),
      frequencySuggested: suggestedFrequency ?? null,
      moneyMode,
      moneyThreshold:
        moneyMode === 'manual'
          ? (storedSettings.monetary?.threshold ?? suggestedMoney ?? null)
          : (suggestedMoney ?? null),
      moneySuggested: suggestedMoney ?? null,
    };

    const distributionRows = Array.from(distribution.entries())
      .map(([segment, customers]) => ({ class: segment, customers }))
      .sort(
        (a, b) =>
          (b.customers ?? 0) - (a.customers ?? 0) ||
          a.class.localeCompare(b.class),
      );

    return {
      merchantId,
      settings: settingsResponse,
      groups,
      distribution: distributionRows,
      totals: { customers: stats.length },
    };
  }

  async updateRfmSettings(merchantId: string, dto: UpdateRfmSettingsDto) {
    const settingsRow = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const nextRules = this.mergeRfmRules(settingsRow?.rulesJson, {
      recencyDays: dto.recencyDays,
      frequency: {
        mode: dto.frequencyMode,
        threshold:
          dto.frequencyMode === 'manual'
            ? (dto.frequencyThreshold ?? null)
            : null,
      },
      monetary: {
        mode: dto.moneyMode,
        threshold:
          dto.moneyMode === 'manual' ? (dto.moneyThreshold ?? null) : null,
      },
    });
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { rulesJson: nextRules, updatedAt: new Date() },
      create: { merchantId, rulesJson: nextRules },
    });
    return this.getRfmGroupsAnalytics(merchantId);
  }

  /**
   * Метрики выручки
   */
  async getRevenueMetrics(
    merchantId: string,
    period: DashboardPeriod,
    grouping?: TimeGrouping,
    timezone?: string | RussiaTimezone,
  ): Promise<RevenueMetrics> {
    const tz = await this.getTimezoneInfo(merchantId, timezone);
    const effectiveGrouping = this.resolveGrouping(period, grouping);
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

    const previousPeriod = this.getPreviousPeriod(period);
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

    return {
      totalRevenue,
      averageCheck: Math.round(averageCheck),
      transactionCount,
      revenueGrowth: Math.round(revenueGrowth * 10) / 10,
      hourlyDistribution,
      dailyRevenue,
      seriesGrouping: effectiveGrouping,
    };
  }

  /**
   * Метрики клиентов
   */
  async getCustomerMetrics(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<CustomerMetrics> {
    const totalCustomers = await this.prisma.wallet.count({
      where: { merchantId },
    });

    const newCustomers = await this.prisma.wallet.count({
      where: {
        merchantId,
        createdAt: { gte: period.from, lte: period.to },
      },
    });

    const activeCustomers = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: {
        merchantId,
        createdAt: { gte: period.from, lte: period.to },
      },
    });

    // Отток клиентов
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const inactiveCustomers = await this.prisma.wallet.count({
      where: {
        merchantId,
        NOT: {
          customer: {
            transactions: {
              some: {
                merchantId,
                createdAt: { gte: thirtyDaysAgo },
              },
            },
          },
        },
      },
    });

    const churnRate =
      totalCustomers > 0 ? (inactiveCustomers / totalCustomers) * 100 : 0;
    const retentionRate = 100 - churnRate;

    const ltv = await this.calculateCustomerLTV(merchantId);

    const visits = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: { merchantId },
      _count: true,
    });
    const averageVisits =
      visits.length > 0
        ? visits.reduce((sum, v) => sum + v._count, 0) / visits.length
        : 0;

    const topCustomers = await this.getTopCustomers(merchantId, 10);

    return {
      totalCustomers,
      newCustomers,
      activeCustomers: activeCustomers.length,
      churnRate: Math.round(churnRate * 10) / 10,
      retentionRate: Math.round(retentionRate * 10) / 10,
      customerLifetimeValue: Math.round(ltv),
      averageVisitsPerCustomer: Math.round(averageVisits * 10) / 10,
      topCustomers,
    };
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
    const tz = await this.getTimezoneInfo(merchantId, timezone);
    const effectiveGrouping = this.resolveGrouping(period, grouping);

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

    return {
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
  }

  /**
   * Метрики кампаний
   */
  async getCampaignMetrics(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<CampaignMetrics> {
    const activeCampaigns = await this.prisma.loyaltyPromotion.count({
      where: { merchantId, status: PromotionStatus.ACTIVE, archivedAt: null },
    });

    const participantStats = await this.prisma.promotionParticipant.groupBy({
      by: ['promotionId'],
      where: {
        merchantId,
        joinedAt: { gte: period.from, lte: period.to },
      },
      _count: { _all: true },
      _sum: { pointsIssued: true },
    });

    const totalRewardsIssued = participantStats.reduce(
      (sum, row) => sum + (row._sum.pointsIssued ?? 0),
      0,
    );

    const campaignRevenue = await this.prisma.transaction.aggregate({
      where: {
        merchantId,
        type: 'CAMPAIGN',
        createdAt: { gte: period.from, lte: period.to },
      },
      _sum: { amount: true },
    });

    const usageCount = participantStats.reduce(
      (sum, row) => sum + row._count._all,
      0,
    );
    const uniqueParticipantGroups =
      await this.prisma.promotionParticipant.groupBy({
        by: ['customerId'],
        where: {
          merchantId,
          joinedAt: { gte: period.from, lte: period.to },
        },
      });
    const uniqueParticipants = uniqueParticipantGroups.length;

    const campaignROI =
      totalRewardsIssued > 0
        ? ((Math.abs(campaignRevenue._sum.amount || 0) - totalRewardsIssued) /
            totalRewardsIssued) *
          100
        : 0;

    const campaignConversion =
      uniqueParticipants > 0 ? (usageCount / uniqueParticipants) * 100 : 0;

    const topCampaigns = await this.getTopCampaigns(merchantId, period, 5);

    return {
      activeCampaigns,
      campaignROI: Math.round(campaignROI * 10) / 10,
      totalRewardsIssued,
      campaignConversion: Math.round(campaignConversion * 10) / 10,
      topCampaigns,
    };
  }

  /**
   * Операционные метрики
   */
  async getOperationalMetrics(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<OperationalMetrics> {
    const tz = await this.getTimezoneInfo(merchantId, timezone);
    const [outletMetrics, staffMetrics, peakHours, outletUsage] =
      await Promise.all([
        this.getOutletMetrics(merchantId, period),
        this.getStaffMetrics(merchantId, period),
        this.getPeakHours(merchantId, period, tz),
        this.getOutletUsage(merchantId, period),
      ]);

    const topOutlets = outletMetrics.slice(0, 5);
    const topStaff = staffMetrics.slice(0, 5);

    return {
      topOutlets,
      outletMetrics,
      topStaff,
      staffMetrics,
      peakHours,
      outletUsage,
    };
  }

  async getAutoReturnMetrics(
    merchantId: string,
    period: DashboardPeriod,
    outletId?: string,
  ): Promise<{
    period: {
      from: string;
      to: string;
      type: DashboardPeriod['type'];
      thresholdDays: number;
      giftPoints: number;
    };
    summary: {
      invitations: number;
      returned: number;
      conversion: number;
      pointsCost: number;
      firstPurchaseRevenue: number;
    };
    distance: {
      customers: number;
      purchasesPerCustomer: number;
      purchasesCount: number;
      totalAmount: number;
      averageCheck: number;
    };
    rfm: Array<{ segment: string; invitations: number; returned: number }>;
    trends: {
      attempts: Array<{ date: string; invitations: number; returns: number }>;
      revenue: Array<{ date: string; total: number; firstPurchases: number }>;
    };
  }> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });

    const rules =
      settings?.rulesJson && typeof settings.rulesJson === 'object'
        ? (settings.rulesJson as any)
        : {};
    const autoReturn =
      rules &&
      typeof rules === 'object' &&
      rules.autoReturn &&
      typeof rules.autoReturn === 'object'
        ? rules.autoReturn
        : {};

    const thresholdDays = Math.max(
      1,
      Math.floor(
        Number(autoReturn?.days ?? autoReturn?.thresholdDays ?? 60) || 60,
      ),
    );
    const giftPoints = Math.max(
      0,
      Math.floor(Number(autoReturn?.giftPoints ?? 0) || 0),
    );

    const from = new Date(period.from);
    const to = new Date(period.to);
    const msInDay = 24 * 60 * 60 * 1000;
    const thresholdMs = thresholdDays * msInDay;

    const receiptWhereBase: any = {
      merchantId,
    };
    if (outletId && outletId !== 'all') {
      receiptWhereBase.outletId = outletId;
    }

    const receiptsInPeriod = await this.prisma.receipt.findMany({
      where: {
        ...receiptWhereBase,
        createdAt: { gte: from, lte: to },
      },
      select: { customerId: true, total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const lastReceiptBefore = await this.prisma.receipt.groupBy({
      by: ['customerId'],
      where: {
        ...receiptWhereBase,
        createdAt: { lt: from },
      },
      _max: { createdAt: true },
    });

    const eligible = new Map<
      string,
      {
        lastBefore: Date;
        inviteDate: Date;
        receipts: Array<{ date: Date; total: number }>;
      }
    >();

    const cutoff = new Date(from.getTime() - thresholdMs);
    for (const item of lastReceiptBefore) {
      const customerId = item.customerId;
      const last = item._max.createdAt;
      if (!customerId || !last) continue;
      if (last > cutoff) continue;
      let inviteDate = new Date(last.getTime() + thresholdMs);
      if (inviteDate < from) inviteDate = new Date(from);
      if (inviteDate > to) continue;
      eligible.set(customerId, { lastBefore: last, inviteDate, receipts: [] });
    }

    for (const receipt of receiptsInPeriod) {
      const record = eligible.get(receipt.customerId);
      if (!record) continue;
      record.receipts.push({ date: receipt.createdAt, total: receipt.total });
    }

    const segments = [
      { label: 'Недавние (<92 дней)', min: 0, max: 91 },
      { label: 'Умеренные (92–184)', min: 92, max: 183 },
      { label: 'Засыпающие (184–276)', min: 184, max: 275 },
      { label: 'Спящие (276–368)', min: 276, max: 367 },
      { label: 'Потерянные (>368)', min: 368, max: Number.POSITIVE_INFINITY },
    ];

    const segmentCounters = new Map<
      string,
      { invitations: number; returned: number }
    >();
    for (const seg of segments) {
      segmentCounters.set(seg.label, { invitations: 0, returned: 0 });
    }

    const invitesByDay = new Map<string, number>();
    const returnsByDay = new Map<string, number>();
    const revenueByDay = new Map<string, number>();
    const firstRevenueByDay = new Map<string, number>();

    let invitations = 0;
    let returned = 0;
    let firstPurchaseRevenue = 0;
    let totalPurchases = 0;
    let totalAmount = 0;

    for (const [customerId, record] of eligible.entries()) {
      invitations++;
      const inviteKey = record.inviteDate.toISOString().slice(0, 10);
      invitesByDay.set(inviteKey, (invitesByDay.get(inviteKey) ?? 0) + 1);

      record.receipts.sort((a, b) => a.date.getTime() - b.date.getTime());
      const first = record.receipts[0];
      const hasReturned = Boolean(
        first && first.date >= record.inviteDate && first.date <= to,
      );

      const inactivityDays = Math.floor(
        (from.getTime() - record.lastBefore.getTime()) / msInDay,
      );
      const segment = segments.find(
        (seg) => inactivityDays >= seg.min && inactivityDays <= seg.max,
      );
      if (segment) {
        const bucket = segmentCounters.get(segment.label)!;
        bucket.invitations += 1;
        if (hasReturned) bucket.returned += 1;
      }

      if (!hasReturned) {
        continue;
      }

      returned++;
      if (first) {
        firstPurchaseRevenue += first.total;
        const firstKey = first.date.toISOString().slice(0, 10);
        returnsByDay.set(firstKey, (returnsByDay.get(firstKey) ?? 0) + 1);
        firstRevenueByDay.set(
          firstKey,
          (firstRevenueByDay.get(firstKey) ?? 0) + first.total,
        );
      }

      let customerAmount = 0;
      for (const [index, item] of record.receipts.entries()) {
        customerAmount += item.total;
        const key = item.date.toISOString().slice(0, 10);
        revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + item.total);
      }
      totalAmount += customerAmount;
      totalPurchases += record.receipts.length;
    }

    const daysCount = Math.max(
      1,
      Math.floor((to.getTime() - from.getTime()) / msInDay) + 1,
    );
    const attemptsTrend: Array<{
      date: string;
      invitations: number;
      returns: number;
    }> = [];
    const revenueTrend: Array<{
      date: string;
      total: number;
      firstPurchases: number;
    }> = [];
    for (let i = 0; i < daysCount; i++) {
      const current = new Date(from.getTime() + i * msInDay);
      const key = current.toISOString().slice(0, 10);
      attemptsTrend.push({
        date: key,
        invitations: invitesByDay.get(key) ?? 0,
        returns: returnsByDay.get(key) ?? 0,
      });
      revenueTrend.push({
        date: key,
        total: revenueByDay.get(key) ?? 0,
        firstPurchases: firstRevenueByDay.get(key) ?? 0,
      });
    }

    const conversion = invitations > 0 ? (returned / invitations) * 100 : 0;
    const purchasesPerCustomer = returned > 0 ? totalPurchases / returned : 0;
    const averageCheck = totalPurchases > 0 ? totalAmount / totalPurchases : 0;

    const summary = {
      invitations,
      returned,
      conversion: Math.round(conversion * 10) / 10,
      pointsCost: giftPoints * returned,
      firstPurchaseRevenue,
    };

    const distance = {
      customers: returned,
      purchasesPerCustomer: Math.round(purchasesPerCustomer * 10) / 10,
      purchasesCount: totalPurchases,
      totalAmount,
      averageCheck: Math.round(averageCheck * 10) / 10,
    };

    const rfm = segments.map((seg) => {
      const bucket = segmentCounters.get(seg.label)!;
      return {
        segment: seg.label,
        invitations: bucket.invitations,
        returned: bucket.returned,
      };
    });

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        type: period.type,
        thresholdDays,
        giftPoints,
      },
      summary,
      distance,
      rfm,
      trends: {
        attempts: attemptsTrend,
        revenue: revenueTrend,
      },
    };
  }

  async getBirthdayMechanicMetrics(
    merchantId: string,
    period: DashboardPeriod,
    outletId?: string,
  ): Promise<{
    period: {
      from: string;
      to: string;
      type: DashboardPeriod['type'];
      daysBefore: number;
      onlyBuyers: boolean;
      giftPoints: number;
      giftTtlDays: number;
      purchaseWindowDays: number;
    };
    summary: {
      greetings: number;
      giftPurchasers: number;
      revenueNet: number;
      averageCheck: number;
      giftPointsSpent: number;
      receiptsWithGifts: number;
    };
    timeline: Array<{ date: string; greetings: number; purchases: number }>;
    revenue: Array<{ date: string; revenue: number }>;
  }> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });

    const rules =
      settings?.rulesJson && typeof settings.rulesJson === 'object'
        ? (settings.rulesJson as any)
        : {};
    const birthday =
      rules &&
      typeof rules === 'object' &&
      rules.birthday &&
      typeof rules.birthday === 'object'
        ? rules.birthday
        : {};

    const daysBefore = Math.max(
      0,
      Math.floor(Number(birthday?.daysBefore ?? birthday?.days ?? 5) || 5),
    );
    const onlyBuyers = Boolean(
      birthday?.onlyBuyers ??
        birthday?.buyersOnly ??
        birthday?.onlyCustomers ??
        false,
    );
    const giftPoints = Math.max(
      0,
      Math.floor(Number(birthday?.giftPoints ?? 0) || 0),
    );
    const giftTtlDays = Math.max(
      0,
      Math.floor(Number(birthday?.giftTtlDays ?? birthday?.giftTtl ?? 0) || 0),
    );
    const purchaseWindowDays = Math.max(7, daysBefore + 7);
    const basePeriod = {
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        type: period.type,
        daysBefore,
        onlyBuyers,
        giftPoints,
        giftTtlDays,
        purchaseWindowDays,
      },
    };

    const empty = {
      ...basePeriod,
      summary: {
        greetings: 0,
        giftPurchasers: 0,
        revenueNet: 0,
        averageCheck: 0,
        giftPointsSpent: 0,
        receiptsWithGifts: 0,
      },
      timeline: [],
      revenue: [],
    };

    const dateKey = (value: Date) => value.toISOString().slice(0, 10);

    const refundOrderIds = new Set(
      (
        await this.prisma.transaction.findMany({
          where: {
            merchantId,
            type: TxnType.REFUND,
            canceledAt: null,
            orderId: { not: null },
            createdAt: { lte: period.to },
          },
          select: { orderId: true },
        })
      )
        .map((row) => row.orderId)
        .filter((id): id is string => Boolean(id)),
    );

    let outletCustomers: Set<string> | null = null;
    if (outletId && outletId !== 'all') {
      const outletReceipts = await this.prisma.receipt.findMany({
        where: {
          merchantId,
          outletId,
          createdAt: { lte: period.to },
          canceledAt: null,
        },
        select: { customerId: true },
      });
      outletCustomers = new Set(
        outletReceipts
          .map((row) => row.customerId)
          .filter((id): id is string => Boolean(id)),
      );
    }

    const greetingsRaw = await this.prisma.birthdayGreeting.findMany({
      where: {
        merchantId,
        sendDate: { gte: period.from, lte: period.to },
      },
      select: { customerId: true, sendDate: true },
    });
    const greetings = greetingsRaw.filter(
      (row) => !outletCustomers || outletCustomers.has(row.customerId),
    );
    const greetingCustomers = new Set(
      greetings.map((row) => row.customerId).filter(Boolean),
    );

    const receiptFilter: any = {
      merchantId,
      createdAt: { gte: period.from, lte: period.to },
      redeemApplied: { gt: 0 },
      canceledAt: null,
    };
    if (outletId && outletId !== 'all') {
      receiptFilter.outletId = outletId;
    }

    const targetReceiptsRaw = await this.prisma.receipt.findMany({
      where: receiptFilter,
      select: {
        id: true,
        customerId: true,
        orderId: true,
        total: true,
        redeemApplied: true,
        createdAt: true,
        outletId: true,
      },
    });
    const targetReceipts = targetReceiptsRaw.filter((row) => {
      const customerId = row.customerId as string | null;
      if (!customerId) return false;
      if (!greetingCustomers.has(customerId)) return false;
      if (row.orderId && refundOrderIds.has(row.orderId as string)) return false;
      return true;
    });
    const targetCustomerIds = new Set(
      targetReceipts.map((row) => row.customerId as string),
    );

    const relevantCustomers = new Set<string>(greetingCustomers);
    if (relevantCustomers.size === 0) {
      return empty;
    }

    const giftSources = await this.prisma.birthdayGreeting.findMany({
      where: {
        merchantId,
        customerId: { in: Array.from(relevantCustomers) },
        giftPoints: { gt: 0 },
        sendDate: { gte: period.from, lte: period.to },
      },
      select: {
        customerId: true,
        giftPoints: true,
        giftExpiresAt: true,
        sendDate: true,
      },
    });

    const historyFrom = new Date(period.from);
    historyFrom.setHours(0, 0, 0, 0);

    const customerIds = Array.from(relevantCustomers);
    const receiptsForConsumptionRaw =
      customerIds.length === 0
        ? []
        : await this.prisma.receipt.findMany({
            where: {
              merchantId,
              customerId: { in: customerIds },
              redeemApplied: { gt: 0 },
              createdAt: { gte: historyFrom, lte: period.to },
              canceledAt: null,
            },
            select: {
              id: true,
              customerId: true,
              orderId: true,
              total: true,
              redeemApplied: true,
              createdAt: true,
              outletId: true,
            },
          });

    const receiptsForConsumption = receiptsForConsumptionRaw.filter((row) => {
      const customerId = row.customerId as string | null;
      if (!customerId) return false;
      if (!greetingCustomers.has(customerId)) return false;
      if (row.orderId && refundOrderIds.has(row.orderId as string)) return false;
      return true;
    });

    type GiftLot = {
      points: number;
      expiresAt: Date | null;
      sendDate: Date;
    };
    type ReceiptInfo = {
      id: string;
      customerId: string;
      createdAt: Date;
      total: number;
      redeemApplied: number;
    };

    const lotsByCustomer = new Map<string, GiftLot[]>();
    for (const source of giftSources) {
      if (!source.customerId) continue;
      if (!lotsByCustomer.has(source.customerId)) {
        lotsByCustomer.set(source.customerId, []);
      }
      lotsByCustomer.get(source.customerId)!.push({
        points: Math.max(0, source.giftPoints || 0),
        expiresAt: source.giftExpiresAt ? new Date(source.giftExpiresAt) : null,
        sendDate: new Date(source.sendDate),
      });
    }

    const receiptsByCustomer = new Map<string, ReceiptInfo[]>();
    for (const receipt of receiptsForConsumption) {
      const customerId = receipt.customerId as string;
      if (!receiptsByCustomer.has(customerId)) {
        receiptsByCustomer.set(customerId, []);
      }
      receiptsByCustomer.get(customerId)!.push({
        id: receipt.id,
        customerId,
        createdAt: new Date(receipt.createdAt),
        total: Number(receipt.total ?? 0),
        redeemApplied: Math.max(0, Number(receipt.redeemApplied ?? 0)),
      });
    }

    const giftSpentByReceipt = new Map<string, number>();
    for (const [customerId, items] of receiptsByCustomer.entries()) {
      const lots = (lotsByCustomer.get(customerId) ?? []).slice();
      items.sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );

      if (!lots.length) {
        for (const receipt of items) {
          giftSpentByReceipt.set(receipt.id, 0);
        }
        continue;
      }

      lots.sort((a, b) => a.sendDate.getTime() - b.sendDate.getTime());
      const remaining = lots.map((lot) => lot.points);

      for (const receipt of items) {
        let toSpend = receipt.redeemApplied;
        let spent = 0;

        for (let i = 0; i < lots.length && toSpend > 0; i += 1) {
          const lot = lots[i];
          const expiresAt = lot.expiresAt;
          if (expiresAt && expiresAt.getTime() < receipt.createdAt.getTime()) {
            continue;
          }
          const available = Math.max(0, remaining[i] ?? 0);
          if (available <= 0) continue;
          const take = Math.min(available, toSpend);
          remaining[i] = available - take;
          spent += take;
          toSpend -= take;
        }

        giftSpentByReceipt.set(receipt.id, spent);
      }
    }

    const greetingsPerBucket = new Map<string, Set<string>>();
    for (const greeting of greetings) {
      const key = dateKey(new Date(greeting.sendDate));
      const list = greetingsPerBucket.get(key) ?? new Set<string>();
      if (greeting.customerId) list.add(greeting.customerId);
      greetingsPerBucket.set(key, list);
    }

    const purchasesPerBucket = new Map<string, Set<string>>();
    const revenuePerBucket = new Map<string, number>();
    const buyers = new Set<string>();
    let revenueNet = 0;
    let pointsSpent = 0;
    let grossSum = 0;
    let giftReceiptCount = 0;

    for (const receipt of targetReceipts) {
      const giftSpent = giftSpentByReceipt.get(receipt.id) ?? 0;
      if (giftSpent <= 0) continue;

      const net = Math.max(0, Number(receipt.total ?? 0) - giftSpent);
      const bucket = dateKey(new Date(receipt.createdAt));
      const set = purchasesPerBucket.get(bucket) ?? new Set<string>();
      if (receipt.customerId) set.add(receipt.customerId as string);
      purchasesPerBucket.set(bucket, set);
      revenuePerBucket.set(bucket, (revenuePerBucket.get(bucket) ?? 0) + net);

      buyers.add(receipt.customerId as string);
      revenueNet += net;
      pointsSpent += giftSpent;
      grossSum += Number(receipt.total ?? 0);
      giftReceiptCount += 1;
    }

    const timelineKeys = new Set<string>([
      ...greetingsPerBucket.keys(),
      ...purchasesPerBucket.keys(),
    ]);
    const timeline = Array.from(timelineKeys)
      .map((key) => ({
        date: key,
        greetings: greetingsPerBucket.get(key)?.size ?? 0,
        purchases: purchasesPerBucket.get(key)?.size ?? 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const revenueTimeline = Array.from(revenuePerBucket.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      ...basePeriod,
      summary: {
        greetings: greetingCustomers.size,
        giftPurchasers: buyers.size,
        revenueNet: Math.round(revenueNet),
        averageCheck:
          giftReceiptCount > 0 ? Math.round(grossSum / giftReceiptCount) : 0,
        giftPointsSpent: Math.round(pointsSpent),
        receiptsWithGifts: giftReceiptCount,
      },
      timeline,
      revenue: revenueTimeline,
    };
  }

  // Вспомогательные методы

  private async getTimezoneInfo(
    merchantId: string,
    timezone?: string | RussiaTimezone | null,
  ): Promise<RussiaTimezone> {
    if (!timezone) {
      const row = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { timezone: true },
      });
      return findTimezone(row?.timezone ?? DEFAULT_TIMEZONE_CODE);
    }
    if (typeof timezone === 'string') return findTimezone(timezone);
    return timezone;
  }

  async resolveTimezone(
    merchantId: string,
    timezone?: string | RussiaTimezone,
  ) {
    return this.getTimezoneInfo(merchantId, timezone);
  }

  private formatDateLabel(date: Date, timezone: RussiaTimezone) {
    const local = new Date(
      date.getTime() + timezone.utcOffsetMinutes * 60 * 1000,
    );
    const year = local.getUTCFullYear();
    const month = String(local.getUTCMonth() + 1).padStart(2, '0');
    const day = String(local.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private truncateForTimezone(
    date: Date,
    grouping: TimeGrouping,
    timezone: RussiaTimezone,
  ): Date {
    const local = new Date(
      date.getTime() + timezone.utcOffsetMinutes * 60 * 1000,
    );
    local.setUTCHours(0, 0, 0, 0);
    if (grouping === 'week') {
      const day = local.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      local.setUTCDate(local.getUTCDate() + diff);
    } else if (grouping === 'month') {
      local.setUTCDate(1);
    }
    return new Date(local.getTime() - timezone.utcOffsetMinutes * 60 * 1000);
  }

  private getPreviousPeriod(period: DashboardPeriod): DashboardPeriod {
    const duration = period.to.getTime() - period.from.getTime();
    return {
      from: new Date(period.from.getTime() - duration),
      to: new Date(period.from.getTime()),
      type: period.type,
    };
  }

  private async getHourlyDistribution(
    merchantId: string,
    period: DashboardPeriod,
    timezone: RussiaTimezone,
  ): Promise<HourlyData[]> {
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

  private async getDailyRevenue(
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
      const label = this.formatDateLabel(new Date(row.bucket), timezone);
      const revenue = Number(row.revenue ?? 0);
      const orders = Math.round(Number(row.orders ?? 0));
      const customers = Math.round(Number(row.customers ?? 0));
      byLabel.set(label, { revenue, orders, customers });
    }

    const start = this.truncateForTimezone(period.from, grouping, timezone);
    const end = this.truncateForTimezone(period.to, grouping, timezone);
    const result: DailyData[] = [];
    let cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const label = this.formatDateLabel(cursor, timezone);
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
      cursor = this.advanceDate(cursor, grouping, timezone);
    }

    return result;
  }

  private async getPointsSeries(
    merchantId: string,
    period: DashboardPeriod,
    grouping: TimeGrouping,
    timezone: RussiaTimezone,
  ): Promise<PointsSeriesItem[]> {
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
      const label = this.formatDateLabel(new Date(row.bucket), timezone);
      byLabel.set(label, {
        accrued: Math.round(Number(row.accrued ?? 0)),
        redeemed: Math.round(Number(row.redeemed ?? 0)),
        burned: Math.round(Number(row.burned ?? 0)),
        net: Number(row.net ?? 0),
      });
    }

    const start = this.truncateForTimezone(period.from, grouping, timezone);
    const end = this.truncateForTimezone(period.to, grouping, timezone);
    const result: PointsSeriesItem[] = [];
    let cursor = new Date(start);
    let balance = initialBalance;

    while (cursor.getTime() <= end.getTime()) {
      const label = this.formatDateLabel(cursor, timezone);
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
      cursor = this.advanceDate(cursor, grouping, timezone);
    }

    return result;
  }

  private resolveGrouping(
    period: DashboardPeriod,
    requested?: TimeGrouping,
  ): TimeGrouping {
    if (requested === 'day' || requested === 'week' || requested === 'month') {
      return requested;
    }
    const totalDays = Math.max(
      1,
      Math.ceil(
        (period.to.getTime() - period.from.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    if (totalDays > 210) return 'month';
    if (totalDays > 45) return 'week';
    return 'day';
  }

  private truncateDate(value: Date, grouping: TimeGrouping): Date {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    if (grouping === 'week') {
      const day = date.getUTCDay();
      const offset = (day + 6) % 7;
      date.setUTCDate(date.getUTCDate() - offset);
    } else if (grouping === 'month') {
      date.setUTCDate(1);
    }
    return date;
  }

  private advanceDate(
    value: Date,
    grouping: TimeGrouping,
    timezone: RussiaTimezone,
  ): Date {
    const offsetMs = timezone.utcOffsetMinutes * 60 * 1000;
    const local = new Date(value.getTime() + offsetMs);
    if (grouping === 'week') {
      local.setUTCDate(local.getUTCDate() + 7);
    } else if (grouping === 'month') {
      local.setUTCMonth(local.getUTCMonth() + 1);
      local.setUTCDate(1);
    } else {
      local.setUTCDate(local.getUTCDate() + 1);
    }
    local.setUTCHours(0, 0, 0, 0);
    return new Date(local.getTime() - offsetMs);
  }

  private async calculateCustomerLTV(merchantId: string): Promise<number> {
    const result = await this.prisma.transaction.aggregate({
      where: { merchantId, type: 'EARN' },
      _sum: { amount: true },
      _count: { customerId: true },
    });

    if (!result._count.customerId) return 0;
    return Math.abs(result._sum.amount || 0) / result._count.customerId;
  }

  private async getTopCustomers(
    merchantId: string,
    limit: number,
  ): Promise<TopCustomer[]> {
    // Группировка транзакций по клиенту (вся история для мерчанта, как и в исходном SQL)
    const grouped = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: { merchantId, type: 'EARN' },
      _sum: { amount: true },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    });

    const ids = grouped
      .map((g) => g.customerId)
      .filter((v): v is string => !!v);
    if (ids.length === 0) return [];

    const [customers, wallets] = await Promise.all([
      this.prisma.customer.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, phone: true },
      }),
      this.prisma.wallet.findMany({
        where: { merchantId, customerId: { in: ids }, type: 'POINTS' as any },
        select: { customerId: true, balance: true },
      }),
    ]);
    const cMap = new Map(customers.map((c) => [c.id, c]));
    const wMap = new Map(wallets.map((w) => [w.customerId, w.balance || 0]));

    return grouped.map((g) => {
      const c = cMap.get(g.customerId);
      const total = Math.abs(g._sum.amount || 0);
      const visits = g._count._all || 0;
      const lastVisit = g._max.createdAt as Date;
      const loyaltyPoints = wMap.get(g.customerId) || 0;
      return {
        id: g.customerId,
        name: c?.name || undefined,
        phone: c?.phone || undefined,
        totalSpent: total,
        visits,
        lastVisit,
        loyaltyPoints,
      } as TopCustomer;
    });
  }

  private async calculateLoyaltyROI(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<number> {
    const [loyaltyRevenue, programCost] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          merchantId,
          type: 'EARN',
          customer: {
            wallets: {
              some: { merchantId, balance: { gt: 0 } },
            },
          },
          createdAt: { gte: period.from, lte: period.to },
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          merchantId,
          type: { in: ['EARN', 'CAMPAIGN', 'REFERRAL'] },
          createdAt: { gte: period.from, lte: period.to },
        },
        _sum: { amount: true },
      }),
    ]);

    const revenue = Math.abs(loyaltyRevenue._sum.amount || 0);
    const cost = Math.abs(programCost._sum.amount || 0);
    return cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
  }

  private async calculateLoyaltyConversion(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<number> {
    const [withLoyalty, total] = await Promise.all([
      this.prisma.transaction.count({
        where: {
          merchantId,
          type: 'REDEEM',
          createdAt: { gte: period.from, lte: period.to },
        },
      }),
      this.prisma.transaction.count({
        where: {
          merchantId,
          type: { in: ['EARN', 'REDEEM'] },
          createdAt: { gte: period.from, lte: period.to },
        },
      }),
    ]);

    return total > 0 ? (withLoyalty / total) * 100 : 0;
  }

  private async getTopCampaigns(
    merchantId: string,
    period: DashboardPeriod,
    limit: number,
  ): Promise<CampaignPerformance[]> {
    const aggregates = await this.prisma.promotionParticipant.groupBy({
      by: ['promotionId'],
      where: {
        merchantId,
        joinedAt: { gte: period.from, lte: period.to },
      },
      _count: { _all: true },
      _sum: { pointsIssued: true },
      take: limit,
      orderBy: { _sum: { pointsIssued: 'desc' } },
    });

    const ids = aggregates.map((row) => row.promotionId);
    if (ids.length === 0) return [];

    const promotions = await this.prisma.loyaltyPromotion.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, metadata: true },
    });
    const map = new Map(promotions.map((promo) => [promo.id, promo]));

    return aggregates.map((row) => {
      const promotion = map.get(row.promotionId);
      const legacy = ((promotion?.metadata as any)?.legacyCampaign ??
        {}) as Record<string, any>;
      return {
        id: row.promotionId,
        name: promotion?.name ?? row.promotionId,
        type: legacy.kind ?? 'LOYALTY_PROMOTION',
        usageCount: row._count._all,
        totalRewards: row._sum.pointsIssued ?? 0,
        roi: 0,
      };
    });
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
            AND r."canceledAt" IS NULL
            AND r."outletId" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM "Transaction" refund
              WHERE refund."merchantId" = r."merchantId"
                AND refund."orderId" = r."orderId"
                AND refund."type" = 'REFUND'
                AND refund."canceledAt" IS NULL
            )
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
            AND r."canceledAt" IS NULL
            AND r."outletId" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM "Transaction" refund
              WHERE refund."merchantId" = r."merchantId"
                AND refund."orderId" = r."orderId"
                AND refund."type" = 'REFUND'
                AND refund."canceledAt" IS NULL
            )
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
              AND r."canceledAt" IS NULL
              AND NOT EXISTS (
                SELECT 1
                FROM "Transaction" refund
                WHERE refund."merchantId" = r."merchantId"
                  AND refund."orderId" = r."orderId"
                  AND refund."type" = 'REFUND'
                  AND refund."canceledAt" IS NULL
              )
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
    const hourlyData = await this.getHourlyDistribution(
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
        select: { id: true, name: true, posLastSeenAt: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['outletId'],
        where: {
          merchantId,
          createdAt: { gte: period.from, lte: period.to },
          outletId: { not: null },
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
      const lastActive = outlet.posLastSeenAt ?? aggregate?.lastTxnAt ?? null;
      return {
        outletId: outlet.id,
        name: outlet.name || outlet.id,
        transactions: aggregate?.transactions || 0,
        lastActive,
      };
    });

    rows.sort((a, b) => b.transactions - a.transactions);
    return rows;
  }

  async getPurchaseRecencyDistribution(
    merchantId: string,
    group: RecencyGrouping,
    rawLimit?: number,
  ): Promise<PurchaseRecencyDistribution> {
    const normalizedGroup: RecencyGrouping =
      group === 'week' || group === 'month' ? group : 'day';
    const defaults: Record<RecencyGrouping, number> = {
      day: 30,
      week: 10,
      month: 5,
    };
    const maximums: Record<RecencyGrouping, number> = {
      day: 365,
      week: 52,
      month: 12,
    };
    const limit = Math.max(
      1,
      Math.min(
        rawLimit ?? defaults[normalizedGroup],
        maximums[normalizedGroup],
      ),
    );

    const rows = await this.prisma.$queryRaw<
      Array<{ days: number; customers: number }>
    >(Prisma.sql`
      SELECT
        GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (NOW() - "lastOrderAt")) / 86400)
        )::int AS days,
        COUNT(*)::int AS customers
      FROM "CustomerStats"
      WHERE "merchantId" = ${merchantId}
        AND "lastOrderAt" IS NOT NULL
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    const bucketsMap = new Map<number, number>();

    const mapToBucket = (days: number): number => {
      if (normalizedGroup === 'day') return days;
      if (normalizedGroup === 'week') {
        if (days <= 0) return 0;
        const base = Math.floor(days / 7);
        return days % 7 === 0 ? Math.max(base - 1, 0) : base;
      }
      if (days <= 0) return 0;
      const base = Math.floor(days / 30);
      return days % 30 === 0 ? Math.max(base - 1, 0) : base;
    };

    for (const row of rows) {
      const bucket = mapToBucket(Number(row.days || 0));
      if (bucket < 0 || bucket >= limit) continue;
      const current = bucketsMap.get(bucket) ?? 0;
      bucketsMap.set(bucket, current + Number(row.customers || 0));
    }

    const buckets: RecencyBucket[] = [];
    for (let index = 0; index < limit; index++) {
      const customers = bucketsMap.get(index) ?? 0;
      if (normalizedGroup === 'day') {
        buckets.push({
          index,
          value: index,
          label: String(index),
          customers,
        });
        continue;
      }
      if (normalizedGroup === 'week') {
        const value = index + 1;
        buckets.push({
          index,
          value,
          label: this.pluralize(value, ['неделя', 'недели', 'недель']),
          customers,
        });
        continue;
      }
      const value = index + 1;
      buckets.push({
        index,
        value,
        label: this.pluralize(value, ['месяц', 'месяца', 'месяцев']),
        customers,
      });
    }

    const totalCustomers = buckets.reduce(
      (acc, bucket) => acc + bucket.customers,
      0,
    );

    return {
      group: normalizedGroup,
      buckets,
      totalCustomers,
    };
  }

  async getTimeActivityMetrics(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<TimeActivityMetrics> {
    const tz = await this.getTimezoneInfo(merchantId, timezone);
    const offsetInterval = Prisma.sql`${tz.utcOffsetMinutes} * interval '1 minute'`;
    const refundExclusion = Prisma.sql`
      AND NOT EXISTS (
        SELECT 1
        FROM "Transaction" refund
        WHERE refund."merchantId" = r."merchantId"
          AND refund."orderId" = r."orderId"
          AND refund."type" = 'REFUND'
          AND refund."canceledAt" IS NULL
      )
    `;
    const [dayRows, hourRows, cellRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          dow: number;
          orders: number;
          customers: number;
          revenue: number;
        }>
      >(Prisma.sql`
        SELECT
          EXTRACT(ISODOW FROM (r."createdAt" + ${offsetInterval}))::int AS dow,
          COUNT(*)::int AS orders,
          COUNT(DISTINCT r."customerId")::int AS customers,
          COALESCE(SUM(r."total"), 0)::int AS revenue
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" BETWEEN ${period.from} AND ${period.to}
          AND r."canceledAt" IS NULL
          AND r."total" > 0
          ${refundExclusion}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<
        Array<{
          hour: number;
          orders: number;
          customers: number;
          revenue: number;
        }>
      >(Prisma.sql`
        SELECT
          EXTRACT(HOUR FROM (r."createdAt" + ${offsetInterval}))::int AS hour,
          COUNT(*)::int AS orders,
          COUNT(DISTINCT r."customerId")::int AS customers,
          COALESCE(SUM(r."total"), 0)::int AS revenue
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" BETWEEN ${period.from} AND ${period.to}
          AND r."canceledAt" IS NULL
          AND r."total" > 0
          ${refundExclusion}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<
        Array<{
          dow: number;
          hour: number;
          orders: number;
          customers: number;
          revenue: number;
        }>
      >(Prisma.sql`
        SELECT
          EXTRACT(ISODOW FROM (r."createdAt" + ${offsetInterval}))::int AS dow,
          EXTRACT(HOUR FROM (r."createdAt" + ${offsetInterval}))::int AS hour,
          COUNT(*)::int AS orders,
          COUNT(DISTINCT r."customerId")::int AS customers,
          COALESCE(SUM(r."total"), 0)::int AS revenue
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" BETWEEN ${period.from} AND ${period.to}
          AND r."canceledAt" IS NULL
          AND r."total" > 0
          ${refundExclusion}
        GROUP BY 1, 2
      `),
    ]);

    const hoursRange = Array.from({ length: 24 }, (_, idx) => idx);
    const isoWeekDays = Array.from({ length: 7 }, (_, idx) => idx + 1); // 1..7

    const cellMap = new Map<string, TimeHeatmapCell>();

    for (const row of cellRows) {
      const day = Math.min(Math.max(Number(row.dow || 1), 1), 7);
      const hour = Math.min(Math.max(Number(row.hour || 0), 0), 23);
      const orders = Math.max(0, Number(row.orders || 0));
      const revenue = Math.max(0, Number(row.revenue || 0));
      const customers = Math.max(0, Number(row.customers || 0));
      const averageCheck = orders > 0 ? revenue / orders : 0;
      const key = `${day}:${hour}`;
      cellMap.set(key, { day, hour, orders, customers, revenue, averageCheck });
    }

    const dayOfWeek: TimeActivityDay[] = isoWeekDays.map((day) => {
      const row = dayRows.find((item) => Number(item.dow || 0) === day);
      const orders = Math.max(0, Number(row?.orders || 0));
      const revenue = Math.max(0, Number(row?.revenue || 0));
      const customers = Math.max(0, Number(row?.customers || 0));
      const averageCheck = orders > 0 ? revenue / orders : 0;
      return { day, orders, revenue, customers, averageCheck };
    });

    const hours: TimeActivityHour[] = hoursRange.map((hour) => {
      const row = hourRows.find((item) => Number(item.hour || 0) === hour);
      const orders = Math.max(0, Number(row?.orders || 0));
      const revenue = Math.max(0, Number(row?.revenue || 0));
      const customers = Math.max(0, Number(row?.customers || 0));
      const averageCheck = orders > 0 ? revenue / orders : 0;
      return { hour, orders, revenue, customers, averageCheck };
    });

    const heatmap: TimeHeatmapCell[] = [];
    for (const day of isoWeekDays) {
      for (const hour of hoursRange) {
        const key = `${day}:${hour}`;
        const existing = cellMap.get(key);
        if (existing) {
          heatmap.push(existing);
        } else {
          heatmap.push({
            day,
            hour,
            orders: 0,
            customers: 0,
            revenue: 0,
            averageCheck: 0,
          });
        }
      }
    }

    return { dayOfWeek, hours, heatmap };
  }

  private pluralize(value: number, forms: [string, string, string]): string {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 14) return `${value} ${forms[2]}`.trim();
    const mod10 = value % 10;
    if (mod10 === 1) return `${value} ${forms[0]}`.trim();
    if (mod10 >= 2 && mod10 <= 4) return `${value} ${forms[1]}`.trim();
    return `${value} ${forms[2]}`.trim();
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
