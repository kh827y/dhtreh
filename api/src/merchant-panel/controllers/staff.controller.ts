import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService, StaffFilters, UpsertStaffPayload } from '../merchant-panel.service';

@Controller('portal/staff')
@UseGuards(PortalGuard)
export class StaffController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  list(@Req() req: any, @Query() query: StaffFilters & { search?: string; status?: string; outletId?: string; groupId?: string; portalOnly?: string }) {
    const filters: StaffFilters = {
      search: query.search,
      outletId: query.outletId,
      groupId: query.groupId,
      portalOnly: query.portalOnly === 'true',
    };
    if (query.status && query.status !== 'ALL') {
      filters.status = query.status as any;
    }
    return this.service.listStaff(this.getMerchantId(req), filters);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.service.getStaff(this.getMerchantId(req), id);
  }

  @Post()
  create(@Req() req: any, @Body() body: UpsertStaffPayload) {
    return this.service.createStaff(this.getMerchantId(req), body);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpsertStaffPayload) {
    return this.service.updateStaff(this.getMerchantId(req), id, body);
  }

  @Post(':id/status')
  changeStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: any }) {
    return this.service.changeStaffStatus(this.getMerchantId(req), id, body.status);
  }

  @Post('access/:accessId/rotate')
  rotatePin(@Req() req: any, @Param('accessId') accessId: string) {
    return this.service.rotateStaffPin(this.getMerchantId(req), accessId);
  }

  @Post('access/:accessId/revoke')
  revokePin(@Req() req: any, @Param('accessId') accessId: string) {
    return this.service.revokeStaffPin(this.getMerchantId(req), accessId);
  }
}
