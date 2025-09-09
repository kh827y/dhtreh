import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards, Query } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { CreateDeviceDto, CreateOutletDto, CreateStaffDto, UpdateDeviceDto, UpdateMerchantSettingsDto, UpdateOutletDto, UpdateStaffDto } from './dto';
import { AdminGuard } from '../admin.guard';
import { ApiHeader, ApiTags } from '@nestjs/swagger';

@Controller('merchants')
@UseGuards(AdminGuard)
@ApiTags('merchants')
@ApiHeader({ name: 'X-Admin-Key', required: true, description: 'Админ-ключ (в проде проксируется сервером админки)' })
export class MerchantsController {
  constructor(private readonly service: MerchantsService) {}

  @Get(':id/settings')
  getSettings(@Param('id') id: string) {
    return this.service.getSettings(id);
  }

  @Put(':id/settings')
  updateSettings(@Param('id') id: string, @Body() dto: UpdateMerchantSettingsDto) {
    return this.service.updateSettings(
      id,
      dto.earnBps,
      dto.redeemLimitBps,
      dto.qrTtlSec,
      dto.webhookUrl,
      dto.webhookSecret,
      dto.webhookKeyId,
      dto.redeemCooldownSec,
      dto.earnCooldownSec,
      dto.redeemDailyCap,
      dto.earnDailyCap,
      dto.requireJwtForQuote,
      dto.rulesJson,
      dto.requireBridgeSig,
      dto.bridgeSecret,
      dto.requireStaffKey,
    );
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

  @Post(':id/devices/:deviceId/secret')
  issueDeviceSecret(@Param('id') id: string, @Param('deviceId') deviceId: string) {
    return this.service.issueDeviceSecret(id, deviceId);
  }
  @Delete(':id/devices/:deviceId/secret')
  revokeDeviceSecret(@Param('id') id: string, @Param('deviceId') deviceId: string) {
    return this.service.revokeDeviceSecret(id, deviceId);
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

  // Staff tokens
  @Post(':id/staff/:staffId/token')
  issueStaffToken(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.service.issueStaffToken(id, staffId);
  }
  @Delete(':id/staff/:staffId/token')
  revokeStaffToken(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.service.revokeStaffToken(id, staffId);
  }

  // Outbox monitor
  @Get(':id/outbox')
  listOutbox(@Param('id') id: string, @Query('status') status?: string, @Query('limit') limitStr?: string, @Query('type') type?: string, @Query('since') since?: string) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : undefined;
    return this.service.listOutbox(id, status, limit, type, since);
  }
  @Post(':id/outbox/:eventId/retry')
  retryOutbox(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.service.retryOutbox(id, eventId);
  }
  @Delete(':id/outbox/:eventId')
  deleteOutbox(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.service.deleteOutbox(id, eventId);
  }
  @Post(':id/outbox/retryAll')
  retryAll(@Param('id') id: string, @Query('status') status?: string) {
    return this.service.retryAll(id, status);
  }

  @Get(':id/outbox/by-order')
  async outboxByOrder(@Param('id') id: string, @Query('orderId') orderId: string, @Query('limit') limitStr?: string) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 500) : 100;
    return this.service.listOutboxByOrder(id, orderId, limit);
  }

  // Transactions overview
  @Get(':id/transactions')
  listTransactions(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('type') type?: string,
    @Query('customerId') customerId?: string,
    @Query('outletId') outletId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    return this.service.listTransactions(id, { limit, before, type, customerId, outletId, deviceId, staffId });
  }
  @Get(':id/receipts')
  listReceipts(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    return this.service.listReceipts(id, { limit, before, orderId, customerId });
  }
  @Get(':id/receipts/:receiptId')
  getReceipt(@Param('id') id: string, @Param('receiptId') receiptId: string) {
    return this.service.getReceipt(id, receiptId);
  }
  @Get(':id/receipts.csv')
  async exportReceiptsCsv(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 1000, 1), 5000) : 1000;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    const items = await this.service.listReceipts(id, { limit, before, orderId, customerId });
    const lines = [ 'id,orderId,customerId,total,eligibleTotal,redeemApplied,earnApplied,createdAt,outletId,deviceId,staffId' ];
    for (const r of items) lines.push([r.id,r.orderId,r.customerId,r.total,r.eligibleTotal,r.redeemApplied,r.earnApplied,r.createdAt.toISOString(),(r.outletId||''),(r.deviceId||''),(r.staffId||'')].map(x=>`"${String(x).replaceAll('"','""')}"`).join(','));
    return lines.join('\n') + '\n';
  }

  // CRM helpers
  @Get(':id/customer/summary')
  async customerSummary(
    @Param('id') id: string,
    @Query('customerId') customerId: string,
  ) {
    const bal = await this.service.getBalance(id, customerId);
    const tx = await this.service.listTransactions(id, { limit: 10 });
    const rc = await this.service.listReceipts(id, { limit: 5, customerId });
    return { balance: bal, recentTx: tx, recentReceipts: rc };
  }
  @Get(':id/customer/search')
  async customerSearch(
    @Param('id') id: string,
    @Query('phone') phone: string,
  ) {
    return this.service.findCustomerByPhone(id, phone);
  }

  // CSV exports
  @Get(':id/transactions.csv')
  async exportTxCsv(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('type') type?: string,
    @Query('customerId') customerId?: string,
    @Query('outletId') outletId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 1000, 1), 5000) : 1000;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    const items = await this.service.listTransactions(id, { limit, before, type, customerId, outletId, deviceId, staffId });
    const lines = [ 'id,type,amount,orderId,customerId,createdAt,outletId,deviceId,staffId' ];
    for (const t of items) lines.push([t.id,t.type,t.amount,(t.orderId||''),t.customerId,t.createdAt.toISOString(),(t.outletId||''),(t.deviceId||''),(t.staffId||'')].map(x=>`"${String(x).replaceAll('"','""')}"`).join(','));
    return lines.join('\n') + '\n';
  }
}
