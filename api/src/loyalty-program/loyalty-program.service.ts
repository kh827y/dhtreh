import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommunicationChannel,
  LoyaltyMechanicType,
  MechanicStatus,
  Prisma,
  PromotionRewardType,
  PromotionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { CommunicationsService } from '../communications/communications.service';
import { ensureDefaultTiers, extractTierMinPayment } from './tiers.util';

export interface TierPayload {
  name: string;
  description?: string | null;
  thresholdAmount?: number | null;
  earnRatePercent?: number | null;
  redeemRatePercent?: number | null;
  minPaymentAmount?: number | null;
  isInitial?: boolean;
  isHidden?: boolean;
  color?: string | null;
  actorId?: string | null;
}

export interface TierDto {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  thresholdAmount: number;
  earnRateBps: number;
  redeemRateBps: number | null;
  minPaymentAmount: number | null;
  isInitial: boolean;
  isHidden: boolean;
  isDefault: boolean;
  color: string | null;
  customersCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MechanicPayload {
  type: LoyaltyMechanicType;
  name?: string | null;
  description?: string | null;
  status?: MechanicStatus;
  settings?: any;
  metadata?: any;
  actorId?: string;
}

export interface PromotionPayload {
  name: string;
  description?: string | null;
  segmentId?: string | null;
  targetTierId?: string | null;
  status?: PromotionStatus;
  rewardType: PromotionRewardType;
  rewardValue?: number | null;
  rewardMetadata?: any;
  pointsExpireInDays?: number | null;
  pushTemplateStartId?: string | null;
  pushTemplateReminderId?: string | null;
  pushOnStart?: boolean;
  pushReminderEnabled?: boolean;
  reminderOffsetHours?: number | null;
  autoLaunch?: boolean;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  metadata?: any;
  actorId?: string;
}

export interface OperationsLogFilters {
  type?: 'MECHANIC' | 'PROMO_CODE' | 'PROMOTION';
  from?: Date | string;
  to?: Date | string;
}

@Injectable()
export class LoyaltyProgramService {
  private readonly logger = new Logger(LoyaltyProgramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly comms: CommunicationsService,
  ) {}

  // ===== Loyalty tiers =====

  private sanitizePercent(value: number | null | undefined, fallbackBps = 0) {
    if (value == null) return fallbackBps;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallbackBps;
    return Math.round(parsed * 100);
  }

  // ===== Notifications scheduling =====
  private normalizeFuture(date: Date | null | undefined): Date | null {
    if (!date) return null;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const now = Date.now();
    // createPushTask/createTelegramTask требуют дату не в прошлом
    if (d.getTime() < now + 60_000) return new Date(now + 60_000);
    return d;
  }

  private async isTelegramEnabled(merchantId: string): Promise<boolean> {
    try {
      const m = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { telegramBotEnabled: true } });
      return !!m?.telegramBotEnabled;
    } catch {}
    return false;
  }

  private async taskExists(params: {
    merchantId: string;
    promotionId: string;
    channel: CommunicationChannel;
    scheduledAt: Date | null;
  }): Promise<boolean> {
    const { merchantId, promotionId, channel, scheduledAt } = params;
    const where: Prisma.CommunicationTaskWhereInput = {
      merchantId,
      promotionId,
      channel,
      status: { in: ['SCHEDULED', 'RUNNING', 'PAUSED'] },
    };
    if (scheduledAt) (where as any).scheduledAt = scheduledAt;
    const existing = await this.prisma.communicationTask.findFirst({ where });
    return !!existing;
  }

  private buildStartText(p: any): string {
    const parts: string[] = [];
    parts.push(`Акция стартовала: ${p?.name || 'Новая акция'}`);
    if (p?.rewardType === 'POINTS' && Number.isFinite(Number(p?.rewardValue))) {
      parts.push(`Бонус: +${Math.max(0, Math.round(Number(p.rewardValue)))} баллов`);
    }
    if (p?.endAt) {
      try {
        const dd = new Date(p.endAt);
        parts.push(`До ${dd.toLocaleDateString('ru-RU')}`);
      } catch {}
    }
    return parts.join(' · ');
  }

  private buildReminderText(p: any, hours: number): string {
    const parts: string[] = [];
    parts.push(`Скоро завершится акция: ${p?.name || ''}`.trim());
    if (p?.rewardType === 'POINTS' && Number.isFinite(Number(p?.rewardValue))) {
      parts.push(`Успейте получить +${Math.max(0, Math.round(Number(p.rewardValue)))} баллов`);
    }
    parts.push(`Осталось ~${Math.max(1, Math.round(hours))} ч.`);
    return parts.join(' · ');
  }

  private async schedulePromotionNotifications(merchantId: string, promotion: any): Promise<void> {
    const now = Date.now();
    const hasSegment = !!promotion.segmentId;
    const audienceCode = hasSegment ? `segment:${promotion.segmentId}` : 'all';
    const audienceId = promotion.segmentId ?? null;
    const actorId = promotion.updatedById ?? promotion.createdById ?? null;

    // START notifications
    if (promotion.pushOnStart) {
      let when: Date | null = null;
      if (promotion.status === 'SCHEDULED' && promotion.startAt) {
        when = this.normalizeFuture(promotion.startAt);
      } else if (promotion.status === 'ACTIVE') {
        // немедленная отправка → +60 секунд
        when = new Date(now + 60_000);
      }
      if (when) {
        const text = this.buildStartText(promotion);
        // PUSH — если выбран шаблон
        if (promotion.pushTemplateStartId) {
          if (!(await this.taskExists({ merchantId, promotionId: promotion.id, channel: CommunicationChannel.PUSH, scheduledAt: when }))) {
            await this.comms.createTask(merchantId, {
              channel: CommunicationChannel.PUSH,
              templateId: promotion.pushTemplateStartId,
              audienceId,
              audienceCode,
              promotionId: promotion.id,
              scheduledAt: when,
              payload: { text, event: 'promotion.start', promotionId: promotion.id },
              actorId: actorId ?? undefined,
            });
          }
        }
        // TELEGRAM — если включён бот
        if (await this.isTelegramEnabled(merchantId)) {
          if (!(await this.taskExists({ merchantId, promotionId: promotion.id, channel: CommunicationChannel.TELEGRAM, scheduledAt: when }))) {
            await this.comms.createTask(merchantId, {
              channel: CommunicationChannel.TELEGRAM,
              promotionId: promotion.id,
              audienceId,
              audienceName: null,
              audienceSnapshot: { code: audienceCode },
              scheduledAt: when,
              payload: { text, event: 'promotion.start', promotionId: promotion.id },
              actorId: actorId ?? undefined,
            });
          }
        }
      }
    }

    // REMINDER notifications (default 48h before end)
    if (promotion.pushReminderEnabled && promotion.endAt) {
      const offsetH = Number.isFinite(Number(promotion.reminderOffsetHours)) && Number(promotion.reminderOffsetHours) > 0
        ? Math.round(Number(promotion.reminderOffsetHours))
        : 48;
      const end = new Date(promotion.endAt).getTime();
      const ts = end - offsetH * 3600_000;
      if (ts > now) {
        const when = this.normalizeFuture(new Date(ts));
        if (when) {
          const text = this.buildReminderText(promotion, offsetH);
          if (promotion.pushTemplateReminderId) {
            if (!(await this.taskExists({ merchantId, promotionId: promotion.id, channel: CommunicationChannel.PUSH, scheduledAt: when }))) {
              await this.comms.createTask(merchantId, {
                channel: CommunicationChannel.PUSH,
                templateId: promotion.pushTemplateReminderId,
                audienceId,
                audienceCode,
                promotionId: promotion.id,
                scheduledAt: when,
                payload: { text, event: 'promotion.reminder', promotionId: promotion.id },
                actorId: actorId ?? undefined,
              });
            }
          }
          if (await this.isTelegramEnabled(merchantId)) {
            if (!(await this.taskExists({ merchantId, promotionId: promotion.id, channel: CommunicationChannel.TELEGRAM, scheduledAt: when }))) {
              await this.comms.createTask(merchantId, {
                channel: CommunicationChannel.TELEGRAM,
                promotionId: promotion.id,
                audienceId,
                audienceName: null,
                audienceSnapshot: { code: audienceCode },
                scheduledAt: when,
                payload: { text, event: 'promotion.reminder', promotionId: promotion.id },
                actorId: actorId ?? undefined,
              });
            }
          }
        }
      }
    }
  }

  private sanitizeAmount(value: number | null | undefined, fallback = 0) {
    if (value == null) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.round(parsed);
  }

  private mapTier(
    tier: Prisma.LoyaltyTierGetPayload<{ include?: any }>,
    customersCount = 0,
  ): TierDto {
    return {
      id: tier.id,
      merchantId: tier.merchantId,
      name: tier.name,
      description: tier.description ?? null,
      thresholdAmount: Number(tier.thresholdAmount ?? 0),
      earnRateBps: tier.earnRateBps ?? 0,
      redeemRateBps: tier.redeemRateBps ?? null,
      minPaymentAmount: extractTierMinPayment(tier.metadata),
      isInitial: tier.isInitial,
      isHidden: tier.isHidden,
      isDefault: tier.isDefault,
      color: tier.color ?? null,
      customersCount,
      createdAt: tier.createdAt,
      updatedAt: tier.updatedAt,
    };
  }

  async listTiers(merchantId: string): Promise<TierDto[]> {
    await ensureDefaultTiers(this.prisma, merchantId);
    const tiers = await this.prisma.loyaltyTier.findMany({
      where: { merchantId },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
    });
    const assignmentGroups = await this.prisma.loyaltyTierAssignment.groupBy({
      by: ['tierId'],
      where: {
        merchantId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      _count: { _all: true },
    });
    const assignmentsMap = new Map<string, number>(
      assignmentGroups.map((row) => [row.tierId, row._count._all]),
    );
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.tiers.list',
          merchantId,
          total: tiers.length,
        }),
      );
      this.metrics.inc('portal_loyalty_tiers_list_total');
    } catch {}
    return tiers.map((tier) =>
      this.mapTier(tier, assignmentsMap.get(tier.id) ?? 0),
    );
  }

  async getTier(merchantId: string, tierId: string): Promise<TierDto> {
    const tier = await this.prisma.loyaltyTier.findFirst({
      where: { merchantId, id: tierId },
    });
    if (!tier) throw new NotFoundException('Уровень не найден');
    const customersCount = await this.prisma.loyaltyTierAssignment.count({
      where: {
        merchantId,
        tierId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    return this.mapTier(tier, customersCount);
  }

  async createTier(merchantId: string, payload: TierPayload): Promise<TierDto> {
    if (!payload?.name?.trim())
      throw new BadRequestException('Название обязательно');
    const name = payload.name.trim();
    const thresholdAmount = this.sanitizeAmount(payload.thresholdAmount, 0);
    const earnRateBps = this.sanitizePercent(payload.earnRatePercent, 0);
    const redeemRateBps =
      payload.redeemRatePercent != null
        ? this.sanitizePercent(payload.redeemRatePercent, 0)
        : null;
    const minPaymentAmount =
      payload.minPaymentAmount != null
        ? this.sanitizeAmount(payload.minPaymentAmount, 0)
        : null;
    const metadata =
      minPaymentAmount != null ? { minPaymentAmount } : undefined;
    const isInitial = !!payload.isInitial;
    const isHidden = !!payload.isHidden;

    const created = await this.prisma.$transaction(async (tx) => {
      if (isInitial) {
        await tx.loyaltyTier.updateMany({
          where: { merchantId },
          data: { isInitial: false, isDefault: false },
        });
      }
      const orderAggregate = await tx.loyaltyTier.aggregate({
        where: { merchantId },
        _max: { order: true },
      });
      const nextOrder = (orderAggregate._max.order ?? 0) + 1;
      const tier = await tx.loyaltyTier.create({
        data: {
          merchantId,
          name,
          description: payload.description?.trim() ?? null,
          thresholdAmount,
          earnRateBps,
          redeemRateBps,
          isInitial,
          isDefault: isInitial,
          isHidden,
          color: payload.color ?? null,
          metadata: metadata as Prisma.InputJsonValue,
          order: nextOrder,
        },
      });
      return tier;
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.tiers.create',
          merchantId,
          tierId: created.id,
        }),
      );
      this.metrics.inc('portal_loyalty_tiers_write_total', {
        action: 'create',
      });
    } catch {}
    return this.mapTier(created, 0);
  }

  async updateTier(
    merchantId: string,
    tierId: string,
    payload: TierPayload,
  ): Promise<TierDto> {
    const tier = await this.prisma.loyaltyTier.findFirst({
      where: { merchantId, id: tierId },
    });
    if (!tier) throw new NotFoundException('Уровень не найден');

    const name = payload.name?.trim();
    const thresholdAmount =
      payload.thresholdAmount != null
        ? this.sanitizeAmount(payload.thresholdAmount, tier.thresholdAmount)
        : tier.thresholdAmount;
    const earnRateBps =
      payload.earnRatePercent != null
        ? this.sanitizePercent(payload.earnRatePercent, tier.earnRateBps)
        : tier.earnRateBps;
    const redeemRateBps =
      payload.redeemRatePercent != null
        ? this.sanitizePercent(
            payload.redeemRatePercent,
            tier.redeemRateBps ?? 0,
          )
        : tier.redeemRateBps;
    const minPaymentAmount =
      payload.minPaymentAmount != null
        ? this.sanitizeAmount(payload.minPaymentAmount, 0)
        : this.extractMinPayment(tier.metadata);
    const metadataBase =
      tier.metadata &&
      typeof tier.metadata === 'object' &&
      !Array.isArray(tier.metadata)
        ? { ...(tier.metadata as Record<string, unknown>) }
        : ({} as Record<string, unknown>);
    if ('value' in metadataBase && metadataBase.value === 'JsonNull')
      delete (metadataBase as any).value;
    const metadata = metadataBase;
    if (payload.minPaymentAmount != null)
      metadata.minPaymentAmount = minPaymentAmount;
    else if (payload.minPaymentAmount === null)
      delete metadata.minPaymentAmount;

    const isInitial =
      payload.isInitial != null ? !!payload.isInitial : tier.isInitial;
    const isHidden =
      payload.isHidden != null ? !!payload.isHidden : tier.isHidden;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (isInitial) {
        await tx.loyaltyTier.updateMany({
          where: { merchantId, NOT: { id: tierId } },
          data: { isInitial: false, isDefault: false },
        });
      }
      const next = await tx.loyaltyTier.update({
        where: { id: tierId },
        data: {
          name: name ?? tier.name,
          description:
            payload.description !== undefined
              ? (payload.description?.trim() ?? null)
              : tier.description,
          thresholdAmount,
          earnRateBps,
          redeemRateBps,
          isInitial,
          isDefault: isInitial,
          isHidden,
          color: payload.color ?? tier.color,
          metadata: Object.keys(metadata).length
            ? (metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      return next;
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.tiers.update',
          merchantId,
          tierId,
        }),
      );
      this.metrics.inc('portal_loyalty_tiers_write_total', {
        action: 'update',
      });
    } catch {}
    const customersCount = await this.prisma.loyaltyTierAssignment.count({
      where: {
        merchantId,
        tierId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    return this.mapTier(updated, customersCount);
  }

  async deleteTier(
    merchantId: string,
    tierId: string,
  ): Promise<{ ok: boolean }> {
    const tier = await this.prisma.loyaltyTier.findFirst({
      where: { merchantId, id: tierId },
    });
    if (!tier) throw new NotFoundException('Уровень не найден');
    const assignments = await this.prisma.loyaltyTierAssignment.count({
      where: {
        merchantId,
        tierId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (assignments > 0)
      throw new BadRequestException(
        'Нельзя удалить уровень, пока в нём есть клиенты',
      );

    await this.prisma.loyaltyTier.delete({ where: { id: tierId } });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.tiers.delete',
          merchantId,
          tierId,
        }),
      );
      this.metrics.inc('portal_loyalty_tiers_write_total', {
        action: 'delete',
      });
    } catch {}
    return { ok: true };
  }

  async listMechanics(merchantId: string, status?: MechanicStatus | 'ALL') {
    const where: Prisma.LoyaltyMechanicWhereInput = { merchantId };
    if (status && status !== 'ALL') {
      where.status = status;
    }

    const mechanics = await this.prisma.loyaltyMechanic.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.mechanics.list',
          merchantId,
          status: status ?? 'ALL',
          total: mechanics.length,
        }),
      );
      this.metrics.inc('portal_loyalty_mechanics_list_total');
    } catch {}
    return mechanics;
  }

  async createMechanic(merchantId: string, payload: MechanicPayload) {
    if (!payload.type) throw new BadRequestException('Тип механики обязателен');
    const mechanic = await this.prisma.loyaltyMechanic.create({
      data: {
        merchantId,
        type: payload.type,
        name: payload.name ?? null,
        description: payload.description ?? null,
        status: payload.status ?? MechanicStatus.DRAFT,
        settings: payload.settings ?? null,
        metadata: payload.metadata ?? null,
        createdById: payload.actorId ?? null,
        updatedById: payload.actorId ?? null,
      },
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.mechanics.create',
          merchantId,
          mechanicId: mechanic.id,
          type: mechanic.type,
          status: mechanic.status,
        }),
      );
      this.metrics.inc('portal_loyalty_mechanics_changed_total', {
        action: 'create',
      });
    } catch {}
    return mechanic;
  }

  async updateMechanic(
    merchantId: string,
    mechanicId: string,
    payload: MechanicPayload,
  ) {
    const mechanic = await this.prisma.loyaltyMechanic.findFirst({
      where: { merchantId, id: mechanicId },
    });
    if (!mechanic) throw new NotFoundException('Механика не найдена');

    const updated = await this.prisma.loyaltyMechanic.update({
      where: { id: mechanicId },
      data: {
        type: payload.type ?? mechanic.type,
        name: payload.name ?? mechanic.name,
        description: payload.description ?? mechanic.description,
        status: payload.status ?? mechanic.status,
        settings: payload.settings ?? mechanic.settings,
        metadata: payload.metadata ?? mechanic.metadata,
        updatedById: payload.actorId ?? mechanic.updatedById,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.mechanics.update',
          merchantId,
          mechanicId,
          status: updated.status,
        }),
      );
      this.metrics.inc('portal_loyalty_mechanics_changed_total', {
        action: 'update',
      });
    } catch {}
    return updated;
  }

  async changeMechanicStatus(
    merchantId: string,
    mechanicId: string,
    status: MechanicStatus,
    actorId?: string,
  ) {
    const mechanic = await this.prisma.loyaltyMechanic.findFirst({
      where: { merchantId, id: mechanicId },
    });
    if (!mechanic) throw new NotFoundException('Механика не найдена');
    const updated = await this.prisma.loyaltyMechanic.update({
      where: { id: mechanicId },
      data: {
        status,
        updatedById: actorId ?? mechanic.updatedById,
        enabledAt:
          status === MechanicStatus.ENABLED ? new Date() : mechanic.enabledAt,
        disabledAt:
          status === MechanicStatus.DISABLED ? new Date() : mechanic.disabledAt,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.mechanics.status',
          merchantId,
          mechanicId,
          status,
        }),
      );
      this.metrics.inc('portal_loyalty_mechanics_changed_total', {
        action: 'status',
      });
    } catch {}
    return updated;
  }

  async deleteMechanic(merchantId: string, mechanicId: string) {
    const mechanic = await this.prisma.loyaltyMechanic.findFirst({
      where: { merchantId, id: mechanicId },
    });
    if (!mechanic) throw new NotFoundException('Механика не найдена');
    await this.prisma.loyaltyMechanic.delete({ where: { id: mechanicId } });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.mechanics.delete',
          merchantId,
          mechanicId,
        }),
      );
      this.metrics.inc('portal_loyalty_mechanics_changed_total', {
        action: 'delete',
      });
    } catch {}
    return { ok: true };
  }

  async listPromotions(merchantId: string, status?: PromotionStatus | 'ALL') {
    const where: Prisma.LoyaltyPromotionWhereInput = { merchantId };
    if (status && status !== 'ALL') {
      where.status = status;
    }

    const promotions = await this.prisma.loyaltyPromotion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        metrics: true,
        audience: {
          include: {
            _count: { select: { customers: true } },
          },
        },
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promotions.list',
          merchantId,
          status: status ?? 'ALL',
          total: promotions.length,
        }),
      );
      this.metrics.inc('portal_loyalty_promotions_list_total');
    } catch {}
    return promotions;
  }

  async createPromotion(merchantId: string, payload: PromotionPayload) {
    if (!payload.name?.trim())
      throw new BadRequestException('Название акции обязательно');

    const promotion = await this.prisma.loyaltyPromotion.create({
      data: {
        merchantId,
        name: payload.name.trim(),
        description: payload.description ?? null,
        segmentId: payload.segmentId ?? null,
        targetTierId: payload.targetTierId ?? null,
        status: payload.status ?? PromotionStatus.DRAFT,
        rewardType: payload.rewardType,
        rewardValue: payload.rewardValue ?? null,
        rewardMetadata: payload.rewardMetadata ?? null,
        pointsExpireInDays: payload.pointsExpireInDays ?? null,
        pushTemplateStartId: payload.pushTemplateStartId ?? null,
        pushTemplateReminderId: payload.pushTemplateReminderId ?? null,
        pushOnStart: payload.pushOnStart ?? false,
        pushReminderEnabled: payload.pushReminderEnabled ?? false,
        reminderOffsetHours: payload.reminderOffsetHours ?? null,
        autoLaunch: payload.autoLaunch ?? false,
        startAt: payload.startAt ? new Date(payload.startAt) : null,
        endAt: payload.endAt ? new Date(payload.endAt) : null,
        metadata: payload.metadata ?? null,
        createdById: payload.actorId ?? null,
        updatedById: payload.actorId ?? null,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promotions.create',
          merchantId,
          promotionId: promotion.id,
          status: promotion.status,
        }),
      );
      this.metrics.inc('portal_loyalty_promotions_changed_total', {
        action: 'create',
      });
    } catch {}
    try {
      await this.schedulePromotionNotifications(merchantId, promotion);
    } catch (e) {
      // не валим создание акции из-за ошибок планирования уведомлений
      this.logger.warn(`schedulePromotionNotifications failed: ${String((e as any)?.message || e)}`);
    }
    return promotion;
  }

  async updatePromotion(
    merchantId: string,
    promotionId: string,
    payload: PromotionPayload,
  ) {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({
      where: { merchantId, id: promotionId },
    });
    if (!promotion) throw new NotFoundException('Акция не найдена');

    const updated = await this.prisma.loyaltyPromotion.update({
      where: { id: promotionId },
      data: {
        name: payload.name?.trim() ?? promotion.name,
        description: payload.description ?? promotion.description,
        segmentId: payload.segmentId ?? promotion.segmentId,
        targetTierId: payload.targetTierId ?? promotion.targetTierId,
        status: payload.status ?? promotion.status,
        rewardType: payload.rewardType ?? promotion.rewardType,
        rewardValue: payload.rewardValue ?? promotion.rewardValue,
        rewardMetadata: payload.rewardMetadata ?? promotion.rewardMetadata,
        pointsExpireInDays:
          payload.pointsExpireInDays ?? promotion.pointsExpireInDays,
        pushTemplateStartId:
          payload.pushTemplateStartId ?? promotion.pushTemplateStartId,
        pushTemplateReminderId:
          payload.pushTemplateReminderId ?? promotion.pushTemplateReminderId,
        pushOnStart: payload.pushOnStart ?? promotion.pushOnStart,
        pushReminderEnabled:
          payload.pushReminderEnabled ?? promotion.pushReminderEnabled,
        reminderOffsetHours:
          payload.reminderOffsetHours ?? promotion.reminderOffsetHours,
        autoLaunch: payload.autoLaunch ?? promotion.autoLaunch,
        startAt: payload.startAt
          ? new Date(payload.startAt)
          : promotion.startAt,
        endAt: payload.endAt ? new Date(payload.endAt) : promotion.endAt,
        metadata: payload.metadata ?? promotion.metadata,
        updatedById: payload.actorId ?? promotion.updatedById,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promotions.update',
          merchantId,
          promotionId,
          status: updated.status,
        }),
      );
      this.metrics.inc('portal_loyalty_promotions_changed_total', {
        action: 'update',
      });
    } catch {}
    return updated;
  }

  async getPromotion(merchantId: string, promotionId: string) {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({
      where: { merchantId, id: promotionId },
      include: {
        metrics: true,
        audience: {
          include: {
            _count: { select: { customers: true } },
          },
        },
        participants: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            customer: true,
          },
        },
      },
    });
    if (!promotion) throw new NotFoundException('Акция не найдена');
    return promotion;
  }

  async changePromotionStatus(
    merchantId: string,
    promotionId: string,
    status: PromotionStatus,
    actorId?: string,
  ) {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({
      where: { merchantId, id: promotionId },
    });
    if (!promotion) throw new NotFoundException('Акция не найдена');

    const updated = await this.prisma.loyaltyPromotion.update({
      where: { id: promotionId },
      data: {
        status,
        updatedById: actorId ?? promotion.updatedById,
        launchedAt:
          status === PromotionStatus.ACTIVE ? new Date() : promotion.launchedAt,
        archivedAt:
          status === PromotionStatus.ARCHIVED
            ? new Date()
            : promotion.archivedAt,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promotions.status',
          merchantId,
          promotionId,
          status,
        }),
      );
      this.metrics.inc('portal_loyalty_promotions_changed_total', {
        action: 'status',
      });
    } catch {}
    return updated;
  }

  async bulkUpdatePromotionStatus(
    merchantId: string,
    promotionIds: string[],
    status: PromotionStatus,
    actorId?: string,
  ) {
    if (!promotionIds.length) return { updated: 0 };
    const results = await this.prisma.$transaction(
      promotionIds.map((id) =>
        this.prisma.loyaltyPromotion.updateMany({
          where: { id, merchantId },
          data: {
            status,
            updatedById: actorId ?? undefined,
            launchedAt:
              status === PromotionStatus.ACTIVE ? new Date() : undefined,
            archivedAt:
              status === PromotionStatus.ARCHIVED ? new Date() : undefined,
          },
        }),
      ),
    );

    const updated = results.reduce((acc, res) => acc + res.count, 0);
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promotions.bulkStatus',
          merchantId,
          status,
          ids: promotionIds.length,
          updated,
        }),
      );
      this.metrics.inc(
        'portal_loyalty_promotions_changed_total',
        { action: 'bulk-status' },
        updated || 1,
      );
    } catch {}
    return { updated };
  }

  async operationsLog(merchantId: string, filters: OperationsLogFilters = {}) {
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;

    const logs: any = {};
    if (!filters.type || filters.type === 'MECHANIC') {
      logs.mechanics = await this.prisma.loyaltyMechanicLog.findMany({
        where: {
          merchantId,
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    }
    if (!filters.type || filters.type === 'PROMO_CODE') {
      logs.promoCodes = await this.prisma.promoCodeUsage.findMany({
        where: {
          merchantId,
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    }
    if (!filters.type || filters.type === 'PROMOTION') {
      logs.promotions = await this.prisma.promotionParticipant.findMany({
        where: {
          merchantId,
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    }

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.operations.log',
          merchantId,
          type: filters.type ?? 'ALL',
          mechanics: logs.mechanics?.length ?? 0,
          promoCodes: logs.promoCodes?.length ?? 0,
          promotions: logs.promotions?.length ?? 0,
        }),
      );
      this.metrics.inc('portal_loyalty_operations_list_total');
    } catch {}
    return logs;
  }
}
