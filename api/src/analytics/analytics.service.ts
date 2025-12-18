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
import {
  fetchReceiptAggregates,
  type ReceiptAggregateRow,
} from '../common/receipt-aggregates.util';
import { AnalyticsAggregatorWorker } from './analytics-aggregator.worker';

export interface DashboardPeriod {
  from: Date;
  to: Date;
  type: 'yesterday' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
}

export type TimeGrouping = 'day' | 'week' | 'month';

export interface DashboardSummary {
  period: {
    from: string;
    to: string;
    type: DashboardPeriod['type'];
  };
  previousPeriod: {
    from: string;
    to: string;
    type: DashboardPeriod['type'];
  };
  metrics: SummaryMetrics;
  previousMetrics: SummaryMetrics;
  timeline: {
    current: SummaryTimelinePoint[];
    previous: SummaryTimelinePoint[];
    grouping: TimeGrouping;
  };
  composition: {
    newChecks: number;
    repeatChecks: number;
  };
  retention: {
    activeCurrent: number;
    activePrevious: number;
    retained: number;
    retentionRate: number;
    churnRate: number;
  };
}

export interface SummaryMetrics {
  salesAmount: number;
  orders: number;
  averageCheck: number;
  newCustomers: number;
  activeCustomers: number;
  averagePurchasesPerCustomer: number;
  visitFrequencyDays: number | null;
  pointsBurned: number;
}

export interface SummaryTimelinePoint {
  date: string;
  registrations: number;
  salesCount: number;
  salesAmount: number;
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

type RfmRange = { min: number | null; max: number | null; count: number };
type RfmGroupSummary = {
  score: number;
  recency: RfmRange;
  frequency: RfmRange;
  monetary: RfmRange;
};
type ParsedRfmSettings = {
  recencyMode?: 'auto' | 'manual';
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
  bonusesIssued: number;
  timeline: ReferralTimelinePoint[];
  topReferrers: Array<{
    rank: number;
    name: string;
    customerId: string;
    invited: number;
    conversions: number;
    revenue: number;
  }>;
  previous: ReferralPeriodSnapshot;
}

export interface ReferralPeriodSnapshot {
  registeredViaReferral: number;
  purchasedViaReferral: number;
  referralRevenue: number;
  bonusesIssued: number;
}

export interface ReferralTimelinePoint {
  date: string;
  registrations: number;
  firstPurchases: number;
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

interface DashboardAggregates {
  revenue: number;
  orders: number;
  buyers: number;
  pointsRedeemed: number;
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
    private aggregatorWorker?: AnalyticsAggregatorWorker,
  ) {}

  /**
   * Получить полный дашборд
   */
  async getDashboard(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<DashboardSummary> {
    const tz = await this.getTimezoneInfo(merchantId, timezone);
    const grouping = this.resolveGrouping(period);
    const previousPeriod = this.getPreviousPeriod(period);

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
      this.getDailyRevenue(merchantId, period, grouping, tz),
      this.getDailyRevenue(merchantId, previousPeriod, grouping, tz),
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
    const timeline = {
      current: this.mergeTimeline(currentDailySales, currentRegistrationsByDay),
      previous: this.mergeTimeline(
        previousDailySales,
        previousRegistrationsByDay,
      ),
      grouping,
    };
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
      timeline,
      composition,
      retention,
    };
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
        total: { gt: 0 },
        createdAt: { gte: period.from, lte: period.to },
        ...(segmentId
          ? {
              customer: {
                segments: { some: { segmentId } },
              },
            }
          : {}),
      },
      include: {
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
      const customerId = receipt.customerId;
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
    timezone?: string | RussiaTimezone,
  ): Promise<ReferralSummary> {
    const tz = await this.getTimezoneInfo(merchantId, timezone);
    const current = await this.computeReferralPeriodStats(
      merchantId,
      period,
      tz,
      { withTimeline: true, withLeaderboard: true },
    );
    const previous = await this.computeReferralPeriodStats(
      merchantId,
      this.getPreviousPeriod(period),
      tz,
      { withTimeline: false, withLeaderboard: false },
    );

    return {
      ...current,
      previous: {
        registeredViaReferral: previous.registeredViaReferral,
        purchasedViaReferral: previous.purchasedViaReferral,
        referralRevenue: previous.referralRevenue,
        bonusesIssued: previous.bonusesIssued,
      },
    };
  }

  private computeReferralReward(
    rewardType?: string | null,
    rewardValue?: number | null,
    purchaseAmount?: number | null,
  ) {
    const roundTwo = (value: number) => Math.round(value * 100) / 100;
    const normalizedReward = Number.isFinite(rewardValue ?? NaN)
      ? Math.max(0, Number(rewardValue))
      : 0;
    if ((rewardType || '').toUpperCase() === 'PERCENT') {
      const amount = Number.isFinite(purchaseAmount ?? NaN)
        ? Number(purchaseAmount)
        : 0;
      if (amount <= 0 || normalizedReward <= 0) return 0;
      return roundTwo((amount * normalizedReward) / 100);
    }
    if (normalizedReward <= 0) return 0;
    return roundTwo(normalizedReward);
  }

  private async computeReferralPeriodStats(
    merchantId: string,
    period: DashboardPeriod,
    tz: RussiaTimezone,
    opts: { withTimeline: boolean; withLeaderboard: boolean },
  ) {
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
    let bonusesIssued = 0;

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
      const friendReward = Math.max(
        0,
        Number(activation.program?.refereeReward ?? 0),
      );
      if (refereeId) {
        bonusesIssued += friendReward;
      }
      if (
        activation.completedAt &&
        activation.completedAt >= period.from &&
        activation.completedAt <= period.to
      ) {
        const reward = this.computeReferralReward(
          activation.program?.rewardType,
          activation.program?.referrerReward,
          activation.purchaseAmount,
        );
        bonusesIssued += reward;
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
        const key = this.formatDateLabel(cursor, tz);
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
        const key = this.formatDateLabel(activation.activatedAt, tz);
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
            const key = this.formatDateLabel(row.firstPurchaseAt, tz);
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
          .slice(0, 20)
          .map((x, i) => ({ rank: i + 1, ...x }))
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
    if (!root) return { recencyMode: 'auto' };
    const raw = root.rfm;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return { recencyMode: 'auto' };
    const rfm = raw as Record<string, unknown>;
    const recencyObject = this.toJsonObject(
      rfm.recency as Prisma.JsonValue,
    ) as {
      mode?: unknown;
      days?: unknown;
      recencyDays?: unknown;
      threshold?: unknown;
    } | null;
    const legacyRecencyDays = this.toNumber(rfm.recencyDays);
    const recencyModeFromObject =
      recencyObject?.mode === 'manual' ? 'manual' : 'auto';
    const recencyDaysFromObject = this.toNumber(
      recencyObject?.days ??
        recencyObject?.recencyDays ??
        recencyObject?.threshold,
    );
    let recencyMode: 'auto' | 'manual' = recencyModeFromObject;
    let recencyDays = recencyDaysFromObject;
    if (!recencyDays && legacyRecencyDays) {
      recencyDays = legacyRecencyDays;
      recencyMode = 'manual';
    }
    if (!(recencyDays && recencyDays > 0) && recencyMode === 'manual') {
      recencyMode = 'auto';
      recencyDays = undefined;
    }
    const frequencyRaw = this.toJsonObject(rfm.frequency as Prisma.JsonValue);
    const monetaryRaw = this.toJsonObject(rfm.monetary as Prisma.JsonValue);
    return {
      recencyMode,
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
      recencyMode: 'auto' | 'manual';
      recencyDays?: number | null;
      frequency: { mode: 'auto' | 'manual'; threshold: number | null };
      monetary: { mode: 'auto' | 'manual'; threshold: number | null };
    },
  ): Prisma.JsonObject {
    const root = this.toJsonObject(rulesJson);
    const next: Prisma.JsonObject = root ? { ...root } : {};
    next.rfm = {
      ...(rfm.recencyMode === 'manual' && rfm.recencyDays
        ? { recencyDays: rfm.recencyDays }
        : {}),
      recency: {
        mode: rfm.recencyMode,
        ...(rfm.recencyMode === 'manual' && rfm.recencyDays
          ? { recencyDays: rfm.recencyDays }
          : {}),
      },
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
    if (!values.length) return { min: null, max: null, count: 0 };
    let min = values[0];
    let max = values[0];
    for (const value of values) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return { min, max, count: values.length };
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

  private normalizeThreshold(
    value: number | null | undefined,
    minimum: number,
  ): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return Math.max(minimum, Math.round(value));
  }

  private computeRecencyDaysBounded(
    lastOrderAt: Date | null | undefined,
    horizon: number,
    now: Date,
  ): number {
    if (!(lastOrderAt instanceof Date) || Number.isNaN(lastOrderAt.getTime())) {
      return horizon;
    }
    const diff = now.getTime() - lastOrderAt.getTime();
    if (diff <= 0) return 0;
    const days = Math.floor(diff / DAY_MS);
    return Math.max(0, Math.min(days, horizon));
  }

  private computeRecencyDaysRaw(
    lastOrderAt: Date | null | undefined,
    now: Date,
  ): number {
    if (!(lastOrderAt instanceof Date) || Number.isNaN(lastOrderAt.getTime())) {
      return Number.POSITIVE_INFINITY;
    }
    const diff = now.getTime() - lastOrderAt.getTime();
    if (diff <= 0) return 0;
    return Math.max(0, Math.floor(diff / DAY_MS));
  }

  private scoreRecency(daysSince: number, horizon: number): number {
    if (!Number.isFinite(daysSince)) return 1;
    const limit = Math.max(1, horizon);
    const bounded = Math.max(0, Math.min(daysSince, limit));
    const bucket = Math.min(4, Math.floor((bounded / limit) * 5));
    return 5 - bucket;
  }

  private scoreRecencyQuantile(
    daysSince: number,
    quantiles?: Quantiles | null,
  ): number {
    if (!Number.isFinite(daysSince)) return 1;
    if (!quantiles) return 1;
    const { q20, q40, q60, q80 } = quantiles;
    if (q20 == null || q40 == null || q60 == null || q80 == null) return 1;
    if (q20 === q40 && q40 === q60 && q60 === q80) {
      if (daysSince < q20) return 5;
      if (daysSince > q20) return 1;
      return q20 === 0 ? 5 : 3;
    }
    if (daysSince <= q20) return 5;
    if (daysSince <= q40) return 4;
    if (daysSince <= q60) return 3;
    if (daysSince <= q80) return 2;
    return 1;
  }

  private scoreDescending(
    value: number,
    threshold: number | null | undefined,
    quantiles?: Quantiles | null,
  ): number {
    if (!Number.isFinite(value)) return 1;
    if (threshold != null && Number.isFinite(threshold) && threshold > 0) {
      if (value >= threshold) return 5;
      if (value >= threshold * 0.75) return 4;
      if (value >= threshold * 0.5) return 3;
      if (value >= threshold * 0.25) return 2;
      return 1;
    }
    if (quantiles) {
      const { q20, q40, q60, q80 } = quantiles;
      if (q20 == null || q40 == null || q60 == null || q80 == null) return 1;
      if (q20 === q40 && q40 === q60 && q60 === q80) {
        if (value > q20) return 5;
        if (value < q20) return 1;
        return q20 === 0 ? 1 : 3;
      }
      if (value <= q20) return 1;
      if (value <= q40) return 2;
      if (value <= q60) return 3;
      if (value <= q80) return 4;
      return 5;
    }
    return 1;
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
    const recencyMode =
      storedSettings.recencyMode === 'manual' && storedSettings.recencyDays
        ? 'manual'
        : 'auto';
    const recencyHorizon =
      recencyMode === 'manual' ? storedSettings.recencyDays : undefined;
    const now = new Date();
    const recencyBuckets = new Map<number, number[]>();
    const frequencyBuckets = new Map<number, number[]>();
    const monetaryBuckets = new Map<number, number[]>();
    const frequencySamples: number[] = [];
    const monetarySamples: number[] = [];
    const recencySamples: number[] = [];
    const distribution = new Map<string, number>();

    const eligibleStats = stats.filter((row) => {
      const visits = Math.max(0, Number(row.visits ?? 0));
      const totalSpent = Math.max(0, Number(row.totalSpent ?? 0));
      return visits > 0 && totalSpent > 0;
    });

    const prepared = eligibleStats.map((row) => {
      const daysSinceRaw = this.computeRecencyDaysRaw(row.lastOrderAt, now);
      const visits = Math.max(0, Number(row.visits ?? 0));
      const totalSpent = Math.max(0, Number(row.totalSpent ?? 0));

      const rScore = this.normalizeScore(row.rfmR);
      const fScore = this.normalizeScore(row.rfmF);
      const mScore = this.normalizeScore(row.rfmM);

      if (visits > 0) frequencySamples.push(visits);
      if (totalSpent > 0) monetarySamples.push(totalSpent);
      if (visits > 0 && Number.isFinite(daysSinceRaw) && daysSinceRaw >= 0) {
        recencySamples.push(daysSinceRaw);
      }

      return {
        row,
        daysSinceRaw,
        visits,
        totalSpent,
        rScore,
        fScore,
        mScore,
      };
    });

    const frequencyQuantiles =
      frequencySamples.length > 0
        ? this.computeQuantiles(frequencySamples)
        : null;
    const monetaryQuantiles =
      monetarySamples.length > 0
        ? this.computeQuantiles(monetarySamples)
        : null;
    const recencyQuantiles =
      recencySamples.length > 0 ? this.computeQuantiles(recencySamples) : null;
    const frequencyMode =
      storedSettings.frequency?.mode === 'manual' ? 'manual' : 'auto';
    const moneyMode =
      storedSettings.monetary?.mode === 'manual' ? 'manual' : 'auto';
    const frequencyThreshold =
      frequencyMode === 'manual'
        ? this.normalizeThreshold(storedSettings.frequency?.threshold, 1)
        : null;
    const moneyThreshold =
      moneyMode === 'manual'
        ? this.normalizeThreshold(storedSettings.monetary?.threshold, 0)
        : null;

    for (const entry of prepared) {
      const boundedRecency =
        recencyMode === 'manual' && recencyHorizon
          ? this.computeRecencyDaysBounded(
              entry.row.lastOrderAt,
              recencyHorizon,
              now,
            )
          : null;
      const resolvedRScore =
        entry.rScore ??
        (recencyMode === 'manual' && recencyHorizon
          ? this.scoreRecency(boundedRecency ?? recencyHorizon, recencyHorizon)
          : this.scoreRecencyQuantile(entry.daysSinceRaw, recencyQuantiles));
      const resolvedFScore =
        entry.fScore ??
        this.scoreDescending(
          entry.visits,
          frequencyThreshold,
          frequencyThreshold == null ? frequencyQuantiles : null,
        );
      const resolvedMScore =
        entry.mScore ??
        this.scoreDescending(
          entry.totalSpent,
          moneyThreshold,
          moneyThreshold == null ? monetaryQuantiles : null,
        );

      if (resolvedRScore)
        this.pushToBucket(
          recencyBuckets,
          resolvedRScore,
          recencyMode === 'manual' && recencyHorizon
            ? (boundedRecency ?? recencyHorizon)
            : entry.daysSinceRaw,
        );
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

    const suggestedFrequency = this.suggestUpperQuantile(frequencySamples, {
      minimum: 1,
    });
    const suggestedMoney = this.suggestUpperQuantile(monetarySamples, {
      minimum: 0,
    });

    const groups: RfmGroupSummary[] = [1, 2, 3, 4, 5].map((score) => ({
      score,
      recency: this.buildRange(recencyBuckets.get(score) ?? []),
      frequency: this.buildRange(frequencyBuckets.get(score) ?? []),
      monetary: this.buildRange(monetaryBuckets.get(score) ?? []),
    }));

    const settingsResponse = {
      recencyMode,
      recencyDays: recencyHorizon ?? null,
      frequencyMode,
      frequencyThreshold:
        frequencyMode === 'manual'
          ? (frequencyThreshold ?? null)
          : (suggestedFrequency ?? null),
      frequencySuggested: suggestedFrequency ?? null,
      moneyMode,
      moneyThreshold:
        moneyMode === 'manual'
          ? (moneyThreshold ?? null)
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
      totals: { customers: eligibleStats.length },
    };
  }

  async updateRfmSettings(merchantId: string, dto: UpdateRfmSettingsDto) {
    const settingsRow = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const nextRules = this.mergeRfmRules(settingsRow?.rulesJson, {
      recencyMode: dto.recencyMode,
      recencyDays:
        dto.recencyMode === 'manual' ? (dto.recencyDays ?? null) : null,
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
    if (this.aggregatorWorker?.recalculateCustomerStatsForMerchant) {
      await this.aggregatorWorker.recalculateCustomerStatsForMerchant(
        merchantId,
      );
    }
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
    const totalCustomers = await this.prisma.customer.count({
      where: { merchantId },
    });

    const newCustomers = await this.prisma.customer.count({
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

    // Customer теперь per-merchant модель
    const inactiveCustomers = await this.prisma.customer.count({
      where: {
        merchantId,
        NOT: {
          transactions: {
            some: {
              merchantId,
              createdAt: { gte: thirtyDaysAgo },
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
      giftTtlDays: number;
      giftBurnEnabled: boolean;
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
      rfmReturns: Array<{ date: string; segment: string; returned: number }>;
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
    const giftBurnEnabled = Boolean(
      autoReturn?.giftBurnEnabled ??
        (Number(autoReturn?.giftTtlDays ?? 0) || 0) > 0,
    );
    const giftTtlDays = giftBurnEnabled
      ? Math.max(0, Math.floor(Number(autoReturn?.giftTtlDays ?? 0) || 0))
      : 0;

    const from = new Date(period.from);
    const to = new Date(period.to);
    const msInDay = 24 * 60 * 60 * 1000;

    const refundOrderIds = new Set(
      (
        await this.prisma.transaction.findMany({
          where: {
            merchantId,
            type: TxnType.REFUND,
            canceledAt: null,
            orderId: { not: null },
            createdAt: { lte: to },
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
          createdAt: { lte: to },
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

    const attemptsRaw = await this.prisma.autoReturnAttempt.findMany({
      where: {
        merchantId,
        invitedAt: { gte: from, lte: to },
        status: { not: 'CANCELED' },
      },
      select: {
        id: true,
        customerId: true,
        invitedAt: true,
        status: true,
        giftPoints: true,
        giftExpiresAt: true,
        lastPurchaseAt: true,
      },
    });

    type AttemptInfo = {
      id: string;
      customerId: string;
      invitedAt: Date;
      giftPoints: number;
      expiresAt: Date | null;
    };

    const attemptsByCustomer = new Map<string, AttemptInfo>();
    for (const attempt of attemptsRaw) {
      if (!attempt.customerId) continue;
      if (attempt.status === 'FAILED') continue;
      if (outletCustomers && !outletCustomers.has(attempt.customerId)) continue;
      const giftPointsValue = Math.max(0, Number(attempt.giftPoints ?? 0));
      const expiresAt =
        giftBurnEnabled && giftPointsValue > 0
          ? attempt.giftExpiresAt
            ? new Date(attempt.giftExpiresAt)
            : new Date(attempt.invitedAt.getTime() + giftTtlDays * msInDay)
          : null;
      const existing = attemptsByCustomer.get(attempt.customerId);
      if (
        !existing ||
        attempt.invitedAt.getTime() < existing.invitedAt.getTime()
      ) {
        attemptsByCustomer.set(attempt.customerId, {
          id: attempt.id,
          customerId: attempt.customerId,
          invitedAt: new Date(attempt.invitedAt),
          giftPoints: giftPointsValue,
          expiresAt,
        });
      }
    }

    const attempts = Array.from(attemptsByCustomer.values());
    if (!attempts.length) {
      return {
        period: {
          from: from.toISOString(),
          to: to.toISOString(),
          type: period.type,
          thresholdDays,
          giftPoints,
          giftTtlDays,
          giftBurnEnabled,
        },
        summary: {
          invitations: 0,
          returned: 0,
          conversion: 0,
          pointsCost: 0,
          firstPurchaseRevenue: 0,
        },
        distance: {
          customers: 0,
          purchasesPerCustomer: 0,
          purchasesCount: 0,
          totalAmount: 0,
          averageCheck: 0,
        },
        rfm: [],
        trends: { attempts: [], revenue: [], rfmReturns: [] },
      };
    }

    const customerIds = attempts.map((item) => item.customerId);
    const statsRows =
      customerIds.length === 0
        ? []
        : await this.prisma.customerStats.findMany({
            where: { merchantId, customerId: { in: customerIds } },
            select: { customerId: true, rfmClass: true },
          });
    const rfmByCustomer = new Map<string, string>();
    for (const row of statsRows) {
      const label =
        typeof row.rfmClass === 'string' && row.rfmClass.trim().length
          ? row.rfmClass.trim()
          : 'Не рассчитано';
      rfmByCustomer.set(row.customerId, label);
    }

    const receiptWhere: any = {
      merchantId,
      customerId: { in: customerIds },
      createdAt: { gte: from, lte: to },
      canceledAt: null,
    };
    if (outletId && outletId !== 'all') {
      receiptWhere.outletId = outletId;
    }

    const receiptsRaw = await this.prisma.receipt.findMany({
      where: receiptWhere,
      select: {
        id: true,
        customerId: true,
        createdAt: true,
        total: true,
        redeemApplied: true,
        orderId: true,
      },
    });

    const receipts = receiptsRaw.filter((row) => {
      if (!row.customerId) return false;
      if (row.orderId && refundOrderIds.has(row.orderId)) return false;
      return true;
    });

    const receiptsByCustomer = new Map<
      string,
      Array<{
        id: string;
        createdAt: Date;
        total: number;
        redeemApplied: number;
      }>
    >();
    for (const receipt of receipts) {
      const customerId = receipt.customerId;
      const arr = receiptsByCustomer.get(customerId) ?? [];
      arr.push({
        id: receipt.id,
        createdAt: new Date(receipt.createdAt),
        total: Number(receipt.total ?? 0),
        redeemApplied: Math.max(0, Number(receipt.redeemApplied ?? 0)),
      });
      receiptsByCustomer.set(customerId, arr);
    }
    for (const arr of receiptsByCustomer.values()) {
      arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    const invitesByDay = new Map<string, number>();
    const returnsByDay = new Map<string, number>();
    const revenueByDay = new Map<string, number>();
    const firstRevenueByDay = new Map<string, number>();
    const rfmTimeline = new Map<string, number>(); // key: `${date}|${segment}`
    const rfmCounters = new Map<
      string,
      { invitations: number; returned: number }
    >();

    let invitations = 0;
    let returned = 0;
    let pointsCost = 0;
    let firstPurchaseRevenue = 0;
    let repeatCustomers = 0;
    let purchasesAfterReturn = 0;
    let amountAfterReturn = 0;

    const dateKey = (value: Date) => value.toISOString().slice(0, 10);

    for (const attempt of attempts) {
      const customerId = attempt.customerId;
      const segment = rfmByCustomer.get(customerId) ?? 'Не рассчитано';
      if (!rfmCounters.has(segment)) {
        rfmCounters.set(segment, { invitations: 0, returned: 0 });
      }
      rfmCounters.get(segment)!.invitations += 1;

      invitations += 1;
      const inviteBucket = dateKey(attempt.invitedAt);
      invitesByDay.set(inviteBucket, (invitesByDay.get(inviteBucket) ?? 0) + 1);

      const customerReceipts =
        receiptsByCustomer
          .get(customerId)
          ?.filter((receipt) => receipt.createdAt >= attempt.invitedAt) ?? [];
      if (!customerReceipts.length) continue;

      const giftSpentByReceipt = new Map<string, number>();
      let availableGift = Math.max(0, attempt.giftPoints);
      const burnActive = giftBurnEnabled && attempt.giftPoints > 0;
      const expireAt = burnActive ? attempt.expiresAt : null;

      for (const receipt of customerReceipts) {
        let spent = 0;
        if (
          availableGift > 0 &&
          (!burnActive ||
            !expireAt ||
            receipt.createdAt.getTime() <= expireAt.getTime())
        ) {
          spent = Math.min(availableGift, receipt.redeemApplied);
          availableGift -= spent;
        }
        giftSpentByReceipt.set(receipt.id, spent);
        pointsCost += spent;
      }

      const firstReceipt = customerReceipts[0];
      if (!firstReceipt) continue;
      const giftSpentFirst = giftSpentByReceipt.get(firstReceipt.id) ?? 0;
      const isExpired =
        burnActive &&
        expireAt &&
        firstReceipt.createdAt.getTime() > expireAt.getTime();
      if (isExpired) continue;

      returned += 1;
      rfmCounters.get(segment)!.returned += 1;

      const firstBucket = dateKey(firstReceipt.createdAt);
      returnsByDay.set(firstBucket, (returnsByDay.get(firstBucket) ?? 0) + 1);
      rfmTimeline.set(
        `${firstBucket}|${segment}`,
        (rfmTimeline.get(`${firstBucket}|${segment}`) ?? 0) + 1,
      );

      const firstNet = Math.max(0, firstReceipt.total - giftSpentFirst);
      firstPurchaseRevenue += firstNet;
      firstRevenueByDay.set(
        firstBucket,
        (firstRevenueByDay.get(firstBucket) ?? 0) + firstNet,
      );

      for (const receipt of customerReceipts) {
        const spent = giftSpentByReceipt.get(receipt.id) ?? 0;
        const net = Math.max(0, receipt.total - spent);
        const bucket = dateKey(receipt.createdAt);
        revenueByDay.set(bucket, (revenueByDay.get(bucket) ?? 0) + net);
      }

      const afterFirst = customerReceipts.filter(
        (receipt) =>
          receipt.createdAt.getTime() > firstReceipt.createdAt.getTime(),
      );
      if (afterFirst.length > 0) {
        repeatCustomers += 1;
        purchasesAfterReturn += afterFirst.length;
        amountAfterReturn += afterFirst.reduce(
          (sum, receipt) => sum + receipt.total,
          0,
        );
      }
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
    for (let i = 0; i < daysCount; i += 1) {
      const current = new Date(from.getTime() + i * msInDay);
      const key = dateKey(current);
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

    const rfmReturns = Array.from(rfmTimeline.entries())
      .map(([key, count]) => {
        const [date, ...segmentParts] = key.split('|');
        return { date, segment: segmentParts.join('|'), returned: count ?? 0 };
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.segment.localeCompare(b.segment),
      );

    const conversion = invitations > 0 ? (returned / invitations) * 100 : 0;
    const purchasesPerCustomer =
      returned > 0 ? purchasesAfterReturn / returned : 0;
    const averageCheck =
      purchasesAfterReturn > 0
        ? Math.round(amountAfterReturn / purchasesAfterReturn)
        : 0;

    const summary = {
      invitations,
      returned,
      conversion: Math.round(conversion * 10) / 10,
      pointsCost: Math.round(pointsCost),
      firstPurchaseRevenue: Math.round(firstPurchaseRevenue),
    };

    const distance = {
      customers: repeatCustomers,
      purchasesPerCustomer:
        Math.round(Math.max(0, purchasesPerCustomer) * 10) / 10,
      purchasesCount: purchasesAfterReturn,
      totalAmount: Math.round(amountAfterReturn),
      averageCheck,
    };

    const rfm = Array.from(rfmCounters.entries())
      .map(([segment, counters]) => ({
        segment,
        invitations: counters.invitations,
        returned: counters.returned,
      }))
      .sort(
        (a, b) =>
          (b.invitations ?? 0) - (a.invitations ?? 0) ||
          a.segment.localeCompare(b.segment),
      );

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        type: period.type,
        thresholdDays,
        giftPoints,
        giftTtlDays,
        giftBurnEnabled,
      },
      summary,
      distance,
      rfm,
      trends: {
        attempts: attemptsTrend,
        revenue: revenueTrend,
        rfmReturns,
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
      if (row.orderId && refundOrderIds.has(row.orderId)) return false;
      return true;
    });
    const targetCustomerIds = new Set(
      targetReceipts.map((row) => row.customerId),
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
      if (row.orderId && refundOrderIds.has(row.orderId)) return false;
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
      const customerId = receipt.customerId;
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
      if (receipt.customerId) set.add(receipt.customerId);
      purchasesPerBucket.set(bucket, set);
      revenuePerBucket.set(bucket, (revenuePerBucket.get(bucket) ?? 0) + net);

      buyers.add(receipt.customerId);
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
      const label = this.formatDateLabel(new Date(row.bucket), timezone);
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
    sales: DailyData[],
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
        COALESCE(SUM(CASE WHEN fp.first_at >= ${period.from} AND fp.first_at <= ${period.to} THEN 1 ELSE 0 END), 0)::bigint AS "newChecks",
        COALESCE(SUM(CASE WHEN fp.first_at < ${period.from} THEN 1 ELSE 0 END), 0)::bigint AS "repeatChecks"
      FROM valid_receipts vr
      JOIN first_purchases fp ON fp."customerId" = vr."customerId"
    `);

    return {
      newChecks: Math.max(0, Math.round(Number(row?.newChecks ?? 0))),
      repeatChecks: Math.max(0, Math.round(Number(row?.repeatChecks ?? 0))),
    };
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
            AND r."total" > 0
            AND r."customerId" IS NOT NULL
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
            AND r."total" > 0
            AND r."customerId" IS NOT NULL
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
