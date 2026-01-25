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
import type {
  PortalPromoCodePayloadDto,
  PortalPromoCodeStatusDto,
} from '../dto/promocodes.dto';

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
    const limit = this.helpers.parseLimit(limitStr, {
      defaultValue: 50,
      max: 200,
    });
    const offset = this.helpers.parseOffset(offsetStr);
    return this.promoCodes.listForPortal(
      this.helpers.getMerchantId(req),
      status,
      limit,
      offset,
    );
  }

  promocodesIssue(req: PortalRequest, body: PortalPromoCodePayloadDto) {
    const payload = this.helpers.normalizePromocodePayload(
      req,
      body as unknown as Record<string, unknown>,
    ) as PortalPromoCodePayload;
    return this.promoCodes
      .createFromPortal(this.helpers.getMerchantId(req), payload)
      .then((created) => ({ ok: true, promoCodeId: created.id }));
  }

  promocodesDeactivate(req: PortalRequest, body: PortalPromoCodeStatusDto) {
    if (!body?.promoCodeId) throw new NotFoundException('Промокод не найден');
    return this.promoCodes.changeStatus(
      this.helpers.getMerchantId(req),
      body.promoCodeId,
      PromoCodeStatus.ARCHIVED,
    );
  }

  promocodesActivate(req: PortalRequest, body: PortalPromoCodeStatusDto) {
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
    body: PortalPromoCodePayloadDto,
  ) {
    const payload = this.helpers.normalizePromocodePayload(
      req,
      body as unknown as Record<string, unknown>,
    ) as PortalPromoCodePayload;
    return this.promoCodes.updateFromPortal(
      this.helpers.getMerchantId(req),
      promoCodeId,
      payload,
    );
  }
}
