import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService } from '../merchant-panel.service';

@Controller('portal/cashier')
@UseGuards(PortalGuard)
export class CashierController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get('credentials')
  credentials(@Req() req: any) {
    return this.service.getCashierCredentials(this.getMerchantId(req));
  }

  @Post('credentials/rotate')
  rotateCredentials(@Req() req: any, @Body() body: { regenerateLogin?: boolean }) {
    return this.service.rotateCashierCredentials(this.getMerchantId(req), body?.regenerateLogin);
  }

  @Get('pins')
  pins(@Req() req: any) {
    return this.service.listCashierPins(this.getMerchantId(req));
  }
}
