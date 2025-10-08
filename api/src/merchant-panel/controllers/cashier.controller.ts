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
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService } from '../merchant-panel.service';
import {
  CashierCredentialsDto,
  CashierRotationResultDto,
  RotateCashierDto,
  CashierPinDto,
} from '../dto/cashier.dto';
import { plainToInstance } from 'class-transformer';
import { ApiTags } from '@nestjs/swagger';

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

  private getMerchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get('credentials')
  async credentials(@Req() req: any): Promise<CashierCredentialsDto> {
    const data = await this.service.getCashierCredentials(
      this.getMerchantId(req),
    );
    return plainToInstance(CashierCredentialsDto, data, {
      enableImplicitConversion: true,
    });
  }

  @Get()
  async summary(@Req() req: any): Promise<CashierCredentialsDto> {
    return this.credentials(req);
  }

  @Post('credentials/rotate')
  async rotateCredentials(
    @Req() req: any,
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
    @Req() req: any,
    @Body() body: RotateCashierDto,
  ): Promise<CashierRotationResultDto> {
    return this.rotateCredentials(req, body);
  }

  @Get('pins')
  async pins(@Req() req: any): Promise<CashierPinDto[]> {
    const pins = await this.service.listCashierPins(this.getMerchantId(req));
    return pins.map((pin) =>
      plainToInstance(CashierPinDto, pin, { enableImplicitConversion: true }),
    );
  }
}
