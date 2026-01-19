import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  Delete,
  BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';
import {
  AdminMerchantsService,
  type UpdateMerchantSettingsPayload,
} from './admin-merchants.service';

interface ListQuery {
  search?: string;
  status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
}

@Controller('admin/merchants')
@UseGuards(AdminGuard, AdminIpGuard)
@UseInterceptors(AdminAuditInterceptor)
@ApiTags('admin-merchants')
export class AdminMerchantsController {
  constructor(private readonly service: AdminMerchantsService) {}

  @Get()
  listMerchants(@Query() query: ListQuery) {
    return this.service.listMerchants(query);
  }

  @Get(':id')
  getMerchant(@Param('id') id: string) {
    return this.service.getMerchant(id);
  }

  @Post()
  createMerchant(
    @Body()
    body: {
      name: string;
      portalEmail?: string;
      portalPassword?: string;
      ownerName?: string;
      settings?: UpdateMerchantSettingsPayload;
    },
  ) {
    return this.service.createMerchant({
      name: body.name,
      portalEmail: body.portalEmail,
      portalPassword: body.portalPassword,
      ownerName: body.ownerName,
      settings: body.settings,
    });
  }

  @Put(':id')
  updateMerchant(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      portalEmail?: string | null;
      portalPassword?: string | null;
      ownerName?: string | null;
      archived?: boolean;
    },
  ) {
    return this.service.updateMerchant(id, {
      name: body.name ?? undefined,
      portalEmail:
        body.portalEmail === undefined ? undefined : body.portalEmail,
      portalPassword:
        body.portalPassword === undefined ? undefined : body.portalPassword,
      ownerName: body.ownerName ?? undefined,
      archived: body.archived,
    });
  }

  @Put(':id/settings')
  updateSettings(
    @Param('id') id: string,
    @Body() body: UpdateMerchantSettingsPayload,
  ) {
    return this.service.updateSettings(id, body);
  }

  @Post(':id/cashier/rotate')
  rotateCashier(
    @Param('id') id: string,
    @Body() body: { regenerateLogin?: boolean },
  ) {
    return this.service.rotateCashierCredentials(id, !!body?.regenerateLogin);
  }

  @Post(':id/subscription')
  grantSubscription(
    @Param('id') id: string,
    @Body() body: { days?: number; planId?: string },
  ) {
    const days = Number(body?.days);
    if (!Number.isFinite(days) || days <= 0)
      throw new BadRequestException('days must be > 0');
    return this.service.grantSubscription(id, days, body?.planId);
  }

  @Delete(':id/subscription')
  resetSubscription(@Param('id') id: string) {
    return this.service.resetSubscription(id);
  }
}
