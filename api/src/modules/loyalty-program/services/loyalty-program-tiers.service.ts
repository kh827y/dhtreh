import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { PromotionRulesService } from './promotion-rules.service';
import { ensureBaseTier } from '../../loyalty/utils/tier-defaults.util';
import type {
  TierDto,
  TierMembersResponse,
  TierPayload,
} from '../loyalty-program.types';
import { cloneRecord } from '../loyalty-program.utils';
import { logEvent, safeMetric } from '../../../shared/logging/event-log.util';

@Injectable()
export class LoyaltyProgramTiersService {
  private readonly logger = new Logger(LoyaltyProgramTiersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly promotionRules: PromotionRulesService,
  ) {}

  private sanitizeAmount(value: number | null | undefined, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.floor(n));
  }

  private extractMinPayment(
    metadata: Prisma.JsonValue | null | undefined,
  ): number | null {
    const meta =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : null;
    if (!meta) return null;
    const raw = meta.minPaymentAmount ?? meta.minPayment;
    if (raw == null) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
  }

  private mapTier(
    tier: Prisma.LoyaltyTierGetPayload<object>,
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
      minPaymentAmount: this.extractMinPayment(tier.metadata),
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
    await ensureBaseTier(this.prisma, merchantId).catch(() => null);
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
    logEvent(this.logger, 'portal.loyalty.tiers.list', {
      merchantId,
      total: tiers.length,
    });
    safeMetric(this.metrics, 'portal_loyalty_tiers_list_total');
    return tiers.map((tier) =>
      this.mapTier(tier, assignmentsMap.get(tier.id) ?? 0),
    );
  }

  async getTier(merchantId: string, tierId: string): Promise<TierDto> {
    await ensureBaseTier(this.prisma, merchantId).catch(() => null);
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

  async listTierCustomers(
    merchantId: string,
    tierId: string,
    params?: { limit?: number; cursor?: string },
  ): Promise<TierMembersResponse> {
    const tier = await this.prisma.loyaltyTier.findFirst({
      where: { merchantId, id: tierId },
    });
    if (!tier) throw new NotFoundException('Уровень не найден');

    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const cursorId =
      params?.cursor && params.cursor.trim() ? params.cursor.trim() : null;
    const cursorRow = cursorId
      ? await this.prisma.loyaltyTierAssignment.findFirst({
          where: { merchantId, tierId, id: cursorId },
          select: { id: true, assignedAt: true },
        })
      : null;
    const activeWhere = {
      merchantId,
      tierId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
    const cursorWhere = cursorRow
      ? {
          OR: [
            { assignedAt: { lt: cursorRow.assignedAt } },
            {
              assignedAt: cursorRow.assignedAt,
              id: { lt: cursorRow.id },
            },
          ],
        }
      : {};
    const assignments = await this.prisma.loyaltyTierAssignment.findMany({
      where: { ...activeWhere, ...cursorWhere },
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const customerIds = Array.from(
      new Set(assignments.map((row) => row.customerId)),
    );
    const customers = customerIds.length
      ? await this.prisma.customer.findMany({
          where: { merchantId, id: { in: customerIds } },
          select: { id: true, name: true, phone: true, createdAt: true },
        })
      : [];
    const stats = customerIds.length
      ? await this.prisma.customerStats.findMany({
          where: { merchantId, customerId: { in: customerIds } },
          select: { customerId: true, totalSpent: true, firstSeenAt: true },
        })
      : [];
    const custMap = new Map(customers.map((c) => [c.id, c]));
    const statsMap = new Map(stats.map((s) => [s.customerId, s]));
    const items = assignments.slice(0, limit).map((row) => {
      const profile = custMap.get(row.customerId);
      const stat = statsMap.get(row.customerId);
      const seenAt = stat?.firstSeenAt ?? profile?.createdAt ?? null;
      return {
        customerId: row.customerId,
        name: profile?.name ?? null,
        phone: profile?.phone ?? null,
        assignedAt: row.assignedAt.toISOString(),
        source: row.source ?? null,
        totalSpent: stat?.totalSpent ?? null,
        firstSeenAt: seenAt ? new Date(seenAt).toISOString() : null,
      };
    });
    const total = await this.prisma.loyaltyTierAssignment.count({
      where: activeWhere,
    });
    const nextCursor =
      assignments.length > limit ? assignments[limit].id : null;
    return { tierId, total, items, nextCursor };
  }

  async createTier(merchantId: string, payload: TierPayload): Promise<TierDto> {
    if (!payload?.name?.trim())
      throw new BadRequestException('Название обязательно');
    const name = payload.name.trim();
    this.promotionRules.assertNonNegativeNumber(
      payload.thresholdAmount,
      'thresholdAmount',
    );
    this.promotionRules.assertNonNegativeNumber(
      payload.earnRatePercent,
      'earnRatePercent',
    );
    if (
      payload.redeemRatePercent !== null &&
      payload.redeemRatePercent !== undefined
    ) {
      this.promotionRules.assertNonNegativeNumber(
        payload.redeemRatePercent,
        'redeemRatePercent',
      );
    }
    if (
      payload.minPaymentAmount !== null &&
      payload.minPaymentAmount !== undefined
    ) {
      this.promotionRules.assertNonNegativeNumber(
        payload.minPaymentAmount,
        'minPaymentAmount',
      );
    }
    const thresholdAmount = this.sanitizeAmount(payload.thresholdAmount, 0);
    const earnRateBps = this.promotionRules.sanitizePercent(
      payload.earnRatePercent,
      0,
    );
    const redeemRateBps =
      payload.redeemRatePercent != null
        ? this.promotionRules.sanitizePercent(payload.redeemRatePercent, 0)
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
      if (isInitial && isHidden) {
        throw new BadRequestException('Нельзя скрыть стартовый уровень');
      }
      if (isInitial) {
        await tx.loyaltyTier.updateMany({
          where: { merchantId, isInitial: true },
          data: { isInitial: false, isDefault: false },
        });
      }
      const nameExists = await tx.loyaltyTier.findFirst({
        where: {
          merchantId,
          name: { equals: name, mode: 'insensitive' },
        },
      });
      if (nameExists) {
        throw new BadRequestException(
          'Уровень с таким названием уже существует',
        );
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

    logEvent(this.logger, 'portal.loyalty.tiers.create', {
      merchantId,
      tierId: created.id,
    });
    safeMetric(this.metrics, 'portal_loyalty_tiers_write_total', {
      action: 'create',
    });
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
    if (
      payload.thresholdAmount !== null &&
      payload.thresholdAmount !== undefined
    ) {
      this.promotionRules.assertNonNegativeNumber(
        payload.thresholdAmount,
        'thresholdAmount',
      );
    }
    if (
      payload.earnRatePercent !== null &&
      payload.earnRatePercent !== undefined
    ) {
      this.promotionRules.assertNonNegativeNumber(
        payload.earnRatePercent,
        'earnRatePercent',
      );
    }
    if (
      payload.redeemRatePercent !== null &&
      payload.redeemRatePercent !== undefined
    ) {
      this.promotionRules.assertNonNegativeNumber(
        payload.redeemRatePercent,
        'redeemRatePercent',
      );
    }
    if (
      payload.minPaymentAmount !== null &&
      payload.minPaymentAmount !== undefined
    ) {
      this.promotionRules.assertNonNegativeNumber(
        payload.minPaymentAmount,
        'minPaymentAmount',
      );
    }
    const thresholdAmount =
      payload.thresholdAmount != null
        ? this.sanitizeAmount(payload.thresholdAmount, tier.thresholdAmount)
        : tier.thresholdAmount;
    const earnRateBps =
      payload.earnRatePercent != null
        ? this.promotionRules.sanitizePercent(
            payload.earnRatePercent,
            tier.earnRateBps,
          )
        : tier.earnRateBps;
    const redeemRateBps =
      payload.redeemRatePercent != null
        ? this.promotionRules.sanitizePercent(
            payload.redeemRatePercent,
            tier.redeemRateBps ?? 0,
          )
        : payload.redeemRatePercent === null
          ? null
          : tier.redeemRateBps;
    const minPaymentAmount =
      payload.minPaymentAmount != null
        ? this.sanitizeAmount(payload.minPaymentAmount, 0)
        : this.extractMinPayment(tier.metadata);
    const metadataBase = cloneRecord(tier.metadata);
    if (metadataBase.value === 'JsonNull') delete metadataBase.value;
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
      if (tier.isInitial && payload.isInitial === false) {
        throw new BadRequestException('Нельзя снять статус стартового уровня');
      }
      if (isInitial && isHidden) {
        throw new BadRequestException('Нельзя скрыть стартовый уровень');
      }
      if (isInitial && !tier.isInitial) {
        await tx.loyaltyTier.updateMany({
          where: { merchantId, isInitial: true, NOT: { id: tierId } },
          data: { isInitial: false, isDefault: false },
        });
      }
      if (name) {
        const nameExists = await tx.loyaltyTier.findFirst({
          where: {
            merchantId,
            name: { equals: name, mode: 'insensitive' },
            NOT: { id: tierId },
          },
        });
        if (nameExists) {
          throw new BadRequestException(
            'Уровень с таким названием уже существует',
          );
        }
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

    logEvent(this.logger, 'portal.loyalty.tiers.update', {
      merchantId,
      tierId,
    });
    safeMetric(this.metrics, 'portal_loyalty_tiers_write_total', {
      action: 'update',
    });
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
    if (tier.isInitial) {
      throw new BadRequestException('Нельзя удалить стартовый уровень');
    }
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
    logEvent(this.logger, 'portal.loyalty.tiers.delete', {
      merchantId,
      tierId,
    });
    safeMetric(this.metrics, 'portal_loyalty_tiers_write_total', {
      action: 'delete',
    });
    return { ok: true };
  }
}
