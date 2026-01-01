import {
  Body,
  Controller,
  Delete,
  Get,
  ForbiddenException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  assertPortalPermissions,
  hasPortalPermission,
  resolveMechanicResource,
} from '../../portal-auth/portal-permissions.util';
import {
  LoyaltyProgramService,
  type MechanicPayload,
} from '../loyalty-program.service';
import { MechanicStatus } from '@prisma/client';

const MECHANIC_RESOURCES = [
  'mechanic_birthday',
  'mechanic_auto_return',
  'mechanic_levels',
  'mechanic_redeem_limits',
  'mechanic_registration_bonus',
  'mechanic_ttl',
  'mechanic_referral',
  'loyalty',
];

@Controller('portal/loyalty/mechanics')
@UseGuards(PortalGuard)
export class MechanicsController {
  constructor(private readonly service: LoyaltyProgramService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  async list(@Req() req: any, @Query('status') status?: string) {
    const normalized =
      status && status !== 'ALL' ? (status as MechanicStatus) : 'ALL';
    const items = await this.service.listMechanics(
      this.merchantId(req),
      normalized as any,
    );
    if (req.portalActor !== 'STAFF' || req.portalPermissions?.allowAll) {
      return items;
    }
    const canReadAny = MECHANIC_RESOURCES.some((resource) =>
      hasPortalPermission(req.portalPermissions, resource, 'read'),
    );
    if (!canReadAny) {
      throw new ForbiddenException('Недостаточно прав');
    }
    return items.filter((item: any) =>
      hasPortalPermission(
        req.portalPermissions,
        resolveMechanicResource(item?.type),
        'read',
      ),
    );
  }

  @Post()
  create(@Req() req: any, @Body() body: MechanicPayload) {
    assertPortalPermissions(
      req,
      [resolveMechanicResource(body?.type)],
      'manage',
    );
    return this.service.createMechanic(this.merchantId(req), body);
  }

  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: MechanicPayload,
  ) {
    const current = await this.service.getMechanic(this.merchantId(req), id);
    const currentResource = resolveMechanicResource(current?.type);
    const nextResource = resolveMechanicResource(body?.type ?? current?.type);
    assertPortalPermissions(req, [currentResource], 'manage');
    if (nextResource !== currentResource) {
      assertPortalPermissions(req, [nextResource], 'manage');
    }
    return this.service.updateMechanic(this.merchantId(req), id, body);
  }

  @Post(':id/status')
  async changeStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: MechanicStatus; actorId?: string },
  ) {
    const current = await this.service.getMechanic(this.merchantId(req), id);
    assertPortalPermissions(
      req,
      [resolveMechanicResource(current?.type)],
      'manage',
    );
    return this.service.changeMechanicStatus(
      this.merchantId(req),
      id,
      body.status,
      body.actorId,
    );
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const current = await this.service.getMechanic(this.merchantId(req), id);
    assertPortalPermissions(
      req,
      [resolveMechanicResource(current?.type)],
      'manage',
    );
    return this.service.deleteMechanic(this.merchantId(req), id);
  }
}
