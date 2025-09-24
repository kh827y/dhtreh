import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService, OutletFilters, UpsertOutletPayload } from '../merchant-panel.service';

@Controller('portal/outlets')
@UseGuards(PortalGuard)
export class OutletsController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  list(@Req() req: any, @Query() query: OutletFilters & { status?: string; hidden?: string; search?: string }) {
    const filters: OutletFilters = {
      search: query.search,
    };
    if (query.status && query.status !== 'ALL') {
      filters.status = query.status as any;
    }
    if (query.hidden != null) {
      filters.hidden = query.hidden === 'true';
    }
    return this.service.listOutlets(this.getMerchantId(req), filters);
  }

  @Post()
  create(@Req() req: any, @Body() body: UpsertOutletPayload) {
    return this.service.createOutlet(this.getMerchantId(req), body);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpsertOutletPayload) {
    return this.service.updateOutlet(this.getMerchantId(req), id, body);
  }
}
