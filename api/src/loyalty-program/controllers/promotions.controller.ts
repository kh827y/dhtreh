import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { LoyaltyProgramService, type PromotionPayload } from '../loyalty-program.service';
import { PromotionStatus } from '@prisma/client';

@Controller('portal/loyalty/promotions')
@UseGuards(PortalGuard)
export class PromotionsController {
  constructor(private readonly service: LoyaltyProgramService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: string) {
    const normalized = status && status !== 'ALL' ? (status as PromotionStatus) : 'ALL';
    return this.service.listPromotions(this.merchantId(req), normalized as any);
  }

  @Post()
  create(@Req() req: any, @Body() body: PromotionPayload) {
    return this.service.createPromotion(this.merchantId(req), body);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: PromotionPayload) {
    return this.service.updatePromotion(this.merchantId(req), id, body);
  }

  @Post(':id/status')
  changeStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: PromotionStatus; actorId?: string }) {
    return this.service.changePromotionStatus(this.merchantId(req), id, body.status, body.actorId);
  }

  @Post('bulk/status')
  bulkStatus(@Req() req: any, @Body() body: { ids: string[]; status: PromotionStatus; actorId?: string }) {
    return this.service.bulkUpdatePromotionStatus(this.merchantId(req), body.ids ?? [], body.status, body.actorId);
  }
}
