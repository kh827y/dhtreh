import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  LoyaltyMechanicType,
  MechanicStatus,
  Prisma,
  PromotionRewardType,
  PromotionStatus,
  PromoCodeStatus,
  PromoCodeUsageLimitType,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';

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

export interface PromoCodePayload {
  code: string;
  name?: string | null;
  description?: string | null;
  status?: PromoCodeStatus;
  segmentId?: string | null;
  usageLimitType?: PromoCodeUsageLimitType;
  usageLimitValue?: number | null;
  cooldownDays?: number | null;
  perCustomerLimit?: number | null;
  requireVisit?: boolean;
  visitLookbackHours?: number | null;
  grantPoints?: boolean;
  pointsAmount?: number | null;
  pointsExpireInDays?: number | null;
  assignTierId?: string | null;
  upgradeTierId?: string | null;
  activeFrom?: Date | string | null;
  activeUntil?: Date | string | null;
  autoArchiveAt?: Date | string | null;
  isHighlighted?: boolean;
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
  ) {}

  async listMechanics(merchantId: string, status?: MechanicStatus | 'ALL') {
    const where: Prisma.LoyaltyMechanicWhereInput = { merchantId };
    if (status && status !== 'ALL') {
      where.status = status;
    }
    
    const mechanics = await this.prisma.loyaltyMechanic.findMany({ where, orderBy: { createdAt: 'desc' } });
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
      this.metrics.inc('portal_loyalty_mechanics_changed_total', { action: 'create' });
    } catch {}
    return mechanic;
  }

  async updateMechanic(merchantId: string, mechanicId: string, payload: MechanicPayload) {
    const mechanic = await this.prisma.loyaltyMechanic.findFirst({ where: { merchantId, id: mechanicId } });
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
      this.metrics.inc('portal_loyalty_mechanics_changed_total', { action: 'update' });
    } catch {}
    return updated;
  }

  async changeMechanicStatus(merchantId: string, mechanicId: string, status: MechanicStatus, actorId?: string) {
    const mechanic = await this.prisma.loyaltyMechanic.findFirst({ where: { merchantId, id: mechanicId } });
    if (!mechanic) throw new NotFoundException('Механика не найдена');
    const updated = await this.prisma.loyaltyMechanic.update({
      where: { id: mechanicId },
      data: {
        status,
        updatedById: actorId ?? mechanic.updatedById,
        enabledAt: status === MechanicStatus.ENABLED ? new Date() : mechanic.enabledAt,
        disabledAt: status === MechanicStatus.DISABLED ? new Date() : mechanic.disabledAt,
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
      this.metrics.inc('portal_loyalty_mechanics_changed_total', { action: 'status' });
    } catch {}
    return updated;
  }

  async deleteMechanic(merchantId: string, mechanicId: string) {
    const mechanic = await this.prisma.loyaltyMechanic.findFirst({ where: { merchantId, id: mechanicId } });
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
      this.metrics.inc('portal_loyalty_mechanics_changed_total', { action: 'delete' });
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
      include: { metrics: true },
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
    if (!payload.name?.trim()) throw new BadRequestException('Название акции обязательно');

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
      this.metrics.inc('portal_loyalty_promotions_changed_total', { action: 'create' });
    } catch {}
    return promotion;
  }

  async updatePromotion(merchantId: string, promotionId: string, payload: PromotionPayload) {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({ where: { merchantId, id: promotionId } });
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
        pointsExpireInDays: payload.pointsExpireInDays ?? promotion.pointsExpireInDays,
        pushTemplateStartId: payload.pushTemplateStartId ?? promotion.pushTemplateStartId,
        pushTemplateReminderId: payload.pushTemplateReminderId ?? promotion.pushTemplateReminderId,
        pushOnStart: payload.pushOnStart ?? promotion.pushOnStart,
        pushReminderEnabled: payload.pushReminderEnabled ?? promotion.pushReminderEnabled,
        reminderOffsetHours: payload.reminderOffsetHours ?? promotion.reminderOffsetHours,
        autoLaunch: payload.autoLaunch ?? promotion.autoLaunch,
        startAt: payload.startAt ? new Date(payload.startAt) : promotion.startAt,
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
      this.metrics.inc('portal_loyalty_promotions_changed_total', { action: 'update' });
    } catch {}
    return updated;
  }

  async changePromotionStatus(merchantId: string, promotionId: string, status: PromotionStatus, actorId?: string) {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({ where: { merchantId, id: promotionId } });
    if (!promotion) throw new NotFoundException('Акция не найдена');

    const updated = await this.prisma.loyaltyPromotion.update({
      where: { id: promotionId },
      data: {
        status,
        updatedById: actorId ?? promotion.updatedById,
        launchedAt: status === PromotionStatus.ACTIVE ? new Date() : promotion.launchedAt,
        archivedAt: status === PromotionStatus.ARCHIVED ? new Date() : promotion.archivedAt,
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
      this.metrics.inc('portal_loyalty_promotions_changed_total', { action: 'status' });
    } catch {}
    return updated;
  }

  async bulkUpdatePromotionStatus(merchantId: string, promotionIds: string[], status: PromotionStatus, actorId?: string) {
    if (!promotionIds.length) return { updated: 0 };
    const results = await this.prisma.$transaction(
      promotionIds.map((id) =>
        this.prisma.loyaltyPromotion.updateMany({
          where: { id, merchantId },
          data: {
            status,
            updatedById: actorId ?? undefined,
            launchedAt: status === PromotionStatus.ACTIVE ? new Date() : undefined,
            archivedAt: status === PromotionStatus.ARCHIVED ? new Date() : undefined,
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
      this.metrics.inc('portal_loyalty_promotions_changed_total', { action: 'bulk-status' }, updated || 1);
    } catch {}
    return { updated };
  }

  async listPromoCodes(merchantId: string, status?: PromoCodeStatus | 'ALL') {
    const where: Prisma.PromoCodeWhereInput = { merchantId };
    if (status && status !== 'ALL') where.status = status;

    const promoCodes = await this.prisma.promoCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { metrics: true },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promocodes.list',
          merchantId,
          status: status ?? 'ALL',
          total: promoCodes.length,
        }),
      );
      this.metrics.inc('portal_loyalty_promocodes_list_total');
    } catch {}
    return promoCodes;
  }

  async createPromoCode(merchantId: string, payload: PromoCodePayload) {
    if (!payload.code?.trim()) throw new BadRequestException('Код обязателен');
    const exists = await this.prisma.promoCode.findFirst({ where: { merchantId, code: payload.code.trim() } });
    if (exists) throw new BadRequestException('Промокод уже существует');

    const promoCode = await this.prisma.promoCode.create({
      data: {
        merchantId,
        code: payload.code.trim(),
        name: payload.name ?? null,
        description: payload.description ?? null,
        status: payload.status ?? PromoCodeStatus.DRAFT,
        segmentId: payload.segmentId ?? null,
        usageLimitType: payload.usageLimitType ?? PromoCodeUsageLimitType.UNLIMITED,
        usageLimitValue: payload.usageLimitValue ?? null,
        cooldownDays: payload.cooldownDays ?? null,
        perCustomerLimit: payload.perCustomerLimit ?? null,
        requireVisit: payload.requireVisit ?? false,
        visitLookbackHours: payload.visitLookbackHours ?? null,
        grantPoints: payload.grantPoints ?? false,
        pointsAmount: payload.pointsAmount ?? null,
        pointsExpireInDays: payload.pointsExpireInDays ?? null,
        assignTierId: payload.assignTierId ?? null,
        upgradeTierId: payload.upgradeTierId ?? null,
        activeFrom: payload.activeFrom ? new Date(payload.activeFrom) : null,
        activeUntil: payload.activeUntil ? new Date(payload.activeUntil) : null,
        autoArchiveAt: payload.autoArchiveAt ? new Date(payload.autoArchiveAt) : null,
        isHighlighted: payload.isHighlighted ?? false,
        metadata: payload.metadata ?? null,
        createdById: payload.actorId ?? null,
        updatedById: payload.actorId ?? null,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promocodes.create',
          merchantId,
          promoCodeId: promoCode.id,
          status: promoCode.status,
        }),
      );
      this.metrics.inc('portal_loyalty_promocodes_changed_total', { action: 'create' });
    } catch {}
    return promoCode;
  }

  async updatePromoCode(merchantId: string, promoCodeId: string, payload: PromoCodePayload) {
    const promoCode = await this.prisma.promoCode.findFirst({ where: { merchantId, id: promoCodeId } });
    if (!promoCode) throw new NotFoundException('Промокод не найден');

    const updated = await this.prisma.promoCode.update({
      where: { id: promoCodeId },
      data: {
        code: payload.code?.trim() ?? promoCode.code,
        name: payload.name ?? promoCode.name,
        description: payload.description ?? promoCode.description,
        status: payload.status ?? promoCode.status,
        segmentId: payload.segmentId ?? promoCode.segmentId,
        usageLimitType: payload.usageLimitType ?? promoCode.usageLimitType,
        usageLimitValue: payload.usageLimitValue ?? promoCode.usageLimitValue,
        cooldownDays: payload.cooldownDays ?? promoCode.cooldownDays,
        perCustomerLimit: payload.perCustomerLimit ?? promoCode.perCustomerLimit,
        requireVisit: payload.requireVisit ?? promoCode.requireVisit,
        visitLookbackHours: payload.visitLookbackHours ?? promoCode.visitLookbackHours,
        grantPoints: payload.grantPoints ?? promoCode.grantPoints,
        pointsAmount: payload.pointsAmount ?? promoCode.pointsAmount,
        pointsExpireInDays: payload.pointsExpireInDays ?? promoCode.pointsExpireInDays,
        assignTierId: payload.assignTierId ?? promoCode.assignTierId,
        upgradeTierId: payload.upgradeTierId ?? promoCode.upgradeTierId,
        activeFrom: payload.activeFrom ? new Date(payload.activeFrom) : promoCode.activeFrom,
        activeUntil: payload.activeUntil ? new Date(payload.activeUntil) : promoCode.activeUntil,
        autoArchiveAt: payload.autoArchiveAt ? new Date(payload.autoArchiveAt) : promoCode.autoArchiveAt,
        isHighlighted: payload.isHighlighted ?? promoCode.isHighlighted,
        metadata: payload.metadata ?? promoCode.metadata,
        updatedById: payload.actorId ?? promoCode.updatedById,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promocodes.update',
          merchantId,
          promoCodeId,
          status: updated.status,
        }),
      );
      this.metrics.inc('portal_loyalty_promocodes_changed_total', { action: 'update' });
    } catch {}
    return updated;
  }

  async changePromoCodeStatus(merchantId: string, promoCodeId: string, status: PromoCodeStatus, actorId?: string) {
    const promoCode = await this.prisma.promoCode.findFirst({ where: { merchantId, id: promoCodeId } });
    if (!promoCode) throw new NotFoundException('Промокод не найден');

    const updated = await this.prisma.promoCode.update({
      where: { id: promoCodeId },
      data: {
        status,
        updatedById: actorId ?? promoCode.updatedById,
        archivedAt: status === PromoCodeStatus.ARCHIVED ? new Date() : promoCode.archivedAt,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promocodes.status',
          merchantId,
          promoCodeId,
          status,
        }),
      );
      this.metrics.inc('portal_loyalty_promocodes_changed_total', { action: 'status' });
    } catch {}
    return updated;
  }

  async bulkArchivePromoCodes(merchantId: string, promoCodeIds: string[], status: PromoCodeStatus, actorId?: string) {
    if (!promoCodeIds.length) return { updated: 0 };
    const results = await this.prisma.$transaction(
      promoCodeIds.map((id) =>
        this.prisma.promoCode.updateMany({
          where: { id, merchantId },
          data: {
            status,
            updatedById: actorId ?? undefined,
            archivedAt: status === PromoCodeStatus.ARCHIVED ? new Date() : undefined,
          },
        }),
      ),
    );

    const updated = results.reduce((acc, res) => acc + res.count, 0);
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promocodes.bulkStatus',
          merchantId,
          status,
          ids: promoCodeIds.length,
          updated,
        }),
      );
      this.metrics.inc('portal_loyalty_promocodes_changed_total', { action: 'bulk-status' }, updated || 1);
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
