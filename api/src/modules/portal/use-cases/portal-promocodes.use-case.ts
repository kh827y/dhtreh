import { Injectable, NotFoundException } from '@nestjs/common';
import { PromoCodeStatus } from '@prisma/client';
import {
  PromoCodesService,
  type PortalPromoCodePayload,
} from '../../promocodes/promocodes.service';
import {
  PortalControllerHelpers,
  type PortalRequest,
} from '../controllers/portal.controller-helpers';

@Injectable()
export class PortalPromocodesUseCase {
  constructor(
    private readonly promoCodes: PromoCodesService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  promocodesList(
    req: PortalRequest,
    status?: string,
    limitStr?: string,
    offsetStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const offset = offsetStr ? Math.max(parseInt(offsetStr, 10) || 0, 0) : 0;
    return this.promoCodes.listForPortal(
      this.helpers.getMerchantId(req),
      status,
      limit,
      offset,
    );
  }

  promocodesIssue(req: PortalRequest, body: PortalPromoCodePayload) {
    const payload = this.helpers.normalizePromocodePayload(
      req,
      body as Record<string, unknown>,
    ) as PortalPromoCodePayload;
    return this.promoCodes
      .createFromPortal(this.helpers.getMerchantId(req), payload)
      .then((created) => ({ ok: true, promoCodeId: created.id }));
  }

  promocodesDeactivate(
    req: PortalRequest,
    body: { promoCodeId?: string; code?: string },
  ) {
    if (!body?.promoCodeId) throw new NotFoundException('Промокод не найден');
    return this.promoCodes.changeStatus(
      this.helpers.getMerchantId(req),
      body.promoCodeId,
      PromoCodeStatus.ARCHIVED,
    );
  }

  promocodesActivate(
    req: PortalRequest,
    body: { promoCodeId?: string; code?: string },
  ) {
    if (!body?.promoCodeId) throw new NotFoundException('Промокод не найден');
    return this.promoCodes.changeStatus(
      this.helpers.getMerchantId(req),
      body.promoCodeId,
      PromoCodeStatus.ACTIVE,
    );
  }

  promocodesUpdate(
    req: PortalRequest,
    promoCodeId: string,
    body: PortalPromoCodePayload,
  ) {
    const payload = this.helpers.normalizePromocodePayload(
      req,
      body as Record<string, unknown>,
    ) as PortalPromoCodePayload;
    return this.promoCodes.updateFromPortal(
      this.helpers.getMerchantId(req),
      promoCodeId,
      payload,
    );
  }
}
