import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { PortalPermissionsHandled } from '../../portal-auth/portal-permissions.util';
import { PortalReviewsService } from '../services/reviews.service';
import { SubscriptionService } from '../../subscription/subscription.service';
import { PortalControllerHelpers } from './portal.controller-helpers';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import { AllowInactiveSubscription } from '../../../core/guards/subscription.guard';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalAccountController {
  constructor(
    private readonly reviews: PortalReviewsService,
    private readonly subscriptions: SubscriptionService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  @Get('subscription')
  @AllowInactiveSubscription()
  async subscription(@Req() req: PortalRequest) {
    const merchantId = this.helpers.getMerchantId(req);
    const { state } = await this.subscriptions.describeSubscription(merchantId);
    return {
      planId: state.planId,
      planName: state.planName,
      status: state.status,
      currentPeriodEnd: state.currentPeriodEnd,
      daysLeft: state.daysLeft,
      expiresSoon: state.expiresSoon,
      expired: state.expired,
    };
  }

  @Get('reviews')
  async listReviews(
    @Req() req: PortalRequest,
    @Query('withCommentOnly') withCommentOnly?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.reviews.list(merchantId, {
      withCommentOnly: withCommentOnly === '1' || withCommentOnly === 'true',
      outletId: outletId || undefined,
      staffId: staffId || undefined,
      deviceId: deviceId || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('me')
  @PortalPermissionsHandled()
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        role: { type: 'string' },
        actor: { type: 'string' },
        adminImpersonation: { type: 'boolean' },
        staff: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            name: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            role: { type: 'string', nullable: true },
            groups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  scope: { type: 'string' },
                },
              },
            },
          },
        },
        permissions: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  })
  me(@Req() req: PortalRequest) {
    const actor = req.portalActor || 'MERCHANT';
    const staff =
      actor === 'STAFF'
        ? {
            id: String(req.portalStaffId || ''),
            name:
              typeof req.portalStaffName === 'string'
                ? req.portalStaffName
                : null,
            email:
              typeof req.portalStaffEmail === 'string'
                ? req.portalStaffEmail
                : null,
            role:
              typeof req.portalStaffRole === 'string'
                ? req.portalStaffRole
                : null,
            groups: Array.isArray(req.portalAccessGroups)
              ? req.portalAccessGroups
              : [],
          }
        : null;
    return {
      merchantId: this.helpers.getMerchantId(req),
      role: req.portalRole || 'MERCHANT',
      actor,
      adminImpersonation: !!req.portalAdminImpersonation,
      staff,
      permissions: this.helpers.normalizePortalPermissions(req.portalPermissions),
    };
  }
}
