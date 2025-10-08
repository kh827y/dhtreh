import {
  Body,
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
  PromoCodesService,
  type LoyaltyPromoCodePayload,
} from '../../promocodes/promocodes.service';
import { PromoCodeStatus } from '@prisma/client';

@Controller('portal/loyalty/promocodes')
@UseGuards(PortalGuard)
export class PromoCodesController {
  constructor(private readonly service: PromoCodesService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: string) {
    const normalized =
      status && status !== 'ALL' ? (status as PromoCodeStatus) : 'ALL';
    return this.service.listPromoCodes(this.merchantId(req), normalized as any);
  }

  @Post()
  create(@Req() req: any, @Body() body: LoyaltyPromoCodePayload) {
    return this.service.createPromoCode(this.merchantId(req), body);
  }

  @Put(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: LoyaltyPromoCodePayload,
  ) {
    return this.service.updatePromoCode(this.merchantId(req), id, body);
  }

  @Post(':id/status')
  changeStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: PromoCodeStatus; actorId?: string },
  ) {
    return this.service.changePromoCodeStatus(
      this.merchantId(req),
      id,
      body.status,
      body.actorId,
    );
  }

  @Post('bulk/status')
  bulkStatus(
    @Req() req: any,
    @Body() body: { ids: string[]; status: PromoCodeStatus; actorId?: string },
  ) {
    return this.service.bulkArchivePromoCodes(
      this.merchantId(req),
      body.ids ?? [],
      body.status,
      body.actorId,
    );
  }
}
