import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { Response } from 'express';
import type { CampaignReward, CampaignRules, LegacyCampaignDto } from './dto';
import { toLegacyCampaignDto } from './dto';

interface ApplyTransactionData {
  amount: number;
  orderId: string;
  outletId?: string;
  productCategories?: string[];
  metadata?: any;
}

interface CampaignWithMembership {
  dto: LegacyCampaignDto;
  hasCustomerInSegment: boolean;
}

@Injectable()
export class LoyaltyPromotionService {
  constructor(private readonly prisma: PrismaService) {}

  async streamCampaignUsagesCsv(
    params: { merchantId: string; campaignId?: string; customerId?: string; from?: Date; to?: Date },
    res: Response,
    batch = 1000,
  ) {
    const where: any = { campaign: { merchantId: params.merchantId } };
    if (params.campaignId) where.campaignId = params.campaignId;
    if (params.customerId) where.customerId = params.customerId;
    if (params.from || params.to)
      where.usedAt = Object.assign(
        {},
        params.from ? { gte: params.from } : {},
        params.to ? { lte: params.to } : {},
      );

    res.write(['id', 'campaignId', 'campaignName', 'customerId', 'rewardType', 'rewardValue', 'usedAt'].join(';') + '\n');
    let before: Date | undefined;
    while (true) {
      const page = await this.prisma.campaignUsage.findMany({
        where: Object.assign({}, where, before ? { usedAt: Object.assign({}, where.usedAt || {}, { lt: before }) } : {}),
        include: { campaign: { select: { name: true } } },
        orderBy: { usedAt: 'desc' },
        take: batch,
      });
      if (!page.length) break;
      for (const usage of page) {
        const row = [
          usage.id,
          usage.campaignId,
          usage.campaign?.name || '',
          usage.customerId,
          usage.rewardType || '',
          usage.rewardValue ?? '',
          usage.usedAt.toISOString(),
        ]
          .map((value) => this.csvCell(String(value ?? '')))
          .join(';');
        res.write(row + '\n');
      }
      before = page[page.length - 1].usedAt;
      if (page.length < batch) break;
    }
  }

  async streamCampaignsCsv(merchantId: string, res: Response, status?: string, batch = 1000) {
    const where: any = { merchantId };
    if (status) where.status = status;
    res.write(
      [
        'id',
        'name',
        'status',
        'type',
        'startDate',
        'endDate',
        'budget',
        'maxUsagePerCustomer',
        'maxUsageTotal',
        'createdAt',
      ].join(';') + '\n',
    );
    let before: Date | undefined;
    while (true) {
      const page = await this.prisma.campaign.findMany({
        where: Object.assign({}, where, before ? { createdAt: { lt: before } } : {}),
        orderBy: { createdAt: 'desc' },
        take: batch,
      });
      if (!page.length) break;
      for (const entity of page) {
        const dto = toLegacyCampaignDto(entity as any);
        const row = [
          dto.id,
          dto.name,
          dto.status,
          dto.type,
          dto.startDate ? new Date(dto.startDate).toISOString() : '',
          dto.endDate ? new Date(dto.endDate).toISOString() : '',
          dto.budget ?? '',
          dto.maxUsagePerCustomer ?? '',
          dto.maxUsageTotal ?? '',
          dto.createdAt.toISOString(),
        ]
          .map((value) => this.csvCell(String(value ?? '')))
          .join(';');
        res.write(row + '\n');
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }
  }

  async applyCampaign(merchantId: string, customerId: string, transactionData: ApplyTransactionData) {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        merchantId,
        status: 'ACTIVE',
        OR: [{ startDate: null }, { startDate: { lte: new Date() } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: new Date() } }] }],
      },
      include: {
        segment: {
          include: {
            customers: { where: { customerId } },
          },
        },
      },
    });

    const candidates: CampaignWithMembership[] = campaigns.map((campaign) => ({
      dto: toLegacyCampaignDto(campaign as any),
      hasCustomerInSegment: Boolean(campaign.segment?.customers?.length),
    }));

    const applied: any[] = [];

    for (const campaign of candidates) {
      if (!(await this.isCustomerEligible(campaign.dto, customerId, transactionData, campaign.hasCustomerInSegment))) {
        continue;
      }
      if (!this.checkCampaignRules(campaign.dto, transactionData)) {
        continue;
      }
      if (!(await this.checkUsageLimits(campaign.dto.id, customerId, campaign.dto))) {
        continue;
      }
      const reward = this.calculateReward(campaign.dto, transactionData.amount);
      const usage = await this.applyReward(campaign.dto, customerId, reward, transactionData.orderId);
      applied.push({
        campaignId: campaign.dto.id,
        campaignName: campaign.dto.name,
        rewardType: campaign.dto.reward.type,
        rewardValue: reward.value,
        description: reward.description,
        usage,
      });
    }

    return applied;
  }

  async sendCampaignNotifications(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        segment: {
          include: {
            customers: true,
          },
        },
      },
    });

    if (!campaign) return;
    const dto = toLegacyCampaignDto(campaign as any);
    if (!campaign.segment) return;

    const channels = dto.notificationChannels ?? [];
    for (const customer of campaign.segment.customers) {
      for (const channel of channels) {
        await this.prisma.eventOutbox.create({
          data: {
            merchantId: dto.merchantId,
            eventType: `campaign.notification.${channel.toLowerCase()}`,
            payload: {
              campaignId,
              customerId: customer.customerId,
              channel,
              message: this.formatCampaignMessage(dto),
            },
          },
        });
      }
    }
  }

  private csvCell(value: string) {
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private async isCustomerEligible(
    campaign: LegacyCampaignDto,
    customerId: string,
    transactionData: ApplyTransactionData,
    hasCustomerInSegment: boolean,
  ): Promise<boolean> {
    if (campaign.targetSegmentId) {
      if (!hasCustomerInSegment) return false;
    }

    const rules = campaign.rules ?? {};
    if (rules.customerStatus && rules.customerStatus.length > 0) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          _count: { select: { transactions: true } },
        },
      });
      if (!customer) return false;
      const status = this.getCustomerStatus(customer._count.transactions);
      if (!rules.customerStatus.includes(status)) return false;
    }

    if (rules.minTransactionCount) {
      const transactionCount = await this.prisma.transaction.count({
        where: {
          customerId,
          merchantId: campaign.merchantId,
        },
      });
      if (transactionCount < rules.minTransactionCount) return false;
    }

    if (campaign.type === 'BIRTHDAY') {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer?.birthday) return false;
      const today = new Date();
      const birthDate = new Date(customer.birthday);
      const dayDiff = this.getDaysToBirthday(birthDate, today);
      const range = rules.birthdayRange || 7;
      if (Math.abs(dayDiff) > range) return false;
    }

    return true;
  }

  private checkCampaignRules(campaign: LegacyCampaignDto, transactionData: ApplyTransactionData) {
    const rules: CampaignRules = campaign.rules ?? {};
    if (rules.minPurchaseAmount && transactionData.amount < rules.minPurchaseAmount) {
      return false;
    }
    if (rules.maxPurchaseAmount && transactionData.amount > rules.maxPurchaseAmount) {
      return false;
    }
    if (rules.outlets && rules.outlets.length > 0) {
      if (!transactionData.outletId || !rules.outlets.includes(transactionData.outletId)) {
        return false;
      }
    }
    if (rules.dayOfWeek && rules.dayOfWeek.length > 0) {
      const today = new Date().getDay() || 7;
      if (!rules.dayOfWeek.includes(today)) {
        return false;
      }
    }
    if (rules.timeFrom && rules.timeTo) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
      if (currentTime < rules.timeFrom || currentTime > rules.timeTo) {
        return false;
      }
    }
    if (rules.productCategories && rules.productCategories.length > 0) {
      if (
        !transactionData.productCategories ||
        !transactionData.productCategories.some((category) => rules.productCategories?.includes(category))
      ) {
        return false;
      }
    }
    return true;
  }

  private async checkUsageLimits(campaignId: string, customerId: string, campaign: LegacyCampaignDto) {
    if (campaign.maxUsageTotal) {
      const totalUsage = await this.prisma.campaignUsage.count({ where: { campaignId } });
      if (totalUsage >= campaign.maxUsageTotal) return false;
    }
    if (campaign.maxUsagePerCustomer) {
      const customerUsage = await this.prisma.campaignUsage.count({ where: { campaignId, customerId } });
      if (customerUsage >= campaign.maxUsagePerCustomer) return false;
    }
    if (campaign.budget) {
      const spent = await this.prisma.campaignUsage.aggregate({
        where: { campaignId },
        _sum: { rewardValue: true },
      });
      if ((spent._sum.rewardValue || 0) >= campaign.budget) return false;
    }
    return true;
  }

  private calculateReward(campaign: LegacyCampaignDto, amount: number) {
    const reward = campaign.reward as CampaignReward;
    let value = 0;
    let description = '';

    switch (reward.type) {
      case 'POINTS':
        value = reward.value;
        if (reward.multiplier) {
          value = Math.round((amount * reward.multiplier) / 100);
        }
        description = `+${value} баллов`;
        break;
      case 'PERCENT':
        value = Math.round((amount * reward.value) / 100);
        if (reward.maxValue && value > reward.maxValue) {
          value = reward.maxValue;
        }
        description = `${reward.value}% кэшбэк (${value} баллов)`;
        break;
      case 'FIXED':
        value = reward.value;
        description = `Скидка ${value} руб.`;
        break;
      case 'PRODUCT':
        value = 0;
        description = reward.description || 'Подарок';
        break;
    }

    return { value, description, type: reward.type };
  }

  private async applyReward(campaign: LegacyCampaignDto, customerId: string, reward: any, orderId: string) {
    const usage = await this.prisma.campaignUsage.create({
      data: {
        campaignId: campaign.id,
        customerId,
        rewardType: reward.type,
        rewardValue: reward.value,
      },
    });

    if (reward.type === 'POINTS' || reward.type === 'PERCENT') {
      const wallet = await this.prisma.wallet.findFirst({
        where: { customerId, merchantId: campaign.merchantId },
      });
      if (wallet) {
        await this.prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: reward.value },
          },
        });
        await this.prisma.transaction.create({
          data: {
            customerId,
            merchantId: campaign.merchantId,
            type: 'CAMPAIGN',
            amount: reward.value,
            orderId,
          },
        });
      }
    }

    return usage;
  }

  private formatCampaignMessage(campaign: LegacyCampaignDto) {
    const reward = campaign.reward as CampaignReward;
    let message = campaign.name;
    if (campaign.description) {
      message += `\n${campaign.description}`;
    }
    switch (reward.type) {
      case 'POINTS':
        message += `\n🎁 Получите ${reward.value} баллов!`;
        break;
      case 'PERCENT':
        message += `\n💰 Кэшбэк ${reward.value}%!`;
        break;
      case 'FIXED':
        message += `\n🏷️ Скидка ${reward.value} руб.!`;
        break;
      case 'PRODUCT':
        message += `\n🎁 ${reward.description || 'Подарок при покупке'}!`;
        break;
    }
    if (campaign.endDate) {
      const endDate = new Date(campaign.endDate);
      message += `\n⏰ До ${endDate.toLocaleDateString('ru-RU')}`;
    }
    return message;
  }

  private getCustomerStatus(transactionCount: number): 'NEW' | 'REGULAR' | 'VIP' {
    if (transactionCount === 0) return 'NEW';
    if (transactionCount < 10) return 'REGULAR';
    return 'VIP';
  }

  private getDaysToBirthday(birthDate: Date, today: Date) {
    const currentYear = today.getFullYear();
    const birthdayThisYear = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());
    if (birthdayThisYear < today) {
      birthdayThisYear.setFullYear(currentYear + 1);
    }
    const diffTime = birthdayThisYear.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}
