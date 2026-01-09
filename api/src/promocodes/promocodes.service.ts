import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  PromoCode,
  PromoCodeStatus,
  PromoCodeUsageLimitType,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';

export type PortalPromoCodePayload = {
  code: string;
  description?: string;
  awardPoints?: boolean;
  points?: number;
  burnEnabled?: boolean;
  burnDays?: number;
  levelEnabled?: boolean;
  levelId?: string;
  levelExpireDays?: number;
  usageLimit?: 'none' | 'once_total' | 'once_per_customer';
  usageLimitValue?: number;
  perCustomerLimit?: number;
  usagePeriodEnabled?: boolean;
  usagePeriodDays?: number;
  recentVisitEnabled?: boolean;
  recentVisitHours?: number;
  validFrom?: string;
  validUntil?: string;
  overwrite?: boolean;
};

export type PromoCodeApplyResult = {
  promoCode: PromoCode;
  pointsIssued: number;
  pointsExpireInDays: number | null;
  assignedTier?: {
    id: string;
    name: string | null;
    isHidden: boolean;
    expiresAt: Date | null;
  } | null;
};

@Injectable()
export class PromoCodesService {
  private readonly logger = new Logger(PromoCodesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  private logEvent(event: string, payload: Record<string, unknown>) {
    try {
      this.logger.log(JSON.stringify({ event, ...payload }));
    } catch {}
  }

  private incMetric(
    name: string,
    labels?: Record<string, string>,
    value?: number,
  ) {
    try {
      this.metrics.inc(name, labels, value);
    } catch {}
  }

  private logListEvent(merchantId: string, status: string, total: number) {
    this.logEvent('portal.loyalty.promocodes.list', {
      merchantId,
      status,
      total,
    });
    this.incMetric('portal_loyalty_promocodes_list_total');
  }

  private logChangeEvent(
    suffix: 'create' | 'update' | 'status' | 'bulkStatus',
    payload: Record<string, unknown>,
    action: 'create' | 'update' | 'status' | 'bulk-status',
    value = 1,
  ) {
    this.logEvent(`portal.promocodes.${suffix}`, payload);
    this.incMetric('portal_promocodes_changed_total', { action }, value);
    this.logEvent(`portal.loyalty.promocodes.${suffix}`, payload);
    this.incMetric(
      'portal_loyalty_promocodes_changed_total',
      { action },
      value,
    );
  }

  private toMetadata(payload: PortalPromoCodePayload) {
    const usageLimit =
      payload.usageLimit === 'once_total' ||
      payload.usageLimit === 'once_per_customer'
        ? payload.usageLimit
        : 'none';
    const usageLimitValue =
      usageLimit === 'once_total'
        ? Math.max(1, Number(payload.usageLimitValue ?? 1))
        : undefined;
    const perCustomerLimit =
      payload.perCustomerLimit != null
        ? Math.max(1, Math.floor(Number(payload.perCustomerLimit)))
        : undefined;
    return {
      awardPoints: payload.awardPoints !== false,
      burn: {
        enabled: payload.burnEnabled ?? false,
        days: payload.burnEnabled
          ? Math.max(1, Number(payload.burnDays ?? 0))
          : undefined,
      },
      level: {
        enabled: payload.levelEnabled ?? false,
        target: payload.levelEnabled ? (payload.levelId ?? null) : null,
        expiresInDays:
          payload.levelEnabled && payload.levelExpireDays != null
            ? Math.max(0, Number(payload.levelExpireDays ?? 0))
            : undefined,
      },
      usageLimit,
      usageLimitValue,
      perCustomerLimit,
      usagePeriod: {
        enabled: payload.usagePeriodEnabled ?? false,
        days: payload.usagePeriodEnabled
          ? Math.max(1, Number(payload.usagePeriodDays ?? 0))
          : undefined,
      },
      requireRecentVisit: {
        enabled: payload.recentVisitEnabled ?? false,
        hours: payload.recentVisitEnabled
          ? Math.max(0, Number(payload.recentVisitHours ?? 0))
          : undefined,
      },
    } satisfies Record<string, unknown>;
  }

  private normalizeStatus(scope?: string) {
    if (!scope) return undefined;
    if (scope.toUpperCase() === 'ACTIVE') return PromoCodeStatus.ACTIVE;
    if (scope.toUpperCase() === 'ARCHIVE') return PromoCodeStatus.ARCHIVED;
    return undefined;
  }

  private promoExpiredError() {
    return new BadRequestException('Срок действия промокода закончился.');
  }

  private promoUnavailableError() {
    return new BadRequestException('Промокод недоступен.');
  }

  private async archiveExpired(promo: PromoCode) {
    if (promo.status === PromoCodeStatus.ARCHIVED) return;
    try {
      await this.prisma.promoCode.update({
        where: { id: promo.id },
        data: {
          status: PromoCodeStatus.ARCHIVED,
          archivedAt: promo.archivedAt ?? new Date(),
        },
      });
    } catch {
      /* ignore archival failures */
    }
  }

  private mapToPortalRow(
    row: Prisma.PromoCodeGetPayload<{ include: { metrics: true } }>,
  ) {
    const metadata = (row.metadata as Record<string, any> | null) ?? null;
    const value = row.grantPoints ? Number(row.pointsAmount ?? 0) : 0;
    return {
      id: row.id,
      code: row.code,
      name: row.name ?? row.code,
      description: row.description ?? '',
      value,
      status: row.status,
      isActive: row.status === PromoCodeStatus.ACTIVE,
      validFrom: row.activeFrom ? row.activeFrom.toISOString() : null,
      validUntil: row.activeUntil ? row.activeUntil.toISOString() : null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      totalUsed: row.metrics?.totalIssued ?? 0,
      usageLimitType: row.usageLimitType,
      usageLimitValue: row.usageLimitValue ?? null,
      perCustomerLimit: row.perCustomerLimit ?? null,
      cooldownDays: row.cooldownDays ?? null,
      requireVisit: row.requireVisit ?? false,
      visitLookbackHours: row.visitLookbackHours ?? null,
      assignTierId: row.assignTierId ?? null,
      pointsExpireInDays: row.pointsExpireInDays ?? null,
      metadata,
    };
  }

  async listForPortal(
    merchantId: string,
    scope?: string,
    limit = 200,
    offset = 0,
  ) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    const status = this.normalizeStatus(scope);
    const where: Prisma.PromoCodeWhereInput = { merchantId };
    const now = new Date();
    const safeOffset = Number.isFinite(Number(offset))
      ? Math.max(0, Math.floor(Number(offset)))
      : 0;
    try {
      // Автоархив истёкших промокодов, чтобы они не висели в активных
      await this.prisma.promoCode.updateMany({
        where: {
          merchantId,
          activeUntil: { lt: now },
          status: PromoCodeStatus.ACTIVE,
        },
        data: {
          status: PromoCodeStatus.ARCHIVED,
          archivedAt: now,
        },
      });
    } catch {}
    if (status) {
      if (status === PromoCodeStatus.ARCHIVED) {
        where.status = {
          in: [PromoCodeStatus.ARCHIVED, PromoCodeStatus.EXPIRED],
        } as any;
      } else {
        where.status = status;
      }
    }

    const promoCodes = await this.prisma.promoCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { metrics: true },
      take: limit,
      skip: safeOffset,
    });

    const statusLabel = scope && scope !== 'ALL' ? scope : 'ALL';
    this.logListEvent(merchantId, statusLabel ?? 'ALL', promoCodes.length);

    return { items: promoCodes.map((row) => this.mapToPortalRow(row)) };
  }

  private payloadToPrisma(
    merchantId: string,
    payload: PortalPromoCodePayload,
    status?: PromoCodeStatus,
  ) {
    const code = payload.code?.trim();
    if (!code) throw new BadRequestException('Код обязателен');

    const awardPoints = payload.awardPoints !== false;
    const points = awardPoints
      ? Math.max(0, Math.floor(Number(payload.points ?? 0)))
      : 0;
    const burnDays = payload.burnEnabled
      ? Math.max(1, Number(payload.burnDays ?? 0))
      : null;
    const usageLimit = payload.usageLimit ?? 'none';
    const perCustomerLimitRaw =
      payload.perCustomerLimit != null
        ? Math.floor(Number(payload.perCustomerLimit))
        : null;
    const perCustomerLimitRequested =
      perCustomerLimitRaw != null && Number.isFinite(perCustomerLimitRaw)
        ? Math.max(1, perCustomerLimitRaw)
        : null;
    const usageLimitValueRaw =
      usageLimit === 'once_total'
        ? Math.max(1, Math.floor(Number(payload.usageLimitValue ?? 1)))
        : null;
    let usageLimitType: PromoCodeUsageLimitType =
      PromoCodeUsageLimitType.UNLIMITED;
    let usageLimitValue: number | null = null;
    let perCustomerLimit: number | null = null;
    switch (usageLimit) {
      case 'once_total':
        usageLimitType = PromoCodeUsageLimitType.ONCE_TOTAL;
        usageLimitValue = usageLimitValueRaw ?? 1;
        perCustomerLimit = perCustomerLimitRequested;
        break;
      case 'once_per_customer':
        usageLimitType = PromoCodeUsageLimitType.ONCE_PER_CUSTOMER;
        perCustomerLimit = 1;
        break;
      default:
        if (perCustomerLimitRequested != null) {
          usageLimitType = PromoCodeUsageLimitType.LIMITED_PER_CUSTOMER;
          perCustomerLimit = perCustomerLimitRequested;
        } else {
          usageLimitType = PromoCodeUsageLimitType.UNLIMITED;
        }
    }

    const cooldownDays = payload.usagePeriodEnabled
      ? Math.max(1, Number(payload.usagePeriodDays ?? 0))
      : null;
    const requireVisit = payload.recentVisitEnabled ?? false;
    const visitLookbackHours = requireVisit
      ? Math.max(0, Number(payload.recentVisitHours ?? 0))
      : null;

    const activeFrom = payload.validFrom ? new Date(payload.validFrom) : null;
    const activeUntil = payload.validUntil
      ? new Date(payload.validUntil)
      : null;
    if (activeFrom && Number.isNaN(activeFrom.getTime())) {
      throw new BadRequestException('Некорректная дата начала');
    }
    if (activeUntil && Number.isNaN(activeUntil.getTime())) {
      throw new BadRequestException('Некорректная дата окончания');
    }
    if (activeFrom && activeUntil && activeUntil < activeFrom) {
      throw new BadRequestException(
        'Дата окончания не может быть раньше даты начала',
      );
    }

    return {
      merchantId,
      code,
      name: code,
      description: payload.description?.trim() || null,
      status: status ?? PromoCodeStatus.ACTIVE,
      usageLimitType,
      usageLimitValue,
      perCustomerLimit,
      cooldownDays,
      requireVisit,
      visitLookbackHours,
      grantPoints: awardPoints,
      pointsAmount: awardPoints ? points : null,
      pointsExpireInDays: burnDays,
      assignTierId: payload.levelEnabled ? (payload.levelId ?? null) : null,
      activeFrom,
      activeUntil,
      metadata: this.toMetadata(payload),
    } satisfies Prisma.PromoCodeUncheckedCreateInput;
  }

  async createFromPortal(merchantId: string, payload: PortalPromoCodePayload) {
    if (payload.levelEnabled) {
      if (!payload.levelId) {
        throw new BadRequestException('Уровень лояльности обязателен');
      }
      const tier = await this.prisma.loyaltyTier.findFirst({
        where: { id: payload.levelId, merchantId },
        select: { id: true },
      });
      if (!tier) {
        throw new BadRequestException('Уровень лояльности не найден');
      }
    }
    const data = this.payloadToPrisma(merchantId, payload);
    const existing = await this.prisma.promoCode.findFirst({
      where: { merchantId, code: data.code },
    });

    // Разрешаем переиспользовать код, если предыдущий в архиве/истёк
    if (existing) {
      const overwrite = payload.overwrite === true;
      const expired =
        existing.activeUntil && existing.activeUntil < new Date()
          ? true
          : false;
      const archivedLike =
        existing.status === PromoCodeStatus.ARCHIVED ||
        existing.status === PromoCodeStatus.EXPIRED ||
        expired;
      if (archivedLike || overwrite) {
        const updated = await this.prisma.promoCode.update({
          where: { id: existing.id },
          data: {
            ...data,
            status: PromoCodeStatus.ACTIVE,
            archivedAt: null,
          },
        });
        this.logChangeEvent(
          'create',
          { merchantId, promoCodeId: updated.id, status: updated.status },
          'create',
        );
        return updated;
      }
      throw new BadRequestException(
        'Промокод с таким названием уже существует, перезаписать?',
      );
    }

    const created = await this.prisma.promoCode.create({ data });
    this.logChangeEvent(
      'create',
      { merchantId, promoCodeId: created.id, status: created.status },
      'create',
    );
    return created;
  }

  async updateFromPortal(
    merchantId: string,
    promoCodeId: string,
    payload: PortalPromoCodePayload,
  ) {
    if (payload.levelEnabled) {
      if (!payload.levelId) {
        throw new BadRequestException('Уровень лояльности обязателен');
      }
      const tier = await this.prisma.loyaltyTier.findFirst({
        where: { id: payload.levelId, merchantId },
        select: { id: true },
      });
      if (!tier) {
        throw new BadRequestException('Уровень лояльности не найден');
      }
    }
    const promoCode = await this.prisma.promoCode.findFirst({
      where: { id: promoCodeId, merchantId },
    });
    if (!promoCode) throw new BadRequestException('Промокод не найден');

    const overwrite = payload.overwrite === true;
    const data = this.payloadToPrisma(merchantId, payload, promoCode.status);
    if (data.code !== promoCode.code) {
      const conflict = await this.prisma.promoCode.findFirst({
        where: { merchantId, code: data.code, id: { not: promoCodeId } },
      });
      if (conflict) {
        if (!overwrite) {
          throw new BadRequestException(
            'Промокод с таким названием уже существует, перезаписать?',
          );
        }
        await this.prisma.$transaction([
          this.prisma.promoCodeUsage.deleteMany({
            where: { promoCodeId: conflict.id },
          }),
          this.prisma.promoCodeMetric.deleteMany({
            where: { promoCodeId: conflict.id },
          }),
          this.prisma.promoCode.delete({ where: { id: conflict.id } }),
        ]);
      }
    }
    const updated = await this.prisma.promoCode.update({
      where: { id: promoCodeId },
      data,
    });
    this.logChangeEvent(
      'update',
      { merchantId, promoCodeId: updated.id, status: updated.status },
      'update',
    );
    return updated;
  }

  async changeStatus(
    merchantId: string,
    promoCodeId: string,
    status: PromoCodeStatus,
    actorId?: string,
  ) {
    const promoCode = await this.prisma.promoCode.findFirst({
      where: { id: promoCodeId, merchantId },
    });
    if (!promoCode) throw new BadRequestException('Промокод не найден');
    const updated = await this.prisma.promoCode.update({
      where: { id: promoCodeId },
      data: {
        status,
        archivedAt:
          status === PromoCodeStatus.ARCHIVED
            ? new Date()
            : promoCode.archivedAt,
        updatedById: actorId ?? promoCode.updatedById ?? null,
      },
    });
    this.logChangeEvent(
      'status',
      { merchantId, promoCodeId: updated.id, status: updated.status },
      'status',
    );
    return updated;
  }

  async findActiveByCode(merchantId: string, code: string) {
    if (!code?.trim()) return null;
    const promo = await this.prisma.promoCode.findFirst({
      where: { merchantId, code: code.trim() },
    });
    if (!promo) return null;
    const now = new Date();
    if (promo.activeUntil && promo.activeUntil < now) {
      await this.archiveExpired(promo);
      throw this.promoExpiredError();
    }
    if (promo.status !== PromoCodeStatus.ACTIVE) {
      if (promo.activeUntil && promo.activeUntil < now) {
        throw this.promoExpiredError();
      }
      return null;
    }
    this.ensureUsageWindow(promo);
    return promo;
  }

  async requireActiveByCode(merchantId: string, code: string) {
    const promo = await this.prisma.promoCode.findFirst({
      where: { merchantId, code: code.trim() },
    });
    if (!promo) throw this.promoUnavailableError();
    const now = new Date();
    if (promo.activeUntil && promo.activeUntil < now) {
      await this.archiveExpired(promo);
      throw this.promoExpiredError();
    }
    if (promo.status !== PromoCodeStatus.ACTIVE) {
      if (promo.activeUntil && promo.activeUntil < now) {
        throw this.promoExpiredError();
      }
      throw this.promoUnavailableError();
    }
    this.ensureUsageWindow(promo);
    return promo;
  }

  private ensureUsageWindow(promo: PromoCode) {
    const now = new Date();
    if (promo.activeFrom && promo.activeFrom > now) {
      throw new BadRequestException('Промокод ещё не активен');
    }
    if (promo.activeUntil && promo.activeUntil < now) {
      throw new BadRequestException('Срок действия промокода закончился');
    }
  }

  async apply(
    tx: Prisma.TransactionClient,
    params: {
      promoCodeId: string;
      merchantId: string;
      customerId: string;
      staffId?: string | null;
      outletId?: string | null;
      orderId?: string | null;
    },
  ): Promise<PromoCodeApplyResult | null> {
    const promo = await tx.promoCode.findFirst({
      where: { id: params.promoCodeId, merchantId: params.merchantId },
    });
    if (!promo) return null;
    const now = new Date();
    if (promo.activeUntil && promo.activeUntil < now) {
      await this.archiveExpired(promo);
      throw this.promoExpiredError();
    }
    if (promo.status !== PromoCodeStatus.ACTIVE) {
      if (promo.activeUntil && promo.activeUntil < now) {
        throw this.promoExpiredError();
      }
      throw this.promoUnavailableError();
    }
    this.ensureUsageWindow(promo);
    const meta = (promo.metadata as any) ?? {};
    const levelExpiresInDaysRaw =
      meta?.level?.expiresInDays != null ? Number(meta.level.expiresInDays) : 0;
    const levelExpiresInDays = Number.isFinite(levelExpiresInDaysRaw)
      ? Math.max(0, levelExpiresInDaysRaw)
      : 0;

    let assignedTier: {
      id: string;
      name: string | null;
      isHidden: boolean;
      expiresAt: Date | null;
    } | null = null;
    let tierExpiresAt: Date | null = null;
    let targetTier: {
      id: string;
      name: string | null;
      isHidden: boolean;
      thresholdAmount: number | null;
    } | null = null;

    if (promo.assignTierId) {
      targetTier = await tx.loyaltyTier.findFirst({
        where: { id: promo.assignTierId, merchantId: params.merchantId },
        select: {
          id: true,
          name: true,
          isHidden: true,
          thresholdAmount: true,
        },
      });
      if (targetTier) {
        const currentAssign = await tx.loyaltyTierAssignment.findFirst({
          where: {
            merchantId: params.merchantId,
            customerId: params.customerId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { tier: true },
          orderBy: { assignedAt: 'desc' },
        });
        if (
          !targetTier.isHidden &&
          currentAssign?.tier &&
          !currentAssign.tier.isHidden
        ) {
          const currentThreshold = Number(
            currentAssign.tier.thresholdAmount ?? 0,
          );
          const targetThreshold = Number(targetTier.thresholdAmount ?? 0);
          if (
            Number.isFinite(currentThreshold) &&
            Number.isFinite(targetThreshold) &&
            currentThreshold > targetThreshold
          ) {
            throw new BadRequestException(
              'Вы имеете уровень выше чем дает промокод!',
            );
          }
        }
        if (levelExpiresInDays > 0) {
          tierExpiresAt = new Date(
            Date.now() + levelExpiresInDays * 24 * 3600 * 1000,
          );
        }
      }
    }

    // Lock row to avoid races on usage counters
    try {
      await tx.$executeRaw`SELECT id FROM "PromoCode" WHERE id = ${promo.id} FOR UPDATE`;
    } catch {}

    if (promo.requireVisit) {
      if (!params.customerId) throw new BadRequestException('Требуется клиент');
      const lookbackHours = promo.visitLookbackHours ?? 0;
      const since =
        lookbackHours > 0
          ? new Date(Date.now() - lookbackHours * 3600 * 1000)
          : null;
      const visit = await tx.receipt.findFirst({
        where: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          ...(since ? { createdAt: { gte: since } } : {}),
        },
      });
      if (!visit)
        throw new BadRequestException('Промокод доступен только после визита');
    }

    const existingByOrder = params.orderId
      ? await tx.promoCodeUsage.findFirst({
          where: { promoCodeId: promo.id, orderId: params.orderId },
        })
      : null;
    if (existingByOrder) {
      return {
        promoCode: promo,
        pointsIssued: existingByOrder.pointsIssued ?? 0,
        pointsExpireInDays: existingByOrder.pointsExpireAt
          ? Math.ceil(
              (existingByOrder.pointsExpireAt.getTime() - Date.now()) /
                (24 * 3600 * 1000),
            )
          : null,
      };
    }

    const customerUsageCount = params.customerId
      ? await tx.promoCodeUsage.count({
          where: { promoCodeId: promo.id, customerId: params.customerId },
        })
      : 0;

    // Usage limits
    if (promo.usageLimitType === PromoCodeUsageLimitType.ONCE_TOTAL) {
      const total = await tx.promoCodeUsage.count({
        where: { promoCodeId: promo.id },
      });
      const limit = promo.usageLimitValue ?? 1;
      if (total >= limit)
        throw new BadRequestException('Лимит промокода исчерпан.');
      const perCustomer = promo.perCustomerLimit;
      const normalizedPerCustomer =
        perCustomer != null &&
        Number.isFinite(Number(perCustomer)) &&
        Number(perCustomer) > 0
          ? Number(perCustomer)
          : null;
      if (normalizedPerCustomer && customerUsageCount >= normalizedPerCustomer) {
        if (normalizedPerCustomer <= 1) {
          throw new BadRequestException('Вы уже использовали этот промокод.');
        }
        throw new BadRequestException('Достигнут лимит для клиента');
      }
    } else if (
      promo.usageLimitType === PromoCodeUsageLimitType.ONCE_PER_CUSTOMER
    ) {
      if (customerUsageCount >= 1)
        throw new BadRequestException('Вы уже использовали этот промокод.');
    } else if (
      promo.usageLimitType === PromoCodeUsageLimitType.LIMITED_PER_CUSTOMER
    ) {
      const limit = promo.perCustomerLimit ?? 0;
      if (limit > 0 && customerUsageCount >= limit) {
        throw new BadRequestException('Достигнут лимит для клиента');
      }
    }

    if (promo.cooldownDays && promo.cooldownDays > 0) {
      const since = new Date(
        Date.now() - promo.cooldownDays * 24 * 3600 * 1000,
      );
      const recent = await tx.promoCodeUsage.findFirst({
        where: {
          promoCodeId: promo.id,
          customerId: params.customerId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recent)
        throw new BadRequestException('Промокод можно использовать позже');
    }

    const pointsIssued = promo.grantPoints
      ? Math.max(0, Math.floor(Number(promo.pointsAmount ?? 0)))
      : 0;
    const expiresInDays = promo.pointsExpireInDays ?? null;
    const pointsExpireAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 3600 * 1000)
      : null;

    const usage = await tx.promoCodeUsage.create({
      data: {
        promoCodeId: promo.id,
        merchantId: params.merchantId,
        customerId: params.customerId,
        staffId: params.staffId ?? null,
        outletId: params.outletId ?? null,
        orderId: params.orderId ?? null,
        pointsIssued: pointsIssued > 0 ? pointsIssued : null,
        pointsExpireAt,
        reward: promo.assignTierId
          ? ({ tierId: promo.assignTierId } as Prisma.InputJsonValue)
          : (Prisma.JsonNull as Prisma.NullableJsonNullValueInput),
        metadata:
          promo.metadata != null
            ? (promo.metadata as Prisma.InputJsonValue)
            : (Prisma.JsonNull as Prisma.NullableJsonNullValueInput),
      },
    });

    await tx.promoCodeMetric.upsert({
      where: { promoCodeId: promo.id },
      create: {
        promoCodeId: promo.id,
        merchantId: params.merchantId,
        totalIssued: 1,
        totalPointsIssued: pointsIssued,
        totalCustomers: params.customerId ? 1 : 0,
        totalRedeemed: 0,
        usageByStatus: {},
      },
      update: {
        totalIssued: { increment: 1 },
        totalPointsIssued:
          pointsIssued > 0 ? { increment: pointsIssued } : undefined,
        totalCustomers:
          params.customerId && usage.customerId && customerUsageCount === 0
            ? { increment: 1 }
            : undefined,
        lastUsedAt: new Date(),
      },
    });

    if (promo.assignTierId && targetTier) {
      await tx.loyaltyTierAssignment.upsert({
        where: {
          merchantId_customerId: {
            merchantId: params.merchantId,
            customerId: params.customerId,
          },
        },
        create: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          tierId: promo.assignTierId,
          source: 'promocode',
          metadata: { promoCodeId: promo.id },
          assignedAt: new Date(),
          expiresAt: tierExpiresAt,
        },
        update: {
          tierId: promo.assignTierId,
          source: 'promocode',
          metadata: { promoCodeId: promo.id },
          updatedAt: new Date(),
          assignedAt: new Date(),
          expiresAt: tierExpiresAt,
        },
      });
      assignedTier = {
        id: targetTier.id,
        name: targetTier.name ?? null,
        isHidden: targetTier.isHidden ?? false,
        expiresAt: tierExpiresAt,
      };
    }

    try {
      this.metrics.inc('promocodes_redeemed_total');
    } catch {}

    return {
      promoCode: promo,
      pointsIssued,
      pointsExpireInDays: expiresInDays,
      assignedTier,
    };
  }
}
