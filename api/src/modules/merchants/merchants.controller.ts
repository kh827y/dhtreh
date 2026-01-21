import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  Query,
  UseInterceptors,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { MerchantsService } from './merchants.service';
import {
  CreateOutletDto,
  CreateStaffDto,
  UpdateMerchantSettingsDto,
  UpdateOutletDto,
  UpdateStaffDto,
  MerchantSettingsRespDto,
  OutletDto,
  StaffDto,
  TokenRespDto,
  OkDto,
  OutboxEventDto,
  BulkUpdateRespDto,
  ReceiptDto,
  CustomerSearchRespDto,
  LedgerEntryDto,
  UpdateOutletStatusDto,
} from './dto';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';
import { ErrorDto } from '../loyalty/dto/dto';
import { TransactionItemDto } from '../loyalty/dto/dto';
import { SubscriptionService } from '../subscription/subscription.service';

type MerchantListItem = Awaited<
  ReturnType<MerchantsService['listMerchants']>
>[number];
type MerchantSettings = Awaited<ReturnType<MerchantsService['getSettings']>>;
type MerchantSettingsUpdateResult = Awaited<
  ReturnType<MerchantsService['updateSettings']>
>;
type MaskableSettings = MerchantSettings | MerchantSettingsUpdateResult;

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
export class MerchantsController {
  constructor(
    private readonly service: MerchantsService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  // Admin: list / create merchants
  @Get()
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          initialName: { type: 'string' },
          createdAt: { type: 'string' },
          portalEmail: { type: 'string', nullable: true },
          portalLoginEnabled: { type: 'boolean' },
          portalTotpEnabled: { type: 'boolean' },
        },
      },
    },
  })
  listMerchants() {
    return this.service.listMerchants().then((rows: MerchantListItem[]) =>
      rows.map((row) => ({
        ...row,
        subscription: this.subscriptions.buildStateFromRecord(
          row.subscription ?? null,
        ),
      })),
    );
  }
  @Post()
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        initialName: { type: 'string' },
        email: { type: 'string' },
      },
    },
  })
  createMerchant(
    @Body()
    body: {
      name: string;
      email?: string;
      password?: string;
      portalEmail?: string;
      portalPassword?: string;
      ownerName?: string;
      maxOutlets?: number | null;
    },
  ) {
    const email = body?.email ?? body?.portalEmail;
    const password = body?.password ?? body?.portalPassword;
    return this.service.createMerchant(
      (body?.name || '').trim(),
      String(email || '')
        .trim()
        .toLowerCase(),
      String(password || ''),
      body?.ownerName ? String(body.ownerName).trim() : undefined,
      body?.maxOutlets ?? null,
    );
  }

  // Admin: update/delete merchant
  @Put(':id')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        initialName: { type: 'string' },
        email: { type: 'string', nullable: true },
      },
    },
  })
  updateMerchant(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      password?: string;
      portalEmail?: string;
      portalPassword?: string;
    },
  ) {
    const email = body?.email ?? body?.portalEmail;
    const password = body?.password ?? body?.portalPassword;
    return this.service.updateMerchant(id, {
      name: body?.name,
      email,
      password,
    });
  }

  @Post(':id/subscription')
  grantSubscription(
    @Param('id') id: string,
    @Body() body: { days?: number; planId?: string },
  ) {
    const days = Number(body?.days);
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException('days must be > 0');
    }
    return this.subscriptions.grantSubscription(
      id,
      body?.planId || 'plan_full',
      days,
    );
  }

  @Delete(':id/subscription')
  resetSubscription(@Param('id') id: string) {
    return this.subscriptions.resetSubscription(id);
  }

  @Delete(':id')
  @ApiOkResponse({ type: OkDto })
  deleteMerchant(@Param('id') id: string) {
    return this.service.deleteMerchant(id);
  }

  @Get(':id/settings')
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  getSettings(@Param('id') id: string) {
    return this.service
      .getSettings(id)
      .then((settings) => this.maskSettingsSecrets(settings));
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
    const weekday = Math.max(
      0,
      Math.min(6, parseInt(weekdayStr || '0', 10) || 0),
    );
    const ch =
      channel === 'SMART' || channel === 'PC_POS' || channel === 'VIRTUAL'
        ? channel
        : 'VIRTUAL';
    return this.service.previewRules(id, {
      channel: ch,
      weekday,
      category,
    });
  }

  @Put(':id/settings')
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  updateSettings(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantSettingsDto,
  ) {
    return this.service
      .updateSettings(
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
        dto, // передаём доп.поля (next секреты/флажок) без ломки сигнатуры
      )
      .then((settings) => this.maskSettingsSecrets(settings));
  }

  private maskSettingsSecrets(settings: MaskableSettings | null) {
    if (!settings) return settings;
    return {
      ...settings,
      webhookSecret: null,
      webhookSecretNext: null,
      telegramBotToken: null,
    };
  }

  @Post(':id/antifraud/reset')
  @ApiOkResponse({ type: OkDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  resetAntifraudLimit(
    @Param('id') id: string,
    @Body()
    body: {
      scope: 'merchant' | 'customer' | 'staff' | 'device' | 'outlet';
      targetId?: string;
    },
  ) {
    return this.service.resetAntifraudLimit(id, body);
  }

  // Outlets
  @Get(':id/outlets')
  @ApiOkResponse({ type: OutletDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listOutlets(@Param('id') id: string) {
    return this.service.listOutlets(id);
  }
  @Post(':id/outlets')
  @ApiOkResponse({ type: OutletDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  createOutlet(@Param('id') id: string, @Body() dto: CreateOutletDto) {
    return this.service.createOutlet(id, dto.name);
  }
  @Put(':id/outlets/:outletId')
  @ApiOkResponse({ type: OutletDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  updateOutlet(
    @Param('id') id: string,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateOutletDto,
  ) {
    return this.service.updateOutlet(id, outletId, dto);
  }
  @Delete(':id/outlets/:outletId')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  deleteOutlet(@Param('id') id: string, @Param('outletId') outletId: string) {
    return this.service.deleteOutlet(id, outletId);
  }
  @Put(':id/outlets/:outletId/status')
  @ApiOkResponse({ type: OutletDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  updateOutletStatus(
    @Param('id') id: string,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateOutletStatusDto,
  ) {
    return this.service.updateOutletStatus(id, outletId, dto.status);
  }

  // Staff
  @Get(':id/staff')
  @ApiOkResponse({ type: StaffDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listStaff(@Param('id') id: string) {
    return this.service.listStaff(id);
  }
  @Post(':id/staff')
  @ApiOkResponse({ type: StaffDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  createStaff(@Param('id') id: string, @Body() dto: CreateStaffDto) {
    return this.service.createStaff(id, {
      login: dto.login,
      email: dto.email,
      role: dto.role,
    });
  }
  @Put(':id/staff/:staffId')
  @ApiOkResponse({ type: StaffDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  updateStaff(
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.service.updateStaff(id, staffId, dto);
  }
  @Delete(':id/staff/:staffId')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  deleteStaff(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.service.deleteStaff(id, staffId);
  }

  // Staff tokens
  @Post(':id/staff/:staffId/token')
  @ApiOkResponse({ type: TokenRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  issueStaffToken(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.service.issueStaffToken(id, staffId);
  }
  @Delete(':id/staff/:staffId/token')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  revokeStaffToken(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.service.revokeStaffToken(id, staffId);
  }

  // Outbox monitor
  @Get(':id/outbox')
  @ApiOkResponse({ type: OutboxEventDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listOutbox(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('limit') limitStr?: string,
    @Query('type') type?: string,
    @Query('since') since?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : undefined;
    return this.service.listOutbox(id, status, limit, type, since);
  }
  @Post(':id/outbox/:eventId/retry')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  retryOutbox(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.service.retryOutbox(id, eventId);
  }
  @Delete(':id/outbox/:eventId')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  deleteOutbox(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.service.deleteOutbox(id, eventId);
  }
  @Post(':id/outbox/retryAll')
  @ApiOkResponse({ type: BulkUpdateRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  retryAll(@Param('id') id: string, @Query('status') status?: string) {
    return this.service.retryAll(id, status);
  }

  @Get(':id/outbox/event/:eventId')
  @ApiOkResponse({ type: OutboxEventDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  getOutboxEvent(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.service.getOutboxEvent(id, eventId);
  }

  @Post(':id/outbox/retrySince')
  @ApiOkResponse({ type: BulkUpdateRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  retrySince(
    @Param('id') id: string,
    @Body() body: { status?: string; since?: string },
  ) {
    return this.service.retrySince(id, {
      status: body?.status,
      since: body?.since,
    });
  }

  @Post(':id/outbox/pause')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async pauseOutbox(
    @Param('id') id: string,
    @Body() body: { minutes?: number; until?: string },
  ) {
    return this.service.pauseOutbox(id, body?.minutes, body?.until);
  }
  @Post(':id/outbox/resume')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async resumeOutbox(@Param('id') id: string) {
    return this.service.resumeOutbox(id);
  }

  @Get(':id/outbox/stats')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        since: { type: 'string', nullable: true },
        counts: { type: 'object', additionalProperties: { type: 'number' } },
        lastDeadAt: { type: 'string', nullable: true },
      },
    },
  })
  outboxStats(@Param('id') id: string, @Query('since') sinceStr?: string) {
    const since = sinceStr ? new Date(sinceStr) : undefined;
    if (sinceStr && Number.isNaN(since?.getTime() ?? NaN)) {
      throw new BadRequestException('since is invalid');
    }
    return this.service.outboxStats(id, since);
  }

  @Get(':id/outbox.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV (streamed)' } })
  async outboxCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('since') since?: string,
    @Query('type') type?: string,
    @Query('limit') limitStr?: string,
    @Query('batch') batchStr: string = '1000',
  ) {
    const batchRaw = parseInt(batchStr, 10);
    const batch = Math.min(
      Math.max(Number.isFinite(batchRaw) ? batchRaw : 1000, 100),
      5000,
    );
    const limitRaw = limitStr ? parseInt(limitStr, 10) : NaN;
    const totalLimit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 5000)
        : undefined;
    const pageSize = totalLimit ? Math.min(totalLimit, batch) : batch;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="outbox_${id}_${Date.now()}.csv"`,
    );
    res.write('id,eventType,status,retries,nextRetryAt,lastError,createdAt\n');
    // Пагинация по createdAt
    let cursor: { createdAt: Date; id: string } | null = null;
    let written = 0;
    while (true) {
      const page = await this.service.listOutbox(
        id,
        status,
        pageSize,
        type,
        since,
        cursor,
      );
      if (!page.length) break;
      for (const ev of page) {
        const row = [
          ev.id,
          ev.eventType,
          ev.status,
          ev.retries,
          ev.nextRetryAt ? ev.nextRetryAt.toISOString() : '',
          ev.lastError || '',
          ev.createdAt.toISOString(),
        ]
          .map((x) => `"${String(x).replaceAll('"', '""')}"`)
          .join(',');
        res.write(row + '\n');
        written += 1;
        if (totalLimit && written >= totalLimit) break;
      }
      if (totalLimit && written >= totalLimit) break;
      const last = page[page.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      if (page.length < pageSize) break;
    }
    res.end();
  }

  // ===== Portal auth management (admin only) =====
  @Post(':id/portal/rotate-key')
  @ApiOkResponse({
    schema: { type: 'object', properties: { key: { type: 'string' } } },
  })
  rotatePortalKey(@Param('id') id: string) {
    return this.service.rotatePortalKey(id);
  }
  @Post(':id/portal/login-enabled')
  @ApiOkResponse({ type: OkDto })
  setPortalLoginEnabled(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.service.setPortalLoginEnabled(id, !!body?.enabled);
  }
  @Post(':id/portal/totp/init')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { secret: { type: 'string' }, otpauth: { type: 'string' } },
    },
  })
  initTotp(@Param('id') id: string) {
    return this.service.initTotp(id);
  }
  @Post(':id/portal/totp/verify')
  @ApiOkResponse({ type: OkDto })
  verifyTotp(@Param('id') id: string, @Body() body: { code: string }) {
    return this.service.verifyTotp(id, String(body?.code || ''));
  }
  @Post(':id/portal/totp/disable')
  @ApiOkResponse({ type: OkDto })
  disableTotp(@Param('id') id: string) {
    return this.service.disableTotp(id);
  }
  @Post(':id/portal/impersonate')
  @ApiOkResponse({ type: TokenRespDto })
  impersonatePortal(@Param('id') id: string) {
    return this.service.impersonatePortal(id);
  }

  // Cashier credentials (admin only)
  @Get(':id/cashier')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        login: { type: 'string', nullable: true },
      },
    },
  })
  getCashier(@Param('id') id: string) {
    return this.service.getCashierCredentials(id);
  }
  @Post(':id/cashier')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { login: { type: 'string' } },
    },
  })
  setCashier(@Param('id') id: string, @Body() body: { login?: string }) {
    return this.service.setCashierCredentials(id, String(body?.login || ''));
  }
  @Post(':id/cashier/rotate')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { login: { type: 'string' } },
    },
  })
  rotateCashier(
    @Param('id') id: string,
    @Body() body: { regenerateLogin?: boolean },
  ) {
    return this.service.rotateCashierCredentials(id, !!body?.regenerateLogin);
  }

  @Get(':id/outbox/by-order')
  @ApiOkResponse({ type: OutboxEventDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async outboxByOrder(
    @Param('id') id: string,
    @Query('orderId') orderId: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 500)
      : 100;
    return this.service.listOutboxByOrder(id, orderId, limit);
  }

  // Transactions overview
  @Get(':id/transactions')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(TransactionItemDto) },
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listTransactions(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('type') type?: string,
    @Query('customerId') customerId?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    return this.service.listTransactions(id, {
      limit,
      before,
      from,
      to,
      type,
      customerId,
      outletId,
      staffId,
    });
  }
  @Get(':id/receipts')
  @ApiOkResponse({ type: ReceiptDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listReceipts(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    return this.service.listReceipts(id, {
      limit,
      before,
      from,
      to,
      orderId,
      customerId,
    });
  }
  @Get(':id/receipts/:receiptId')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        receipt: { $ref: getSchemaPath(ReceiptDto) },
        transactions: {
          type: 'array',
          items: { $ref: getSchemaPath(TransactionItemDto) },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  getReceipt(@Param('id') id: string, @Param('receiptId') receiptId: string) {
    return this.service.getReceipt(id, receiptId);
  }
  @Get(':id/receipts.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV (streamed)' } })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async exportReceiptsCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('batch') batchStr: string = '1000',
    @Query('before') beforeStr?: string,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const batch = Math.min(Math.max(parseInt(batchStr, 10) || 1000, 100), 5000);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipts_${id}_${Date.now()}.csv"`,
    );
    res.write(
      'id,orderId,customerId,total,redeemApplied,earnApplied,createdAt,outletId,staffId\n',
    );
    let before = beforeStr ? new Date(beforeStr) : undefined;
    while (true) {
      const page = await this.service.listReceipts(id, {
        limit: batch,
        before,
        orderId,
        customerId,
      });
      if (!page.length) break;
      for (const r of page) {
        const row = [
          r.id,
          r.orderId,
          r.customerId,
          r.total,
          r.redeemApplied,
          r.earnApplied,
          r.createdAt.toISOString(),
          r.outletId || '',
          r.staffId || '',
        ]
          .map((x) => this.csvCell(x))
          .join(',');
        res.write(row + '\n');
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }
    res.end();
  }

  // Ledger
  @Get(':id/ledger')
  @ApiOkResponse({ type: LedgerEntryDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listLedger(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('customerId') customerId?: string,
    @Query('type') type?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 500)
      : 50;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    return this.service.listLedger(id, {
      limit,
      before,
      customerId,
      from,
      to,
      type,
    });
  }

  @Get(':id/ledger.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV (streamed)' } })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async exportLedgerCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('batch') batchStr: string = '1000',
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('customerId') customerId?: string,
    @Query('type') type?: string,
  ) {
    const batch = Math.min(Math.max(parseInt(batchStr, 10) || 1000, 100), 5000);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ledger_${id}_${Date.now()}.csv"`,
    );
    res.write(
      'id,customerId,debit,credit,amount,orderId,receiptId,createdAt,outletId,staffId\n',
    );
    let before = beforeStr ? new Date(beforeStr) : undefined;
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    while (true) {
      const page = await this.service.listLedger(id, {
        limit: batch,
        before,
        customerId,
        from,
        to,
        type,
      });
      if (!page.length) break;
      for (const e of page) {
        const row = [
          e.id,
          e.customerId || '',
          e.debit,
          e.credit,
          e.amount,
          e.orderId || '',
          e.receiptId || '',
          e.createdAt.toISOString(),
          e.outletId || '',
          e.staffId || '',
        ]
          .map((x) => this.csvCell(x))
          .join(',');
        res.write(row + '\n');
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }
    res.end();
  }

  // TTL reconciliation (preview vs burned)
  @Get(':id/ttl/reconciliation')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        cutoff: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
              expiredRemain: { type: 'number' },
              burned: { type: 'number' },
              diff: { type: 'number' },
            },
          },
        },
        totals: {
          type: 'object',
          properties: {
            expiredRemain: { type: 'number' },
            burned: { type: 'number' },
            diff: { type: 'number' },
          },
        },
      },
    },
  })
  ttlReconciliation(@Param('id') id: string, @Query('cutoff') cutoff: string) {
    return this.service.ttlReconciliation(id, cutoff);
  }

  @Get(':id/ttl/reconciliation.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV' } })
  async exportTtlReconciliationCsv(
    @Param('id') id: string,
    @Query('cutoff') cutoff: string,
    @Query('onlyDiff') onlyDiff?: string,
  ) {
    return this.service.exportTtlReconciliationCsv(
      id,
      cutoff,
      onlyDiff === '1' || /true/i.test(onlyDiff || ''),
    );
  }

  // CRM helpers
  @Get(':id/customer/search')
  @ApiOkResponse({
    schema: {
      oneOf: [{ $ref: getSchemaPath(CustomerSearchRespDto) }, { type: 'null' }],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async customerSearch(@Param('id') id: string, @Query('phone') phone: string) {
    return this.service.findCustomerByPhone(id, phone);
  }

  // CSV exports
  @Get(':id/transactions.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV (streamed)' } })
  async exportTxCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('batch') batchStr: string = '1000',
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('type') type?: string,
    @Query('customerId') customerId?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const batch = Math.min(Math.max(parseInt(batchStr, 10) || 1000, 100), 5000);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transactions_${id}_${Date.now()}.csv"`,
    );
    res.write('id,type,amount,orderId,customerId,createdAt,outletId,staffId\n');
    let before = beforeStr ? new Date(beforeStr) : undefined;
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    while (true) {
      const page = await this.service.listTransactions(id, {
        limit: batch,
        before,
        from,
        to,
        type,
        customerId,
        outletId,
        staffId,
      });
      if (!page.length) break;
      for (const t of page) {
        const row = [
          t.id,
          t.type,
          t.amount,
          t.orderId || '',
          t.customerId,
          t.createdAt.toISOString(),
          t.outletId || '',
          t.staffId || '',
        ]
          .map((x) => this.csvCell(x))
          .join(',');
        res.write(row + '\n');
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }
    res.end();
  }

  private sanitizeCsvValue(value: string) {
    const trimmed = value.replace(/^[\t\r\n ]+/, '');
    if (trimmed && /^[=+\-@]/.test(trimmed)) {
      return `'${value}`;
    }
    return value;
  }

  private toCsvString(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    try {
      return JSON.stringify(value);
    } catch (err) {
      logIgnoredError(err, 'MerchantsController toCsvString', undefined, 'debug');
      return '';
    }
  }

  private csvCell(value: unknown) {
    const safe = this.sanitizeCsvValue(this.toCsvString(value));
    const escaped = safe.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
