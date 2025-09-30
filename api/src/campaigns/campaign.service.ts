import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { LoyaltyPromotionService } from '../loyalty-promotion/loyalty-promotion.service';
import type { CreateCampaignDto } from '../loyalty-promotion/dto';

@Injectable()
export class CampaignService {
  constructor(
    private prisma: PrismaService,
    private loyaltyPromotionService: LoyaltyPromotionService,
  ) {}

  /**
   * Создать новую кампанию
   */
  async createCampaign(dto: CreateCampaignDto) {
    // Проверяем лимиты плана подписки
    const subscription = await this.prisma.subscription.findUnique({
      where: { merchantId: dto.merchantId },
      include: { plan: true },
    });

    if (!subscription || subscription.status !== 'active') {
      throw new BadRequestException('Требуется активная подписка для создания кампаний');
    }

    const plan = subscription.plan as any;
    if (!plan.features?.campaigns) {
      throw new BadRequestException('Ваш план не поддерживает маркетинговые кампании');
    }

    // Создаем кампанию
    const campaign = await this.prisma.campaign.create({
      data: {
        merchantId: dto.merchantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        status: dto.status || 'DRAFT',
        startDate: dto.startDate,
        endDate: dto.endDate,
        targetSegmentId: dto.targetSegmentId,
        content: dto.rules as any,
        reward: dto.reward as any,
        budget: dto.budget,
        maxUsagePerCustomer: dto.maxUsagePerCustomer,
        maxUsageTotal: dto.maxUsageTotal,
        notificationChannels: dto.notificationChannels,
      },
    });

    // Если кампания активна, запускаем уведомления
    if (campaign.status === 'ACTIVE' && dto.targetSegmentId) {
      await this.loyaltyPromotionService.sendCampaignNotifications(campaign.id);
    }

    return campaign;
  }

  /**
   * Потоковый экспорт использований кампаний (batch-пагинация)
   */
  async streamCampaignUsagesCsv(
    params: { merchantId: string; campaignId?: string; customerId?: string; from?: Date; to?: Date },
    res: Response,
    batch = 1000,
  ) {
    await this.loyaltyPromotionService.streamCampaignUsagesCsv(params, res, batch);
  }

  /**
   * Потоковый экспорт кампаний мерчанта
   */
  async streamCampaignsCsv(merchantId: string, res: Response, status?: string, batch = 1000) {
    await this.loyaltyPromotionService.streamCampaignsCsv(merchantId, res, status, batch);
  }

  /**
   * Получить список кампаний мерчанта
   */
  async getCampaigns(merchantId: string, status?: string) {
    const where: any = { merchantId };
    if (status) {
      where.status = status;
    }

    return this.prisma.campaign.findMany({
      where,
      include: {
        segment: true,
        _count: {
          select: {
            usages: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Получить детали кампании
   */
  async getCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        segment: {
          include: {
            _count: {
              select: {
                customers: true,
              },
            },
          },
        },
        usages: {
          take: 10,
          orderBy: { usedAt: 'desc' },
          include: {
            customer: true,
          },
        },
        _count: {
          select: {
            usages: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Кампания не найдена');
    }

    // Добавляем статистику
    const stats = await this.getCampaignStats(campaignId);
    
    return {
      ...campaign,
      stats,
    };
  }

  /**
   * Обновить кампанию
   */
  async updateCampaign(campaignId: string, dto: Partial<CreateCampaignDto>) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException('Кампания не найдена');
    }

    if (campaign.status === 'COMPLETED') {
      throw new BadRequestException('Нельзя изменить завершенную кампанию');
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        startDate: dto.startDate,
        endDate: dto.endDate,
        targetSegmentId: dto.targetSegmentId,
        content: dto.rules as any,
        reward: (dto.reward as any),
        budget: dto.budget,
        maxUsagePerCustomer: dto.maxUsagePerCustomer,
        maxUsageTotal: dto.maxUsageTotal,
        notificationChannels: dto.notificationChannels,
      },
    });

    // Если кампания активирована, отправляем уведомления
    if (dto.status === 'ACTIVE' && campaign.status !== 'ACTIVE' && updated.targetSegmentId) {
      await this.loyaltyPromotionService.sendCampaignNotifications(campaignId);
    }

    return updated;
  }

  /**
   * Применить кампанию к транзакции
   */
  async applyCampaign(
    merchantId: string,
    customerId: string,
    transactionData: {
      amount: number;
      orderId: string;
      outletId?: string;
      productCategories?: string[];
      metadata?: any;
    },
  ) {
    return this.loyaltyPromotionService.applyCampaign(merchantId, customerId, transactionData);
  }

  /**
   * Получение статистики кампании
   */
  private async getCampaignStats(campaignId: string) {
    const [
      totalUsage,
      uniqueCustomers,
      totalReward,
      avgReward,
    ] = await Promise.all([
      this.prisma.campaignUsage.count({
        where: { campaignId },
      }),
      this.prisma.campaignUsage.groupBy({
        by: ['customerId'],
        where: { campaignId },
      }),
      this.prisma.campaignUsage.aggregate({
        where: { campaignId },
        _sum: { rewardValue: true },
      }),
      this.prisma.campaignUsage.aggregate({
        where: { campaignId },
        _avg: { rewardValue: true },
      }),
    ]);

    return {
      totalUsage,
      uniqueCustomers: uniqueCustomers.length,
      totalReward: totalReward._sum.rewardValue || 0,
      avgReward: Math.round(avgReward._avg.rewardValue || 0),
      conversionRate: 0, // Можно рассчитать если знаем общее количество целевых клиентов
    };
  }

}
