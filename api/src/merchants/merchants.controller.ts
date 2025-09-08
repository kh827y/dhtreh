import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards, Query } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { CreateDeviceDto, CreateOutletDto, CreateStaffDto, UpdateDeviceDto, UpdateMerchantSettingsDto, UpdateOutletDto, UpdateStaffDto } from './dto';
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

  // Outlets
  @Get(':id/outlets')
  listOutlets(@Param('id') id: string) {
    return this.service.listOutlets(id);
  }
  @Post(':id/outlets')
  createOutlet(@Param('id') id: string, @Body() dto: CreateOutletDto) {
    return this.service.createOutlet(id, dto.name, dto.address);
  }
  @Put(':id/outlets/:outletId')
  updateOutlet(@Param('id') id: string, @Param('outletId') outletId: string, @Body() dto: UpdateOutletDto) {
    return this.service.updateOutlet(id, outletId, dto);
  }
  @Delete(':id/outlets/:outletId')
  deleteOutlet(@Param('id') id: string, @Param('outletId') outletId: string) {
    return this.service.deleteOutlet(id, outletId);
  }

  // Devices
  @Get(':id/devices')
  listDevices(@Param('id') id: string) {
    return this.service.listDevices(id);
  }
  @Post(':id/devices')
  createDevice(@Param('id') id: string, @Body() dto: CreateDeviceDto) {
    return this.service.createDevice(id, dto.type as string, dto.outletId, dto.label);
  }
  @Put(':id/devices/:deviceId')
  updateDevice(@Param('id') id: string, @Param('deviceId') deviceId: string, @Body() dto: UpdateDeviceDto) {
    return this.service.updateDevice(id, deviceId, dto);
  }
  @Delete(':id/devices/:deviceId')
  deleteDevice(@Param('id') id: string, @Param('deviceId') deviceId: string) {
    return this.service.deleteDevice(id, deviceId);
  }

  // Staff
  @Get(':id/staff')
  listStaff(@Param('id') id: string) {
    return this.service.listStaff(id);
  }
  @Post(':id/staff')
  createStaff(@Param('id') id: string, @Body() dto: CreateStaffDto) {
    return this.service.createStaff(id, dto);
  }
  @Put(':id/staff/:staffId')
  updateStaff(@Param('id') id: string, @Param('staffId') staffId: string, @Body() dto: UpdateStaffDto) {
    return this.service.updateStaff(id, staffId, dto);
  }
  @Delete(':id/staff/:staffId')
  deleteStaff(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.service.deleteStaff(id, staffId);
  }

  // Outbox monitor
  @Get(':id/outbox')
  listOutbox(@Param('id') id: string, @Query('status') status?: string, @Query('limit') limitStr?: string) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : undefined;
    return this.service.listOutbox(id, status, limit);
  }
  @Post(':id/outbox/:eventId/retry')
  retryOutbox(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.service.retryOutbox(id, eventId);
  }
}
