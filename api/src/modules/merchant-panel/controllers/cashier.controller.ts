import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService } from '../merchant-panel.service';
import {
  CashierIdDto,
  CashierCredentialsDto,
  CashierRotationResultDto,
  RotateCashierDto,
  CashierPinDto,
  IssueCashierActivationCodesDto,
} from '../dto/cashier.dto';
import { plainToInstance } from 'class-transformer';
import { ApiTags } from '@nestjs/swagger';

type PortalRequest = Request & {
  portalMerchantId?: string;
};

@ApiTags('portal-cashier')
@Controller('portal/cashier')
@UseGuards(PortalGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CashierController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: PortalRequest) {
    return String(req.portalMerchantId ?? '');
  }

  @Get('credentials')
  async credentials(@Req() req: PortalRequest): Promise<CashierCredentialsDto> {
    const data = await this.service.getCashierCredentials(
      this.getMerchantId(req),
    );
    return plainToInstance(CashierCredentialsDto, data, {
      enableImplicitConversion: true,
    });
  }

  @Get()
  async summary(@Req() req: PortalRequest): Promise<CashierCredentialsDto> {
    return this.credentials(req);
  }

  @Post('credentials/rotate')
  async rotateCredentials(
    @Req() req: PortalRequest,
    @Body() body: RotateCashierDto,
  ): Promise<CashierRotationResultDto> {
    const result = await this.service.rotateCashierCredentials(
      this.getMerchantId(req),
      body?.regenerateLogin,
    );
    return plainToInstance(CashierRotationResultDto, result, {
      enableImplicitConversion: true,
    });
  }

  @Post('rotate')
  async rotate(
    @Req() req: PortalRequest,
    @Body() body: RotateCashierDto,
  ): Promise<CashierRotationResultDto> {
    return this.rotateCredentials(req, body);
  }

  @Get('pins')
  async pins(@Req() req: PortalRequest): Promise<CashierPinDto[]> {
    const pins = await this.service.listCashierPins(this.getMerchantId(req));
    return pins.map((pin) =>
      plainToInstance(CashierPinDto, pin, { enableImplicitConversion: true }),
    );
  }

  @Get('activation-codes')
  async activationCodes(@Req() req: PortalRequest) {
    return this.service.listCashierActivationCodes(this.getMerchantId(req));
  }

  @Post('activation-codes')
  async issueActivationCodes(
    @Req() req: PortalRequest,
    @Body() body: IssueCashierActivationCodesDto,
  ) {
    return this.service.issueCashierActivationCodes(
      this.getMerchantId(req),
      body?.count ?? 1,
    );
  }

  @Post('activation-codes/revoke')
  async revokeActivationCode(
    @Req() req: PortalRequest,
    @Body() body: CashierIdDto,
  ) {
    return this.service.revokeCashierActivationCode(
      this.getMerchantId(req),
      String(body?.id || ''),
    );
  }

  @Get('device-sessions')
  async deviceSessions(@Req() req: PortalRequest) {
    return this.service.listCashierDeviceSessions(this.getMerchantId(req));
  }

  @Post('device-sessions/revoke')
  async revokeDeviceSession(
    @Req() req: PortalRequest,
    @Body() body: CashierIdDto,
  ) {
    return this.service.revokeCashierDeviceSession(
      this.getMerchantId(req),
      String(body?.id || ''),
    );
  }
}
