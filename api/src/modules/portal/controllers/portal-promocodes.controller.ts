import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PromoCodeStatus } from '@prisma/client';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  PromoCodesService,
  type PortalPromoCodePayload,
} from '../../promocodes/promocodes.service';
import { PortalControllerHelpers } from './portal.controller-helpers';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto } from '../../loyalty/dto/dto';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalPromocodesController {
  constructor(
    private readonly promoCodes: PromoCodesService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  @Get('promocodes')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  promocodesList(
    @Req() req: PortalRequest,
    @Query('status') status?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
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

  @Post('promocodes/issue')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, promoCodeId: { type: 'string' } },
    },
  })
  promocodesIssue(
    @Req() req: PortalRequest,
    @Body() body: PortalPromoCodePayload,
  ) {
    const payload = this.helpers.normalizePromocodePayload(
      req,
      body as Record<string, unknown>,
    ) as PortalPromoCodePayload;
    return this.promoCodes
      .createFromPortal(this.helpers.getMerchantId(req), payload)
      .then((created) => ({ ok: true, promoCodeId: created.id }));
  }

  @Post('promocodes/deactivate')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  promocodesDeactivate(
    @Req() req: PortalRequest,
    @Body() body: { promoCodeId?: string; code?: string },
  ) {
    if (!body?.promoCodeId) throw new NotFoundException('Промокод не найден');
    return this.promoCodes.changeStatus(
      this.helpers.getMerchantId(req),
      body.promoCodeId,
      PromoCodeStatus.ARCHIVED,
    );
  }

  @Post('promocodes/activate')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  promocodesActivate(
    @Req() req: PortalRequest,
    @Body() body: { promoCodeId?: string; code?: string },
  ) {
    if (!body?.promoCodeId) throw new NotFoundException('Промокод не найден');
    return this.promoCodes.changeStatus(
      this.helpers.getMerchantId(req),
      body.promoCodeId,
      PromoCodeStatus.ACTIVE,
    );
  }

  @Put('promocodes/:promoCodeId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  promocodesUpdate(
    @Req() req: PortalRequest,
    @Param('promoCodeId') promoCodeId: string,
    @Body() body: PortalPromoCodePayload,
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
