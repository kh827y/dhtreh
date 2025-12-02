import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  LoyaltyProgramService,
  type PromotionPayload,
} from '../loyalty-program.service';
import { PromotionRewardType, PromotionStatus } from '@prisma/client';
import {
  toLegacyCampaignDto,
  type CampaignStatus,
  type CreateCampaignDto,
} from '../../loyalty-promotion/dto';

type LegacyCampaignPayload = Omit<CreateCampaignDto, 'merchantId'>;

function mapStatusToPromotion(status?: string | null): PromotionStatus {
  switch (status) {
    case 'ACTIVE':
      return PromotionStatus.ACTIVE;
    case 'PAUSED':
      return PromotionStatus.PAUSED;
    case 'COMPLETED':
      return PromotionStatus.COMPLETED;
    default:
      return PromotionStatus.DRAFT;
  }
}

function ensureNumber(value: any, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildMetadata(body: LegacyCampaignPayload, reward: any) {
  const rawMeta =
    body?.metadata && typeof body.metadata === 'object'
      ? (body.metadata as Record<string, any>)
      : {};
  const { legacyCampaign, ...baseMeta } = rawMeta;
  return {
    ...baseMeta,
    pushOnStart:
      baseMeta.pushOnStart ??
      body.notificationChannels?.includes('PUSH') ??
      false,
    legacyCampaign: {
      type: body.type ?? 'BONUS',
      status: body.status ?? 'DRAFT',
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      targetSegmentId: body.targetSegmentId ?? null,
      rules: body.rules ?? {},
      reward: reward ?? {},
      budget: body.budget ?? null,
      maxUsagePerCustomer: body.maxUsagePerCustomer ?? null,
      maxUsageTotal: body.maxUsageTotal ?? null,
      notificationChannels: body.notificationChannels ?? [],
      metadata: baseMeta,
    },
  };
}

function legacyPayloadToPromotion(
  body: LegacyCampaignPayload,
): PromotionPayload {
  const reward = body.reward ?? { type: 'POINTS', value: 0 };
  const rewardType = String(reward.type || 'POINTS').toUpperCase();
  if (rewardType !== 'POINTS') {
    throw new BadRequestException(
      'Поддерживаются только акции с начислением баллов (reward.type = POINTS)',
    );
  }
  const rewardValue = ensureNumber(reward.value, 0);
  const multiplierRaw =
    (reward as any).multiplier ??
    (reward as any).earnMultiplier ??
    (reward as any).pointsMultiplier ??
    (reward as any).rewardMultiplier;
  const multiplier =
    Number.isFinite(Number(multiplierRaw)) && Number(multiplierRaw) > 0
      ? Number(multiplierRaw)
      : 0;
  if (
    (!Number.isFinite(rewardValue) || rewardValue < 0) &&
    multiplier <= 0
  ) {
    throw new BadRequestException(
      'Укажите количество баллов или множитель для акции',
    );
  }
  const rewardMeta =
    reward && typeof (reward as any).metadata === 'object'
      ? ((reward as any).metadata as Record<string, any>)
      : {};
  const pointsExpire = Boolean(rewardMeta.pointsExpire);
  const pointsExpireDaysRaw = rewardMeta.pointsExpireDays;
  const pointsExpireDays =
    pointsExpire && Number.isFinite(Number(pointsExpireDaysRaw))
      ? Math.max(1, Math.trunc(Number(pointsExpireDaysRaw)))
      : null;
  const targetProducts =
    Array.isArray((body as any).productIds) && (body as any).productIds.length
      ? ((body as any).productIds as any[]).map((id) => String(id))
      : Array.isArray((body as any).products) && (body as any).products.length
        ? ((body as any).products as any[]).map((id) => String(id))
        : Array.isArray((rewardMeta as any).productIds)
          ? ((rewardMeta as any).productIds as any[]).map((id) => String(id))
          : [];
  const targetCategories =
    Array.isArray((body as any).categoryIds) && (body as any).categoryIds.length
      ? ((body as any).categoryIds as any[]).map((id) => String(id))
      : Array.isArray((body as any).categories) &&
          (body as any).categories.length
        ? ((body as any).categories as any[]).map((id) => String(id))
        : Array.isArray((rewardMeta as any).categoryIds)
          ? ((rewardMeta as any).categoryIds as any[]).map((id) => String(id))
          : [];
  const normalizedRewardMetadata = {
    ...reward,
    type: 'POINTS',
    value: rewardValue,
    productIds: targetProducts.length ? targetProducts : undefined,
    categoryIds: targetCategories.length ? targetCategories : undefined,
    metadata: {
      ...rewardMeta,
      pointsExpire,
      pointsExpireDays,
      multiplier: multiplier || rewardMeta?.multiplier,
      productIds: targetProducts.length ? targetProducts : rewardMeta?.productIds,
      categoryIds:
        targetCategories.length ? targetCategories : rewardMeta?.categoryIds,
    },
    pointsExpire,
    pointsExpireDays,
    multiplier,
    legacyType: 'POINTS',
  };
  const reminderRaw = body.metadata?.reminderOffsetHours;
  const reminderOffsetHours =
    reminderRaw === undefined || reminderRaw === null
      ? null
      : ensureNumber(reminderRaw, 0);
  return {
    name: body.name?.trim() || 'Без названия',
    description: body.description ?? null,
    segmentId: body.targetSegmentId ?? null,
    targetTierId: null,
    status: mapStatusToPromotion(body.status),
    rewardType: PromotionRewardType.POINTS,
    rewardValue,
    rewardMetadata: normalizedRewardMetadata,
    pointsExpireInDays: pointsExpire ? pointsExpireDays : null,
    pushOnStart: Boolean(
      body.metadata?.pushOnStart ?? body.notificationChannels?.includes('PUSH'),
    ),
    pushReminderEnabled: Boolean(body.metadata?.pushReminder),
    reminderOffsetHours,
    autoLaunch: Boolean(body.metadata?.autoLaunch),
    startAt: body.startDate ?? null,
    endAt: body.endDate ?? null,
    metadata: buildMetadata(body, normalizedRewardMetadata),
    actorId: body.metadata?.actorId ?? undefined,
  } satisfies PromotionPayload;
}

function toLegacyResponse(promotion: any) {
  const legacy = toLegacyCampaignDto(promotion);
  if (promotion?.audience) {
    (legacy as any).segment = {
      id: promotion.audience.id,
      name: promotion.audience.name ?? null,
      _count: promotion.audience._count ?? {},
    };
    (legacy as any).segmentName = promotion.audience.name ?? null;
  }
  if (promotion?.metrics) {
    (legacy as any).analytics = {
      revenueSeries: promotion.metrics.charts?.revenueSeries ?? null,
      metrics: promotion.metrics,
    };
  }
  return legacy;
}

@Controller('portal/loyalty/promotions')
@UseGuards(PortalGuard)
export class PromotionsController {
  constructor(private readonly service: LoyaltyProgramService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: string) {
    const normalized =
      status && status !== 'ALL' ? (status as PromotionStatus) : 'ALL';
    return this.service
      .listPromotions(this.merchantId(req), normalized as any)
      .then((items) => items.map((item) => toLegacyResponse(item)));
  }

  @Post()
  async create(@Req() req: any, @Body() body: LegacyCampaignPayload) {
    const merchantId = this.merchantId(req);
    const payload = legacyPayloadToPromotion(body);
    const created = await this.service.createPromotion(merchantId, payload);
    const full = await this.service.getPromotion(merchantId, created.id);
    return toLegacyResponse(full);
  }

  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: LegacyCampaignPayload,
  ) {
    const merchantId = this.merchantId(req);
    const payload = legacyPayloadToPromotion(body);
    await this.service.updatePromotion(merchantId, id, payload);
    const full = await this.service.getPromotion(merchantId, id);
    return toLegacyResponse(full);
  }

  @Post(':id/status')
  async changeStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: CampaignStatus; actorId?: string },
  ) {
    const merchantId = this.merchantId(req);
    const updated = await this.service.changePromotionStatus(
      merchantId,
      id,
      mapStatusToPromotion(body.status),
      body.actorId,
    );
    return toLegacyResponse(updated);
  }

  @Post('bulk/status')
  bulkStatus(
    @Req() req: any,
    @Body() body: { ids: string[]; status: CampaignStatus; actorId?: string },
  ) {
    return this.service.bulkUpdatePromotionStatus(
      this.merchantId(req),
      body.ids ?? [],
      mapStatusToPromotion(body.status),
      body.actorId,
    );
  }

  @Get(':id')
  async getById(@Req() req: any, @Param('id') id: string) {
    const merchantId = this.merchantId(req);
    const promotion = await this.service.getPromotion(merchantId, id);
    const legacy = toLegacyResponse(promotion);
    const participants = promotion.participants ?? [];
    const totalUsage =
      promotion.metrics?.participantsCount ?? participants.length;
    const totalReward =
      promotion.metrics?.pointsIssued ??
      participants.reduce((acc, p) => acc + (p.pointsIssued ?? 0), 0);
    const uniqueCustomers =
      promotion.metrics?.participantsCount ??
      new Set(participants.map((p) => p.customerId)).size;
    const avgReward = totalUsage ? Math.round(totalReward / totalUsage) : 0;
    return {
      ...legacy,
      segment: (legacy as any).segment,
      stats: {
        totalUsage,
        uniqueCustomers,
        totalReward,
        avgReward,
      },
      usages: participants.map((participant: any) => ({
        id: participant.id,
        usedAt: participant.joinedAt ?? participant.createdAt ?? null,
        customer: participant.customer
          ? {
              id: participant.customer.id,
              phone: participant.customer.phone ?? null,
              name: participant.customer.name ?? null,
            }
          : null,
        rewardType: 'POINTS',
        rewardValue: participant.pointsIssued ?? null,
      })),
    };
  }
}
