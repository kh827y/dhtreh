import { Injectable } from '@nestjs/common';
import { PromotionStatus } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CampaignMetrics,
  DashboardPeriod,
} from '../analytics.service';

@Injectable()
export class AnalyticsCampaignsService {
  constructor(private readonly prisma: PrismaService) {}

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
      _sum: { pointsIssued: true, totalSpent: true },
    });

    const totalRewardsIssued = participantStats.reduce(
      (sum, row) => sum + (row._sum.pointsIssued ?? 0),
      0,
    );

    const campaignRevenue = participantStats.reduce(
      (sum, row) => sum + Math.max(0, Number(row._sum.totalSpent ?? 0)),
      0,
    );

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
        ? ((campaignRevenue - totalRewardsIssued) / totalRewardsIssued) * 100
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

  private async getTopCampaigns(
    merchantId: string,
    period: DashboardPeriod,
    limit: number,
  ): Promise<CampaignMetrics['topCampaigns']> {
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
      select: { id: true, name: true, rewardType: true, rewardMetadata: true },
    });
    const map = new Map(promotions.map((promo) => [promo.id, promo]));

    return aggregates.map((row) => {
      const promotion = map.get(row.promotionId);
      const rewardMeta =
        promotion?.rewardMetadata &&
        typeof promotion.rewardMetadata === 'object'
          ? (promotion.rewardMetadata as Record<string, any>)
          : {};
      const kind = String(rewardMeta.kind || promotion?.rewardType || '');
      return {
        id: row.promotionId,
        name: promotion?.name ?? row.promotionId,
        type: kind || 'LOYALTY_PROMOTION',
        usageCount: row._count._all,
        totalRewards: row._sum.pointsIssued ?? 0,
        roi: 0,
      };
    });
  }
}
