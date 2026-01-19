import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import type { Request } from 'express';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  hasPortalPermission,
  type PortalPermissionState,
} from '../../portal-auth/portal-permissions.util';
import { LoyaltyProgramService } from '../loyalty-program.service';
import type { TierDto, TierPayload } from '../loyalty-program.service';

type PortalRequest = Request & {
  portalMerchantId?: string;
  portalActor?: string;
  portalPermissions?: PortalPermissionState | null;
};

@Controller('portal/loyalty/tiers')
@UseGuards(PortalGuard)
export class TiersController {
  constructor(private readonly service: LoyaltyProgramService) {}

  private merchantId(req: PortalRequest) {
    return String(req.portalMerchantId ?? '');
  }

  @Get()
  list(@Req() req: PortalRequest): Promise<TierDto[]> {
    return this.service.listTiers(this.merchantId(req));
  }

  @Post()
  create(
    @Req() req: PortalRequest,
    @Body() body: TierPayload,
  ): Promise<TierDto> {
    return this.service.createTier(this.merchantId(req), body);
  }

  @Get(':tierId')
  detail(
    @Req() req: PortalRequest,
    @Param('tierId') tierId: string,
  ): Promise<TierDto> {
    return this.service.getTier(this.merchantId(req), tierId);
  }

  @Put(':tierId')
  update(
    @Req() req: PortalRequest,
    @Param('tierId') tierId: string,
    @Body() body: TierPayload,
  ): Promise<TierDto> {
    return this.service.updateTier(this.merchantId(req), tierId, body);
  }

  @Delete(':tierId')
  remove(@Req() req: PortalRequest, @Param('tierId') tierId: string) {
    return this.service.deleteTier(this.merchantId(req), tierId);
  }

  @Get(':tierId/customers')
  async members(
    @Req() req: PortalRequest,
    @Param('tierId') tierId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsed = limit
      ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
      : undefined;
    const result = await this.service.listTierCustomers(
      this.merchantId(req),
      tierId,
      {
        limit: parsed,
        cursor: cursor?.trim() || undefined,
      },
    );
    const canReadCustomers =
      req.portalActor !== 'STAFF' ||
      req.portalPermissions?.allowAll ||
      hasPortalPermission(req.portalPermissions, 'customers', 'read');
    if (canReadCustomers) {
      return result;
    }
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        name: null,
        phone: null,
        totalSpent: null,
      })),
    };
  }
}
