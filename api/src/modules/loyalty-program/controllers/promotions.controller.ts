import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PromotionStatus } from '@prisma/client';
import type { Request } from 'express';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  assertPortalPermissions,
  hasPortalPermission,
  PortalPermissionsHandled,
  resolvePromotionResource,
  type PortalPermissionState,
} from '../../portal-auth/portal-permissions.util';
import {
  LoyaltyProgramService,
  type PromotionPayload,
} from '../loyalty-program.service';
import {
  PromotionBulkStatusDto,
  PromotionPayloadDto,
  PromotionStatusDto,
} from '../dto';

type PromotionDetail = Awaited<
  ReturnType<LoyaltyProgramService['getPromotion']>
>;
type PromotionBase = Awaited<
  ReturnType<LoyaltyProgramService['changePromotionStatus']>
>;
type PromotionParticipant = PromotionDetail['participants'][number];
type PromotionView = PromotionBase & {
  metrics?: PromotionDetail['metrics'];
  audience?: PromotionDetail['audience'];
};

type PortalRequest = Request & {
  portalMerchantId?: string;
  portalActor?: string;
  portalStaffId?: string;
  portalPermissions?: PortalPermissionState | null;
};

const statusValues = new Set(Object.values(PromotionStatus));

function normalizeStatus(value?: string | null): PromotionStatus {
  if (value && statusValues.has(value as PromotionStatus)) {
    return value as PromotionStatus;
  }
  return PromotionStatus.DRAFT;
}

function normalizePayload(body: PromotionPayloadDto): PromotionPayload {
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

function toPortalResponse(promotion: PromotionView) {
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

  private merchantId(req: PortalRequest) {
    return String(req.portalMerchantId ?? '');
  }

  private actorId(req: PortalRequest): string | null {
    if (req.portalActor === 'STAFF' && req.portalStaffId) {
      return String(req.portalStaffId);
    }
    return null;
  }

  @Get()
  @PortalPermissionsHandled()
  async list(@Req() req: PortalRequest, @Query('status') status?: string) {
    const normalized: PromotionStatus | 'ALL' =
      status && status !== 'ALL' ? (status as PromotionStatus) : 'ALL';
    const items = await this.service.listPromotions(
      this.merchantId(req),
      normalized,
    );
    if (req.portalActor === 'STAFF' && !req.portalPermissions?.allowAll) {
      const canReadAny =
        hasPortalPermission(
          req.portalPermissions,
          'points_promotions',
          'read',
        ) ||
        hasPortalPermission(
          req.portalPermissions,
          'product_promotions',
          'read',
        );
      if (!canReadAny) {
        throw new ForbiddenException('Недостаточно прав');
      }
      const filtered = items.filter((item) =>
        hasPortalPermission(
          req.portalPermissions,
          resolvePromotionResource(item),
          'read',
        ),
      );
      return filtered.map((item) => toPortalResponse(item));
    }
    return items.map((item) => toPortalResponse(item));
  }

  @Post()
  @PortalPermissionsHandled()
  async create(
    @Req() req: PortalRequest,
    @Body() body: PromotionPayloadDto,
  ) {
    const merchantId = this.merchantId(req);
    const payload = normalizePayload(body);
    assertPortalPermissions(req, [resolvePromotionResource(payload)], 'manage');
    const created = await this.service.createPromotion(merchantId, payload);
    const full = await this.service.getPromotion(merchantId, created.id);
    return toPortalResponse(full);
  }

  @Put(':id')
  @PortalPermissionsHandled()
  async update(
    @Req() req: PortalRequest,
    @Param('id') id: string,
    @Body() body: PromotionPayloadDto,
  ) {
    const merchantId = this.merchantId(req);
    const payload = normalizePayload(body);
    const current = await this.service.getPromotion(merchantId, id);
    const currentResource = resolvePromotionResource(current);
    const mergedPayload = {
      rewardType: payload.rewardType ?? current.rewardType,
      rewardMetadata: payload.rewardMetadata ?? current.rewardMetadata,
    };
    const nextResource = resolvePromotionResource(mergedPayload);
    assertPortalPermissions(req, [currentResource], 'manage');
    if (nextResource !== currentResource) {
      assertPortalPermissions(req, [nextResource], 'manage');
    }
    await this.service.updatePromotion(merchantId, id, payload);
    const full = await this.service.getPromotion(merchantId, id);
    return toPortalResponse(full);
  }

  @Post(':id/status')
  @PortalPermissionsHandled()
  async changeStatus(
    @Req() req: PortalRequest,
    @Param('id') id: string,
    @Body() body: PromotionStatusDto,
  ) {
    const merchantId = this.merchantId(req);
    const current = await this.service.getPromotion(merchantId, id);
    assertPortalPermissions(req, [resolvePromotionResource(current)], 'manage');
    const status = normalizeStatus(String(body.status));
    const updated = await this.service.changePromotionStatus(
      merchantId,
      id,
      status,
      this.actorId(req) ?? undefined,
    );
    return toPortalResponse(updated);
  }

  @Post('bulk/status')
  @PortalPermissionsHandled()
  bulkStatus(
    @Req() req: PortalRequest,
    @Body() body: PromotionBulkStatusDto,
  ) {
    const merchantId = this.merchantId(req);
    return this.service
      .listPromotionBasics(merchantId, body.ids ?? [])
      .then((items) => {
        const resources = Array.from(
          new Set(items.map((item) => resolvePromotionResource(item))),
        );
        if (resources.length) {
          assertPortalPermissions(req, resources, 'manage', 'all');
        }
        const status = normalizeStatus(String(body.status));
        return this.service.bulkUpdatePromotionStatus(
          merchantId,
          body.ids ?? [],
          status,
          this.actorId(req) ?? undefined,
        );
      });
  }

  @Get(':id')
  @PortalPermissionsHandled()
  async getById(@Req() req: PortalRequest, @Param('id') id: string) {
    const merchantId = this.merchantId(req);
    const promotion = await this.service.getPromotion(merchantId, id);
    const uniqueCustomersCount = await this.service.countPromotionParticipants(
      merchantId,
      id,
    );
    assertPortalPermissions(req, [resolvePromotionResource(promotion)], 'read');
    const canReadCustomers =
      req.portalActor !== 'STAFF' ||
      req.portalPermissions?.allowAll ||
      hasPortalPermission(req.portalPermissions, 'customers', 'read');
    const participants = promotion.participants ?? [];
    const totalUsage =
      promotion.metrics?.participantsCount ?? participants.length;
    const totalReward =
      promotion.metrics?.pointsIssued ??
      participants.reduce((acc, p) => acc + (p.pointsIssued ?? 0), 0);
    const uniqueCustomers = uniqueCustomersCount;
    const avgReward = totalUsage ? Math.round(totalReward / totalUsage) : 0;
    const rewardType =
      promotion.rewardType === 'DISCOUNT' ? 'DISCOUNT' : 'POINTS';
    return {
      ...toPortalResponse(promotion),
      stats: {
        totalUsage,
        uniqueCustomers,
        totalReward,
        avgReward,
      },
      usages: participants.map((participant: PromotionParticipant) => ({
        id: participant.id,
        usedAt: participant.joinedAt ?? participant.createdAt ?? null,
        customer: participant.customer
          ? {
              id: participant.customer.id,
              phone: canReadCustomers
                ? (participant.customer.phone ?? null)
                : null,
              name: canReadCustomers
                ? (participant.customer.name ?? null)
                : null,
            }
          : null,
        rewardType,
        rewardValue:
          rewardType === 'POINTS'
            ? (participant.pointsIssued ?? null)
            : (promotion.rewardValue ?? null),
      })),
    };
  }

  @Delete(':id')
  @PortalPermissionsHandled()
  async delete(@Req() req: PortalRequest, @Param('id') id: string) {
    const merchantId = this.merchantId(req);
    const current = await this.service.getPromotion(merchantId, id);
    assertPortalPermissions(req, [resolvePromotionResource(current)], 'manage');
    return this.service.deletePromotion(merchantId, id);
  }
}
