import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiExtraModels, ApiOkResponse, ApiTags, ApiUnauthorizedResponse, getSchemaPath } from '@nestjs/swagger';
import { PortalGuard } from '../portal-auth/portal.guard';
import { MerchantsService } from '../merchants/merchants.service';
import { CreateDeviceDto, CreateOutletDto, CreateStaffDto, DeviceDto, LedgerEntryDto, MerchantSettingsRespDto, OutletDto, ReceiptDto, StaffDto, UpdateDeviceDto, UpdateMerchantSettingsDto, UpdateOutletDto, UpdateStaffDto } from '../merchants/dto';
import { ErrorDto, TransactionItemDto } from '../loyalty/dto';
import { VouchersService } from '../vouchers/vouchers.service';
import { NotificationsService, type BroadcastArgs } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { CampaignService } from '../campaigns/campaign.service';
import { GiftsService } from '../gifts/gifts.service';

@ApiTags('portal')
@Controller('portal')
@ApiExtraModels(TransactionItemDto)
@UseGuards(PortalGuard)
export class PortalController {
  constructor(
    private readonly service: MerchantsService,
    private readonly vouchers: VouchersService,
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly campaigns: CampaignService,
    private readonly gifts: GiftsService,
  ) {}

  private getMerchantId(req: any) { return String((req as any).portalMerchantId || ''); }
  private computePeriod(periodType?: string, fromStr?: string, toStr?: string) {
    let from = new Date();
    let to = new Date();
    if (fromStr && toStr) {
      from = new Date(fromStr);
      to = new Date(toStr);
      return { from, to, type: 'custom' as const };
    }
    switch (periodType) {
      case 'day':
        from.setHours(0,0,0,0); to.setHours(23,59,59,999); break;
      case 'week': {
        const dayOfWeek = from.getDay();
        const diff = from.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        from.setDate(diff); from.setHours(0,0,0,0);
        to = new Date(from); to.setDate(to.getDate()+6); to.setHours(23,59,59,999);
        break;
      }
      case 'month':
        from.setDate(1); from.setHours(0,0,0,0);
        to = new Date(from); to.setMonth(to.getMonth()+1); to.setDate(0); to.setHours(23,59,59,999);
        break;
      case 'quarter': {
        const quarter = Math.floor(from.getMonth()/3);
        from.setMonth(quarter*3); from.setDate(1); from.setHours(0,0,0,0);
        to = new Date(from); to.setMonth(to.getMonth()+3); to.setDate(0); to.setHours(23,59,59,999);
        break;
      }
      case 'year':
        from.setMonth(0); from.setDate(1); from.setHours(0,0,0,0);
        to.setMonth(11); to.setDate(31); to.setHours(23,59,59,999);
        break;
      default:
        from.setDate(1); from.setHours(0,0,0,0);
        to = new Date(from); to.setMonth(to.getMonth()+1); to.setDate(0); to.setHours(23,59,59,999);
    }
    return { from, to, type: (periodType as any) || 'month' };
  }

  @Get('me')
  @ApiOkResponse({ schema: { type: 'object', properties: { merchantId: { type: 'string' }, role: { type: 'string' } } } })
  me(@Req() req: any) { return { merchantId: this.getMerchantId(req), role: (req as any).portalRole || 'MERCHANT' }; }

  // Customer search by phone (CRM helper)
  @Get('customer/search')
  @ApiOkResponse({ schema: { oneOf: [ { type: 'object', properties: { customerId: { type: 'string' }, phone: { type: 'string', nullable: true }, balance: { type: 'number' } } }, { type: 'null' } ] } })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  customerSearch(@Req() req: any, @Query('phone') phone: string) {
    return this.service.findCustomerByPhone(this.getMerchantId(req), String(phone||''));
  }

  // Vouchers (list/issue/deactivate)
  @Get('vouchers')
  @ApiOkResponse({ schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', additionalProperties: true } } } } })
  vouchersList(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50;
    return this.vouchers.list({ merchantId: this.getMerchantId(req), status, limit });
  }
  @Post('vouchers/issue')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, voucherId: { type: 'string' } } } })
  vouchersIssue(
    @Req() req: any,
    @Body() body: { name?: string; valueType: 'PERCENTAGE'|'FIXED_AMOUNT'; value: number; code: string; validFrom?: string; validUntil?: string; minPurchaseAmount?: number },
  ) {
    return this.vouchers.issue({ merchantId: this.getMerchantId(req), ...body });
  }
  @Post('vouchers/deactivate')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  vouchersDeactivate(@Req() req: any, @Body() body: { voucherId?: string; code?: string }) {
    return this.vouchers.deactivate({ merchantId: this.getMerchantId(req), voucherId: body?.voucherId, code: body?.code });
  }

  // Promocodes (POINTS) — list/issue/deactivate
  @Get('promocodes')
  @ApiOkResponse({ schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', additionalProperties: true } } } } })
  promocodesList(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50;
    return this.vouchers.list({ merchantId: this.getMerchantId(req), status, type: 'PROMO_CODE', limit });
  }
  @Post('promocodes/issue')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, voucherId: { type: 'string' } } } })
  promocodesIssue(
    @Req() req: any,
    @Body() body: { name?: string; points: number; code: string; validFrom?: string; validUntil?: string },
  ) {
    return this.vouchers.issue({ merchantId: this.getMerchantId(req), name: body?.name, valueType: 'POINTS', value: Number(body?.points||0), code: body?.code, validFrom: body?.validFrom, validUntil: body?.validUntil });
  }
  @Post('promocodes/deactivate')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  promocodesDeactivate(@Req() req: any, @Body() body: { voucherId?: string; code?: string }) {
    return this.vouchers.deactivate({ merchantId: this.getMerchantId(req), voucherId: body?.voucherId, code: body?.code });
  }

  // Notifications broadcast (enqueue or dry-run)
  @Post('notifications/broadcast')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, dryRun: { type: 'boolean', nullable: true }, estimated: { type: 'number', nullable: true } } } })
  notificationsBroadcast(@Req() req: any, @Body() body: Omit<BroadcastArgs, 'merchantId'>) {
    const merchantId = this.getMerchantId(req);
    return this.notifications.broadcast({ merchantId, ...body });
  }

  // ===== Analytics wrappers (portal-friendly) =====
  @Get('analytics/dashboard')
  dashboard(@Req() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getDashboard(merchantId, this.computePeriod(period, from, to));
  }
  @Get('analytics/portrait')
  portrait(@Req() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getCustomerPortrait(merchantId, this.computePeriod(period, from, to));
  }
  @Get('analytics/repeat')
  repeat(@Req() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('outletId') outletId?: string) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getRepeatPurchases(merchantId, this.computePeriod(period, from, to), outletId);
  }
  @Get('analytics/birthdays')
  birthdays(@Req() req: any, @Query('withinDays') withinDays?: string, @Query('limit') limit?: string) {
    const merchantId = this.getMerchantId(req);
    const d = Math.max(1, Math.min(parseInt(withinDays || '30', 10) || 30, 365));
    const l = Math.max(1, Math.min(parseInt(limit || '100', 10) || 100, 1000));
    return this.analytics.getBirthdays(merchantId, d, l);
  }
  @Get('analytics/referral')
  referral(@Req() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getReferralSummary(merchantId, this.computePeriod(period, from, to));
  }
  @Get('analytics/operations')
  operations(@Req() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getOperationalMetrics(merchantId, this.computePeriod(period, from, to));
  }
  @Get('analytics/revenue')
  revenue(@Req() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getRevenueMetrics(merchantId, this.computePeriod(period, from, to));
  }
  @Get('analytics/customers')
  customers(@Req() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getCustomerMetrics(merchantId, this.computePeriod(period, from, to));
  }
  @Get('analytics/loyalty')
  loyalty(@Req() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getLoyaltyMetrics(merchantId, this.computePeriod(period, from, to));
  }
  @Get('analytics/cohorts')
  cohorts(@Req() req: any, @Query('by') by?: 'month'|'week', @Query('limit') limitStr?: string) {
    const merchantId = this.getMerchantId(req);
    const limit = Math.min(Math.max(parseInt(limitStr || '6', 10) || 6, 1), 24);
    return this.analytics.getRetentionCohorts(merchantId, by === 'week' ? 'week' : 'month', limit);
  }
  @Get('analytics/rfm-heatmap')
  rfmHeatmap(@Req() req: any) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getRfmHeatmap(merchantId);
  }

  // Integrations
  @Get('integrations')
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string' }, provider: { type: 'string' }, isActive: { type: 'boolean' }, lastSync: { type: 'string', nullable: true }, errorCount: { type: 'number' } } } } })
  integrations(@Req() req: any) {
    return this.service.listIntegrations(this.getMerchantId(req));
  }

  // Campaigns (portal list)
  @Get('campaigns')
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  campaignsList(@Req() req: any, @Query('status') status?: string) {
    return this.campaigns.getCampaigns(this.getMerchantId(req), status);
  }

  // Gifts (portal list)
  @Get('gifts')
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  giftsList(@Req() req: any) {
    return this.gifts.listGifts(this.getMerchantId(req));
  }

  // Settings
  @Get('settings')
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  getSettings(@Req() req: any) { return this.service.getSettings(this.getMerchantId(req)); }

  @Put('settings')
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  updateSettings(@Req() req: any, @Body() dto: UpdateMerchantSettingsDto) {
    const id = this.getMerchantId(req);
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
      dto,
    );
  }

  // Outlets
  @Get('outlets')
  @ApiOkResponse({ type: OutletDto, isArray: true })
  listOutlets(@Req() req: any) { return this.service.listOutlets(this.getMerchantId(req)); }
  @Post('outlets')
  @ApiOkResponse({ type: OutletDto })
  createOutlet(@Req() req: any, @Body() dto: CreateOutletDto) { return this.service.createOutlet(this.getMerchantId(req), dto.name, dto.address); }
  @Put('outlets/:outletId')
  @ApiOkResponse({ type: OutletDto })
  updateOutlet(@Req() req: any, @Param('outletId') outletId: string, @Body() dto: UpdateOutletDto) { return this.service.updateOutlet(this.getMerchantId(req), outletId, dto); }
  @Delete('outlets/:outletId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  deleteOutlet(@Req() req: any, @Param('outletId') outletId: string) { return this.service.deleteOutlet(this.getMerchantId(req), outletId); }

  // Devices
  @Get('devices')
  @ApiOkResponse({ type: DeviceDto, isArray: true })
  listDevices(@Req() req: any) { return this.service.listDevices(this.getMerchantId(req)); }
  @Post('devices')
  @ApiOkResponse({ type: DeviceDto })
  createDevice(@Req() req: any, @Body() dto: CreateDeviceDto) { return this.service.createDevice(this.getMerchantId(req), dto.type as string, dto.outletId, dto.label); }
  @Put('devices/:deviceId')
  @ApiOkResponse({ type: DeviceDto })
  updateDevice(@Req() req: any, @Param('deviceId') deviceId: string, @Body() dto: UpdateDeviceDto) { return this.service.updateDevice(this.getMerchantId(req), deviceId, dto); }
  @Delete('devices/:deviceId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  deleteDevice(@Req() req: any, @Param('deviceId') deviceId: string) { return this.service.deleteDevice(this.getMerchantId(req), deviceId); }
  @Post('devices/:deviceId/secret')
  @ApiOkResponse({ schema: { type: 'object', properties: { secret: { type: 'string' } } } })
  issueDeviceSecret(@Req() req: any, @Param('deviceId') deviceId: string) { return this.service.issueDeviceSecret(this.getMerchantId(req), deviceId); }
  @Delete('devices/:deviceId/secret')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  revokeDeviceSecret(@Req() req: any, @Param('deviceId') deviceId: string) { return this.service.revokeDeviceSecret(this.getMerchantId(req), deviceId); }

  // Staff
  @Get('staff')
  @ApiOkResponse({ type: StaffDto, isArray: true })
  listStaff(@Req() req: any) { return this.service.listStaff(this.getMerchantId(req)); }
  @Post('staff')
  @ApiOkResponse({ type: StaffDto })
  createStaff(@Req() req: any, @Body() dto: CreateStaffDto) { return this.service.createStaff(this.getMerchantId(req), { login: dto.login, email: dto.email, role: dto.role ? String(dto.role) : undefined }); }
  @Put('staff/:staffId')
  @ApiOkResponse({ type: StaffDto })
  updateStaff(@Req() req: any, @Param('staffId') staffId: string, @Body() dto: UpdateStaffDto) { return this.service.updateStaff(this.getMerchantId(req), staffId, dto); }
  @Delete('staff/:staffId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  deleteStaff(@Req() req: any, @Param('staffId') staffId: string) { return this.service.deleteStaff(this.getMerchantId(req), staffId); }
  @Post('staff/:staffId/token')
  @ApiOkResponse({ schema: { type: 'object', properties: { token: { type: 'string' } } } })
  issueStaffToken(@Req() req: any, @Param('staffId') staffId: string) { return this.service.issueStaffToken(this.getMerchantId(req), staffId); }
  @Delete('staff/:staffId/token')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  revokeStaffToken(@Req() req: any, @Param('staffId') staffId: string) { return this.service.revokeStaffToken(this.getMerchantId(req), staffId); }

  // Staff ↔ Outlet access & PINs
  @Get('staff/:staffId/access')
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', properties: { outletId: { type: 'string' }, outletName: { type: 'string' }, pinCode: { type: 'string', nullable: true }, lastTxnAt: { type: 'string', nullable: true } } } } })
  listStaffAccess(@Req() req: any, @Param('staffId') staffId: string) {
    return this.service.listStaffAccess(this.getMerchantId(req), staffId);
  }
  @Post('staff/:staffId/access')
  @ApiOkResponse({ schema: { type: 'object', properties: { outletId: { type: 'string' }, pinCode: { type: 'string' } } } })
  addStaffAccess(@Req() req: any, @Param('staffId') staffId: string, @Body() body: { outletId: string }) {
    return this.service.addStaffAccess(this.getMerchantId(req), staffId, String(body?.outletId||''));
  }
  @Delete('staff/:staffId/access/:outletId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  removeStaffAccess(@Req() req: any, @Param('staffId') staffId: string, @Param('outletId') outletId: string) {
    return this.service.removeStaffAccess(this.getMerchantId(req), staffId, outletId);
  }
  @Post('staff/:staffId/access/:outletId/regenerate-pin')
  @ApiOkResponse({ schema: { type: 'object', properties: { pinCode: { type: 'string' } } } })
  regenerateStaffPin(@Req() req: any, @Param('staffId') staffId: string, @Param('outletId') outletId: string) {
    return this.service.regenerateStaffPin(this.getMerchantId(req), staffId, outletId);
  }

  // Transactions & Receipts (read-only)
  @Get('transactions')
  @ApiOkResponse({ schema: { type: 'array', items: { $ref: getSchemaPath(TransactionItemDto) } } })
  listTransactions(@Req() req: any, @Query('limit') limitStr?: string, @Query('before') beforeStr?: string, @Query('from') fromStr?: string, @Query('to') toStr?: string, @Query('type') type?: string, @Query('customerId') customerId?: string, @Query('outletId') outletId?: string, @Query('deviceId') deviceId?: string, @Query('staffId') staffId?: string) {
    const id = this.getMerchantId(req);
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    return this.service.listTransactions(id, { limit, before, from, to, type, customerId, outletId, deviceId, staffId });
  }

  @Get('receipts')
  @ApiOkResponse({ type: ReceiptDto, isArray: true })
  listReceipts(@Req() req: any, @Query('limit') limitStr?: string, @Query('before') beforeStr?: string, @Query('orderId') orderId?: string, @Query('customerId') customerId?: string) {
    const id = this.getMerchantId(req);
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    return this.service.listReceipts(id, { limit, before, orderId, customerId });
  }

  @Get('ledger')
  @ApiOkResponse({ type: LedgerEntryDto, isArray: true })
  listLedger(@Req() req: any, @Query('limit') limitStr?: string, @Query('before') beforeStr?: string, @Query('from') fromStr?: string, @Query('to') toStr?: string, @Query('customerId') customerId?: string, @Query('type') type?: string) {
    const id = this.getMerchantId(req);
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 500) : 50;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    return this.service.listLedger(id, { limit, before, customerId, from, to, type });
  }
}
