import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
// import { Cron, CronExpression } from '@nestjs/schedule';

export interface CreateSubscriptionDto {
  merchantId: string;
  planId: string;
  trialDays?: number;
  metadata?: any;
}

export interface UpdateSubscriptionDto {
  planId?: string;
  cancelAtPeriodEnd?: boolean;
  metadata?: any;
}

@Injectable()
export class SubscriptionService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Получить текущую подписку мерчанта
   */
  async getSubscription(merchantId: string) {
    return (this.prisma as any).subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });
  }

  /**
   * Создание новой подписки для мерчанта
   */
  async createSubscription(dto: CreateSubscriptionDto) {
    // Проверяем, нет ли уже активной подписки
    const prismaAny = this.prisma as any;
    const existingSubscription = await prismaAny.subscription.findUnique({
      where: { merchantId: dto.merchantId },
    });

    if (existingSubscription) {
      // В тестах ожидаем 400 при повторном создании подписки независимо от статуса
      throw new BadRequestException('У мерчанта уже есть активная подписка');
    }

    // Получаем план
    const plan = await prismaAny.plan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan || !plan.isActive) {
      throw new NotFoundException('План не найден или неактивен');
    }

    // Рассчитываем даты
    const now = new Date();
    const trialEnd = dto.trialDays 
      ? new Date(now.getTime() + dto.trialDays * 24 * 60 * 60 * 1000)
      : null;
    
    const currentPeriodStart = now;
    const currentPeriodEnd = this.calculatePeriodEnd(currentPeriodStart, plan.interval);

    // Создаем подписку
    let subscription: any;
    try {
      subscription = await prismaAny.subscription.create({
        data: {
          merchantId: dto.merchantId,
          planId: dto.planId,
          status: trialEnd ? 'trialing' : 'active',
          currentPeriodStart,
          currentPeriodEnd,
          trialEnd,
          metadata: dto.metadata,
        },
        include: {
          plan: true,
        },
      });
    } catch (e: any) {
      // Prisma P2002 — уникальная подписка на merchantId уже существует
      if (e?.code === 'P2002') {
        throw new BadRequestException('У мерчанта уже есть активная подписка');
      }
      throw e;
    }

    // Создаем событие в outbox
    await (prismaAny.eventOutbox ?? this.prisma.eventOutbox).create({
      data: {
        merchantId: dto.merchantId,
        eventType: 'subscription.created',
        payload: {
          subscriptionId: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          trialEnd: subscription.trialEnd,
        },
      },
    });

    return subscription;
  }

  /**
   * Обновление подписки (смена плана)
   */
  async updateSubscription(merchantId: string, dto: UpdateSubscriptionDto) {
    const prismaAny = this.prisma as any;
    const subscription = await prismaAny.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    const updateData: any = {};

    // Если меняется план
    if (dto.planId && dto.planId !== subscription.planId) {
      const newPlan = await prismaAny.plan.findUnique({
        where: { id: dto.planId },
      });

      if (!newPlan || !newPlan.isActive) {
        throw new NotFoundException('План не найден или неактивен');
      }

      updateData.planId = dto.planId;

      // Проверяем лимиты нового плана
      await this.validatePlanLimits(merchantId, newPlan);
    }

    // Если отменяется подписка
    if (dto.cancelAtPeriodEnd !== undefined) {
      if (dto.cancelAtPeriodEnd) {
        updateData.cancelAt = subscription.currentPeriodEnd;
      } else {
        updateData.cancelAt = null;
        updateData.canceledAt = null;
      }
    }

    if (dto.metadata) {
      updateData.metadata = dto.metadata;
    }

    const updated = await prismaAny.subscription.update({
      where: { id: subscription.id },
      data: updateData,
      include: { plan: true },
    });

    // Создаем событие
    await this.prisma.eventOutbox.create({
      data: {
        merchantId,
        eventType: 'subscription.updated',
        payload: {
          subscriptionId: updated.id,
          changes: updateData,
        },
      },
    });

    return updated;
  }

  /**
   * Отмена подписки
   */
  async cancelSubscription(merchantId: string, immediately = false) {
    const prismaAny = this.prisma as any;
    const subscription = await prismaAny.subscription.findUnique({
      where: { merchantId },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    if (subscription.status === 'canceled' || subscription.cancelAt) {
      throw new BadRequestException('Подписка уже отменена');
    }

    const updateData: any = {
      canceledAt: new Date(),
    };

    if (immediately) {
      updateData.status = 'canceled';
      updateData.cancelAt = new Date();
    } else {
      updateData.cancelAt = subscription.currentPeriodEnd;
    }

    const canceled = await prismaAny.subscription.update({
      where: { id: subscription.id },
      data: updateData,
    });

    // Создаем событие
    await this.prisma.eventOutbox.create({
      data: {
        merchantId,
        eventType: 'subscription.canceled',
        payload: {
          subscriptionId: canceled.id,
          immediately,
          cancelAt: canceled.cancelAt,
        },
      },
    });

    return canceled;
  }

  /**
   * Проверка лимитов плана
   */
  async validatePlanLimits(merchantId: string, plan: any): Promise<boolean> {
    const checks = [];

    // Проверка лимита транзакций
    if (plan.maxTransactions) {
      const transactionCount = await this.prisma.transaction.count({
        where: {
          merchantId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // За последние 30 дней
          },
        },
      });

      if (transactionCount > plan.maxTransactions) {
        throw new BadRequestException(
          `Превышен лимит транзакций плана (${transactionCount}/${plan.maxTransactions})`
        );
      }
    }

    // Проверка лимита клиентов
    if (plan.maxCustomers) {
      // Подсчет уникальных клиентов через группировку
      const customers = await this.prisma.wallet.groupBy({
        by: ['customerId'],
        where: { merchantId },
      });
      const customerCount = customers.length;

      if (customerCount > plan.maxCustomers) {
        throw new BadRequestException(
          `Превышен лимит клиентов плана (${customerCount}/${plan.maxCustomers})`
        );
      }
    }

    // Проверка лимита точек продаж
    if (plan.maxOutlets) {
      const outletCount = await this.prisma.outlet.count({
        where: { merchantId },
      });

      if (outletCount > plan.maxOutlets) {
        throw new BadRequestException(
          `Превышен лимит точек продаж плана (${outletCount}/${plan.maxOutlets})`
        );
      }
    }

    return true;
  }

  /**
   * Проверка доступности функции для текущего плана
   */
  async checkFeatureAccess(merchantId: string, feature: string): Promise<boolean> {
    const prismaAny = this.prisma as any;
    const subscription = await prismaAny.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trialing')) {
      return false;
    }

    const plan = subscription.plan as any;
    const features = (plan as any)?.features as any;

    switch (feature) {
      case 'webhooks':
        return (plan.webhooksEnabled ?? (features?.webhooks === true)) === true;
      case 'custom_branding':
        return (plan.customBranding ?? (features?.customBranding === true)) === true;
      case 'priority_support':
        return (plan.prioritySupport ?? (features?.prioritySupport === true)) === true;
      case 'api_access':
        return (plan.apiAccess ?? (features?.apiAccess === true)) === true;
      default:
        return features?.[feature] === true;
    }
  }

  /**
   * Обработка платежа
   */
  async processPayment(subscriptionId: string, paymentData: any) {
    const prismaAny = this.prisma as any;
    const subscription = await prismaAny.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    const payment = await prismaAny.payment.create({
      data: {
        subscriptionId,
        amount: (subscription.plan as any).price,
        currency: (subscription.plan as any).currency,
        status: paymentData.status || 'pending',
        paymentMethod: paymentData.method,
        invoiceId: paymentData.invoiceId,
        receiptUrl: paymentData.receiptUrl,
        paidAt: paymentData.status === 'succeeded' ? new Date() : null,
      },
    });

    // Если платеж успешный, обновляем период подписки
    if (paymentData.status === 'succeeded') {
      const newPeriodStart = subscription.currentPeriodEnd;
      const newPeriodEnd = this.calculatePeriodEnd(
        newPeriodStart,
        (subscription.plan as any).interval
      );

      await prismaAny.subscription.update({
        where: { id: subscriptionId },
        data: {
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          status: 'active',
        },
      });

      // Событие об успешном платеже
      await prismaAny.eventOutbox.create({
        data: {
          merchantId: subscription.merchantId,
          eventType: 'payment.succeeded',
          payload: {
            paymentId: payment.id,
            subscriptionId,
            amount: payment.amount,
          },
        },
      });
    } else if (paymentData.status === 'failed') {
      // Событие о неудачном платеже
      await this.prisma.eventOutbox.create({
        data: {
          merchantId: subscription.merchantId,
          eventType: 'payment.failed',
          payload: {
            paymentId: payment.id,
            subscriptionId,
            reason: paymentData.failureReason,
          },
        },
      });
    }

    return payment;
  }

  /**
   * Получение статистики использования
   */
  async getUsageStatistics(merchantId: string) {
    const prismaAny = this.prisma as any;
    const subscription = await prismaAny.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    const plan = subscription.plan as any;
    const period = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [transactions, uniqueCustomers, outlets] = await Promise.all([
      this.prisma.transaction.count({
        where: {
          merchantId,
          createdAt: { gte: period },
        },
      }),
      this.prisma.wallet.groupBy({
        by: ['customerId'],
        where: { merchantId },
      }),
      this.prisma.outlet.count({
        where: { merchantId },
      }),
    ]);
    const customers = uniqueCustomers.length;

    return {
      plan: {
        id: plan.id,
        name: plan.displayName,
        limits: {
          transactions: plan.maxTransactions,
          customers: plan.maxCustomers,
          outlets: plan.maxOutlets,
        },
      },
      usage: {
        transactions: {
          used: transactions,
          limit: plan.maxTransactions || 'unlimited',
          percentage: plan.maxTransactions 
            ? Math.round((transactions / plan.maxTransactions) * 100)
            : null,
        },
        customers: {
          used: customers,
          limit: plan.maxCustomers || 'unlimited',
          percentage: plan.maxCustomers
            ? Math.round((customers / plan.maxCustomers) * 100)
            : null,
        },
        outlets: {
          used: outlets,
          limit: plan.maxOutlets || 'unlimited',
          percentage: plan.maxOutlets
            ? Math.round((outlets / plan.maxOutlets) * 100)
            : null,
        },
      },
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAt: subscription.cancelAt,
    };
  }

  /**
   * Автоматическое продление подписок (cron job)
   */
  // @Cron(CronExpression.EVERY_HOUR)
  async renewSubscriptions() {
    const prismaAny = this.prisma as any;
    const expiredSubscriptions = await prismaAny.subscription.findMany({
      where: {
        status: 'active',
        currentPeriodEnd: {
          lte: new Date(),
        },
        cancelAt: null,
      },
      include: { plan: true },
    });

    for (const subscription of expiredSubscriptions) {
      try {
        // Здесь должна быть интеграция с платежной системой
        // Для примера просто продлеваем подписку
        const newPeriodStart = subscription.currentPeriodEnd;
        const newPeriodEnd = this.calculatePeriodEnd(
          newPeriodStart,
          (subscription.plan as any).interval
        );

        await prismaAny.subscription.update({
          where: { id: subscription.id },
          data: {
            currentPeriodStart: newPeriodStart,
            currentPeriodEnd: newPeriodEnd,
          },
        });

        console.log(`Подписка ${subscription.id} продлена до ${newPeriodEnd}`);
      } catch (error) {
        console.error(`Ошибка продления подписки ${subscription.id}:`, error);
      }
    }
  }

  /**
   * Обработка истекших trial периодов
   */
  // @Cron(CronExpression.EVERY_DAY_AT_NOON)
  async processExpiredTrials() {
    const prismaAny = this.prisma as any;
    const expiredTrials = await prismaAny.subscription.findMany({
      where: {
        status: 'trialing',
        trialEnd: {
          lte: new Date(),
        },
      },
    });

    for (const subscription of expiredTrials) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'expired',
        },
      });

      // Уведомление о завершении trial
      await this.prisma.eventOutbox.create({
        data: {
          merchantId: subscription.merchantId,
          eventType: 'trial.expired',
          payload: {
            subscriptionId: subscription.id,
          },
        },
      });
    }
  }

  /**
   * Расчет даты окончания периода
   */
  private calculatePeriodEnd(start: Date, interval: string): Date {
    const end = new Date(start);
    
    switch (interval) {
      case 'month':
        end.setMonth(end.getMonth() + 1);
        break;
      case 'year':
        end.setFullYear(end.getFullYear() + 1);
        break;
      case 'week':
        end.setDate(end.getDate() + 7);
        break;
      default:
        end.setMonth(end.getMonth() + 1);
    }

    return end;
  }

  /**
   * Получение доступных планов
   */
  async getAvailablePlans() {
    return (this.prisma as any).plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  /**
   * Получение истории платежей
   */
  async getPaymentHistory(merchantId: string, limit = 20) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { merchantId },
    });

    if (!subscription) {
      return [];
    }

    return (this.prisma as any).payment.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
