import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { AccessScope } from '@prisma/client';
import { MerchantPanelService, AccessGroupPayload } from '../merchant-panel.service';

@Controller('portal/access-groups')
@UseGuards(PortalGuard)
export class AccessGroupsController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  list(@Req() req: any, @Query('scope') scope?: string) {
    const normalized = scope && scope !== 'ALL' ? (scope as AccessScope) : 'ALL';
    return this.service.listAccessGroups(this.getMerchantId(req), normalized as any);
  }

  @Post()
  create(@Req() req: any, @Body() body: AccessGroupPayload & { actorId?: string }) {
    return this.service.createAccessGroup(this.getMerchantId(req), body, body.actorId);
  }

  @Put(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AccessGroupPayload & { actorId?: string },
  ) {
    return this.service.updateAccessGroup(this.getMerchantId(req), id, body, body.actorId);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteAccessGroup(this.getMerchantId(req), id);
  }

  @Post(':id/members')
  setMembers(@Req() req: any, @Param('id') id: string, @Body() body: { staffIds: string[] }) {
    return this.service.setGroupMembers(this.getMerchantId(req), id, body.staffIds ?? []);
  }
}
