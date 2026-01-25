import { Injectable } from '@nestjs/common';
import type { RussiaTimezone } from '../../shared/timezone/russia-timezones';
import { UpdateRfmSettingsDto } from './dto/update-rfm-settings.dto';
import { AnalyticsTimezoneService } from './analytics-timezone.service';
import { AnalyticsDashboardService } from './services/analytics-dashboard.service';
import { AnalyticsRevenueService } from './services/analytics-revenue.service';
import { AnalyticsCustomersService } from './services/analytics-customers.service';
import { AnalyticsReferralsService } from './services/analytics-referrals.service';
import { AnalyticsCampaignsService } from './services/analytics-campaigns.service';
import { AnalyticsOperationsService } from './services/analytics-operations.service';
import { AnalyticsLoyaltyService } from './services/analytics-loyalty.service';
import { AnalyticsMechanicsService } from './services/analytics-mechanics.service';
import { AnalyticsRfmService } from './services/analytics-rfm.service';

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
    private readonly dashboard: AnalyticsDashboardService,
    private readonly revenue: AnalyticsRevenueService,
    private readonly customers: AnalyticsCustomersService,
    private readonly referrals: AnalyticsReferralsService,
    private readonly campaigns: AnalyticsCampaignsService,
    private readonly operations: AnalyticsOperationsService,
    private readonly loyalty: AnalyticsLoyaltyService,
    private readonly mechanics: AnalyticsMechanicsService,
    private readonly rfm: AnalyticsRfmService,
    private readonly timezone: AnalyticsTimezoneService,
  ) {}

  getDashboard(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<DashboardSummary> {
    return this.dashboard.getDashboard(merchantId, period, timezone);
  }

  getCustomerPortrait(
    merchantId: string,
    period: DashboardPeriod,
    segmentId?: string,
  ): Promise<CustomerPortraitMetrics> {
    return this.customers.getCustomerPortrait(merchantId, period, segmentId);
  }

  getRepeatPurchases(
    merchantId: string,
    period: DashboardPeriod,
    outletId?: string,
  ): Promise<RepeatPurchasesMetrics> {
    return this.customers.getRepeatPurchases(merchantId, period, outletId);
  }

  getBirthdays(
    merchantId: string,
    withinDays = 30,
    limit = 100,
    timezone?: string | RussiaTimezone,
  ): Promise<BirthdayItem[]> {
    return this.customers.getBirthdays(merchantId, withinDays, limit, timezone);
  }

  getReferralSummary(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<ReferralSummary> {
    return this.referrals.getReferralSummary(merchantId, period, timezone);
  }

  getReferralLeaderboard(
    merchantId: string,
    period: DashboardPeriod,
    timezone: string | RussiaTimezone | undefined,
    offset = 0,
    limit = 50,
  ): Promise<{ items: ReferralSummary['topReferrers'] }> {
    return this.referrals.getReferralLeaderboard(
      merchantId,
      period,
      timezone,
      offset,
      limit,
    );
  }

  getBusinessMetrics(
    merchantId: string,
    period: DashboardPeriod,
    minPurchases = 3,
  ): Promise<BusinessMetrics> {
    return this.dashboard.getBusinessMetrics(merchantId, period, minPurchases);
  }

  getRetentionCohorts(
    merchantId: string,
    by: 'month' | 'week' = 'month',
    limit = 6,
  ) {
    return this.dashboard.getRetentionCohorts(merchantId, by, limit);
  }

  getRevenueMetrics(
    merchantId: string,
    period: DashboardPeriod,
    grouping?: TimeGrouping,
    timezone?: string | RussiaTimezone,
  ): Promise<RevenueMetrics> {
    return this.revenue.getRevenueMetrics(merchantId, period, grouping, timezone);
  }

  getCustomerMetrics(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<CustomerMetrics> {
    return this.customers.getCustomerMetrics(merchantId, period);
  }

  getLoyaltyMetrics(
    merchantId: string,
    period: DashboardPeriod,
    grouping?: TimeGrouping,
    timezone?: string | RussiaTimezone,
  ): Promise<LoyaltyMetrics> {
    return this.loyalty.getLoyaltyMetrics(merchantId, period, grouping, timezone);
  }

  getCampaignMetrics(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<CampaignMetrics> {
    return this.campaigns.getCampaignMetrics(merchantId, period);
  }

  getOperationalMetrics(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<OperationalMetrics> {
    return this.operations.getOperationalMetrics(merchantId, period, timezone);
  }

  getAutoReturnMetrics(
    merchantId: string,
    period: DashboardPeriod,
    outletId?: string,
  ) {
    return this.mechanics.getAutoReturnMetrics(merchantId, period, outletId);
  }

  getBirthdayMechanicMetrics(
    merchantId: string,
    period: DashboardPeriod,
    outletId?: string,
  ) {
    return this.mechanics.getBirthdayMechanicMetrics(merchantId, period, outletId);
  }

  getRfmGroupsAnalytics(merchantId: string) {
    return this.rfm.getRfmGroupsAnalytics(merchantId);
  }

  updateRfmSettings(merchantId: string, dto: UpdateRfmSettingsDto) {
    return this.rfm.updateRfmSettings(merchantId, dto);
  }

  getPurchaseRecencyDistribution(
    merchantId: string,
    group: RecencyGrouping,
    rawLimit?: number,
    timezone?: string | RussiaTimezone,
  ): Promise<PurchaseRecencyDistribution> {
    return this.customers.getPurchaseRecencyDistribution(
      merchantId,
      group,
      rawLimit,
      timezone,
    );
  }

  getTimeActivityMetrics(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<TimeActivityMetrics> {
    return this.customers.getTimeActivityMetrics(merchantId, period, timezone);
  }

  resolveTimezone(
    merchantId: string,
    timezone?: string | RussiaTimezone,
  ) {
    return this.timezone.resolveTimezone(merchantId, timezone);
  }
}
