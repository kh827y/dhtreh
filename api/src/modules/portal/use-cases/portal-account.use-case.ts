import { Injectable } from '@nestjs/common';
import { PortalReviewsService } from '../services/reviews.service';
import { SubscriptionService } from '../../subscription/subscription.service';
import {
  PortalControllerHelpers,
  type PortalRequest,
} from '../controllers/portal.controller-helpers';

@Injectable()
export class PortalAccountUseCase {
  constructor(
    private readonly reviews: PortalReviewsService,
    private readonly subscriptions: SubscriptionService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  async subscription(req: PortalRequest) {
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

  listReviews(
    req: PortalRequest,
    withCommentOnly?: string,
    outletId?: string,
    staffId?: string,
    deviceId?: string,
    limit?: string,
    offset?: string,
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

  me(req: PortalRequest) {
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
