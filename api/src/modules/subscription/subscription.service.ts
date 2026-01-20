import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Plan } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { withJsonSchemaVersion } from '../../shared/json-version.util';
// import { Cron, CronExpression } from '@nestjs/schedule';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRATION_WARNING_DAYS = 7;
export const FULL_PLAN_ID = 'plan_full';

export interface CreateSubscriptionDto {
  merchantId: string;
  planId: string;
  metadata?: Prisma.InputJsonValue | null;
}

export interface UpdateSubscriptionDto {
  planId?: string;
  cancelAtPeriodEnd?: boolean;
  metadata?: Prisma.InputJsonValue | null;
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

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{
  include: { plan: true };
}>;

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  private buildFullPlan(): Prisma.PlanCreateInput {
    return {
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

  ensurePlan(planId: string) {
    if (planId !== FULL_PLAN_ID) {
      throw new BadRequestException('Доступен только тариф FULL');
    }
    const base = this.buildFullPlan();
    const createData: Prisma.PlanCreateInput = { ...base, id: planId };
    const updateData: Prisma.PlanUpdateInput = { ...base };
    return this.prisma.plan.upsert({
      where: { id: planId },
      update: updateData,
      create: createData,
    });
  }

  private computeState(
    subscription: SubscriptionWithPlan | null,
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
    const cancelExpired = subscription.cancelAt
      ? subscription.cancelAt.getTime() <= now.getTime()
      : false;
    const expired = !statusAllows || expiredByDate || cancelExpired;
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

  buildStateFromRecord(
    subscription: SubscriptionWithPlan | null,
    now = new Date(),
  ) {
    return this.computeState(subscription, now);
  }

  async getSubscriptionState(merchantId: string): Promise<SubscriptionState> {
    const subscription = await this.prisma.subscription.findUnique({
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
    const subscription = await this.prisma.subscription.findUnique({
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
    metadata?: Prisma.InputJsonValue | null,
  ) {
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException(
        'Длительность подписки должна быть > 0 дней',
      );
    }
    const plan = await this.ensurePlan(planId);
    const now = new Date();
    const end = new Date(now.getTime() + Math.ceil(days) * DAY_MS);
    const metadataValue = this.toNullableJsonInput(metadata);
    const updateData: Prisma.SubscriptionUncheckedUpdateInput = {
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
      ...(metadataValue !== undefined ? { metadata: metadataValue } : {}),
    };
    const createData: Prisma.SubscriptionUncheckedCreateInput = {
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
      ...(metadataValue !== undefined ? { metadata: metadataValue } : {}),
    };

    const existing = await this.prisma.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });
    const upserted = existing
      ? await this.prisma.subscription.update({
          where: { id: existing.id },
          data: updateData,
          include: { plan: true },
        })
      : await this.prisma.subscription.create({
          data: createData,
          include: { plan: true },
        });

    await this.prisma.eventOutbox.create({
      data: {
        merchantId,
        eventType: existing ? 'subscription.updated' : 'subscription.created',
        payload: this.toJsonValue({
          subscriptionId: upserted.id,
          planId: upserted.planId,
          currentPeriodEnd: upserted.currentPeriodEnd,
          durationDays: Math.ceil(days),
        }),
      },
    });

    return this.computeState(upserted);
  }

  async resetSubscription(merchantId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { merchantId },
    });
    if (!existing) return { ok: true, removed: false };
    await this.prisma.subscription.delete({ where: { merchantId } });
    await this.prisma.eventOutbox.create({
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
    const subscription = await this.prisma.subscription.findUnique({
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
    const existingSubscription = await this.prisma.subscription.findUnique({
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
    let subscription: SubscriptionWithPlan;
    try {
      subscription = await this.prisma.subscription.create({
        data: {
          merchantId: dto.merchantId,
          planId: dto.planId,
          status: 'active',
          currentPeriodStart,
          currentPeriodEnd,
          trialEnd: null,
          metadata: this.toNullableJsonInput(dto.metadata),
          autoRenew: false,
        },
        include: {
          plan: true,
        },
      });
    } catch (error: unknown) {
      // Prisma P2002 — уникальная подписка на merchantId уже существует
      const code =
        typeof error === 'object' && error !== null
          ? (error as { code?: string }).code
          : undefined;
      if (code === 'P2002') {
        throw new BadRequestException('У мерчанта уже есть активная подписка');
      }
      throw error;
    }

    // Создаем событие в outbox
    await this.prisma.eventOutbox.create({
      data: {
        merchantId: dto.merchantId,
        eventType: 'subscription.created',
        payload: this.toJsonValue({
          subscriptionId: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          trialEnd: null,
        }),
      },
    });

    return subscription;
  }

  /**
   * Обновление подписки (смена плана)
   */
  async updateSubscription(merchantId: string, dto: UpdateSubscriptionDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    const updateData: Prisma.SubscriptionUpdateInput = {};

    // Если меняется план
    if (dto.planId && dto.planId !== subscription.planId) {
      const newPlan = await this.ensurePlan(dto.planId);

      updateData.plan = { connect: { id: newPlan.id } };

      // Проверяем лимиты нового плана
      this.validatePlanLimits(merchantId, newPlan);
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

    if (dto.metadata !== undefined) {
      updateData.metadata = this.toNullableJsonInput(dto.metadata);
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: updateData,
      include: { plan: true },
    });

    // Создаем событие
    await this.prisma.eventOutbox.create({
      data: {
        merchantId,
        eventType: 'subscription.updated',
        payload: this.toJsonValue({
          subscriptionId: updated.id,
          changes: this.buildSubscriptionChangePayload(
            dto,
            subscription,
            updated,
          ),
        }),
      },
    });

    return updated;
  }

  /**
   * Отмена подписки
   */
  async cancelSubscription(merchantId: string, immediately = false) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { merchantId },
    });

    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    if (subscription.status === 'canceled' || subscription.cancelAt) {
      throw new BadRequestException('Подписка уже отменена');
    }

    const updateData: Prisma.SubscriptionUpdateInput = {
      canceledAt: new Date(),
    };

    if (immediately) {
      updateData.status = 'canceled';
      updateData.cancelAt = new Date();
    } else {
      updateData.cancelAt = subscription.currentPeriodEnd;
    }

    const canceled = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: updateData,
    });

    // Создаем событие
    await this.prisma.eventOutbox.create({
      data: {
        merchantId,
        eventType: 'subscription.canceled',
        payload: this.toJsonValue({
          subscriptionId: canceled.id,
          immediately,
          cancelAt: canceled.cancelAt,
        }),
      },
    });

    return canceled;
  }

  /**
   * Проверка лимитов плана
   */
  validatePlanLimits(_merchantId: string, _plan: Plan): boolean {
    return true;
  }

  /**
   * Проверка доступности функции для текущего плана
   */
  async checkFeatureAccess(
    merchantId: string,
    feature: string,
  ): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    const state = this.computeState(subscription);
    if (state.status !== 'active') return false;

    const plan = subscription?.plan ?? null;
    if (!plan) return false;
    const features = this.toRecord(plan.features) ?? {};

    if (features.all === true) return true;
    switch (feature) {
      case 'webhooks':
        return (plan.webhooksEnabled ?? features.webhooks === true) === true;
      case 'custom_branding':
        return (
          (plan.customBranding ?? features.customBranding === true) === true
        );
      case 'priority_support':
        return (
          (plan.prioritySupport ?? features.prioritySupport === true) === true
        );
      case 'api_access':
        return (plan.apiAccess ?? features.apiAccess === true) === true;
      default:
        return features[feature] === true;
    }
  }

  /**
   * Получение статистики использования
   */
  async getUsageStatistics(merchantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
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

  private toRecord(
    value: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toNullableJsonInput(
    value: Prisma.InputJsonValue | null | undefined,
  ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.DbNull;
    return withJsonSchemaVersion(value) as Prisma.InputJsonValue;
  }

  private toJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
    if (value === null || value === undefined) return Prisma.JsonNull;
    try {
      const normalized = this.normalizeJsonInput(value);
      const parsed: unknown = JSON.parse(JSON.stringify(normalized));
      if (parsed === null) return Prisma.JsonNull;
      if (this.isJsonValue(parsed)) return parsed;
      return Prisma.JsonNull;
    } catch {
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      ) {
        return String(value);
      }
      return Prisma.JsonNull;
    }
  }

  private isJsonValue(value: unknown): value is Prisma.InputJsonValue {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) {
      return value.every((item) => item === null || this.isJsonValue(item));
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).every(
        (item) => item === null || this.isJsonValue(item),
      );
    }
    return false;
  }

  private normalizeJsonInput(value: unknown): unknown {
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeJsonInput(item));
    }
    if (value && typeof value === 'object') {
      const maybeToJson = value as { toJSON?: unknown };
      if (typeof maybeToJson.toJSON === 'function') {
        return value;
      }
      const record = value as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(record)) {
        normalized[key] = this.normalizeJsonInput(item);
      }
      return normalized;
    }
    return value;
  }

  private buildSubscriptionChangePayload(
    dto: UpdateSubscriptionDto,
    before: SubscriptionWithPlan,
    after: SubscriptionWithPlan,
  ): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    if (dto.planId && dto.planId !== before.planId) {
      changes.planId = after.planId;
    }
    if (dto.cancelAtPeriodEnd !== undefined) {
      changes.cancelAtPeriodEnd = dto.cancelAtPeriodEnd;
    }
    if (dto.metadata !== undefined) {
      if (dto.metadata === null) {
        changes.metadataCleared = true;
      } else {
        changes.metadata = dto.metadata;
      }
    }
    return changes;
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
    return this.prisma.plan.findMany({
      where: { id: FULL_PLAN_ID, isActive: true },
      orderBy: { price: 'asc' },
    });
  }
}
