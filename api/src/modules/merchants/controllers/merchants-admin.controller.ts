import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../core/guards/admin.guard';
import { AdminIpGuard } from '../../../core/guards/admin-ip.guard';
import { AdminAuditInterceptor } from '../../admin/admin-audit.interceptor';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import {
  CreateMerchantDto,
  GrantSubscriptionDto,
  OkDto,
  UpdateMerchantDto,
} from '../dto';
import { MerchantsAdminUseCase } from '../use-cases/merchants-admin.use-case';

@Controller('merchants')
@UseGuards(AdminGuard, AdminIpGuard)
@UseInterceptors(AdminAuditInterceptor)
@ApiTags('merchants')
@ApiHeader({
  name: 'X-Admin-Key',
  required: true,
  description: 'Админ-ключ (в проде проксируется сервером админки)',
})
@ApiExtraModels(TransactionItemDto)
export class MerchantsAdminController {
  constructor(private readonly useCase: MerchantsAdminUseCase) {}

  // Admin: list / create merchants
  @Get()
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          initialName: { type: 'string' },
          createdAt: { type: 'string' },
          portalEmail: { type: 'string', nullable: true },
          portalLoginEnabled: { type: 'boolean' },
          portalTotpEnabled: { type: 'boolean' },
        },
      },
    },
  })
  listMerchants() {
    return this.useCase.listMerchants();
  }

  @Post()
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        initialName: { type: 'string' },
        email: { type: 'string' },
      },
    },
  })
  createMerchant(@Body() body: CreateMerchantDto) {
    return this.useCase.createMerchant(body);
  }

  // Admin: update/delete merchant
  @Put(':id')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        initialName: { type: 'string' },
        email: { type: 'string', nullable: true },
      },
    },
  })
  updateMerchant(@Param('id') id: string, @Body() body: UpdateMerchantDto) {
    return this.useCase.updateMerchant(id, body);
  }

  @Post(':id/subscription')
  grantSubscription(
    @Param('id') id: string,
    @Body() body: GrantSubscriptionDto,
  ) {
    return this.useCase.grantSubscription(id, body);
  }

  @Delete(':id/subscription')
  resetSubscription(@Param('id') id: string) {
    return this.useCase.resetSubscription(id);
  }

  @Delete(':id')
  @ApiOkResponse({ type: OkDto })
  deleteMerchant(@Param('id') id: string) {
    return this.useCase.deleteMerchant(id);
  }
}
