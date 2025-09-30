import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { ApiBadRequestResponse, ApiExtraModels, ApiOkResponse, ApiTags, ApiUnauthorizedResponse, getSchemaPath } from '@nestjs/swagger';
import { PortalGuard } from '../portal-auth/portal.guard';
import { MerchantsService } from '../merchants/merchants.service';
import { CreateDeviceDto, DeviceDto, LedgerEntryDto, MerchantSettingsRespDto, ReceiptDto, UpdateDeviceDto, UpdateMerchantSettingsDto } from '../merchants/dto';
import { ErrorDto, TransactionItemDto } from '../loyalty/dto';
import { PromoCodesService, type PortalPromoCodePayload } from '../promocodes/promocodes.service';
import { CommunicationChannel, PromoCodeStatus } from '@prisma/client';
import { NotificationsService, type BroadcastArgs } from '../notifications/notifications.service';
import { PortalCustomersService } from './customers.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { GiftsService } from '../gifts/gifts.service';
import { PortalCatalogService } from './catalog.service';
import {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoriesDto,
  CreateProductDto,
  UpdateProductDto,
  ProductListResponseDto,
  ProductDto,
  ListProductsQueryDto,
  ProductBulkActionDto,
  PortalOutletListResponseDto,
  PortalOutletDto,
  CreatePortalOutletDto,
  UpdatePortalOutletDto,
} from './catalog.dto';
import { CommunicationsService } from '../communications/communications.service';
import { StaffMotivationService, type UpdateStaffMotivationPayload } from './services/staff-motivation.service';
import { ActionsService, type ActionsTab, type CreateProductBonusActionPayload, type UpdateActionStatusPayload } from './services/actions.service';
import { OperationsLogService, type OperationsLogFilters } from './services/operations-log.service';
import { PortalTelegramIntegrationService } from './services/telegram-integration.service';

@ApiTags('portal')
@Controller('portal')
@ApiExtraModels(TransactionItemDto)
@UseGuards(PortalGuard)
export class PortalController {
  constructor(
    private readonly service: MerchantsService,
    private readonly promoCodes: PromoCodesService,
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly catalog: PortalCatalogService,
    private readonly gifts: GiftsService,
    private readonly communications: CommunicationsService,
    private readonly staffMotivation: StaffMotivationService,
    private readonly actions: ActionsService,
    private readonly operations: OperationsLogService,
    private readonly customersService: PortalCustomersService,
    private readonly telegramIntegration: PortalTelegramIntegrationService,
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

  private normalizePushScope(scope?: string): 'ACTIVE' | 'ARCHIVED' {
    return scope === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  }

  private normalizeTelegramScope(scope?: string): 'ACTIVE' | 'ARCHIVED' {
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

  private asRecord(value: unknown): Record<string, any> {
    if (value && typeof value === 'object') return value as Record<string, any>;
    return {};
  }

  private coerceCount(value: unknown): number {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? num : 0;
  }

  private extractMetadata(payload: Record<string, any>, stats: Record<string, any>) {
    if (payload.metadata !== undefined) return payload.metadata;
    if (stats.metadata !== undefined) return stats.metadata;
    return null;
  }

  private mapPushTask(task: any) {
    const payload = this.asRecord(task?.payload);
    const stats = this.asRecord(task?.stats);
    const snapshot = this.asRecord(task?.audienceSnapshot);
    const audienceRaw =
      task?.audienceName ?? snapshot.code ?? snapshot.legacyAudience ?? snapshot.audienceName ?? 'ALL';
    const totalRecipients =
      typeof task?.totalRecipients === 'number'
        ? task.totalRecipients
        : this.coerceCount(stats.totalRecipients ?? stats.total);
    const sent =
      typeof task?.sentCount === 'number' ? task.sentCount : this.coerceCount(stats.sent ?? stats.delivered);
    const failed =
      typeof task?.failedCount === 'number' ? task.failedCount : this.coerceCount(stats.failed ?? stats.errors);
    const metadata = this.extractMetadata(payload, stats);

    return {
      id: task.id,
      merchantId: task.merchantId,
      text: typeof payload.text === 'string' ? payload.text : '',
      audience: audienceRaw ? String(audienceRaw) : 'ALL',
      scheduledAt: task.scheduledAt,
      timezone: task.timezone ?? null,
      status: task.status,
      totalRecipients,
      sent,
      failed,
      archivedAt: task.archivedAt ?? null,
      metadata: metadata ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private mapTelegramTask(task: any) {
    const payload = this.asRecord(task?.payload);
    const stats = this.asRecord(task?.stats);
    const snapshot = this.asRecord(task?.audienceSnapshot);
    const media = this.asRecord(task?.media);
    const totalRecipients =
      typeof task?.totalRecipients === 'number'
        ? task.totalRecipients
        : this.coerceCount(stats.totalRecipients ?? stats.total);
    const sent =
      typeof task?.sentCount === 'number' ? task.sentCount : this.coerceCount(stats.sent ?? stats.delivered);
    const failed =
      typeof task?.failedCount === 'number' ? task.failedCount : this.coerceCount(stats.failed ?? stats.errors);
    const metadata = this.extractMetadata(payload, stats);
    const imageCandidate = media.imageUrl ?? payload.imageUrl;

    return {
      id: task.id,
      merchantId: task.merchantId,
      audienceId: task.audienceId ?? snapshot.legacyAudienceId ?? null,
      audienceName: task.audienceName ?? snapshot.audienceName ?? null,
      text: typeof payload.text === 'string' ? payload.text : '',
      imageUrl: typeof imageCandidate === 'string' ? imageCandidate : null,
      scheduledAt: task.scheduledAt,
      timezone: task.timezone ?? null,
      status: task.status,
      totalRecipients,
      sent,
      failed,
      archivedAt: task.archivedAt ?? null,
      metadata: metadata ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
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

  // ===== Customers CRUD =====
  @Get('customers')
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  listCustomers(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50;
    const offset = offsetStr ? Math.max(parseInt(offsetStr, 10) || 0, 0) : 0;
    return this.customersService.list(this.getMerchantId(req), { search, limit, offset });
  }

  @Get('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  getCustomer(@Req() req: any, @Param('customerId') customerId: string) {
    return this.customersService.get(this.getMerchantId(req), String(customerId||''));
  }

  @Post('customers')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createCustomer(
    @Req() req: any,
    @Body() body: { phone?: string; email?: string; name?: string; firstName?: string; lastName?: string; birthday?: string; gender?: string; tags?: string[] },
  ) {
    return this.customersService.create(this.getMerchantId(req), body || {});
  }

  @Put('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  updateCustomer(
    @Req() req: any,
    @Param('customerId') customerId: string,
    @Body() body: { phone?: string; email?: string; name?: string; firstName?: string; lastName?: string; birthday?: string; gender?: string; tags?: string[] },
  ) {
    return this.customersService.update(this.getMerchantId(req), String(customerId||''), body || {});
  }

  @Delete('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  deleteCustomer(@Req() req: any, @Param('customerId') customerId: string) {
    return this.customersService.remove(this.getMerchantId(req), String(customerId||''));
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
    return this.promoCodes.listForPortal(this.getMerchantId(req), status, limit);
  }
  @Post('promocodes/issue')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, promoCodeId: { type: 'string' } } } })
  promocodesIssue(
    @Req() req: any,
    @Body() body: PortalPromoCodePayload,
  ) {
    return this.promoCodes
      .createFromPortal(this.getMerchantId(req), body)
      .then((created) => ({ ok: true, promoCodeId: created.id }));
  }
  @Post('promocodes/deactivate')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  promocodesDeactivate(@Req() req: any, @Body() body: { promoCodeId?: string; code?: string }) {
    if (!body?.promoCodeId) throw new NotFoundException('Промокод не найден');
    return this.promoCodes.changeStatus(this.getMerchantId(req), body.promoCodeId, PromoCodeStatus.ARCHIVED);
  }
  @Post('promocodes/activate')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  promocodesActivate(@Req() req: any, @Body() body: { promoCodeId?: string; code?: string }) {
    if (!body?.promoCodeId) throw new NotFoundException('Промокод не найден');
    return this.promoCodes.changeStatus(this.getMerchantId(req), body.promoCodeId, PromoCodeStatus.ACTIVE);
  }
  @Put('promocodes/:promoCodeId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  promocodesUpdate(
    @Req() req: any,
    @Param('promoCodeId') promoCodeId: string,
    @Body() body: PortalPromoCodePayload,
  ) {
    return this.promoCodes.updateFromPortal(this.getMerchantId(req), promoCodeId, body);
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
    const merchantId = this.getMerchantId(req);
    return this.communications
      .listChannelTasks(merchantId, CommunicationChannel.PUSH, this.normalizePushScope(scope))
      .then(tasks => tasks.map(task => this.mapPushTask(task)));
  }

  @Post('push-campaigns')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createPushCampaign(
    @Req() req: any,
    @Body() body: { text?: string; audience?: string; startAt?: string; scheduledAt?: string; timezone?: string },
  ) {
    const merchantId = this.getMerchantId(req);
    return this.communications
      .createTask(merchantId, {
        channel: CommunicationChannel.PUSH,
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
        timezone: body?.timezone ?? null,
        audienceCode: body?.audience ? String(body.audience) : undefined,
        audienceName: body?.audience ? String(body.audience) : undefined,
        payload: {
          text: body?.text ?? '',
          audience: body?.audience ?? null,
        },
      })
      .then(task => this.mapPushTask(task));
  }

  @Post('push-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelPushCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.communications
      .updateTaskStatus(this.getMerchantId(req), campaignId, 'CANCELED')
      .then(task => this.mapPushTask(task));
  }

  @Post('push-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archivePushCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.communications
      .updateTaskStatus(this.getMerchantId(req), campaignId, 'ARCHIVED')
      .then(task => this.mapPushTask(task));
  }

  @Post('push-campaigns/:campaignId/duplicate')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  duplicatePushCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
    @Body() body: { scheduledAt?: string; startAt?: string },
  ) {
    const merchantId = this.getMerchantId(req);
    return this.communications
      .duplicateTask(merchantId, campaignId, { scheduledAt: body?.scheduledAt ?? body?.startAt ?? null })
      .then(task => this.mapPushTask(task));
  }

  // ===== Telegram campaigns =====
  @Get('telegram-campaigns')
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  listTelegramCampaigns(@Req() req: any, @Query('scope') scope?: string) {
    const merchantId = this.getMerchantId(req);
    return this.communications
      .listChannelTasks(merchantId, CommunicationChannel.TELEGRAM, this.normalizeTelegramScope(scope))
      .then(tasks => tasks.map(task => this.mapTelegramTask(task)));
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
    const merchantId = this.getMerchantId(req);
    return this.communications
      .createTask(merchantId, {
        channel: CommunicationChannel.TELEGRAM,
        audienceId: body?.audienceId ?? undefined,
        audienceName: body?.audienceName ?? undefined,
        audienceSnapshot: {
          legacyAudienceId: body?.audienceId ?? null,
          audienceName: body?.audienceName ?? null,
        },
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
        timezone: body?.timezone ?? null,
        payload: {
          text: body?.text ?? '',
        },
        media: body?.imageUrl ? { imageUrl: body.imageUrl } : undefined,
      })
      .then(task => this.mapTelegramTask(task));
  }

  @Post('telegram-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelTelegramCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.communications
      .updateTaskStatus(this.getMerchantId(req), campaignId, 'CANCELED')
      .then(task => this.mapTelegramTask(task));
  }

  @Post('telegram-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archiveTelegramCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.communications
      .updateTaskStatus(this.getMerchantId(req), campaignId, 'ARCHIVED')
      .then(task => this.mapTelegramTask(task));
  }

  @Post('telegram-campaigns/:campaignId/duplicate')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  duplicateTelegramCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
    @Body() body: { scheduledAt?: string; startAt?: string },
  ) {
    const merchantId = this.getMerchantId(req);
    return this.communications
      .duplicateTask(merchantId, campaignId, { scheduledAt: body?.scheduledAt ?? body?.startAt ?? null })
      .then(task => this.mapTelegramTask(task));
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
  analyticsOperations(@Req() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
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
  @Get('analytics/auto-return')
  analyticsAutoReturn(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getAutoReturnMetrics(merchantId, this.computePeriod(period, from, to), outletId);
  }
  @Get('analytics/birthday-mechanic')
  analyticsBirthdayMechanic(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getBirthdayMechanicMetrics(merchantId, this.computePeriod(period, from, to), outletId);
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

  @Get('integrations/telegram-mini-app')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        botUsername: { type: 'string', nullable: true },
        botLink: { type: 'string', nullable: true },
        miniappUrl: { type: 'string', nullable: true },
        connectionHealthy: { type: 'boolean' },
        lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
        integrationId: { type: 'string', nullable: true },
        tokenMask: { type: 'string', nullable: true },
        message: { type: 'string', nullable: true },
      },
    },
  })
  telegramMiniAppState(@Req() req: any) {
    return this.telegramIntegration.getState(this.getMerchantId(req));
  }

  @Post('integrations/telegram-mini-app/connect')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @ApiBadRequestResponse({ type: ErrorDto })
  telegramMiniAppConnect(@Req() req: any, @Body() body: { token?: string }) {
    return this.telegramIntegration.connect(this.getMerchantId(req), body?.token || '');
  }

  @Post('integrations/telegram-mini-app/check')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @ApiBadRequestResponse({ type: ErrorDto })
  telegramMiniAppCheck(@Req() req: any) {
    return this.telegramIntegration.check(this.getMerchantId(req));
  }

  @Delete('integrations/telegram-mini-app')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  telegramMiniAppDisconnect(@Req() req: any) {
    return this.telegramIntegration.disconnect(this.getMerchantId(req));
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

  // Catalog — Categories
  @Get('catalog/categories')
  @ApiOkResponse({ type: CategoryDto, isArray: true })
  listCatalogCategories(@Req() req: any) {
    return this.catalog.listCategories(this.getMerchantId(req));
  }
  @Post('catalog/categories')
  @ApiOkResponse({ type: CategoryDto })
  createCatalogCategory(@Req() req: any, @Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(this.getMerchantId(req), dto);
  }
  @Put('catalog/categories/:categoryId')
  @ApiOkResponse({ type: CategoryDto })
  updateCatalogCategory(@Req() req: any, @Param('categoryId') categoryId: string, @Body() dto: UpdateCategoryDto) {
    return this.catalog.updateCategory(this.getMerchantId(req), categoryId, dto);
  }
  @Post('catalog/categories/reorder')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, updated: { type: 'number' } } } })
  reorderCatalogCategories(@Req() req: any, @Body() dto: ReorderCategoriesDto) {
    return this.catalog.reorderCategories(this.getMerchantId(req), dto);
  }
  @Delete('catalog/categories/:categoryId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  deleteCatalogCategory(@Req() req: any, @Param('categoryId') categoryId: string) {
    return this.catalog.deleteCategory(this.getMerchantId(req), categoryId);
  }

  // Catalog — Products
  @Get('catalog/products')
  @ApiOkResponse({ type: ProductListResponseDto })
  listCatalogProducts(@Req() req: any, @Query() query: ListProductsQueryDto) {
    return this.catalog.listProducts(this.getMerchantId(req), query);
  }
  @Get('catalog/products/:productId')
  @ApiOkResponse({ type: ProductDto })
  getCatalogProduct(@Req() req: any, @Param('productId') productId: string) {
    return this.catalog.getProduct(this.getMerchantId(req), productId);
  }
  @Post('catalog/products')
  @ApiOkResponse({ type: ProductDto })
  createCatalogProduct(@Req() req: any, @Body() dto: CreateProductDto) {
    return this.catalog.createProduct(this.getMerchantId(req), dto);
  }
  @Put('catalog/products/:productId')
  @ApiOkResponse({ type: ProductDto })
  updateCatalogProduct(@Req() req: any, @Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(this.getMerchantId(req), productId, dto);
  }
  @Delete('catalog/products/:productId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  deleteCatalogProduct(@Req() req: any, @Param('productId') productId: string) {
    return this.catalog.deleteProduct(this.getMerchantId(req), productId);
  }
  @Post('catalog/products/bulk')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, updated: { type: 'number' } } } })
  bulkCatalogProducts(@Req() req: any, @Body() dto: ProductBulkActionDto) {
    return this.catalog.bulkProductAction(this.getMerchantId(req), dto);
  }

  // Outlets
  @Get('outlets')
  @ApiOkResponse({ type: PortalOutletListResponseDto })
  listOutlets(
    @Req() req: any,
    @Query('status') status?: 'active' | 'inactive' | 'all',
    @Query('search') search?: string,
  ) {
    const normalized: 'active' | 'inactive' | 'all' = status === 'active' ? 'active' : status === 'inactive' ? 'inactive' : 'all';
    return this.catalog.listOutlets(this.getMerchantId(req), normalized, search);
  }
  @Get('outlets/:outletId')
  @ApiOkResponse({ type: PortalOutletDto })
  getOutlet(@Req() req: any, @Param('outletId') outletId: string) {
    return this.catalog.getOutlet(this.getMerchantId(req), outletId);
  }
  @Post('outlets')
  @ApiOkResponse({ type: PortalOutletDto })
  createOutlet(@Req() req: any, @Body() dto: CreatePortalOutletDto) {
    return this.catalog.createOutlet(this.getMerchantId(req), dto);
  }
  @Put('outlets/:outletId')
  @ApiOkResponse({ type: PortalOutletDto })
  updateOutlet(@Req() req: any, @Param('outletId') outletId: string, @Body() dto: UpdatePortalOutletDto) {
    return this.catalog.updateOutlet(this.getMerchantId(req), outletId, dto);
  }
  @Delete('outlets/:outletId')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  deleteOutlet(@Req() req: any, @Param('outletId') outletId: string) {
    return this.service.deleteOutlet(this.getMerchantId(req), outletId);
  }

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
