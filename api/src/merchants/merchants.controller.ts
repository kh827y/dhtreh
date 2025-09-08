import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { UpdateMerchantSettingsDto } from './dto';
import { AdminGuard } from '../admin.guard';

@Controller('merchants')
@UseGuards(AdminGuard)
export class MerchantsController {
  constructor(private readonly service: MerchantsService) {}

  @Get(':id/settings')
  getSettings(@Param('id') id: string) {
    return this.service.getSettings(id);
  }

  @Put(':id/settings')
  updateSettings(@Param('id') id: string, @Body() dto: UpdateMerchantSettingsDto) {
    return this.service.updateSettings(id, dto.earnBps, dto.redeemLimitBps, dto.qrTtlSec, dto.webhookUrl, dto.webhookSecret);
  }
}
