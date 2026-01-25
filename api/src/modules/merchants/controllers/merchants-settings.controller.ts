import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../core/guards/admin.guard';
import { AdminIpGuard } from '../../../core/guards/admin-ip.guard';
import { AdminAuditInterceptor } from '../../admin/admin-audit.interceptor';
import { ErrorDto, TransactionItemDto } from '../../loyalty/dto/dto';
import {
  MerchantSettingsRespDto,
  OkDto,
  ResetAntifraudLimitDto,
  UpdateMerchantSettingsDto,
} from '../dto';
import { MerchantsSettingsUseCase } from '../use-cases/merchants-settings.use-case';

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
export class MerchantsSettingsController {
  constructor(private readonly useCase: MerchantsSettingsUseCase) {}

  @Get(':id/settings')
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  getSettings(@Param('id') id: string) {
    return this.useCase.getSettings(id);
  }

  @Get(':id/rules/preview')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        earnBps: { type: 'number' },
        redeemLimitBps: { type: 'number' },
      },
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  previewRules(
    @Param('id') id: string,
    @Query('channel') channel: 'VIRTUAL' | 'PC_POS' | 'SMART',
    @Query('weekday') weekdayStr?: string,
    @Query('category') category?: string,
  ) {
    return this.useCase.previewRules(id, channel, weekdayStr, category);
  }

  @Put(':id/settings')
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  updateSettings(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantSettingsDto,
  ) {
    return this.useCase.updateSettings(id, dto);
  }

  @Post(':id/antifraud/reset')
  @ApiOkResponse({ type: OkDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  resetAntifraudLimit(
    @Param('id') id: string,
    @Body() body: ResetAntifraudLimitDto,
  ) {
    return this.useCase.resetAntifraudLimit(id, body);
  }
}
