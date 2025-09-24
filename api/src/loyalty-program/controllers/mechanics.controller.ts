import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { LoyaltyProgramService } from '../loyalty-program.service';
import type { MechanicPayload } from '../loyalty-program.service';
import { MechanicStatus } from '@prisma/client';

@Controller('portal/loyalty/mechanics')
@UseGuards(PortalGuard)
export class MechanicsController {
  constructor(private readonly service: LoyaltyProgramService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: string) {
    const normalized = status && status !== 'ALL' ? (status as MechanicStatus) : 'ALL';
    return this.service.listMechanics(this.merchantId(req), normalized as any);
  }

  @Post()
  create(@Req() req: any, @Body() body: MechanicPayload) {
    return this.service.createMechanic(this.merchantId(req), body);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: MechanicPayload) {
    return this.service.updateMechanic(this.merchantId(req), id, body);
  }

  @Post(':id/status')
  changeStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: MechanicStatus; actorId?: string }) {
    return this.service.changeMechanicStatus(this.merchantId(req), id, body.status, body.actorId);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteMechanic(this.merchantId(req), id);
  }
}
