import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { CashierCredentialsDto, CashierRotateDto } from '../dto';
import { MerchantsCashierUseCase } from '../use-cases/merchants-cashier.use-case';

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
export class MerchantsCashierController {
  constructor(private readonly useCase: MerchantsCashierUseCase) {}

  // Cashier credentials (admin only)
  @Get(':id/cashier')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        login: { type: 'string', nullable: true },
      },
    },
  })
  getCashier(@Param('id') id: string) {
    return this.useCase.getCashier(id);
  }

  @Post(':id/cashier')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { login: { type: 'string' } },
    },
  })
  setCashier(@Param('id') id: string, @Body() body: CashierCredentialsDto) {
    return this.useCase.setCashier(id, body);
  }

  @Post(':id/cashier/rotate')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { login: { type: 'string' } },
    },
  })
  rotateCashier(@Param('id') id: string, @Body() body: CashierRotateDto) {
    return this.useCase.rotateCashier(id, body);
  }
}
