import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PromotionStatus } from '@prisma/client';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  LoyaltyProgramService,
  type PromotionPayload,
} from '../loyalty-program.service';

type PortalPromotionPayload = Omit<PromotionPayload, 'actorId'>;

const statusValues = new Set(Object.values(PromotionStatus));

function normalizeStatus(value?: string | null): PromotionStatus {
  if (value && statusValues.has(value as PromotionStatus)) {
    return value as PromotionStatus;
  }
  return PromotionStatus.DRAFT;
}

function normalizePayload(body: PortalPromotionPayload): PromotionPayload {
  const segmentId = body.segmentId === '' ? null : body.segmentId;
  const metadata =
    body.metadata === undefined
      ? undefined
      : body.metadata && typeof body.metadata === 'object'
        ? body.metadata
        : null;
  const rewardMetadata =
    body.rewardMetadata === undefined
      ? undefined
      : body.rewardMetadata && typeof body.rewardMetadata === 'object'
        ? body.rewardMetadata
        : null;

  return {
    ...body,
    segmentId,
    status: body.status ? normalizeStatus(String(body.status)) : body.status,
    metadata,
    rewardMetadata,
  };
}

function toPortalResponse(promotion: any) {
  return {
    id: promotion.id,
    name: promotion.name,
    description: promotion.description ?? null,
    status: promotion.status,
    startAt: promotion.startAt ?? null,
    endAt: promotion.endAt ?? null,
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt,
    segmentId: promotion.segmentId ?? null,
    rewardType: promotion.rewardType,
    rewardValue: promotion.rewardValue ?? null,
    rewardMetadata: promotion.rewardMetadata ?? null,
    pointsExpireInDays: promotion.pointsExpireInDays ?? null,
    pushOnStart: promotion.pushOnStart ?? false,
    pushReminderEnabled: promotion.pushReminderEnabled ?? false,
    reminderOffsetHours: promotion.reminderOffsetHours ?? null,
    pushTemplateStartId: promotion.pushTemplateStartId ?? null,
    pushTemplateReminderId: promotion.pushTemplateReminderId ?? null,
    metadata: promotion.metadata ?? null,
    metrics: promotion.metrics ?? null,
    audience: promotion.audience
      ? {
          id: promotion.audience.id,
          name: promotion.audience.name ?? null,
          _count: promotion.audience._count ?? {},
        }
      : null,
  };
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
      .then((items) => items.map((item) => toPortalResponse(item)));
  }

  @Post()
  async create(@Req() req: any, @Body() body: PortalPromotionPayload) {
    const merchantId = this.merchantId(req);
    const payload = normalizePayload(body);
    const created = await this.service.createPromotion(merchantId, payload);
    const full = await this.service.getPromotion(merchantId, created.id);
    return toPortalResponse(full);
  }

  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: PortalPromotionPayload,
  ) {
    const merchantId = this.merchantId(req);
    const payload = normalizePayload(body);
    await this.service.updatePromotion(merchantId, id, payload);
    const full = await this.service.getPromotion(merchantId, id);
    return toPortalResponse(full);
  }

  @Post(':id/status')
  async changeStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: PromotionStatus; actorId?: string },
  ) {
    const merchantId = this.merchantId(req);
    const status = normalizeStatus(String(body.status));
    const updated = await this.service.changePromotionStatus(
      merchantId,
      id,
      status,
      body.actorId,
    );
    return toPortalResponse(updated);
  }

  @Post('bulk/status')
  bulkStatus(
    @Req() req: any,
    @Body() body: { ids: string[]; status: PromotionStatus; actorId?: string },
  ) {
    const status = normalizeStatus(String(body.status));
    return this.service.bulkUpdatePromotionStatus(
      this.merchantId(req),
      body.ids ?? [],
      status,
      body.actorId,
    );
  }

  @Get(':id')
  async getById(@Req() req: any, @Param('id') id: string) {
    const merchantId = this.merchantId(req);
    const promotion = await this.service.getPromotion(merchantId, id);
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
      ...toPortalResponse(promotion),
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

  @Delete(':id')
  delete(@Req() req: any, @Param('id') id: string) {
    const merchantId = this.merchantId(req);
    return this.service.deletePromotion(merchantId, id);
  }
}
