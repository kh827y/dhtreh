import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
// import { Cron, CronExpression } from '@nestjs/schedule';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRATION_WARNING_DAYS = 7;
export const FULL_PLAN_ID = 'plan_full';

export interface CreateSubscriptionDto {
  merchantId: string;
  planId: string;
  metadata?: any;
}

export interface UpdateSubscriptionDto {
  planId?: string;
  cancelAtPeriodEnd?: boolean;
  metadata?: any;
}

export type SubscriptionState =
  | {
      status: 'missing';
      planId: null;
      planName: null;
      currentPeriodEnd: null;
      daysLeft: null;
      expiresSoon: false;
      expired: true;
      problem: string;
    }
  | {
      status: 'active' | 'expired';
      planId: string | null;
      planName: string | null;
      currentPeriodEnd: Date | null;
      daysLeft: number | null;
      expiresSoon: boolean;
      expired: boolean;
      problem: string | null;
    };

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  private buildFullPlan() {
    return {
      id: FULL_PLAN_ID,
      name: 'full',
      displayName: 'Full',
      price: 0,
      currency: 'RUB',
      interval: 'day',
      features: { all: true },
      maxTransactions: null,
      maxCustomers: null,
      maxOutlets: null,
      webhooksEnabled: true,
      customBranding: true,
      prioritySupport: true,
      apiAccess: true,
      isActive: true,
    };
  }

  async ensurePlan(planId: string) {
    const prismaAny = this.prisma as any;
    if (planId !== FULL_PLAN_ID) {
      throw new BadRequestException('Доступен только тариф FULL');
    }
    const predefined = { ...this.buildFullPlan(), id: planId };
    return prismaAny.plan.upsert({
      where: { id: predefined.id },
      update: predefined,
      create: predefined,
    });
  }

  private computeState(
    subscription: any | null,
    now: Date = new Date(),
  ): SubscriptionState {
    if (!subscription) {
      return {
        status: 'missing',
        planId: null,
        planName: null,
        currentPeriodEnd: null,
        daysLeft: null,
        expiresSoon: false,
        expired: true,
        problem: 'Программа лояльности временно недоступна',
      };
    }
    const end: Date | null =
      subscription.currentPeriodEnd ?? subscription.cancelAt ?? null;
    const statusRaw = String(subscription.status || '').toLowerCase();
    const statusAllows = statusRaw === 'active';
    const expiredByDate = !end || end.getTime() <= now.getTime();
    const expired =
      !statusAllows ||
      expiredByDate ||
      (subscription.cancelAt &&
        new Date(subscription.cancelAt).getTime() <= now.getTime());
    const daysLeft =
      end && !expired
        ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS))
        : expiredByDate
          ? 0
          : null;
    return {
      status: expired ? 'expired' : 'active',
      planId: subscription.planId ?? null,
      planName:
        subscription.plan?.displayName ??
        subscription.plan?.name ??
        subscription.planId ??
        null,
      currentPeriodEnd: end ?? null,
      daysLeft,
      expiresSoon:
        !expired && daysLeft != null && daysLeft <= EXPIRATION_WARNING_DAYS,
      expired,
      problem: expired ? 'Подписка закончилась' : null,
    };
  }

  buildStateFromRecord(subscription: any | null, now: Date = new Date()) {
    return this.computeState(subscription, now);
  }

  async getSubscriptionState(merchantId: string): Promise<SubscriptionState> {
    const subscription = await (this.prisma as any).subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });
    const state = this.computeState(subscription);
    if (
      subscription &&
      state.expired &&
      String(subscription.status || '') !== 'expired'
    ) {
      try {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'expired',
            autoRenew: false,
            canceledAt: subscription.canceledAt ?? new Date(),
            cancelAt:
              subscription.cancelAt ??
              subscription.currentPeriodEnd ??
              new Date(),
          },
        });
      } catch {}
    }
    return state;
  }

  async describeSubscription(merchantId: string) {
    const subscription = await (this.prisma as any).subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });
    const state = this.computeState(subscription);
    if (
      subscription &&
      state.expired &&
      String(subscription.status || '') !== 'expired'
    ) {
      try {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'expired',
            autoRenew: false,
            canceledAt: subscription.canceledAt ?? new Date(),
            cancelAt:
              subscription.cancelAt ??
              subscription.currentPeriodEnd ??
              new Date(),
          },
        });
      } catch {}
    }
    return { subscription, state };
  }

  async requireActiveSubscription(
    merchantId: string,
  ): Promise<SubscriptionState> {
    const state = await this.getSubscriptionState(merchantId);
    if (state.status !== 'active') {
      throw new ForbiddenException(
        state.problem ||
          'Подписка закончилась, продлите её чтобы продолжить работу',
      );
    }
    return state;
  }

  async grantSubscription(
    merchantId: string,
    planId: string,
    days: number,
    metadata?: any,
  ) {
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException(
        'Длительность подписки должна быть > 0 дней',
      );
    }
    const plan = await this.ensurePlan(planId);
    const now = new Date();
    const end = new Date(now.getTime() + Math.ceil(days) * DAY_MS);
    const payload = {
      merchantId,
      planId: plan.id,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: end,
      cancelAt: null,
      canceledAt: null,
      trialEnd: null,
      autoRenew: false,
      reminderSent1Day: false,
      reminderSent7Days: false,
      metadata: metadata ?? null,
    };

    const existing = await (this.prisma as any).subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });
    const upserted = existing
      ? await this.prisma.subscription.update({
          where: { id: existing.id },
          data: payload,
          include: { plan: true },
        })
      : await this.prisma.subscription.create({
          data: payload,
          include: { plan: true },
        });

    await (this.prisma as any).eventOutbox.create({
      data: {
        merchantId,
        eventType: existing ? 'subscription.updated' : 'subscription.created',
        payload: {
          subscriptionId: upserted.id,
          planId: upserted.planId,
          currentPeriodEnd: upserted.currentPeriodEnd,
          durationDays: Math.ceil(days),
        },
      },
    });

    return this.computeState(upserted);
  }

  async resetSubscription(merchantId: string) {
    const existing = await (this.prisma as any).subscription.findUnique({
      where: { merchantId },
    });
    if (!existing) return { ok: true, removed: false };
    await this.prisma.subscription.delete({ where: { merchantId } });
    await (this.prisma as any).eventOutbox.create({
      data: {
        merchantId,
        eventType: 'subscription.canceled',
        payload: { subscriptionId: existing.id, reset: true },
      },
    });
    return { ok: true, removed: true };
  }

  /**
   * Получить текущую подписку мерчанта
   */
  async getSubscription(merchantId: string) {
    const subscription = await (this.prisma as any).subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });
    if (!subscription) return null;
    return { ...subscription, state: this.computeState(subscription) };
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
    const plan = await this.ensurePlan(dto.planId);

    // Рассчитываем даты
    const now = new Date();
    const currentPeriodStart = now;
    const currentPeriodEnd = this.calculatePeriodEnd(
      currentPeriodStart,
      plan.interval,
    );

    // Создаем подписку
    let subscription: any;
    try {
      subscription = await prismaAny.subscription.create({
        data: {
          merchantId: dto.merchantId,
          planId: dto.planId,
          status: 'active',
          currentPeriodStart,
          currentPeriodEnd,
          trialEnd: null,
          metadata: dto.metadata,
          autoRenew: false,
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
          trialEnd: null,
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
      const newPlan = await this.ensurePlan(dto.planId);

      updateData.planId = newPlan.id;

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
    return true;
  }

  /**
   * Проверка доступности функции для текущего плана
   */
  async checkFeatureAccess(
    merchantId: string,
    feature: string,
  ): Promise<boolean> {
    const prismaAny = this.prisma as any;
    const subscription = await prismaAny.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    const state = this.computeState(subscription);
    if (state.status !== 'active') return false;

    const plan = subscription?.plan ?? null;
    if (!plan) return false;
    const features = plan?.features;

    if (features?.all === true) return true;
    switch (feature) {
      case 'webhooks':
        return (plan.webhooksEnabled ?? features?.webhooks === true) === true;
      case 'custom_branding':
        return (
          (plan.customBranding ?? features?.customBranding === true) === true
        );
      case 'priority_support':
        return (
          (plan.prioritySupport ?? features?.prioritySupport === true) === true
        );
      case 'api_access':
        return (plan.apiAccess ?? features?.apiAccess === true) === true;
      default:
        return features?.[feature] === true;
    }
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
    const state = this.computeState(subscription);
    if (state.status !== 'active') {
      throw new BadRequestException('Подписка неактивна');
    }

    const plan = subscription.plan;

    const outlets = await this.prisma.outlet.count({
      where: { merchantId },
    });

    return {
      plan: {
        id: plan.id,
        name: plan.displayName,
        limits: {
          outlets: null,
        },
      },
      usage: {
        outlets: {
          used: outlets,
          limit: 'unlimited',
          percentage: null,
        },
      },
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAt: subscription.cancelAt,
    };
  }

  /**
   * Расчет даты окончания периода
   */
  private calculatePeriodEnd(start: Date, interval: string): Date {
    const end = new Date(start);

    switch (interval) {
      case 'day':
      case 'daily':
        end.setDate(end.getDate() + 1);
        break;
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
    await this.ensurePlan(FULL_PLAN_ID);
    return (this.prisma as any).plan.findMany({
      where: { id: FULL_PLAN_ID, isActive: true },
      orderBy: { price: 'asc' },
    });
  }
}
