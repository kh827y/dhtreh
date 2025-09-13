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
  lastActive: Date;
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
    const customers = await this.prisma.$queryRaw<TopCustomer[]>`
      SELECT 
        c.id,
        c.name,
        c.phone,
        SUM(ABS(t.amount)) as "totalSpent",
        COUNT(t.id) as visits,
        MAX(t.created_at) as "lastVisit",
        w.balance as "loyaltyPoints"
      FROM customer c
      JOIN wallet w ON w.customer_id = c.id
      LEFT JOIN transaction t ON t.customer_id = c.id AND t.merchant_id = ${merchantId}
      WHERE w.merchant_id = ${merchantId}
      GROUP BY c.id, c.name, c.phone, w.balance
      ORDER BY "totalSpent" DESC
      LIMIT ${limit}
    `;

    return customers;
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
    const outlets = await this.prisma.$queryRaw<OutletPerformance[]>`
      SELECT 
        o.id,
        o.name,
        SUM(ABS(t.amount)) as revenue,
        COUNT(t.id) as transactions,
        0 as growth
      FROM outlet o
      LEFT JOIN transaction t ON t.outlet_id = o.id 
        AND t.created_at >= ${period.from}
        AND t.created_at <= ${period.to}
        AND t.type = 'EARN'
      WHERE o.merchant_id = ${merchantId}
      GROUP BY o.id, o.name
      ORDER BY revenue DESC
      LIMIT 5
    `;

    return outlets;
  }

  private async getTopStaff(merchantId: string, period: DashboardPeriod): Promise<StaffPerformance[]> {
    const staff = await this.prisma.$queryRaw<StaffPerformance[]>`
      SELECT 
        s.id,
        COALESCE(s.login, s.email, '') as name,
        COUNT(t.id) as transactions,
        SUM(ABS(t.amount)) as revenue,
        AVG(ABS(t.amount)) as "averageCheck"
      FROM staff s
      LEFT JOIN transaction t ON t.staff_id = s.id
        AND t.created_at >= ${period.from}
        AND t.created_at <= ${period.to}
        AND t.type = 'EARN'
      WHERE s.merchant_id = ${merchantId}
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
      LIMIT 5
    `;

    return staff;
  }

  private async getPeakHours(merchantId: string, period: DashboardPeriod): Promise<string[]> {
    const hourlyData = await this.getHourlyDistribution(merchantId, period);
    const sorted = hourlyData.sort((a, b) => b.transactions - a.transactions);
    const top3 = sorted.slice(0, 3);
    return top3.map(h => `${h.hour}:00-${h.hour + 1}:00`);
  }

  private async getDeviceUsage(merchantId: string, period: DashboardPeriod): Promise<DeviceStats[]> {
    const devices = await this.prisma.$queryRaw<DeviceStats[]>`
      SELECT 
        d.id as "deviceId",
        d.type,
        COUNT(t.id) as transactions,
        MAX(t.created_at) as "lastActive"
      FROM device d
      LEFT JOIN transaction t ON t.device_id = d.id
        AND t.created_at >= ${period.from}
        AND t.created_at <= ${period.to}
      WHERE d.merchant_id = ${merchantId}
      GROUP BY d.id, d.type
      ORDER BY transactions DESC
    `;

    return devices;
  }
}
