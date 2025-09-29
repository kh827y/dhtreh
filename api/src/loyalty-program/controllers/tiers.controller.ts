import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { LoyaltyProgramService } from '../loyalty-program.service';
import type { TierDto, TierPayload } from '../loyalty-program.service';

@Controller('portal/loyalty/tiers')
@UseGuards(PortalGuard)
export class TiersController {
  constructor(private readonly service: LoyaltyProgramService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  list(@Req() req: any): Promise<TierDto[]> {
    return this.service.listTiers(this.merchantId(req));
  }

  @Post()
  create(@Req() req: any, @Body() body: TierPayload): Promise<TierDto> {
    return this.service.createTier(this.merchantId(req), body);
  }

  @Get(':tierId')
  detail(@Req() req: any, @Param('tierId') tierId: string): Promise<TierDto> {
    return this.service.getTier(this.merchantId(req), tierId);
  }

  @Put(':tierId')
  update(@Req() req: any, @Param('tierId') tierId: string, @Body() body: TierPayload): Promise<TierDto> {
    return this.service.updateTier(this.merchantId(req), tierId, body);
  }

  @Delete(':tierId')
  remove(@Req() req: any, @Param('tierId') tierId: string) {
    return this.service.deleteTier(this.merchantId(req), tierId);
  }
}
