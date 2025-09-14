import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

export interface CreateCampaignDto {
  merchantId: string;
  name: string;
  description?: string;
  type: 'BONUS' | 'DISCOUNT' | 'CASHBACK' | 'BIRTHDAY' | 'REFERRAL' | 'FIRST_PURCHASE';
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  startDate?: Date;
  endDate?: Date;
  targetSegmentId?: string;
  rules: CampaignRules;
  reward: CampaignReward;
  budget?: number;
  maxUsagePerCustomer?: number;
  maxUsageTotal?: number;
  notificationChannels?: ('SMS' | 'TELEGRAM' | 'PUSH')[];
  metadata?: any;
}

export interface CampaignRules {
  // Условия активации
  minPurchaseAmount?: number; // Минимальная сумма покупки
  maxPurchaseAmount?: number; // Максимальная сумма покупки
  productCategories?: string[]; // Категории товаров
  dayOfWeek?: number[]; // Дни недели (1-7)
  timeFrom?: string; // Время начала (HH:MM)
  timeTo?: string; // Время окончания (HH:MM)
  outlets?: string[]; // Конкретные точки продаж
  customerStatus?: ('NEW' | 'REGULAR' | 'VIP')[]; // Статус клиента
  minTransactionCount?: number; // Минимум транзакций клиента
  birthdayRange?: number; // За сколько дней до/после ДР
}

export interface CampaignReward {
  type: 'POINTS' | 'PERCENT' | 'FIXED' | 'PRODUCT';
  value: number; // Значение награды
  maxValue?: number; // Максимальная сумма награды
  multiplier?: number; // Множитель баллов (например, x2, x3)
  productId?: string; // ID товара для подарка
  description?: string; // Описание награды
}

@Injectable()
export class CampaignService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
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
      await this.sendCampaignNotifications(campaign.id);
    }

    return campaign;
  }

  /**
   * Потоковый экспорт использований кампаний (batch-пагинация)
   */
  async streamCampaignUsagesCsv(params: { merchantId: string; campaignId?: string; customerId?: string; from?: Date; to?: Date }, res: Response, batch = 1000) {
    const where: any = { campaign: { merchantId: params.merchantId } };
    if (params.campaignId) where.campaignId = params.campaignId;
    if (params.customerId) where.customerId = params.customerId;
    if (params.from || params.to) where.usedAt = Object.assign({}, params.from ? { gte: params.from } : {}, params.to ? { lte: params.to } : {});

    res.write(['id','campaignId','campaignName','customerId','rewardType','rewardValue','usedAt'].join(';') + '\n');
    let before: Date | undefined = undefined;
    while (true) {
      const page = await this.prisma.campaignUsage.findMany({
        where: Object.assign({}, where, before ? { usedAt: Object.assign({}, (where.usedAt||{}), { lt: before }) } : {}),
        include: { campaign: { select: { name: true } } },
        orderBy: { usedAt: 'desc' },
        take: batch,
      });
      if (!page.length) break;
      for (const u of page) {
        const row = [u.id, u.campaignId, u.campaign?.name || '', u.customerId, u.rewardType||'', u.rewardValue??'', u.usedAt.toISOString()]
          .map(v => this.csvCell(String(v ?? ''))).join(';');
        res.write(row + '\n');
      }
      before = page[page.length - 1].usedAt;
      if (page.length < batch) break;
    }
  }

  /**
   * Потоковый экспорт кампаний мерчанта
   */
  async streamCampaignsCsv(merchantId: string, res: Response, status?: string, batch = 1000) {
    const where: any = { merchantId };
    if (status) where.status = status;
    res.write(['id','name','status','type','startDate','endDate','budget','maxUsagePerCustomer','maxUsageTotal','createdAt'].join(';') + '\n');
    let before: Date | undefined = undefined;
    while (true) {
      const page = await this.prisma.campaign.findMany({
        where: Object.assign({}, where, before ? { createdAt: { lt: before } } : {}),
        orderBy: { createdAt: 'desc' },
        take: batch,
      });
      if (!page.length) break;
      for (const c of page) {
        const row = [c.id, c.name, c.status, c.type, c.startDate?c.startDate.toISOString():'', c.endDate?c.endDate.toISOString():'', c.budget??'', c.maxUsagePerCustomer??'', c.maxUsageTotal??'', c.createdAt.toISOString()]
          .map(v => this.csvCell(String(v ?? ''))).join(';');
        res.write(row + '\n');
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }
  }

  private csvCell(s: string) {
    const esc = s.replace(/"/g, '""');
    return `"${esc}"`;
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
      await this.sendCampaignNotifications(campaignId);
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
    }
  ) {
    // Находим активные кампании мерчанта
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        merchantId,
        status: 'ACTIVE',
        OR: [
          { startDate: null },
          { startDate: { lte: new Date() } },
        ],
        AND: [
          { OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
        ],
      },
      include: {
        segment: {
          include: {
            customers: {
              where: { customerId },
            },
          },
        },
      },
    });

    const appliedCampaigns: any[] = [];

    for (const campaign of campaigns) {
      // Проверяем, подходит ли клиент под кампанию
      if (!(await this.isCustomerEligible(campaign, customerId, transactionData))) {
        continue;
      }

      // Проверяем правила кампании
      if (!this.checkCampaignRules(campaign, transactionData)) {
        continue;
      }

      // Проверяем лимиты использования
      if (!(await this.checkUsageLimits(campaign.id, customerId))) {
        continue;
      }

      // Рассчитываем награду
      const reward = this.calculateReward(campaign, transactionData.amount);

      // Применяем награду
      const usage = await this.applyReward(
        campaign.id,
        customerId,
        reward,
        transactionData.orderId
      );

      appliedCampaigns.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        rewardType: (campaign.reward as any)?.type,
        rewardValue: reward.value,
        description: reward.description,
        usage,
      });
    }

    return appliedCampaigns;
  }

  /**
   * Проверка соответствия клиента кампании
   */
  private async isCustomerEligible(
    campaign: any,
    customerId: string,
    transactionData: any
  ): Promise<boolean> {
    // Если указан сегмент, проверяем принадлежность
    if (campaign.targetSegmentId && campaign.segment) {
      const isInSegment = campaign.segment.customers.length > 0;
      if (!isInSegment) return false;
    }

    // Проверяем статус клиента
    const rules = campaign.rules as CampaignRules;
    if (rules.customerStatus && rules.customerStatus.length > 0) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          _count: {
            select: { transactions: true },
          },
        },
      });

      if (!customer) return false;

      const status = this.getCustomerStatus(customer._count.transactions);
      if (!rules.customerStatus.includes(status)) return false;
    }

    // Проверяем минимальное количество транзакций
    if (rules.minTransactionCount) {
      const transactionCount = await this.prisma.transaction.count({
        where: {
          customerId,
          merchantId: campaign.merchantId,
        },
      });

      if (transactionCount < rules.minTransactionCount) return false;
    }

    // Проверка для кампаний на день рождения
    if (campaign.type === 'BIRTHDAY') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer || !customer.birthday) return false;

      const today = new Date();
      const birthDate = new Date(customer.birthday);
      const dayDiff = this.getDaysToBirthday(birthDate, today);
      const range = rules.birthdayRange || 7;

      if (Math.abs(dayDiff) > range) return false;
    }

    return true;
  }

  /**
   * Проверка правил кампании
   */
  private checkCampaignRules(campaign: any, transactionData: any): boolean {
    const rules = campaign.rules as CampaignRules;

    // Проверка суммы покупки
    if (rules.minPurchaseAmount && transactionData.amount < rules.minPurchaseAmount) {
      return false;
    }
    if (rules.maxPurchaseAmount && transactionData.amount > rules.maxPurchaseAmount) {
      return false;
    }

    // Проверка точки продаж
    if (rules.outlets && rules.outlets.length > 0) {
      if (!transactionData.outletId || !rules.outlets.includes(transactionData.outletId)) {
        return false;
      }
    }

    // Проверка дня недели
    if (rules.dayOfWeek && rules.dayOfWeek.length > 0) {
      const today = new Date().getDay() || 7; // 1-7
      if (!rules.dayOfWeek.includes(today)) {
        return false;
      }
    }

    // Проверка времени
    if (rules.timeFrom && rules.timeTo) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (currentTime < rules.timeFrom || currentTime > rules.timeTo) {
        return false;
      }
    }

    // Проверка категорий товаров
    if (rules.productCategories && rules.productCategories.length > 0) {
      if (!transactionData.productCategories ||
          !transactionData.productCategories.some(cat => (rules.productCategories || []).includes(cat))) {
        return false;
      }
    }

    return true;
  }

  /**
   * Проверка лимитов использования
   */
  private async checkUsageLimits(campaignId: string, customerId: string): Promise<boolean> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) return false;

    // Проверка общего лимита
    if (campaign.maxUsageTotal) {
      const totalUsage = await this.prisma.campaignUsage.count({
        where: { campaignId },
      });
      if (totalUsage >= campaign.maxUsageTotal) return false;
    }

    // Проверка лимита на клиента
    if (campaign.maxUsagePerCustomer) {
      const customerUsage = await this.prisma.campaignUsage.count({
        where: { campaignId, customerId },
      });
      if (customerUsage >= campaign.maxUsagePerCustomer) return false;
    }

    // Проверка бюджета
    if (campaign.budget) {
      const spent = await this.prisma.campaignUsage.aggregate({
        where: { campaignId },
        _sum: { rewardValue: true },
      });
      if ((spent._sum.rewardValue || 0) >= campaign.budget) return false;
    }

    return true;
  }

  /**
   * Расчет награды
   */
  private calculateReward(campaign: any, amount: number) {
    const reward = campaign.reward as CampaignReward;
    let value = 0;
    let description = '';

    switch (reward.type) {
      case 'POINTS':
        // Фиксированные баллы
        value = reward.value;
        if (reward.multiplier) {
          value = Math.round(amount * reward.multiplier / 100);
        }
        description = `+${value} баллов`;
        break;

      case 'PERCENT':
        // Процент от суммы
        value = Math.round(amount * reward.value / 100);
        if (reward.maxValue && value > reward.maxValue) {
          value = reward.maxValue;
        }
        description = `${reward.value}% кэшбэк (${value} баллов)`;
        break;

      case 'FIXED':
        // Фиксированная скидка
        value = reward.value;
        description = `Скидка ${value} руб.`;
        break;

      case 'PRODUCT':
        // Подарок
        value = 0;
        description = reward.description || 'Подарок';
        break;
    }

    return { value, description, type: reward.type };
  }

  /**
   * Применение награды
   */
  private async applyReward(
    campaignId: string,
    customerId: string,
    reward: any,
    orderId: string
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) throw new Error('Campaign not found');

    // Записываем использование
    const usage = await this.prisma.campaignUsage.create({
      data: {
        campaignId,
        customerId,
        rewardType: reward.type,
        rewardValue: reward.value,
      },
    });

    // Если это баллы, начисляем их
    if (reward.type === 'POINTS' || reward.type === 'PERCENT') {
      const wallet = await this.prisma.wallet.findFirst({
        where: {
          customerId,
          merchantId: campaign.merchantId,
        },
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

  /**
   * Отправка уведомлений о кампании
   */
  private async sendCampaignNotifications(campaignId: string) {
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

    if (!campaign || !campaign.segment) return;

    const channels = campaign.notificationChannels || [];
    
    for (const customer of campaign.segment.customers) {
      // Создаем событие в outbox для каждого канала
      for (const channel of channels) {
        await this.prisma.eventOutbox.create({
          data: {
            merchantId: campaign.merchantId,
            eventType: `campaign.notification.${channel.toLowerCase()}`,
            payload: {
              campaignId,
              customerId: customer.customerId,
              channel,
              message: this.formatCampaignMessage(campaign),
            },
          },
        });
      }
    }
  }

  /**
   * Форматирование сообщения кампании
   */
  private formatCampaignMessage(campaign: any): string {
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

  /**
   * Определение статуса клиента
   */
  private getCustomerStatus(transactionCount: number): 'NEW' | 'REGULAR' | 'VIP' {
    if (transactionCount === 0) return 'NEW';
    if (transactionCount < 10) return 'REGULAR';
    return 'VIP';
  }

  /**
   * Расчет дней до дня рождения
   */
  private getDaysToBirthday(birthDate: Date, today: Date): number {
    const currentYear = today.getFullYear();
    const birthdayThisYear = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());
    
    if (birthdayThisYear < today) {
      birthdayThisYear.setFullYear(currentYear + 1);
    }
    
    const diffTime = birthdayThisYear.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}
