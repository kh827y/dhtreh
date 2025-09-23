import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req, NotFoundException } from '@nestjs/common';
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
import { PushCampaignsService, type PushCampaignScope } from './services/push-campaigns.service';
import { TelegramCampaignsService, type TelegramCampaignScope } from './services/telegram-campaigns.service';
import { StaffMotivationService, type UpdateStaffMotivationPayload } from './services/staff-motivation.service';
import { ActionsService, type ActionsTab, type CreateProductBonusActionPayload, type UpdateActionStatusPayload } from './services/actions.service';
import { OperationsLogService, type OperationsLogFilters } from './services/operations-log.service';

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
    private readonly pushCampaigns: PushCampaignsService,
    private readonly telegramCampaigns: TelegramCampaignsService,
    private readonly staffMotivation: StaffMotivationService,
    private readonly actions: ActionsService,
    private readonly operations: OperationsLogService,
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

  private normalizePushScope(scope?: string): PushCampaignScope {
    return scope === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  }

  private normalizeTelegramScope(scope?: string): TelegramCampaignScope {
    return scope === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  }

  private normalizeActionsTab(tab?: string): ActionsTab {
    const upper = String(tab || '').toUpperCase() as ActionsTab;
    return upper === 'UPCOMING' || upper === 'PAST' ? upper : 'CURRENT';
  }

  private normalizeDirection(direction?: string): OperationsLogFilters['direction'] {
    const upper = String(direction || '').toUpperCase();
    if (upper === 'EARN' || upper === 'REDEEM') return upper;
    return 'ALL';
  }

  // Cashier credentials (merchant-wide 9-digit password)
  @Get('cashier')
  @ApiOkResponse({ schema: { type: 'object', properties: { login: { type: 'string', nullable: true }, hasPassword: { type: 'boolean' } } } })
  getCashier(@Req() req: any) {
    return this.service.getCashierCredentials(this.getMerchantId(req));
  }
  @Post('cashier/rotate')
  @ApiOkResponse({ schema: { type: 'object', properties: { login: { type: 'string' }, password: { type: 'string' } } } })
  rotateCashier(@Req() req: any, @Body() body: { regenerateLogin?: boolean }) {
    return this.service.rotateCashierCredentials(this.getMerchantId(req), !!body?.regenerateLogin);
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
    @Body() body: { name?: string; description?: string; points: number; code: string; validFrom?: string; validUntil?: string; awardPoints?: boolean; burnEnabled?: boolean; burnDays?: number; levelEnabled?: boolean; levelId?: string; usageLimit?: 'none'|'once_total'|'once_per_customer'; usagePeriodEnabled?: boolean; usagePeriodDays?: number; recentVisitEnabled?: boolean; recentVisitHours?: number },
  ) {
    return this.vouchers.issue({
      merchantId: this.getMerchantId(req),
      name: body?.name,
      description: body?.description,
      valueType: 'POINTS',
      value: Number(body?.points||0),
      points: Number(body?.points||0),
      code: body?.code,
      validFrom: body?.validFrom,
      validUntil: body?.validUntil,
      awardPoints: body?.awardPoints,
      burnEnabled: body?.burnEnabled,
      burnDays: body?.burnDays,
      levelEnabled: body?.levelEnabled,
      levelId: body?.levelId,
      usageLimit: body?.usageLimit,
      usagePeriodEnabled: body?.usagePeriodEnabled,
      usagePeriodDays: body?.usagePeriodDays,
      recentVisitEnabled: body?.recentVisitEnabled,
      recentVisitHours: body?.recentVisitHours,
    });
  }
  @Post('promocodes/deactivate')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  promocodesDeactivate(@Req() req: any, @Body() body: { voucherId?: string; code?: string }) {
    return this.vouchers.deactivate({ merchantId: this.getMerchantId(req), voucherId: body?.voucherId, code: body?.code });
  }
  @Post('promocodes/activate')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  promocodesActivate(@Req() req: any, @Body() body: { voucherId?: string; code?: string }) {
    return this.vouchers.activate({ merchantId: this.getMerchantId(req), voucherId: body?.voucherId, code: body?.code });
  }
  @Put('promocodes/:voucherId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  promocodesUpdate(
    @Req() req: any,
    @Param('voucherId') voucherId: string,
    @Body() body: { name?: string; description?: string; code?: string; points?: number; awardPoints?: boolean; burnEnabled?: boolean; burnDays?: number; levelEnabled?: boolean; levelId?: string; usageLimit?: 'none'|'once_total'|'once_per_customer'; usagePeriodEnabled?: boolean; usagePeriodDays?: number; recentVisitEnabled?: boolean; recentVisitHours?: number; validFrom?: string; validUntil?: string },
  ) {
    return this.vouchers.updatePromocode(this.getMerchantId(req), voucherId, body);
  }

  // Notifications broadcast (enqueue or dry-run)
  @Post('notifications/broadcast')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, dryRun: { type: 'boolean', nullable: true }, estimated: { type: 'number', nullable: true } } } })
  notificationsBroadcast(@Req() req: any, @Body() body: Omit<BroadcastArgs, 'merchantId'>) {
    const merchantId = this.getMerchantId(req);
    return this.notifications.broadcast({ merchantId, ...body });
  }

  // ===== Push campaigns =====
  @Get('push-campaigns')
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  listPushCampaigns(@Req() req: any, @Query('scope') scope?: string) {
    return this.pushCampaigns.list(this.getMerchantId(req), this.normalizePushScope(scope));
  }

  @Post('push-campaigns')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createPushCampaign(
    @Req() req: any,
    @Body() body: { text?: string; audience?: string; startAt?: string; scheduledAt?: string; timezone?: string },
  ) {
    return this.pushCampaigns.create(this.getMerchantId(req), {
      text: body?.text ?? '',
      audience: body?.audience ?? '',
      scheduledAt: body?.scheduledAt ?? body?.startAt ?? '',
      timezone: body?.timezone,
    });
  }

  @Post('push-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelPushCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.pushCampaigns.markCanceled(this.getMerchantId(req), campaignId);
  }

  @Post('push-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archivePushCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.pushCampaigns.markArchived(this.getMerchantId(req), campaignId);
  }

  @Post('push-campaigns/:campaignId/duplicate')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  duplicatePushCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
    @Body() body: { scheduledAt?: string; startAt?: string },
  ) {
    return this.pushCampaigns.duplicate(this.getMerchantId(req), campaignId, {
      scheduledAt: body?.scheduledAt ?? body?.startAt,
    });
  }

  // ===== Telegram campaigns =====
  @Get('telegram-campaigns')
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  listTelegramCampaigns(@Req() req: any, @Query('scope') scope?: string) {
    return this.telegramCampaigns.list(this.getMerchantId(req), this.normalizeTelegramScope(scope));
  }

  @Post('telegram-campaigns')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createTelegramCampaign(
    @Req() req: any,
    @Body()
    body: {
      audienceId?: string;
      audienceName?: string;
      text?: string;
      imageUrl?: string;
      startAt?: string;
      scheduledAt?: string;
      timezone?: string;
    },
  ) {
    return this.telegramCampaigns.create(this.getMerchantId(req), {
      audienceId: body?.audienceId,
      audienceName: body?.audienceName,
      text: body?.text ?? '',
      imageUrl: body?.imageUrl,
      scheduledAt: body?.scheduledAt ?? body?.startAt ?? '',
      timezone: body?.timezone,
    });
  }

  @Post('telegram-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelTelegramCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.telegramCampaigns.markCanceled(this.getMerchantId(req), campaignId);
  }

  @Post('telegram-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archiveTelegramCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.telegramCampaigns.markArchived(this.getMerchantId(req), campaignId);
  }

  @Post('telegram-campaigns/:campaignId/duplicate')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  duplicateTelegramCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
    @Body() body: { scheduledAt?: string; startAt?: string },
  ) {
    return this.telegramCampaigns.duplicate(this.getMerchantId(req), campaignId, {
      scheduledAt: body?.scheduledAt ?? body?.startAt,
    });
  }

  // ===== Staff motivation =====
  @Get('staff-motivation')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        pointsForNewCustomer: { type: 'number' },
        pointsForExistingCustomer: { type: 'number' },
        leaderboardPeriod: { type: 'string' },
        customDays: { type: 'number', nullable: true },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  getStaffMotivation(@Req() req: any) {
    return this.staffMotivation.getSettings(this.getMerchantId(req));
  }

  @Put('staff-motivation')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  updateStaffMotivation(@Req() req: any, @Body() body: UpdateStaffMotivationPayload) {
    return this.staffMotivation.updateSettings(this.getMerchantId(req), {
      enabled: !!body?.enabled,
      pointsForNewCustomer: Number(body?.pointsForNewCustomer ?? 0),
      pointsForExistingCustomer: Number(body?.pointsForExistingCustomer ?? 0),
      leaderboardPeriod: body?.leaderboardPeriod ?? 'week',
      customDays:
        body?.customDays === undefined || body?.customDays === null
          ? null
          : Number(body.customDays),
    });
  }

  // ===== Loyalty actions =====
  @Get('actions')
  @ApiOkResponse({ schema: { type: 'object', properties: { total: { type: 'number' }, items: { type: 'array', items: { type: 'object', additionalProperties: true } } } } })
  listActions(@Req() req: any, @Query('tab') tab?: string, @Query('search') search?: string) {
    return this.actions.list(this.getMerchantId(req), this.normalizeActionsTab(tab), search || undefined);
  }

  @Get('actions/:campaignId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  getAction(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.actions.getById(this.getMerchantId(req), campaignId);
  }

  @Post('actions/product-bonus')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createProductBonusAction(@Req() req: any, @Body() body: any) {
    const payload: CreateProductBonusActionPayload = {
      name: String(body?.name ?? ''),
      productIds: Array.isArray(body?.productIds) ? body.productIds.map((id: any) => String(id)) : [],
      rule: {
        mode: body?.rule?.mode ?? 'FIXED',
        value: Number(body?.rule?.value ?? 0),
      },
      audienceId: body?.audienceId ?? undefined,
      audienceName: body?.audienceName ?? undefined,
      usageLimit: (body?.usageLimit ?? 'UNLIMITED') as CreateProductBonusActionPayload['usageLimit'],
      usageLimitValue:
        body?.usageLimitValue === undefined ? undefined : Number(body.usageLimitValue),
      schedule: {
        startEnabled: !!body?.schedule?.startEnabled,
        startDate: body?.schedule?.startDate ?? body?.startDate,
        endEnabled: !!body?.schedule?.endEnabled,
        endDate: body?.schedule?.endDate ?? body?.endDate,
      },
      enabled: !!body?.enabled,
    };

    return this.actions.createProductBonus(this.getMerchantId(req), payload);
  }

  @Post('actions/:campaignId/status')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  updateActionStatus(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
    @Body() body: UpdateActionStatusPayload,
  ) {
    const action = body?.action === 'PAUSE' ? 'PAUSE' : 'RESUME';
    return this.actions.updateStatus(this.getMerchantId(req), campaignId, { action });
  }

  @Post('actions/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archiveAction(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.actions.archive(this.getMerchantId(req), campaignId);
  }

  @Post('actions/:campaignId/duplicate')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  duplicateAction(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.actions.duplicate(this.getMerchantId(req), campaignId);
  }

  // ===== Operations journal =====
  @Get('operations/log')
  @ApiOkResponse({ schema: { type: 'object', properties: { total: { type: 'number' }, items: { type: 'array', items: { type: 'object', additionalProperties: true } } } } })
  getOperationsLog(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('staffId') staffId?: string,
    @Query('outletId') outletId?: string,
    @Query('direction') direction?: string,
    @Query('receiptNumber') receiptNumber?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const filters: OperationsLogFilters = {
      from: from || undefined,
      to: to || undefined,
      staffId: staffId || undefined,
      outletId: outletId || undefined,
      direction: this.normalizeDirection(direction),
      receiptNumber: receiptNumber || undefined,
      limit: limitStr ? parseInt(limitStr, 10) : undefined,
      offset: offsetStr ? parseInt(offsetStr, 10) : undefined,
    };
    return this.operations.list(this.getMerchantId(req), filters);
  }

  @Get('operations/log/:receiptId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  getOperationDetails(@Req() req: any, @Param('receiptId') receiptId: string) {
    return this.operations.getDetails(this.getMerchantId(req), receiptId);
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
  @Post('campaigns')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createCampaign(@Req() req: any, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    const dto = Object.assign({}, body || {}, { merchantId });
    return this.campaigns.createCampaign(dto);
  }
  @Get('campaigns/:campaignId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async campaignDetails(@Req() req: any, @Param('campaignId') campaignId: string) {
    const merchantId = this.getMerchantId(req);
    const c: any = await this.campaigns.getCampaign(String(campaignId||''));
    if (!c || c.merchantId !== merchantId) throw new NotFoundException();
    return c;
  }
  @Put('campaigns/:campaignId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async updateCampaign(@Req() req: any, @Param('campaignId') campaignId: string, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    const c: any = await this.campaigns.getCampaign(String(campaignId||''));
    if (!c || c.merchantId !== merchantId) throw new NotFoundException();
    return this.campaigns.updateCampaign(String(campaignId||''), body || {});
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
  createStaff(@Req() req: any, @Body() dto: CreateStaffDto) {
    return this.service.createStaff(this.getMerchantId(req), {
      login: dto.login,
      email: dto.email,
      role: dto.role ? String(dto.role) : undefined,
      firstName: dto.firstName,
      lastName: dto.lastName,
      position: dto.position,
      phone: dto.phone,
      comment: dto.comment,
      avatarUrl: dto.avatarUrl,
      canAccessPortal: dto.canAccessPortal,
      password: dto.password,
    });
  }
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
  @Post('staff/:staffId/pin/regenerate')
  @ApiOkResponse({ schema: { type: 'object', properties: { pinCode: { type: 'string' } } } })
  regenerateStaffPersonalPin(@Req() req: any, @Param('staffId') staffId: string) {
    return this.service.regenerateStaffPersonalPin(this.getMerchantId(req), staffId);
  }

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
