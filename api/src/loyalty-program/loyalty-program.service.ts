import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommunicationChannel,
  Prisma,
  PromotionRewardType,
  PromotionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { computePromotionRedeemRevenueFromData } from './promotion-redeem-revenue';
import { CommunicationsService } from '../communications/communications.service';
import { ensureBaseTier } from '../loyalty/tier-defaults.util';

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

export interface TierMemberDto {
  customerId: string;
  name: string | null;
  phone: string | null;
  assignedAt: string;
  source: string | null;
  totalSpent: number | null;
  firstSeenAt: string | null;
}

export interface TierMembersResponse {
  tierId: string;
  total: number;
  items: TierMemberDto[];
  nextCursor: string | null;
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
  type?: 'PROMO_CODE' | 'PROMOTION';
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  offset?: number;
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

  private assertNonNegativeNumber(value: unknown, field: string) {
    if (value === undefined || value === null) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`Некорректное значение ${field}`);
    }
  }

  private sanitizePercent(value: number | null | undefined, fallbackBps = 0) {
    if (value == null) return fallbackBps;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallbackBps;
    if (parsed > 100) return 10000;
    return Math.round(parsed * 100);
  }

  private normalizePointsTtl(days?: number | null): number | null {
    if (days === undefined || days === null) return null;
    const parsed = Number(days);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.max(1, Math.trunc(parsed));
  }

  private normalizeIdList(value: any): string[] {
    if (!Array.isArray(value)) return [];
    const normalized = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
    return Array.from(new Set(normalized));
  }

  private normalizePointsRuleType(
    value: any,
  ): 'multiplier' | 'percent' | 'fixed' | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (
      normalized === 'multiplier' ||
      normalized === 'percent' ||
      normalized === 'fixed'
    ) {
      return normalized;
    }
    throw new BadRequestException(
      'pointsRuleType должен быть multiplier/percent/fixed',
    );
  }

  private normalizePointsValue(
    ruleType: 'multiplier' | 'percent' | 'fixed',
    value: any,
  ): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Укажите pointsValue для товарной акции');
    }
    const normalized = ruleType === 'fixed' ? Math.floor(parsed) : parsed;
    if (!Number.isFinite(normalized) || normalized <= 0) {
      throw new BadRequestException('Укажите pointsValue для товарной акции');
    }
    return normalized;
  }

  private normalizePromotionDate(value: any, label: string): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Некорректная дата ${label}`);
    }
    return date;
  }

  private validatePromotionDates(
    startAt: Date | null,
    endAt: Date | null,
    status: PromotionStatus,
  ) {
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException(
        'Дата окончания не может быть раньше даты начала',
      );
    }
    const now = new Date();
    if (status === PromotionStatus.ACTIVE) {
      if (startAt && startAt.getTime() > now.getTime()) {
        throw new BadRequestException(
          'Акция не может быть активной до даты старта',
        );
      }
      if (endAt && endAt.getTime() < now.getTime()) {
        throw new BadRequestException('Акция уже завершена');
      }
    }
    if (status === PromotionStatus.SCHEDULED) {
      if (!startAt) {
        throw new BadRequestException('Для отложенной акции нужна дата старта');
      }
      if (startAt.getTime() <= now.getTime()) {
        throw new BadRequestException(
          'Дата старта должна быть в будущем',
        );
      }
    }
  }

  // ===== Notifications scheduling =====
  private normalizeFuture(date: Date | null | undefined): Date | null {
    if (!date) return null;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    // Если время уже прошло — отправим немедленно (scheduledAt=null)
    return d.getTime() > Date.now() ? d : null;
  }

  private async isTelegramEnabled(merchantId: string): Promise<boolean> {
    try {
      const m = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { telegramBotEnabled: true },
      });
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
    if (scheduledAt !== null) (where as any).scheduledAt = scheduledAt;
    const existing = await this.prisma.communicationTask.findFirst({ where });
    return !!existing;
  }

  private buildStartText(p: any): string {
    const parts: string[] = [];
    parts.push(`Акция стартовала: ${p?.name || 'Новая акция'}`);
    if (p?.rewardType === 'POINTS' && Number.isFinite(Number(p?.rewardValue))) {
      parts.push(
        `Бонус: +${Math.max(0, Math.round(Number(p.rewardValue)))} баллов`,
      );
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
      parts.push(
        `Успейте получить +${Math.max(0, Math.round(Number(p.rewardValue)))} баллов`,
      );
    }
    parts.push(`Осталось ~${Math.max(1, Math.round(hours))} ч.`);
    return parts.join(' · ');
  }

  private resolvePromotionText(
    promotion: any,
    kind: 'start' | 'reminder',
    reminderHours?: number,
  ): string {
    const meta =
      promotion?.metadata && typeof promotion.metadata === 'object'
        ? (promotion.metadata as Record<string, any>)
        : {};
    const raw = kind === 'start' ? meta.pushMessage : meta.pushReminderMessage;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (kind === 'start') return this.buildStartText(promotion);
    return this.buildReminderText(promotion, reminderHours ?? 48);
  }

  private async ensureSegmentOwned(
    merchantId: string,
    segmentId: string | null | undefined,
  ) {
    if (!segmentId) return;
    const existing = await this.prisma.customerSegment.findFirst({
      where: { id: segmentId, merchantId },
      select: { id: true },
    });
    if (!existing) {
      throw new BadRequestException('Сегмент не найден');
    }
  }

  private async clearPromotionTasks(
    merchantId: string,
    promotionId: string,
  ): Promise<void> {
    try {
      await this.prisma.communicationTask.deleteMany({
        where: {
          merchantId,
          promotionId,
          status: { in: ['SCHEDULED', 'PAUSED'] },
        },
      });
    } catch {}
  }

  private async refreshPromotionNotifications(
    merchantId: string,
    promotion: any,
  ): Promise<void> {
    await this.clearPromotionTasks(merchantId, promotion.id);
    await this.schedulePromotionNotifications(merchantId, promotion);
  }

  private async schedulePromotionNotifications(
    merchantId: string,
    promotion: any,
  ): Promise<void> {
    const statusAllows =
      promotion.status === 'ACTIVE' || promotion.status === 'SCHEDULED';
    if (!statusAllows) return;
    const now = Date.now();
    const hasSegment = !!promotion.segmentId;
    const audienceCode = hasSegment ? `segment:${promotion.segmentId}` : 'all';
    const audienceId = promotion.segmentId ?? null;
    const actorId = promotion.updatedById ?? promotion.createdById ?? null;

    // START notifications
    if (promotion.pushOnStart) {
      let when: Date | null | undefined = undefined;
      if (promotion.status === 'SCHEDULED' && promotion.startAt) {
        when = this.normalizeFuture(promotion.startAt);
      } else if (promotion.status === 'ACTIVE') {
        // Если акция активна, но ещё не началась (startAt в будущем) — шедулим на startAt.
        if (promotion.startAt && promotion.startAt.getTime() > now) {
          when = this.normalizeFuture(promotion.startAt);
        } else {
          // немедленная отправка
          when = null;
        }
      }
      if (when !== undefined) {
        const text = this.resolvePromotionText(promotion, 'start');
        // PUSH — шедулим даже без шаблона, текст берём из payload
        if (
          !(await this.taskExists({
            merchantId,
            promotionId: promotion.id,
            channel: CommunicationChannel.PUSH,
            scheduledAt: when,
          }))
        ) {
          await this.comms.createTask(merchantId, {
            channel: CommunicationChannel.PUSH,
            templateId: promotion.pushTemplateStartId ?? null,
            audienceId,
            audienceCode,
            promotionId: promotion.id,
            scheduledAt: when,
            payload: {
              text,
              event: 'promotion.start',
              promotionId: promotion.id,
            },
            actorId: actorId ?? undefined,
          });
        }
        // TELEGRAM — если включён бот
        if (await this.isTelegramEnabled(merchantId)) {
          if (
            !(await this.taskExists({
              merchantId,
              promotionId: promotion.id,
              channel: CommunicationChannel.TELEGRAM,
              scheduledAt: when,
            }))
          ) {
            await this.comms.createTask(merchantId, {
              channel: CommunicationChannel.TELEGRAM,
              promotionId: promotion.id,
              audienceId,
              audienceName: null,
              audienceSnapshot: { code: audienceCode },
              scheduledAt: when,
              payload: {
                text,
                event: 'promotion.start',
                promotionId: promotion.id,
              },
              actorId: actorId ?? undefined,
            });
          }
        }
      }
    }

    // REMINDER notifications (default 48h before end)
    if (promotion.pushReminderEnabled && promotion.endAt) {
      const offsetH =
        Number.isFinite(Number(promotion.reminderOffsetHours)) &&
        Number(promotion.reminderOffsetHours) > 0
          ? Math.round(Number(promotion.reminderOffsetHours))
          : 48;
      const end = new Date(promotion.endAt).getTime();
      const ts = end - offsetH * 3600_000;
      if (ts > now) {
        const when = this.normalizeFuture(new Date(ts));
        if (when) {
          const text = this.resolvePromotionText(
            promotion,
            'reminder',
            offsetH,
          );
          if (
            !(await this.taskExists({
              merchantId,
              promotionId: promotion.id,
              channel: CommunicationChannel.PUSH,
              scheduledAt: when,
            }))
          ) {
            await this.comms.createTask(merchantId, {
              channel: CommunicationChannel.PUSH,
              templateId: promotion.pushTemplateReminderId ?? null,
              audienceId,
              audienceCode,
              promotionId: promotion.id,
              scheduledAt: when,
              payload: {
                text,
                event: 'promotion.reminder',
                promotionId: promotion.id,
              },
              actorId: actorId ?? undefined,
            });
          }
          if (await this.isTelegramEnabled(merchantId)) {
            if (
              !(await this.taskExists({
                merchantId,
                promotionId: promotion.id,
                channel: CommunicationChannel.TELEGRAM,
                scheduledAt: when,
              }))
            ) {
              await this.comms.createTask(merchantId, {
                channel: CommunicationChannel.TELEGRAM,
                promotionId: promotion.id,
                audienceId,
                audienceName: null,
                audienceSnapshot: { code: audienceCode },
                scheduledAt: when,
                payload: {
                  text,
                  event: 'promotion.reminder',
                  promotionId: promotion.id,
                },
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

  private extractMinPayment(
    metadata: Prisma.JsonValue | null | undefined,
  ): number | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const meta = metadata as Record<string, unknown>;
    const raw = meta?.minPaymentAmount ?? meta?.minPayment;
    if (raw == null) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
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
    const items: TierMemberDto[] = assignments.slice(0, limit).map((row) => {
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
    this.assertNonNegativeNumber(payload.thresholdAmount, 'thresholdAmount');
    this.assertNonNegativeNumber(payload.earnRatePercent, 'earnRatePercent');
    if (payload.redeemRatePercent !== null && payload.redeemRatePercent !== undefined) {
      this.assertNonNegativeNumber(payload.redeemRatePercent, 'redeemRatePercent');
    }
    if (payload.minPaymentAmount !== null && payload.minPaymentAmount !== undefined) {
      this.assertNonNegativeNumber(payload.minPaymentAmount, 'minPaymentAmount');
    }
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
    if (payload.thresholdAmount !== null && payload.thresholdAmount !== undefined) {
      this.assertNonNegativeNumber(payload.thresholdAmount, 'thresholdAmount');
    }
    if (payload.earnRatePercent !== null && payload.earnRatePercent !== undefined) {
      this.assertNonNegativeNumber(payload.earnRatePercent, 'earnRatePercent');
    }
    if (payload.redeemRatePercent !== null && payload.redeemRatePercent !== undefined) {
      this.assertNonNegativeNumber(payload.redeemRatePercent, 'redeemRatePercent');
    }
    if (payload.minPaymentAmount !== null && payload.minPaymentAmount !== undefined) {
      this.assertNonNegativeNumber(payload.minPaymentAmount, 'minPaymentAmount');
    }
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
        : payload.redeemRatePercent === null
          ? null
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

  async deletePromotion(merchantId: string, promotionId: string) {
    await this.prisma.$transaction(async (tx) => {
      const promotion = await tx.loyaltyPromotion.findFirst({
        where: { merchantId, id: promotionId },
        select: { id: true },
      });
      if (!promotion) throw new NotFoundException('Акция не найдена');

      // Fully delete related communication tasks (recipients cascade by FK).
      await tx.communicationTask.deleteMany({
        where: { merchantId, promotionId },
      });

      await tx.loyaltyPromotion.delete({ where: { id: promotionId } });
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.promotions.delete',
          merchantId,
          promotionId,
        }),
      );
      this.metrics.inc('portal_loyalty_promotions_changed_total', {
        action: 'delete',
      });
    } catch {}

    return { ok: true };
  }

  async listPromotions(merchantId: string, status?: PromotionStatus | 'ALL') {
    const where: Prisma.LoyaltyPromotionWhereInput = {
      merchantId,
    };
    if (status && status !== 'ALL') {
      where.status = status;
      if (status !== PromotionStatus.ARCHIVED) {
        where.archivedAt = null;
      }
    } else {
      where.archivedAt = null;
      where.status = { not: PromotionStatus.ARCHIVED };
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

    const revenueMap = await this.computePromotionRedeemRevenue(
      merchantId,
      promotions
        .filter((p) => p.rewardType === PromotionRewardType.POINTS)
        .map((p) => p.id),
    );
    promotions.forEach((promotion) => {
      const revenue = revenueMap.get(promotion.id);
      if (!revenue) return;
      const charts = {
        ...((promotion as any).metrics?.charts ?? {}),
        revenueSeries: revenue.series,
        revenueDates: revenue.dates,
      };
      (promotion as any).metrics = {
        ...(promotion as any).metrics,
        revenueGenerated: revenue.netTotal,
        revenueRedeemed: revenue.grossTotal,
        pointsRedeemed: revenue.redeemedTotal,
        charts,
      };
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

  async listPromotionBasics(merchantId: string, ids: string[]) {
    const list = Array.isArray(ids)
      ? ids.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (!list.length) return [];
    return this.prisma.loyaltyPromotion.findMany({
      where: { merchantId, id: { in: list } },
      select: { id: true, rewardType: true, rewardMetadata: true },
    });
  }

  private async computePromotionRedeemRevenue(
    merchantId: string,
    promotionIds: string[],
  ): Promise<
    Map<
      string,
      {
        series: number[];
        dates: string[];
        netTotal: number;
        redeemedTotal: number;
        grossTotal: number;
      }
    >
  > {
    const ids = promotionIds.filter(Boolean);
    const result = new Map<
      string,
      {
        series: number[];
        dates: string[];
        netTotal: number;
        redeemedTotal: number;
        grossTotal: number;
      }
    >();
    if (!ids.length) return result;

    const participants = await this.prisma.promotionParticipant.findMany({
      where: { merchantId, promotionId: { in: ids } },
      select: {
        promotionId: true,
        customerId: true,
        joinedAt: true,
        pointsIssued: true,
      },
      orderBy: [{ customerId: 'asc' }, { joinedAt: 'asc' }],
    });
    if (!participants.length) return result;

    let globalMin = participants[0].joinedAt;
    participants.forEach((p) => {
      if (p.joinedAt < globalMin) globalMin = p.joinedAt;
    });

    const customerIds = Array.from(
      new Set(participants.map((p) => p.customerId)),
    );
    const receipts = await this.prisma.receipt.findMany({
      where: {
        merchantId,
        customerId: { in: customerIds },
        canceledAt: null,
        redeemApplied: { gt: 0 },
        createdAt: { gte: globalMin },
      },
      select: {
        customerId: true,
        createdAt: true,
        redeemApplied: true,
        total: true,
      },
      orderBy: [{ customerId: 'asc' }, { createdAt: 'asc' }],
    });
    return computePromotionRedeemRevenueFromData(
      participants.map((p) => ({
        promotionId: p.promotionId,
        customerId: p.customerId,
        joinedAt: p.joinedAt,
        pointsIssued: p.pointsIssued ?? null,
      })),
      receipts.map((r) => ({
        customerId: r.customerId,
        createdAt: r.createdAt,
        redeemApplied: r.redeemApplied,
        total: r.total,
      })),
    );
  }

  async createPromotion(merchantId: string, payload: PromotionPayload) {
    if (!payload.name?.trim())
      throw new BadRequestException('Название акции обязательно');
    const rewardType = payload.rewardType ?? PromotionRewardType.POINTS;
    if (
      rewardType !== PromotionRewardType.POINTS &&
      rewardType !== PromotionRewardType.DISCOUNT
    ) {
      throw new BadRequestException(
        'Тип акции должен быть POINTS или DISCOUNT',
      );
    }
    const rewardMetadata =
      payload.rewardMetadata && typeof payload.rewardMetadata === 'object'
        ? { ...(payload.rewardMetadata as Record<string, any>) }
        : {};
    const productIds = this.normalizeIdList(rewardMetadata.productIds);
    const categoryIds = this.normalizeIdList(rewardMetadata.categoryIds);
    const hasTargets = productIds.length > 0 || categoryIds.length > 0;
    if (rewardType === PromotionRewardType.POINTS && !hasTargets) {
      throw new BadRequestException('Выберите товары или категории');
    }
    if (rewardType === PromotionRewardType.DISCOUNT && !hasTargets) {
      throw new BadRequestException('Выберите товары или категории');
    }
    if (hasTargets) {
      rewardMetadata.productIds = productIds;
      rewardMetadata.categoryIds = categoryIds;
    }
    const pointsRuleType = this.normalizePointsRuleType(
      rewardMetadata.pointsRuleType,
    );
    if (rewardType === PromotionRewardType.POINTS && hasTargets) {
      if (!pointsRuleType) {
        throw new BadRequestException(
          'Укажите pointsRuleType для товарной акции',
        );
      }
      rewardMetadata.pointsRuleType = pointsRuleType;
      rewardMetadata.pointsValue = this.normalizePointsValue(
        pointsRuleType,
        rewardMetadata.pointsValue,
      );
      if ('multiplier' in rewardMetadata) {
        delete (rewardMetadata as Record<string, any>).multiplier;
      }
    }
    let rewardValue = Math.max(
      0,
      Math.floor(Number(payload.rewardValue ?? 0) || 0),
    );
    let pointsExpireInDays = this.normalizePointsTtl(
      payload.pointsExpireInDays,
    );
    if (rewardType === PromotionRewardType.POINTS) {
      if (hasTargets) {
        rewardValue = 0;
      } else {
        const rewardValueRaw = Number(payload.rewardValue ?? 0);
        if (!Number.isFinite(rewardValueRaw) || rewardValueRaw <= 0) {
          throw new BadRequestException('Укажите количество баллов');
        }
        rewardValue = Math.max(0, Math.floor(rewardValueRaw));
      }
    } else {
      pointsExpireInDays = null;
      const kind = String(rewardMetadata?.kind || '')
        .toUpperCase()
        .trim();
      if (kind === 'NTH_FREE') {
        const buyQtyRaw = (rewardMetadata as any).buyQty ?? 0;
        const freeQtyRaw = (rewardMetadata as any).freeQty ?? 0;
        const buyQty = Number(buyQtyRaw);
        const freeQty = Number(freeQtyRaw);
        if (!Number.isFinite(buyQty) || buyQty <= 0) {
          throw new BadRequestException(
            'Укажите buyQty для акции «каждый N-й бесплатно»',
          );
        }
        if (!Number.isFinite(freeQty) || freeQty <= 0) {
          throw new BadRequestException(
            'Укажите freeQty для акции «каждый N-й бесплатно»',
          );
        }
        rewardMetadata.buyQty = Math.max(1, Math.trunc(buyQty));
        rewardMetadata.freeQty = Math.max(1, Math.trunc(freeQty));
        rewardValue = 0;
      } else if (kind === 'FIXED_PRICE') {
        const priceRaw = (rewardMetadata as any).price ?? null;
        const price = Number(priceRaw);
        if (!Number.isFinite(price) || price < 0) {
          throw new BadRequestException('Укажите акционную цену');
        }
        rewardMetadata.price = Math.max(0, price);
        rewardValue = Math.round(Math.max(0, price));
      } else {
        throw new BadRequestException(
          'Укажите тип акции (NTH_FREE/FIXED_PRICE)',
        );
      }
    }

    await this.ensureSegmentOwned(merchantId, payload.segmentId ?? null);
    const status = payload.status ?? PromotionStatus.DRAFT;
    const startAt = this.normalizePromotionDate(payload.startAt, 'startAt');
    const endAt = this.normalizePromotionDate(payload.endAt, 'endAt');
    this.validatePromotionDates(startAt, endAt, status);

    const promotion = await this.prisma.loyaltyPromotion.create({
      data: {
        merchantId,
        name: payload.name.trim(),
        description: payload.description ?? null,
        segmentId: payload.segmentId ?? null,
        targetTierId: payload.targetTierId ?? null,
        status,
        rewardType: rewardType,
        rewardValue,
        rewardMetadata: rewardMetadata ?? Prisma.JsonNull,
        pointsExpireInDays,
        pushTemplateStartId: payload.pushTemplateStartId ?? null,
        pushTemplateReminderId: payload.pushTemplateReminderId ?? null,
        pushOnStart: payload.pushOnStart ?? false,
        pushReminderEnabled: payload.pushReminderEnabled ?? false,
        reminderOffsetHours: payload.reminderOffsetHours ?? null,
        autoLaunch: payload.autoLaunch ?? false,
        startAt,
        endAt,
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
      this.logger.warn(
        `schedulePromotionNotifications failed: ${String(e?.message || e)}`,
      );
    }
    return promotion;
  }

  async updatePromotion(
    merchantId: string,
    promotionId: string,
    payload: PromotionPayload,
  ) {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({
      where: {
        merchantId,
        id: promotionId,
      },
    });
    if (!promotion) throw new NotFoundException('Акция не найдена');
    const rewardType =
      payload.rewardType ?? promotion.rewardType ?? PromotionRewardType.POINTS;
    if (
      rewardType !== PromotionRewardType.POINTS &&
      rewardType !== PromotionRewardType.DISCOUNT
    ) {
      throw new BadRequestException(
        'Тип акции должен быть POINTS или DISCOUNT',
      );
    }
    const rewardMetadata =
      payload.rewardMetadata && typeof payload.rewardMetadata === 'object'
        ? { ...(payload.rewardMetadata as Record<string, any>) }
        : promotion.rewardMetadata &&
            typeof promotion.rewardMetadata === 'object'
          ? { ...(promotion.rewardMetadata as any) }
          : {};
    const productIds = this.normalizeIdList(rewardMetadata.productIds);
    const categoryIds = this.normalizeIdList(rewardMetadata.categoryIds);
    const hasTargets = productIds.length > 0 || categoryIds.length > 0;
    if (rewardType === PromotionRewardType.POINTS && !hasTargets) {
      throw new BadRequestException('Выберите товары или категории');
    }
    if (rewardType === PromotionRewardType.DISCOUNT && !hasTargets) {
      throw new BadRequestException('Выберите товары или категории');
    }
    if (hasTargets) {
      rewardMetadata.productIds = productIds;
      rewardMetadata.categoryIds = categoryIds;
    }
    const pointsRuleType = this.normalizePointsRuleType(
      rewardMetadata.pointsRuleType,
    );
    if (rewardType === PromotionRewardType.POINTS && hasTargets) {
      if (!pointsRuleType) {
        throw new BadRequestException(
          'Укажите pointsRuleType для товарной акции',
        );
      }
      rewardMetadata.pointsRuleType = pointsRuleType;
      rewardMetadata.pointsValue = this.normalizePointsValue(
        pointsRuleType,
        rewardMetadata.pointsValue,
      );
      if ('multiplier' in rewardMetadata) {
        delete (rewardMetadata as Record<string, any>).multiplier;
      }
    }
    let rewardValue = Math.max(
      0,
      Math.floor(
        Number(payload.rewardValue ?? promotion.rewardValue ?? 0) || 0,
      ),
    );
    let pointsExpireInDays = this.normalizePointsTtl(
      payload.pointsExpireInDays ?? promotion.pointsExpireInDays,
    );
    if (rewardType === PromotionRewardType.POINTS) {
      if (hasTargets) {
        rewardValue = 0;
      } else {
        const rewardValueRaw = Number(
          payload.rewardValue ?? promotion.rewardValue ?? 0,
        );
        if (!Number.isFinite(rewardValueRaw) || rewardValueRaw <= 0) {
          throw new BadRequestException('Укажите количество баллов');
        }
        rewardValue = Math.max(0, Math.floor(rewardValueRaw));
      }
    } else {
      pointsExpireInDays = null;
      const kind = String(rewardMetadata?.kind || '')
        .toUpperCase()
        .trim();
      const promoMeta =
        promotion.rewardMetadata && typeof promotion.rewardMetadata === 'object'
          ? (promotion.rewardMetadata as any)
          : {};
      if (kind === 'NTH_FREE') {
        const buyQtyRaw = rewardMetadata.buyQty ?? promoMeta?.buyQty;
        const freeQtyRaw = rewardMetadata.freeQty ?? promoMeta?.freeQty;
        const buyQty = Number(buyQtyRaw);
        const freeQty = Number(freeQtyRaw);
        if (!Number.isFinite(buyQty) || buyQty <= 0) {
          throw new BadRequestException(
            'Укажите buyQty для акции «каждый N-й бесплатно»',
          );
        }
        if (!Number.isFinite(freeQty) || freeQty <= 0) {
          throw new BadRequestException(
            'Укажите freeQty для акции «каждый N-й бесплатно»',
          );
        }
        rewardMetadata.buyQty = Math.max(1, Math.trunc(buyQty));
        rewardMetadata.freeQty = Math.max(1, Math.trunc(freeQty));
        rewardValue = 0;
      } else if (kind === 'FIXED_PRICE') {
        const priceRaw = rewardMetadata.price ?? promoMeta?.price ?? null;
        const price = Number(priceRaw);
        if (!Number.isFinite(price) || price < 0) {
          throw new BadRequestException('Укажите акционную цену');
        }
        rewardMetadata.price = Math.max(0, price);
        rewardValue = Math.round(Math.max(0, price));
      } else {
        throw new BadRequestException(
          'Укажите тип акции (NTH_FREE/FIXED_PRICE)',
        );
      }
    }

    const segmentId =
      payload.segmentId !== undefined ? payload.segmentId : promotion.segmentId;
    await this.ensureSegmentOwned(merchantId, segmentId);
    const startAt =
      payload.startAt === undefined
        ? promotion.startAt
        : this.normalizePromotionDate(payload.startAt, 'startAt');
    const endAt =
      payload.endAt === undefined
        ? promotion.endAt
        : this.normalizePromotionDate(payload.endAt, 'endAt');
    const status = payload.status ?? promotion.status;
    this.validatePromotionDates(startAt, endAt, status);

    const updated = await this.prisma.loyaltyPromotion.update({
      where: { id: promotionId },
      data: {
        name: payload.name?.trim() ?? promotion.name,
        description: payload.description ?? promotion.description,
        segmentId,
        targetTierId: payload.targetTierId ?? promotion.targetTierId,
        status,
        rewardType,
        rewardValue,
        rewardMetadata,
        pointsExpireInDays,
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
        startAt,
        endAt,
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
    try {
      await this.refreshPromotionNotifications(merchantId, updated);
    } catch (e) {
      this.logger.warn(
        `refreshPromotionNotifications failed: ${String(e?.message || e)}`,
      );
    }
    return updated;
  }

  async getPromotion(merchantId: string, promotionId: string) {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({
      where: {
        merchantId,
        id: promotionId,
      },
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
    if (promotion.rewardType === PromotionRewardType.POINTS) {
      const revenue = (
        await this.computePromotionRedeemRevenue(merchantId, [promotionId])
      ).get(promotionId);
      if (revenue) {
        const charts = {
          ...((promotion as any).metrics?.charts ?? {}),
          revenueSeries: revenue.series,
          revenueDates: revenue.dates,
        };
        (promotion as any).metrics = {
          ...(promotion as any).metrics,
          revenueGenerated: revenue.netTotal,
          revenueRedeemed: revenue.grossTotal,
          pointsRedeemed: revenue.redeemedTotal,
          charts,
        };
      }
    }
    return promotion;
  }

  async countPromotionParticipants(merchantId: string, promotionId: string) {
    return this.prisma.promotionParticipant.count({
      where: { merchantId, promotionId },
    });
  }

  async changePromotionStatus(
    merchantId: string,
    promotionId: string,
    status: PromotionStatus,
    actorId?: string,
  ) {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({
      where: {
        merchantId,
        id: promotionId,
      },
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
    try {
      await this.refreshPromotionNotifications(merchantId, updated);
    } catch (e) {
      this.logger.warn(
        `refreshPromotionNotifications failed: ${String(e?.message || e)}`,
      );
    }
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
          where: {
            id,
            merchantId,
          },
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
      const promotions = await this.prisma.loyaltyPromotion.findMany({
        where: { merchantId, id: { in: promotionIds } },
      });
      for (const promotion of promotions) {
        await this.refreshPromotionNotifications(merchantId, promotion).catch(
          () => {},
        );
      }
    } catch (e) {
      this.logger.warn(
        `refreshPromotionNotifications failed: ${String(e?.message || e)}`,
      );
    }
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
    const limitRaw = Number(filters.limit ?? 200);
    const offsetRaw = Number(filters.offset ?? 0);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 500)
      : 200;
    const offset = Number.isFinite(offsetRaw)
      ? Math.max(Math.floor(offsetRaw), 0)
      : 0;

    const logs: any = {};
    if (!filters.type || filters.type === 'PROMO_CODE') {
      logs.promoCodes = await this.prisma.promoCodeUsage.findMany({
        where: {
          merchantId,
          usedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
        orderBy: { usedAt: 'desc' },
        take: limit,
        skip: offset,
      });
      logs.promoCodesTotal = await this.prisma.promoCodeUsage.count({
        where: {
          merchantId,
          usedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
      });
    }
    if (!filters.type || filters.type === 'PROMOTION') {
      logs.promotions = await this.prisma.promotionParticipant.findMany({
        where: {
          merchantId,
          joinedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
        orderBy: { joinedAt: 'desc' },
        take: limit,
        skip: offset,
      });
      logs.promotionsTotal = await this.prisma.promotionParticipant.count({
        where: {
          merchantId,
          joinedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
      });
    }

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.loyalty.operations.log',
          merchantId,
          type: filters.type ?? 'ALL',
          promoCodes: logs.promoCodes?.length ?? 0,
          promotions: logs.promotions?.length ?? 0,
        }),
      );
      this.metrics.inc('portal_loyalty_operations_list_total');
    } catch {}
    logs.limit = limit;
    logs.offset = offset;
    return logs;
  }
}
