import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';

export interface DashboardPeriod {
  from: Date;
  to: Date;
  type: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
}

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
  topStaff: StaffPerformance[];
  peakHours: string[];
  deviceUsage: DeviceStats[];
}

export interface CustomerPortraitMetrics {
  gender: Array<{ sex: string; customers: number; transactions: number; revenue: number; averageCheck: number }>;
  age: Array<{ bucket: string; customers: number; transactions: number; revenue: number; averageCheck: number }>;
  sexAge: Array<{ sex: string; bucket: string; customers: number; transactions: number; revenue: number; averageCheck: number }>;
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
  topReferrers: Array<{ rank: number; name: string; customerId: string; invited: number }>;
}

export interface BusinessMetrics {
  minPurchases: number;
  averageCheck: number;
  customers: number;
  transactions: number;
  revenue: number;
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
  growth: number;
}

interface StaffPerformance {
  id: string;
  name: string;
  transactions: number;
  revenue: number;
  averageCheck: number;
}

interface DeviceStats {
  deviceId: string;
  type: string;
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
  async getDashboard(merchantId: string, period: DashboardPeriod): Promise<DashboardMetrics> {
    const [revenue, customers, loyalty, campaigns, operations] = await Promise.all([
      this.getRevenueMetrics(merchantId, period),
      this.getCustomerMetrics(merchantId, period),
      this.getLoyaltyMetrics(merchantId, period),
      this.getCampaignMetrics(merchantId, period),
      this.getOperationalMetrics(merchantId, period),
    ]);

    return { revenue, customers, loyalty, campaigns, operations };
  }

  /**
   * Портрет клиента: пол, возраст, матрица пол×возраст за период
   */
  async getCustomerPortrait(merchantId: string, period: DashboardPeriod): Promise<CustomerPortraitMetrics> {
    const tx = await this.prisma.transaction.findMany({
      where: { merchantId, createdAt: { gte: period.from, lte: period.to }, type: 'EARN' },
      select: { amount: true, createdAt: true, customer: { select: { id: true, gender: true, birthday: true } } },
    });
    const genderMap = new Map<string, { customers: Set<string>; transactions: number; revenue: number }>();
    const ageBuckets = ['<18','18-24','25-34','35-44','45-54','55-64','65+'];
    const ageMap = new Map<string, { customers: Set<string>; transactions: number; revenue: number }>();
    const sexAgeMap = new Map<string, { customers: Set<string>; transactions: number; revenue: number }>();

    const bucketOf = (age: number | null): string => {
      if (age == null || isNaN(age)) return '25-34';
      if (age < 18) return '<18';
      if (age <= 24) return '18-24';
      if (age <= 34) return '25-34';
      if (age <= 44) return '35-44';
      if (age <= 54) return '45-54';
      if (age <= 64) return '55-64';
      return '65+';
    };

    for (const t of tx) {
      const sex = t.customer?.gender || 'U';
      const bday = t.customer?.birthday || null;
      const today = period.to || new Date();
      const age = bday ? Math.floor((today.getTime() - bday.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
      const bucket = bucketOf(age);
      const abs = Math.abs(t.amount || 0);

      // gender
      if (!genderMap.has(sex)) genderMap.set(sex, { customers: new Set(), transactions: 0, revenue: 0 });
      const g = genderMap.get(sex)!;
      if (t.customer?.id) g.customers.add(t.customer.id);
      g.transactions++; g.revenue += abs;

      // age
      if (!ageMap.has(bucket)) ageMap.set(bucket, { customers: new Set(), transactions: 0, revenue: 0 });
      const a = ageMap.get(bucket)!;
      if (t.customer?.id) a.customers.add(t.customer.id);
      a.transactions++; a.revenue += abs;

      // sex×age
      const key = `${sex}:${bucket}`;
      if (!sexAgeMap.has(key)) sexAgeMap.set(key, { customers: new Set(), transactions: 0, revenue: 0 });
      const sa = sexAgeMap.get(key)!;
      if (t.customer?.id) sa.customers.add(t.customer.id);
      sa.transactions++; sa.revenue += abs;
    }

    const gender = Array.from(genderMap.entries()).map(([sex, v]) => ({
      sex,
      customers: v.customers.size,
      transactions: v.transactions,
      revenue: Math.round(v.revenue),
      averageCheck: v.transactions > 0 ? Math.round(v.revenue / v.transactions) : 0,
    })).sort((a,b)=>b.revenue - a.revenue);

    const age = ageBuckets.map(bucket => {
      const v = ageMap.get(bucket) || { customers: new Set<string>(), transactions: 0, revenue: 0 };
      return {
        bucket,
        customers: v.customers.size,
        transactions: v.transactions,
        revenue: Math.round(v.revenue),
        averageCheck: v.transactions > 0 ? Math.round(v.revenue / v.transactions) : 0,
      };
    });

    const sexAge: Array<{ sex: string; bucket: string; customers: number; transactions: number; revenue: number; averageCheck: number }> = [];
    for (const [key, v] of sexAgeMap.entries()) {
      const [sex, bucket] = key.split(':');
      sexAge.push({ sex, bucket, customers: v.customers.size, transactions: v.transactions, revenue: Math.round(v.revenue), averageCheck: v.transactions>0?Math.round(v.revenue/v.transactions):0 });
    }

    return { gender, age, sexAge };
  }

  /**
   * Повторные продажи и распределение покупок на клиента за период
   */
  async getRepeatPurchases(merchantId: string, period: DashboardPeriod, outletId?: string): Promise<RepeatPurchasesMetrics> {
    const group = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: { merchantId, type: 'EARN', createdAt: { gte: period.from, lte: period.to }, ...(outletId ? { outletId } : {}) },
      _count: true,
    });
    const uniqueBuyers = group.length;
    const repeatBuyers = group.filter(g => g._count >= 2).length;
    const histogramMap: Record<number, number> = {};
    for (const g of group) {
      const c = g._count;
      histogramMap[c] = (histogramMap[c] || 0) + 1;
    }
    const histogram = Object.keys(histogramMap).map(k => ({ purchases: parseInt(k, 10), customers: histogramMap[parseInt(k, 10)] })).sort((a,b)=>a.purchases-b.purchases);
    const newBuyers = await this.prisma.wallet.count({ where: { merchantId, createdAt: { gte: period.from, lte: period.to } } });
    return { uniqueBuyers, newBuyers, repeatBuyers, histogram };
  }

  /**
   * Ближайшие дни рождения
   */
  async getBirthdays(merchantId: string, withinDays = 30, limit = 100): Promise<BirthdayItem[]> {
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
        items.push({ customerId: c.id, name: c.name || undefined, phone: c.phone || undefined, nextBirthday: nb.toISOString(), age });
      }
    }
    items.sort((a,b)=> a.nextBirthday.localeCompare(b.nextBirthday));
    return items.slice(0, limit);
  }

  /**
   * Реферальная сводка за период
   */
  async getReferralSummary(merchantId: string, period: DashboardPeriod): Promise<ReferralSummary> {
    const [activated, completed] = await Promise.all([
      this.prisma.referral.count({ where: { program: { merchantId }, activatedAt: { gte: period.from, lte: period.to } } }),
      this.prisma.referral.findMany({ where: { program: { merchantId }, completedAt: { gte: period.from, lte: period.to }, status: 'COMPLETED' }, select: { referrerId: true, purchaseAmount: true, referrer: { select: { name: true } } } }),
    ]);
    const purchasedViaReferral = completed.length;
    const referralRevenue = completed.reduce((s, r) => s + (r.purchaseAmount || 0), 0);
    const map = new Map<string, { name: string; invited: number }>();
    for (const r of completed) {
      if (!map.has(r.referrerId)) map.set(r.referrerId, { name: r.referrer?.name || 'Без имени', invited: 0 });
      map.get(r.referrerId)!.invited++;
    }
    const top = Array.from(map.entries()).map(([customerId, v]) => ({ customerId, name: v.name, invited: v.invited }))
      .sort((a,b)=>b.invited-a.invited).slice(0, 20).map((x, i) => ({ rank: i+1, ...x }));
    return { registeredViaReferral: activated, purchasedViaReferral, referralRevenue, topReferrers: top };
  }

  /**
   * Бизнес‑метрики: средний чек у клиентов, сделавших >= N покупок за период
   */
  async getBusinessMetrics(merchantId: string, period: DashboardPeriod, minPurchases = 3): Promise<BusinessMetrics> {
    const groups = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: { merchantId, type: 'EARN', createdAt: { gte: period.from, lte: period.to } },
      _count: true,
      _sum: { amount: true },
    });
    const filtered = groups.filter(g => g._count >= minPurchases);
    const transactions = filtered.reduce((s, g) => s + g._count, 0);
    const revenue = filtered.reduce((s, g) => s + Math.abs(g._sum.amount || 0), 0);
    const customers = filtered.length;
    const averageCheck = transactions > 0 ? Math.round(revenue / transactions) : 0;
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
  ): Promise<Array<{ cohort: string; from: string; to: string; size: number; retention: number[] }>> {
    // Сформируем периоды когорт от новейших к более старым
    const now = new Date();
    const cohorts: Array<{ label: string; start: Date; end: Date }> = [];
    const makeMonth = (d: Date) => {
      const s = new Date(d); s.setDate(1); s.setHours(0,0,0,0);
      const e = new Date(s); e.setMonth(e.getMonth()+1); e.setMilliseconds(e.getMilliseconds()-1);
      const label = `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}`;
      return { label, start: s, end: e };
    };
    const makeWeek = (d: Date) => {
      const s = new Date(d);
      const day = s.getDay();
      const diff = s.getDate() - day + (day === 0 ? -6 : 1); // Пн=1..Вс=0
      s.setDate(diff); s.setHours(0,0,0,0);
      const e = new Date(s); e.setDate(e.getDate()+7); e.setMilliseconds(e.getMilliseconds()-1);
      const y = s.getFullYear();
      const week = Math.floor(((((s as any) - (new Date(y,0,1) as any)) / 86400000) + new Date(y,0,1).getDay()+1)/7);
      const label = `${y}-W${String(week).padStart(2,'0')}`;
      return { label, start: s, end: e };
    };

    let cursor = new Date(now);
    for (let i = 0; i < limit; i++) {
      const c = by === 'week' ? makeWeek(cursor) : makeMonth(cursor);
      cohorts.push({ label: c.label, start: c.start, end: c.end });
      // Сдвиг на предыдущий период
      cursor = new Date(c.start);
      if (by === 'week') cursor.setDate(cursor.getDate()-1); else cursor.setDate(0);
    }

    // Для каждой когорты найдём клиентов по firstSeenAt в CustomerStats (fallback на wallet.createdAt уже учитывается в агрегаторе)
    const results: Array<{ cohort: string; from: string; to: string; size: number; retention: number[] }> = [];

    for (let i = cohorts.length - 1; i >= 0; i--) {
      const { label, start, end } = cohorts[i];
      const cohortCustomers = await this.prisma.customerStats.findMany({
        where: { merchantId, firstSeenAt: { gte: start, lte: end } },
        select: { customerId: true },
      });
      const ids = cohortCustomers.map(c => c.customerId);
      const size = ids.length;
      const retention: number[] = [];
      // Сдвиги считаем максимум до количества когорт (чтобы красиво отображать таблицу)
      const maxShifts = cohorts.length - i; // включая 0
      for (let s = 0; s < maxShifts; s++) {
        const periodStart = new Date(start);
        const periodEnd = new Date(start);
        if (by === 'week') {
          periodStart.setDate(periodStart.getDate() + 7*s);
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
            where: { merchantId, customerId: { in: ids }, createdAt: { gte: periodStart, lt: periodEnd } },
          });
          returned = visits.length;
        }
        retention.push(size > 0 ? Math.round((returned / size) * 1000) / 10 : 0);
      }
      results.push({ cohort: label, from: start.toISOString(), to: end.toISOString(), size, retention });
    }

    return results;
  }

  /**
   * RFM heatmap 5x5: матрица по R и F (или можно по R и M) с количеством клиентов
   */
  async getRfmHeatmap(merchantId: string): Promise<{ grid: number[][]; totals: { count: number } }> {
    const rows = await this.prisma.customerStats.findMany({
      where: { merchantId },
      select: { rfmR: true, rfmF: true },
    });
    const grid: number[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
    for (const r of rows) {
      const R = Math.min(Math.max((r.rfmR || 1), 1), 5);
      const F = Math.min(Math.max((r.rfmF || 1), 1), 5);
      grid[5 - R][F - 1]++; // по вертикали R сверху=5, снизу=1; горизонталь F слева=1..5
    }
    return { grid, totals: { count: rows.length } };
  }

  /**
   * Метрики выручки
   */
  async getRevenueMetrics(merchantId: string, period: DashboardPeriod): Promise<RevenueMetrics> {
    const where = {
      merchantId,
      createdAt: { gte: period.from, lte: period.to },
    };

    const transactions = await this.prisma.transaction.findMany({
      where: { ...where, type: { in: ['EARN', 'REDEEM'] } },
    });

    const totalRevenue = transactions
      .filter(t => t.type === 'EARN')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const transactionCount = transactions.length;
    const averageCheck = transactionCount > 0 ? totalRevenue / transactionCount : 0;

    // Рост относительно предыдущего периода
    const previousPeriod = this.getPreviousPeriod(period);
    const previousRevenue = await this.prisma.transaction.aggregate({
      where: {
        merchantId,
        type: 'EARN',
        createdAt: { gte: previousPeriod.from, lte: previousPeriod.to },
      },
      _sum: { amount: true },
    });

    const revenueGrowth = previousRevenue._sum.amount
      ? ((totalRevenue - Math.abs(previousRevenue._sum.amount)) / Math.abs(previousRevenue._sum.amount)) * 100
      : 0;

    const hourlyDistribution = await this.getHourlyDistribution(merchantId, period);
    const dailyRevenue = await this.getDailyRevenue(merchantId, period);

    return {
      totalRevenue,
      averageCheck: Math.round(averageCheck),
      transactionCount,
      revenueGrowth: Math.round(revenueGrowth * 10) / 10,
      hourlyDistribution,
      dailyRevenue,
    };
  }

  /**
   * Метрики клиентов
   */
  async getCustomerMetrics(merchantId: string, period: DashboardPeriod): Promise<CustomerMetrics> {
    const totalCustomers = await this.prisma.wallet.count({ where: { merchantId } });
    
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

    const churnRate = totalCustomers > 0 ? (inactiveCustomers / totalCustomers) * 100 : 0;
    const retentionRate = 100 - churnRate;

    const ltv = await this.calculateCustomerLTV(merchantId);

    const visits = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: { merchantId },
      _count: true,
    });
    const averageVisits = visits.length > 0
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
  async getLoyaltyMetrics(merchantId: string, period: DashboardPeriod): Promise<LoyaltyMetrics> {
    const where = {
      merchantId,
      createdAt: { gte: period.from, lte: period.to },
    };

    const [earned, redeemed, balances, activeWallets] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { ...where, type: 'EARN' },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { ...where, type: 'REDEEM' },
        _sum: { amount: true },
      }),
      this.prisma.wallet.aggregate({
        where: { merchantId },
        _avg: { balance: true },
      }),
      this.prisma.wallet.count({
        where: { merchantId, balance: { gt: 0 } },
      }),
    ]);

    const totalPointsIssued = Math.abs(earned._sum.amount || 0);
    const totalPointsRedeemed = Math.abs(redeemed._sum.amount || 0);
    const redemptionRate = totalPointsIssued > 0
      ? (totalPointsRedeemed / totalPointsIssued) * 100
      : 0;

    const roi = await this.calculateLoyaltyROI(merchantId, period);
    const conversionRate = await this.calculateLoyaltyConversion(merchantId, period);

    return {
      totalPointsIssued,
      totalPointsRedeemed,
      pointsRedemptionRate: Math.round(redemptionRate * 10) / 10,
      averageBalance: Math.round(balances._avg.balance || 0),
      activeWallets,
      programROI: Math.round(roi * 10) / 10,
      conversionRate: Math.round(conversionRate * 10) / 10,
    };
  }

  /**
   * Метрики кампаний
   */
  async getCampaignMetrics(merchantId: string, period: DashboardPeriod): Promise<CampaignMetrics> {
    const activeCampaigns = await this.prisma.campaign.count({
      where: { merchantId, status: 'ACTIVE' },
    });

    const usage = await this.prisma.campaignUsage.findMany({
      where: {
        campaign: { merchantId },
        usedAt: { gte: period.from, lte: period.to },
      },
      include: { campaign: true },
    });

    const totalRewardsIssued = usage.reduce((sum, u) => sum + (u.rewardValue || 0), 0);

    const campaignRevenue = await this.prisma.transaction.aggregate({
      where: {
        merchantId,
        type: 'CAMPAIGN',
        createdAt: { gte: period.from, lte: period.to },
      },
      _sum: { amount: true },
    });

    const campaignROI = totalRewardsIssued > 0
      ? ((Math.abs(campaignRevenue._sum.amount || 0) - totalRewardsIssued) / totalRewardsIssued) * 100
      : 0;

    const targetedCustomers = await this.prisma.segmentCustomer.count({
      where: {
        segment: {
          campaigns: {
            some: { merchantId, status: 'ACTIVE' },
          },
        },
      },
    });

    const campaignConversion = targetedCustomers > 0
      ? (usage.length / targetedCustomers) * 100
      : 0;

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
  async getOperationalMetrics(merchantId: string, period: DashboardPeriod): Promise<OperationalMetrics> {
    const [topOutlets, topStaff, peakHours, deviceUsage] = await Promise.all([
      this.getTopOutlets(merchantId, period),
      this.getTopStaff(merchantId, period),
      this.getPeakHours(merchantId, period),
      this.getDeviceUsage(merchantId, period),
    ]);

    return { topOutlets, topStaff, peakHours, deviceUsage };
  }

  // Вспомогательные методы

  private getPreviousPeriod(period: DashboardPeriod): DashboardPeriod {
    const duration = period.to.getTime() - period.from.getTime();
    return {
      from: new Date(period.from.getTime() - duration),
      to: new Date(period.from.getTime()),
      type: period.type,
    };
  }

  private async getHourlyDistribution(merchantId: string, period: DashboardPeriod): Promise<HourlyData[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        merchantId,
        createdAt: { gte: period.from, lte: period.to },
      },
      select: { createdAt: true, amount: true },
    });

    const hourlyData: Record<number, { revenue: number; transactions: number }> = {};
    for (let hour = 0; hour < 24; hour++) {
      hourlyData[hour] = { revenue: 0, transactions: 0 };
    }

    transactions.forEach(t => {
      const hour = t.createdAt.getHours();
      hourlyData[hour].revenue += Math.abs(t.amount);
      hourlyData[hour].transactions++;
    });

    return Object.entries(hourlyData).map(([hour, data]) => ({
      hour: parseInt(hour),
      revenue: Math.round(data.revenue),
      transactions: data.transactions,
    }));
  }

  private async getDailyRevenue(merchantId: string, period: DashboardPeriod): Promise<DailyData[]> {
    const days = Math.ceil((period.to.getTime() - period.from.getTime()) / (1000 * 60 * 60 * 24));
    const dailyData: DailyData[] = [];

    for (let i = 0; i < Math.min(days, 31); i++) {
      const dayStart = new Date(period.from);
      dayStart.setDate(dayStart.getDate() + i);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const [revenue, customers] = await Promise.all([
        this.prisma.transaction.aggregate({
          where: {
            merchantId,
            type: 'EARN',
            createdAt: { gte: dayStart, lte: dayEnd },
          },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.transaction.groupBy({
          by: ['customerId'],
          where: {
            merchantId,
            createdAt: { gte: dayStart, lte: dayEnd },
          },
        }),
      ]);

      dailyData.push({
        date: dayStart.toISOString().split('T')[0],
        revenue: Math.abs(revenue._sum.amount || 0),
        transactions: revenue._count,
        customers: customers.length,
      });
    }

    return dailyData;
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

  private async getTopCustomers(merchantId: string, limit: number): Promise<TopCustomer[]> {
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

    const ids = grouped.map(g => g.customerId).filter((v): v is string => !!v);
    if (ids.length === 0) return [];

    const [customers, wallets] = await Promise.all([
      this.prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true } }),
      this.prisma.wallet.findMany({ where: { merchantId, customerId: { in: ids }, type: 'POINTS' as any }, select: { customerId: true, balance: true } }),
    ]);
    const cMap = new Map(customers.map(c => [c.id, c]));
    const wMap = new Map(wallets.map(w => [w.customerId, w.balance || 0]));

    return grouped.map(g => {
      const c = cMap.get(g.customerId!);
      const total = Math.abs(g._sum.amount || 0);
      const visits = g._count._all || 0;
      const lastVisit = g._max.createdAt as Date;
      const loyaltyPoints = wMap.get(g.customerId!) || 0;
      return {
        id: g.customerId!,
        name: c?.name || undefined,
        phone: c?.phone || undefined,
        totalSpent: total,
        visits,
        lastVisit,
        loyaltyPoints,
      } as TopCustomer;
    });
  }

  private async calculateLoyaltyROI(merchantId: string, period: DashboardPeriod): Promise<number> {
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

  private async calculateLoyaltyConversion(merchantId: string, period: DashboardPeriod): Promise<number> {
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

  private async getTopCampaigns(merchantId: string, period: DashboardPeriod, limit: number): Promise<CampaignPerformance[]> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { merchantId },
      include: {
        usages: {
          where: {
            usedAt: { gte: period.from, lte: period.to },
          },
        },
      },
      take: limit,
    });

    return campaigns.map(campaign => ({
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      usageCount: campaign.usages.length,
      totalRewards: campaign.usages.reduce((sum, u) => sum + (u.rewardValue || 0), 0),
      roi: 0,
    }));
  }

  private async getTopOutlets(merchantId: string, period: DashboardPeriod): Promise<OutletPerformance[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['outletId'],
      where: { merchantId, type: 'EARN', createdAt: { gte: period.from, lte: period.to }, outletId: { not: null } },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    });
    const ids = grouped.map(g => g.outletId).filter((v): v is string => !!v);
    if (ids.length === 0) return [];
    const outs = await this.prisma.outlet.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const oMap = new Map(outs.map(o => [o.id, o]));
    return grouped.map(g => ({
      id: g.outletId!,
      name: oMap.get(g.outletId!)?.name || g.outletId!,
      revenue: Math.round(Math.abs(g._sum.amount || 0)),
      transactions: g._count._all || 0,
      growth: 0,
    }));
  }

  private async getTopStaff(merchantId: string, period: DashboardPeriod): Promise<StaffPerformance[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['staffId'],
      where: { merchantId, type: 'EARN', createdAt: { gte: period.from, lte: period.to }, staffId: { not: null } },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    });
    const ids = grouped.map(g => g.staffId).filter((v): v is string => !!v);
    if (ids.length === 0) return [];
    const staffRows = await this.prisma.staff.findMany({ where: { id: { in: ids } }, select: { id: true, login: true, email: true } });
    const sMap = new Map(staffRows.map(s => [s.id, s]));
    return grouped.map(g => {
      const s = sMap.get(g.staffId!);
      const revenue = Math.abs(g._sum.amount || 0);
      const tx = g._count._all || 0;
      return {
        id: g.staffId!,
        name: (s?.login || s?.email || g.staffId!) as string,
        transactions: tx,
        revenue: Math.round(revenue),
        averageCheck: tx > 0 ? Math.round(revenue / tx) : 0,
      } as StaffPerformance;
    });
  }

  private async getPeakHours(merchantId: string, period: DashboardPeriod): Promise<string[]> {
    const hourlyData = await this.getHourlyDistribution(merchantId, period);
    const sorted = hourlyData.sort((a, b) => b.transactions - a.transactions);
    const top3 = sorted.slice(0, 3);
    return top3.map(h => `${h.hour}:00-${h.hour + 1}:00`);
  }

  private async getDeviceUsage(merchantId: string, period: DashboardPeriod): Promise<DeviceStats[]> {
    const [devices, grouped] = await Promise.all([
      this.prisma.device.findMany({ where: { merchantId }, select: { id: true, type: true } }),
      this.prisma.transaction.groupBy({
        by: ['deviceId'],
        where: { merchantId, createdAt: { gte: period.from, lte: period.to }, deviceId: { not: null } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);
    const map = new Map<string, { transactions: number; lastActive: Date | null }>();
    for (const g of grouped) {
      if (!g.deviceId) continue;
      map.set(g.deviceId, { transactions: g._count._all || 0, lastActive: (g._max.createdAt as Date) || null });
    }
    const rows: DeviceStats[] = devices.map(d => ({
      deviceId: d.id,
      type: d.type as any,
      transactions: map.get(d.id)?.transactions || 0,
      lastActive: map.get(d.id)?.lastActive || null,
    }));
    rows.sort((a, b) => b.transactions - a.transactions);
    return rows;
  }
}
