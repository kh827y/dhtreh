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
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { computePromotionRedeemRevenueFromData } from '../promotion-redeem-revenue';
import { CommunicationsService } from '../../communications/communications.service';
import { PromotionRulesService } from './promotion-rules.service';
import type { PromotionPayload } from '../loyalty-program.types';
import {
  asRecord,
  cloneRecord,
  readErrorMessage,
  readString,
} from '../loyalty-program.utils';
import { logEvent, safeMetric } from '../../../shared/logging/event-log.util';
import {
  ensureMetadataVersion,
  upgradeMetadata,
} from '../../../shared/metadata.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

type PromotionRecord = Prisma.LoyaltyPromotionGetPayload<object>;
type PromotionMetricRecord = Prisma.LoyaltyPromotionMetricGetPayload<object>;
type PromotionRevenue = {
  series: number[];
  dates: string[];
  netTotal: number;
  redeemedTotal: number;
  grossTotal: number;
};

const mergePromotionMetrics = (
  metrics: PromotionMetricRecord | null,
  revenue: PromotionRevenue,
): PromotionMetricRecord => {
  const chartsBase = asRecord(metrics?.charts) ?? {};
  const charts = {
    ...chartsBase,
    revenueSeries: revenue.series,
    revenueDates: revenue.dates,
  };
  return {
    ...(metrics ?? {}),
    revenueGenerated: revenue.netTotal,
    revenueRedeemed: revenue.grossTotal,
    pointsRedeemed: revenue.redeemedTotal,
    charts: charts as Prisma.InputJsonValue,
  } as PromotionMetricRecord;
};

const toCreateJson = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull => {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return ensureMetadataVersion(
    value as Prisma.InputJsonValue,
  ) as Prisma.InputJsonValue;
};

const toUpdateJson = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return ensureMetadataVersion(
    value as Prisma.InputJsonValue,
  ) as Prisma.InputJsonValue;
};

@Injectable()
export class LoyaltyProgramPromotionsService {
  private readonly logger = new Logger(LoyaltyProgramPromotionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly comms: CommunicationsService,
    private readonly promotionRules: PromotionRulesService,
  ) {}

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
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyProgramPromotionsService clear tasks',
        this.logger,
        'debug',
      );
    }
  }

  private async backfillPromotionMetadata(promotions: PromotionRecord[]) {
    const tasks: Array<Promise<unknown>> = [];
    for (const promotion of promotions) {
      const metadataUpgrade = upgradeMetadata(
        promotion.metadata as Prisma.InputJsonValue | null,
      );
      const rewardUpgrade = upgradeMetadata(
        promotion.rewardMetadata as Prisma.InputJsonValue | null,
      );
      if (!metadataUpgrade.changed && !rewardUpgrade.changed) continue;
      if (metadataUpgrade.changed) {
        promotion.metadata = (metadataUpgrade.value ?? null) as
          | Prisma.JsonValue
          | null;
      }
      if (rewardUpgrade.changed) {
        promotion.rewardMetadata = (rewardUpgrade.value ?? null) as
          | Prisma.JsonValue
          | null;
      }
      const data: Prisma.LoyaltyPromotionUpdateInput = {};
      if (metadataUpgrade.changed) {
        data.metadata = metadataUpgrade.value as Prisma.InputJsonValue;
      }
      if (rewardUpgrade.changed) {
        data.rewardMetadata = rewardUpgrade.value as Prisma.InputJsonValue;
      }
      tasks.push(
        this.prisma.loyaltyPromotion
          .update({
            where: { id: promotion.id },
            data,
          })
          .catch((err) =>
            logIgnoredError(
              err,
              'LoyaltyProgramPromotionsService backfill metadata',
              this.logger,
              'debug',
              {
                promotionId: promotion.id,
                merchantId: promotion.merchantId,
                fields: Object.keys(data),
              },
            ),
          ),
      );
    }
    if (tasks.length) {
      await Promise.all(tasks);
    }
  }

  private async refreshPromotionNotifications(
    merchantId: string,
    promotion: PromotionRecord,
  ): Promise<void> {
    await this.clearPromotionTasks(merchantId, promotion.id);
    await this.schedulePromotionNotifications(merchantId, promotion);
  }

  private async schedulePromotionNotifications(
    merchantId: string,
    promotion: PromotionRecord,
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
        when = this.promotionRules.normalizeFuture(promotion.startAt);
      } else if (promotion.status === 'ACTIVE') {
        // Если акция активна, но ещё не началась (startAt в будущем) — шедулим на startAt.
        if (promotion.startAt && promotion.startAt.getTime() > now) {
          when = this.promotionRules.normalizeFuture(promotion.startAt);
        } else {
          // немедленная отправка
          when = null;
        }
      }
      if (when !== undefined) {
        const text = this.promotionRules.resolvePromotionText(
          promotion,
          'start',
        );
        // PUSH — шедулим даже без шаблона, текст берём из payload
        if (
          !(await this.promotionRules.taskExists({
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
        const when = this.promotionRules.normalizeFuture(new Date(ts));
        if (when) {
          const text = this.promotionRules.resolvePromotionText(
            promotion,
            'reminder',
            offsetH,
          );
          if (
            !(await this.promotionRules.taskExists({
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
        }
      }
    }
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

    logEvent(this.logger, 'portal.loyalty.promotions.delete', {
      merchantId,
      promotionId,
    });
    safeMetric(this.metrics, 'portal_loyalty_promotions_changed_total', {
      action: 'delete',
    });

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
    await this.backfillPromotionMetadata(promotions);

    const revenueMap = await this.computePromotionRedeemRevenue(
      merchantId,
      promotions
        .filter((p) => p.rewardType === PromotionRewardType.POINTS)
        .map((p) => p.id),
    );
    promotions.forEach((promotion) => {
      const revenue = revenueMap.get(promotion.id);
      if (!revenue) return;
      promotion.metrics = mergePromotionMetrics(promotion.metrics, revenue);
    });

    logEvent(this.logger, 'portal.loyalty.promotions.list', {
      merchantId,
      status: status ?? 'ALL',
      total: promotions.length,
    });
    safeMetric(this.metrics, 'portal_loyalty_promotions_list_total');
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
  ): Promise<Map<string, PromotionRevenue>> {
    const ids = promotionIds.filter(Boolean);
    const result = new Map<string, PromotionRevenue>();
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
    const rewardMetadata = cloneRecord(payload.rewardMetadata);
    const productIds = this.promotionRules.normalizeIdList(
      rewardMetadata.productIds,
    );
    const categoryIds = this.promotionRules.normalizeIdList(
      rewardMetadata.categoryIds,
    );
    const hasTargets = productIds.length > 0 || categoryIds.length > 0;
    if (rewardType === PromotionRewardType.DISCOUNT && !hasTargets) {
      throw new BadRequestException('Выберите товары или категории');
    }
    if (hasTargets) {
      rewardMetadata.productIds = productIds;
      rewardMetadata.categoryIds = categoryIds;
    }
    const pointsRuleType = this.promotionRules.normalizePointsRuleType(
      rewardMetadata.pointsRuleType,
    );
    if (rewardType === PromotionRewardType.POINTS && hasTargets) {
      if (!pointsRuleType) {
        throw new BadRequestException(
          'Укажите pointsRuleType для товарной акции',
        );
      }
      rewardMetadata.pointsRuleType = pointsRuleType;
      rewardMetadata.pointsValue = this.promotionRules.normalizePointsValue(
        pointsRuleType,
        rewardMetadata.pointsValue,
      );
      if ('multiplier' in rewardMetadata) {
        delete rewardMetadata.multiplier;
      }
    }
    let rewardValue = Math.max(
      0,
      Math.floor(Number(payload.rewardValue ?? 0) || 0),
    );
    let pointsExpireInDays = this.promotionRules.normalizePointsTtl(
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
      const kind = (readString(rewardMetadata.kind) ?? '').toUpperCase().trim();
      if (kind === 'NTH_FREE') {
        const buyQtyRaw = rewardMetadata.buyQty ?? 0;
        const freeQtyRaw = rewardMetadata.freeQty ?? 0;
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
        const priceRaw = rewardMetadata.price ?? null;
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
    const rewardMetadataJson = ensureMetadataVersion(
      rewardMetadata as Prisma.InputJsonValue,
    ) as Prisma.InputJsonValue;

    await this.ensureSegmentOwned(merchantId, payload.segmentId ?? null);
    const status = payload.status ?? PromotionStatus.DRAFT;
    const startAt = this.promotionRules.normalizePromotionDate(
      payload.startAt,
      'startAt',
    );
    const endAt = this.promotionRules.normalizePromotionDate(
      payload.endAt,
      'endAt',
    );
    this.promotionRules.validatePromotionDates(startAt, endAt, status);

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
        rewardMetadata: rewardMetadataJson,
        pointsExpireInDays,
        pushTemplateStartId: payload.pushTemplateStartId ?? null,
        pushTemplateReminderId: payload.pushTemplateReminderId ?? null,
        pushOnStart: payload.pushOnStart ?? false,
        pushReminderEnabled: payload.pushReminderEnabled ?? false,
        reminderOffsetHours: payload.reminderOffsetHours ?? null,
        autoLaunch: payload.autoLaunch ?? false,
        startAt,
        endAt,
        metadata: toCreateJson(payload.metadata),
        createdById: payload.actorId ?? null,
        updatedById: payload.actorId ?? null,
      },
    });

    logEvent(this.logger, 'portal.loyalty.promotions.create', {
      merchantId,
      promotionId: promotion.id,
      status: promotion.status,
    });
    safeMetric(this.metrics, 'portal_loyalty_promotions_changed_total', {
      action: 'create',
    });
    try {
      await this.schedulePromotionNotifications(merchantId, promotion);
    } catch (err: unknown) {
      // не валим создание акции из-за ошибок планирования уведомлений
      this.logger.warn(
        `schedulePromotionNotifications failed: ${readErrorMessage(err)}`,
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
    const rewardMetadata = asRecord(payload.rewardMetadata)
      ? cloneRecord(payload.rewardMetadata)
      : cloneRecord(promotion.rewardMetadata);
    const productIds = this.promotionRules.normalizeIdList(
      rewardMetadata.productIds,
    );
    const categoryIds = this.promotionRules.normalizeIdList(
      rewardMetadata.categoryIds,
    );
    const hasTargets = productIds.length > 0 || categoryIds.length > 0;
    if (rewardType === PromotionRewardType.DISCOUNT && !hasTargets) {
      throw new BadRequestException('Выберите товары или категории');
    }
    if (hasTargets) {
      rewardMetadata.productIds = productIds;
      rewardMetadata.categoryIds = categoryIds;
    }
    const pointsRuleType = this.promotionRules.normalizePointsRuleType(
      rewardMetadata.pointsRuleType,
    );
    if (rewardType === PromotionRewardType.POINTS && hasTargets) {
      if (!pointsRuleType) {
        throw new BadRequestException(
          'Укажите pointsRuleType для товарной акции',
        );
      }
      rewardMetadata.pointsRuleType = pointsRuleType;
      rewardMetadata.pointsValue = this.promotionRules.normalizePointsValue(
        pointsRuleType,
        rewardMetadata.pointsValue,
      );
      if ('multiplier' in rewardMetadata) {
        delete rewardMetadata.multiplier;
      }
    }
    let rewardValue = Math.max(
      0,
      Math.floor(
        Number(payload.rewardValue ?? promotion.rewardValue ?? 0) || 0,
      ),
    );
    let pointsExpireInDays = this.promotionRules.normalizePointsTtl(
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
      const kind = (readString(rewardMetadata.kind) ?? '').toUpperCase().trim();
      if (kind === 'NTH_FREE') {
        const buyQtyRaw = rewardMetadata.buyQty ?? 0;
        const freeQtyRaw = rewardMetadata.freeQty ?? 0;
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
        const priceRaw = rewardMetadata.price ?? null;
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
    const rewardMetadataJson = ensureMetadataVersion(
      rewardMetadata as Prisma.InputJsonValue,
    ) as Prisma.InputJsonValue;

    const segmentId =
      payload.segmentId !== undefined ? payload.segmentId : promotion.segmentId;
    await this.ensureSegmentOwned(merchantId, segmentId);
    const status = payload.status ?? promotion.status ?? PromotionStatus.DRAFT;
    const startAt =
      payload.startAt !== undefined
        ? this.promotionRules.normalizePromotionDate(payload.startAt, 'startAt')
        : promotion.startAt;
    const endAt =
      payload.endAt !== undefined
        ? this.promotionRules.normalizePromotionDate(payload.endAt, 'endAt')
        : promotion.endAt;
    this.promotionRules.validatePromotionDates(startAt, endAt, status);

    const updated = await this.prisma.loyaltyPromotion.update({
      where: { id: promotionId },
      data: {
        name: payload.name?.trim() ?? promotion.name,
        description:
          payload.description !== undefined
            ? (payload.description?.trim() ?? null)
            : promotion.description,
        segmentId,
        targetTierId:
          payload.targetTierId !== undefined
            ? payload.targetTierId
            : promotion.targetTierId,
        status,
        rewardType,
        rewardValue,
        rewardMetadata: rewardMetadataJson,
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
        metadata: toUpdateJson(
          payload.metadata !== undefined ? payload.metadata : undefined,
        ),
        updatedById: payload.actorId ?? promotion.updatedById,
      },
    });

    logEvent(this.logger, 'portal.loyalty.promotions.update', {
      merchantId,
      promotionId,
      status: updated.status,
    });
    safeMetric(this.metrics, 'portal_loyalty_promotions_changed_total', {
      action: 'update',
    });

    try {
      await this.refreshPromotionNotifications(merchantId, updated);
    } catch (err: unknown) {
      this.logger.warn(
        `refreshPromotionNotifications failed: ${readErrorMessage(err)}`,
      );
    }
    return updated;
  }

  async getPromotion(merchantId: string, promotionId: string) {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({
      where: { merchantId, id: promotionId },
      include: {
        metrics: true,
        participants: {
          include: {
            customer: true,
          },
        },
        audience: {
          include: {
            _count: { select: { customers: true } },
          },
        },
      },
    });
    if (!promotion) throw new NotFoundException('Акция не найдена');
    await this.backfillPromotionMetadata([promotion]);

    if (promotion.rewardType === PromotionRewardType.POINTS) {
      const revenueMap = await this.computePromotionRedeemRevenue(merchantId, [
        promotionId,
      ]);
      const revenue = revenueMap.get(promotionId);
      if (revenue) {
        promotion.metrics = mergePromotionMetrics(promotion.metrics, revenue);
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
      where: { merchantId, id: promotionId },
    });
    if (!promotion) throw new NotFoundException('Акция не найдена');
    const normalized = status ?? promotion.status;
    if (!Object.values(PromotionStatus).includes(normalized)) {
      throw new BadRequestException('Некорректный статус');
    }
    if (
      normalized === PromotionStatus.ACTIVE &&
      promotion.status === PromotionStatus.ARCHIVED
    ) {
      throw new BadRequestException('Нельзя активировать архивную акцию');
    }
    const updated = await this.prisma.loyaltyPromotion.update({
      where: { id: promotionId },
      data: {
        status: normalized,
        archivedAt:
          normalized === PromotionStatus.ARCHIVED
            ? new Date()
            : promotion.archivedAt,
        launchedAt:
          normalized === PromotionStatus.ACTIVE && !promotion.launchedAt
            ? new Date()
            : promotion.launchedAt,
        updatedById: actorId ?? promotion.updatedById,
      },
    });
    logEvent(this.logger, 'portal.loyalty.promotions.status', {
      merchantId,
      promotionId,
      status: updated.status,
    });
    safeMetric(this.metrics, 'portal_loyalty_promotions_changed_total', {
      action: 'status',
    });
    try {
      await this.refreshPromotionNotifications(merchantId, updated);
    } catch (err: unknown) {
      this.logger.warn(
        `refreshPromotionNotifications failed: ${readErrorMessage(err)}`,
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
    const list = Array.isArray(promotionIds)
      ? promotionIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (!list.length) return { updated: 0 };
    const normalized = status ?? PromotionStatus.DRAFT;
    if (!Object.values(PromotionStatus).includes(normalized)) {
      throw new BadRequestException('Некорректный статус');
    }
    const now = new Date();
    const updated = await this.prisma.loyaltyPromotion.updateMany({
      where: { merchantId, id: { in: list } },
      data: {
        status: normalized,
        launchedAt: normalized === PromotionStatus.ACTIVE ? now : undefined,
        archivedAt: normalized === PromotionStatus.ARCHIVED ? now : undefined,
        updatedById: actorId ?? undefined,
      },
    });
    const promotions = await this.prisma.loyaltyPromotion.findMany({
      where: { merchantId, id: { in: list } },
    });
    for (const promotion of promotions) {
      await this.refreshPromotionNotifications(merchantId, promotion).catch(
        (err: unknown) =>
          this.logger.warn(
            `refreshPromotionNotifications failed: ${readErrorMessage(err)}`,
          ),
      );
    }
    logEvent(this.logger, 'portal.loyalty.promotions.bulkStatus', {
      merchantId,
      status,
      ids: promotionIds.length,
      updated: updated.count,
    });
    safeMetric(
      this.metrics,
      'portal_loyalty_promotions_changed_total',
      { action: 'bulk-status' },
      updated.count || 1,
    );
    return { updated: updated.count };
  }
}
