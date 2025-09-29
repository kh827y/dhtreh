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
  usageLimit?: 'none' | 'once_total' | 'once_per_customer';
  usagePeriodEnabled?: boolean;
  usagePeriodDays?: number;
  recentVisitEnabled?: boolean;
  recentVisitHours?: number;
  validFrom?: string;
  validUntil?: string;
};

export type PromoCodeApplyResult = {
  promoCode: PromoCode;
  pointsIssued: number;
  pointsExpireInDays: number | null;
};

@Injectable()
export class PromoCodesService {
  private readonly logger = new Logger(PromoCodesService.name);

  constructor(private readonly prisma: PrismaService, private readonly metrics: MetricsService) {}

  private toMetadata(payload: PortalPromoCodePayload) {
    return {
      awardPoints: payload.awardPoints !== false,
      burn: {
        enabled: payload.burnEnabled ?? false,
        days: payload.burnEnabled ? Math.max(1, Number(payload.burnDays ?? 0)) : undefined,
      },
      level: {
        enabled: payload.levelEnabled ?? false,
        target: payload.levelEnabled ? payload.levelId ?? null : null,
      },
      usageLimit: payload.usageLimit ?? 'none',
      usagePeriod: {
        enabled: payload.usagePeriodEnabled ?? false,
        days: payload.usagePeriodEnabled ? Math.max(1, Number(payload.usagePeriodDays ?? 0)) : undefined,
      },
      requireRecentVisit: {
        enabled: payload.recentVisitEnabled ?? false,
        hours: payload.recentVisitEnabled ? Math.max(0, Number(payload.recentVisitHours ?? 0)) : undefined,
      },
    } satisfies Record<string, unknown>;
  }

  private normalizeStatus(scope?: string) {
    if (!scope) return undefined;
    if (scope.toUpperCase() === 'ACTIVE') return PromoCodeStatus.ACTIVE;
    if (scope.toUpperCase() === 'ARCHIVE') return PromoCodeStatus.ARCHIVED;
    return undefined;
  }

  private mapToPortalRow(row: Prisma.PromoCodeGetPayload<{ include: { metrics: true } }>) {
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
      totalUsed: row.metrics?.totalIssued ?? 0,
      metadata,
    };
  }

  async listForPortal(merchantId: string, scope?: string, limit = 200) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    const status = this.normalizeStatus(scope);
    const where: Prisma.PromoCodeWhereInput = { merchantId };
    if (status) {
      if (status === PromoCodeStatus.ARCHIVED) {
        where.status = { in: [PromoCodeStatus.ARCHIVED, PromoCodeStatus.EXPIRED, PromoCodeStatus.PAUSED] } as any;
      } else {
        where.status = status;
      }
    }

    const promoCodes = await this.prisma.promoCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { metrics: true },
      take: limit,
    });

    return { items: promoCodes.map((row) => this.mapToPortalRow(row)) };
  }

  private payloadToPrisma(merchantId: string, payload: PortalPromoCodePayload, status?: PromoCodeStatus) {
    const code = payload.code?.trim();
    if (!code) throw new BadRequestException('Код обязателен');

    const awardPoints = payload.awardPoints !== false;
    const points = awardPoints ? Math.max(0, Math.floor(Number(payload.points ?? 0))) : 0;
    const burnDays = payload.burnEnabled ? Math.max(1, Number(payload.burnDays ?? 0)) : null;
    const usageLimit = payload.usageLimit ?? 'none';
    let usageLimitType: PromoCodeUsageLimitType = PromoCodeUsageLimitType.UNLIMITED;
    let usageLimitValue: number | null = null;
    let perCustomerLimit: number | null = null;
    switch (usageLimit) {
      case 'once_total':
        usageLimitType = PromoCodeUsageLimitType.ONCE_TOTAL;
        usageLimitValue = 1;
        break;
      case 'once_per_customer':
        usageLimitType = PromoCodeUsageLimitType.ONCE_PER_CUSTOMER;
        perCustomerLimit = 1;
        break;
      default:
        usageLimitType = PromoCodeUsageLimitType.UNLIMITED;
    }

    const cooldownDays = payload.usagePeriodEnabled ? Math.max(1, Number(payload.usagePeriodDays ?? 0)) : null;
    const requireVisit = payload.recentVisitEnabled ?? false;
    const visitLookbackHours = requireVisit ? Math.max(0, Number(payload.recentVisitHours ?? 0)) : null;

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
      assignTierId: payload.levelEnabled ? payload.levelId ?? null : null,
      activeFrom: payload.validFrom ? new Date(payload.validFrom) : null,
      activeUntil: payload.validUntil ? new Date(payload.validUntil) : null,
      metadata: this.toMetadata(payload),
    } satisfies Prisma.PromoCodeUncheckedCreateInput;
  }

  async createFromPortal(merchantId: string, payload: PortalPromoCodePayload) {
    const data = this.payloadToPrisma(merchantId, payload);
    const exists = await this.prisma.promoCode.findFirst({ where: { merchantId, code: data.code } });
    if (exists) throw new BadRequestException('Промокод уже существует');
    const created = await this.prisma.promoCode.create({ data });
    try {
      this.logger.log(
        JSON.stringify({ event: 'portal.promocodes.create', merchantId, promoCodeId: created.id, status: created.status }),
      );
      this.metrics.inc('portal_promocodes_changed_total', { action: 'create' });
    } catch {}
    return created;
  }

  async updateFromPortal(merchantId: string, promoCodeId: string, payload: PortalPromoCodePayload) {
    const promoCode = await this.prisma.promoCode.findFirst({ where: { id: promoCodeId, merchantId } });
    if (!promoCode) throw new BadRequestException('Промокод не найден');

    const data = this.payloadToPrisma(merchantId, payload, promoCode.status);
    const updated = await this.prisma.promoCode.update({
      where: { id: promoCodeId },
      data,
    });
    try {
      this.logger.log(
        JSON.stringify({ event: 'portal.promocodes.update', merchantId, promoCodeId: updated.id, status: updated.status }),
      );
      this.metrics.inc('portal_promocodes_changed_total', { action: 'update' });
    } catch {}
    return updated;
  }

  async changeStatus(merchantId: string, promoCodeId: string, status: PromoCodeStatus) {
    const promoCode = await this.prisma.promoCode.findFirst({ where: { id: promoCodeId, merchantId } });
    if (!promoCode) throw new BadRequestException('Промокод не найден');
    const updated = await this.prisma.promoCode.update({
      where: { id: promoCodeId },
      data: {
        status,
        archivedAt: status === PromoCodeStatus.ARCHIVED ? new Date() : null,
      },
    });
    try {
      this.logger.log(
        JSON.stringify({ event: 'portal.promocodes.status', merchantId, promoCodeId: updated.id, status: updated.status }),
      );
      this.metrics.inc('portal_promocodes_changed_total', { action: 'status' });
    } catch {}
    return updated;
  }

  async findActiveByCode(merchantId: string, code: string) {
    if (!code?.trim()) return null;
    const promo = await this.prisma.promoCode.findFirst({ where: { merchantId, code: code.trim() } });
    if (!promo) return null;
    if (promo.status !== PromoCodeStatus.ACTIVE) return null;
    try {
      this.ensureUsageWindow(promo);
    } catch {
      return null;
    }
    return promo;
  }

  private ensureUsageWindow(promo: PromoCode) {
    const now = new Date();
    if (promo.activeFrom && promo.activeFrom > now) {
      throw new BadRequestException('Промокод ещё не активен');
    }
    if (promo.activeUntil && promo.activeUntil < now) {
      throw new BadRequestException('Промокод истёк');
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
    const promo = await tx.promoCode.findFirst({ where: { id: params.promoCodeId, merchantId: params.merchantId } });
    if (!promo) return null;
    if (promo.status !== PromoCodeStatus.ACTIVE) {
      throw new BadRequestException('Промокод не активен');
    }
    this.ensureUsageWindow(promo);

    // Lock row to avoid races on usage counters
    try {
      await tx.$executeRaw`SELECT id FROM "PromoCode" WHERE id = ${promo.id} FOR UPDATE`;
    } catch {}

    if (promo.requireVisit) {
      if (!params.customerId) throw new BadRequestException('Требуется клиент');
      const lookbackHours = promo.visitLookbackHours ?? 0;
      const since = lookbackHours > 0 ? new Date(Date.now() - lookbackHours * 3600 * 1000) : null;
      const visit = await tx.receipt.findFirst({
        where: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          ...(since ? { createdAt: { gte: since } } : {}),
        },
      });
      if (!visit) throw new BadRequestException('Промокод доступен только после визита');
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
          ? Math.ceil((existingByOrder.pointsExpireAt.getTime() - Date.now()) / (24 * 3600 * 1000))
          : null,
      };
    }

    const customerUsageCount = params.customerId
      ? await tx.promoCodeUsage.count({ where: { promoCodeId: promo.id, customerId: params.customerId } })
      : 0;

    // Usage limits
    if (promo.usageLimitType === PromoCodeUsageLimitType.ONCE_TOTAL) {
      const total = await tx.promoCodeUsage.count({ where: { promoCodeId: promo.id } });
      const limit = promo.usageLimitValue ?? 1;
      if (total >= limit) throw new BadRequestException('Лимит использований достигнут');
    } else if (promo.usageLimitType === PromoCodeUsageLimitType.ONCE_PER_CUSTOMER) {
      if (customerUsageCount >= 1) throw new BadRequestException('Клиент уже использовал этот промокод');
    } else if (promo.usageLimitType === PromoCodeUsageLimitType.LIMITED_PER_CUSTOMER) {
      const limit = promo.perCustomerLimit ?? 0;
      if (limit > 0 && customerUsageCount >= limit) {
        throw new BadRequestException('Достигнут лимит для клиента');
      }
    }

    if (promo.cooldownDays && promo.cooldownDays > 0) {
      const since = new Date(Date.now() - promo.cooldownDays * 24 * 3600 * 1000);
      const recent = await tx.promoCodeUsage.findFirst({
        where: { promoCodeId: promo.id, customerId: params.customerId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
      });
      if (recent) throw new BadRequestException('Промокод можно использовать позже');
    }

    const pointsIssued = promo.grantPoints ? Math.max(0, Math.floor(Number(promo.pointsAmount ?? 0))) : 0;
    const expiresInDays = promo.pointsExpireInDays ?? null;
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 3600 * 1000) : null;

    const usage = await tx.promoCodeUsage.create({
      data: {
        promoCodeId: promo.id,
        merchantId: params.merchantId,
        customerId: params.customerId,
        staffId: params.staffId ?? null,
        outletId: params.outletId ?? null,
        orderId: params.orderId ?? null,
        pointsIssued: pointsIssued > 0 ? pointsIssued : null,
        pointsExpireAt: expiresAt,
        reward: promo.assignTierId ? { tierId: promo.assignTierId } : null,
        metadata: promo.metadata ?? null,
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
        totalPointsIssued: pointsIssued > 0 ? { increment: pointsIssued } : undefined,
        totalCustomers:
          params.customerId && usage.customerId && customerUsageCount === 0
            ? { increment: 1 }
            : undefined,
        lastUsedAt: new Date(),
      },
    });

    if (promo.assignTierId) {
      await tx.loyaltyTierAssignment.upsert({
        where: { merchantId_customerId: { merchantId: params.merchantId, customerId: params.customerId } },
        create: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          tierId: promo.assignTierId,
          source: 'promocode',
          metadata: { promoCodeId: promo.id },
        },
        update: {
          tierId: promo.assignTierId,
          source: 'promocode',
          metadata: { promoCodeId: promo.id },
          updatedAt: new Date(),
        },
      });
    }

    try {
      this.metrics.inc('promocodes_redeemed_total');
    } catch {}

    return { promoCode: promo, pointsIssued, pointsExpireInDays: expiresInDays };
  }
}
