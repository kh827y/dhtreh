import {
  Body,
  Controller,
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
import {
  OkDto,
  PortalLoginEnabledDto,
  PortalTotpVerifyDto,
  TokenRespDto,
} from '../dto';
import { MerchantsPortalAuthUseCase } from '../use-cases/merchants-portal-auth.use-case';

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
export class MerchantsPortalAuthController {
  constructor(private readonly useCase: MerchantsPortalAuthUseCase) {}

  // ===== Portal auth management (admin only) =====
  @Post(':id/portal/rotate-key')
  @ApiOkResponse({
    schema: { type: 'object', properties: { key: { type: 'string' } } },
  })
  rotatePortalKey(@Param('id') id: string) {
    return this.useCase.rotatePortalKey(id);
  }

  @Post(':id/portal/login-enabled')
  @ApiOkResponse({ type: OkDto })
  setPortalLoginEnabled(
    @Param('id') id: string,
    @Body() body: PortalLoginEnabledDto,
  ) {
    return this.useCase.setPortalLoginEnabled(id, body);
  }

  @Post(':id/portal/totp/init')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { secret: { type: 'string' }, otpauth: { type: 'string' } },
    },
  })
  initTotp(@Param('id') id: string) {
    return this.useCase.initTotp(id);
  }

  @Post(':id/portal/totp/verify')
  @ApiOkResponse({ type: OkDto })
  verifyTotp(@Param('id') id: string, @Body() body: PortalTotpVerifyDto) {
    return this.useCase.verifyTotp(id, body);
  }

  @Post(':id/portal/totp/disable')
  @ApiOkResponse({ type: OkDto })
  disableTotp(@Param('id') id: string) {
    return this.useCase.disableTotp(id);
  }

  @Post(':id/portal/impersonate')
  @ApiOkResponse({ type: TokenRespDto })
  impersonatePortal(@Param('id') id: string) {
    return this.useCase.impersonatePortal(id);
  }
}
