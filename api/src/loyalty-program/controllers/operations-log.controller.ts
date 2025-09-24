import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { LoyaltyProgramService } from '../loyalty-program.service';

@Controller('portal/loyalty/operations')
@UseGuards(PortalGuard)
export class OperationsLogController {
  constructor(private readonly service: LoyaltyProgramService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  list(@Req() req: any, @Query() query: { type?: string; from?: string; to?: string }) {
    return this.service.operationsLog(this.merchantId(req), {
      type: query.type as any,
      from: query.from,
      to: query.to,
    });
  }
}
