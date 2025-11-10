import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { PortalGuard } from '../portal-auth/portal.guard';
import { MerchantsService } from '../merchants/merchants.service';
import {
  LedgerEntryDto,
  MerchantSettingsRespDto,
  ReceiptDto,
  UpdateMerchantSettingsDto,
  UpdateOutletPosDto,
  UpdateOutletStatusDto,
  UpdateTimezoneDto,
} from '../merchants/dto';
import { ErrorDto, TransactionItemDto } from '../loyalty/dto';
import {
  PromoCodesService,
  type PortalPromoCodePayload,
} from '../promocodes/promocodes.service';
import { CommunicationChannel, PromoCodeStatus } from '@prisma/client';
import {
  NotificationsService,
  type BroadcastArgs,
} from '../notifications/notifications.service';
import { PortalCustomersService } from './customers.service';
import {
  AnalyticsService,
  DashboardPeriod,
  RecencyGrouping,
  TimeGrouping,
} from '../analytics/analytics.service';
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
import {
  StaffMotivationService,
  type UpdateStaffMotivationPayload,
} from './services/staff-motivation.service';
import {
  ActionsService,
  type ActionsTab,
  type CreateProductBonusActionPayload,
  type UpdateActionStatusPayload,
} from './services/actions.service';
import {
  OperationsLogService,
  type OperationsLogFilters,
} from './services/operations-log.service';
import { PortalTelegramIntegrationService } from './services/telegram-integration.service';
import { PortalTelegramNotifyService } from './services/telegram-notify.service';
import type { StaffNotifyActor } from '../telegram/staff-notifications.service';
import {
  ReferralService,
  type ReferralProgramSettingsDto,
} from '../referral/referral.service';
import { PortalReviewsService } from './services/reviews.service';
import {
  DEFAULT_TIMEZONE_CODE,
  RUSSIA_TIMEZONES,
  serializeTimezone,
} from '../timezone/russia-timezones';
import { UpdateRfmSettingsDto } from '../analytics/dto/update-rfm-settings.dto';

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
    private readonly telegramNotify: PortalTelegramNotifyService,
    private readonly referrals: ReferralService,
    private readonly reviews: PortalReviewsService,
  ) {}

  private getMerchantId(req: any) {
    return String(req.portalMerchantId || '');
  }
  private getTimezoneOffsetMinutes(req: any): number {
    const raw = Number(req?.portalTimezoneOffsetMinutes ?? NaN);
    if (Number.isFinite(raw)) return raw;
    return 7 * 60; // default Барнаул (UTC+7)
  }

  private shiftToTimezone(date: Date, offsetMinutes: number) {
    return new Date(date.getTime() + offsetMinutes * 60 * 1000);
  }

  private shiftFromTimezone(date: Date, offsetMinutes: number) {
    return new Date(date.getTime() - offsetMinutes * 60 * 1000);
  }

  private parseLocalDate(
    value: string,
    offsetMinutes: number,
    endOfDay = false,
  ): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) return null;
    const date = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      ),
    );
    return this.shiftFromTimezone(date, offsetMinutes);
  }

  private computePeriod(
    req: any,
    periodType?: string,
    fromStr?: string,
    toStr?: string,
  ) {
    const offset = this.getTimezoneOffsetMinutes(req);
    if (fromStr && toStr) {
      const from = this.parseLocalDate(fromStr, offset, false);
      const to = this.parseLocalDate(toStr, offset, true);
      if (from && to) {
        if (from.getTime() > to.getTime()) {
          return { from: to, to: from, type: 'custom' as const };
        }
        return { from, to, type: 'custom' as const };
      }
    }

    const now = new Date();
    const localNow = this.shiftToTimezone(now, offset);
    const fromLocal = new Date(localNow);
    let toLocal = new Date(localNow);

    switch (periodType) {
      case 'yesterday':
        fromLocal.setUTCDate(fromLocal.getUTCDate() - 1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      case 'day':
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      case 'week': {
        const dayOfWeek = fromLocal.getUTCDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        fromLocal.setUTCDate(fromLocal.getUTCDate() + diff);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCDate(toLocal.getUTCDate() + 6);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      }
      case 'month':
        fromLocal.setUTCDate(1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCMonth(toLocal.getUTCMonth() + 1);
        toLocal.setUTCDate(0);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      case 'quarter': {
        const quarter = Math.floor(fromLocal.getUTCMonth() / 3);
        fromLocal.setUTCMonth(quarter * 3, 1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCMonth(toLocal.getUTCMonth() + 3);
        toLocal.setUTCDate(0);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      }
      case 'year':
        fromLocal.setUTCMonth(0, 1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCMonth(11, 31);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      default:
        fromLocal.setUTCDate(1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCMonth(toLocal.getUTCMonth() + 1);
        toLocal.setUTCDate(0);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
    }

    const normalized: DashboardPeriod['type'] =
      periodType === 'yesterday' ||
      periodType === 'day' ||
      periodType === 'week' ||
      periodType === 'month' ||
      periodType === 'quarter' ||
      periodType === 'year'
        ? (periodType as DashboardPeriod['type'])
        : 'month';

    return {
      from: this.shiftFromTimezone(fromLocal, offset),
      to: this.shiftFromTimezone(toLocal, offset),
      type: normalized,
    };
  }

  private normalizeGrouping(value?: string): TimeGrouping | undefined {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'week') return 'week';
    if (normalized === 'month') return 'month';
    if (normalized === 'day') return 'day';
    return undefined;
  }

  private normalizePushScope(scope?: string): 'ACTIVE' | 'ARCHIVED' {
    return scope === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  }

  private normalizeTelegramScope(scope?: string): 'ACTIVE' | 'ARCHIVED' {
    return scope === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  }

  private resolveTelegramActor(req: any): StaffNotifyActor {
    if (req?.portalActor === 'STAFF' && req?.portalStaffId) {
      return { kind: 'STAFF', staffId: String(req.portalStaffId) };
    }
    return { kind: 'MERCHANT' };
  }

  private normalizeActionsTab(tab?: string): ActionsTab {
    const upper = String(tab || '').toUpperCase() as ActionsTab;
    return upper === 'UPCOMING' || upper === 'PAST' ? upper : 'CURRENT';
  }

  private normalizeDirection(
    direction?: string,
  ): OperationsLogFilters['direction'] {
    const upper = String(direction || '').toUpperCase();
    if (upper === 'EARN' || upper === 'REDEEM') return upper;
    return 'ALL';
  }

  private asRecord(value: unknown): Record<string, any> {
    if (value && typeof value === 'object') return value as Record<string, any>;
    return {};
  }

  private coerceCount(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.round(num));
  }

  private normalizeReferralProgramPayload(
    body: any,
  ): ReferralProgramSettingsDto {
    const rewardTrigger: ReferralProgramSettingsDto['rewardTrigger'] =
      body?.rewardTrigger === 'all' ? 'all' : 'first';
    const rewardType: ReferralProgramSettingsDto['rewardType'] =
      body?.rewardType === 'PERCENT' || body?.rewardType === 'percent'
        ? 'percent'
        : 'fixed';
    const rewardValueRaw = Number(body?.rewardValue ?? 0);
    const friendRewardRaw = Number(body?.friendReward ?? 0);
    const minPurchaseRaw = Number(body?.minPurchaseAmount ?? 0);
    const placeholders = Array.isArray(body?.placeholders)
      ? body.placeholders
          .map((item: any) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item: string) => item.length > 0)
      : undefined;
    const levels = Array.isArray(body?.levels)
      ? body.levels.map((item: any) => ({
          level: Number(item?.level ?? 0),
          enabled: Boolean(item?.enabled),
          reward: Number(item?.reward ?? 0),
        }))
      : [];

    return {
      enabled: Boolean(body?.enabled),
      rewardTrigger,
      rewardType,
      multiLevel: Boolean(body?.multiLevel),
      rewardValue: Number.isFinite(rewardValueRaw) ? rewardValueRaw : 0,
      levels,
      friendReward: Number.isFinite(friendRewardRaw) ? friendRewardRaw : 0,
      stackWithRegistration: Boolean(body?.stackWithRegistration),
      message: typeof body?.message === 'string' ? body.message : '',
      placeholders,
      shareMessage:
        typeof body?.shareMessage === 'string' ? body.shareMessage : undefined,
      minPurchaseAmount:
        Number.isFinite(minPurchaseRaw) && minPurchaseRaw > 0
          ? Math.round(minPurchaseRaw)
          : 0,
    };
  }

  private extractMetadata(
    payload: Record<string, any>,
    stats: Record<string, any>,
  ) {
    if (payload.metadata !== undefined) return payload.metadata;
    if (stats.metadata !== undefined) return stats.metadata;
    return null;
  }

  @Get('reviews')
  async listReviews(
    @Req() req: any,
    @Query('withCommentOnly') withCommentOnly?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.reviews.list(merchantId, {
      withCommentOnly: withCommentOnly === '1' || withCommentOnly === 'true',
      outletId: outletId || undefined,
      staffId: staffId || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  private mapPushTask(task: any) {
    const payload = this.asRecord(task?.payload);
    const stats = this.asRecord(task?.stats);
    const snapshot = this.asRecord(task?.audienceSnapshot);
    const audienceRaw =
      task?.audienceName ??
      snapshot.code ??
      snapshot.legacyAudience ??
      snapshot.audienceName ??
      'ALL';
    const totalRecipients =
      typeof task?.totalRecipients === 'number'
        ? task.totalRecipients
        : this.coerceCount(stats.totalRecipients ?? stats.total);
    const sent =
      typeof task?.sentCount === 'number'
        ? task.sentCount
        : this.coerceCount(stats.sent ?? stats.delivered);
    const failed =
      typeof task?.failedCount === 'number'
        ? task.failedCount
        : this.coerceCount(stats.failed ?? stats.errors);
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
      typeof task?.sentCount === 'number'
        ? task.sentCount
        : this.coerceCount(stats.sent ?? stats.delivered);
    const failed =
      typeof task?.failedCount === 'number'
        ? task.failedCount
        : this.coerceCount(stats.failed ?? stats.errors);
    const metadata = this.extractMetadata(payload, stats);
    const imageAssetId = media.assetId ?? null;

    return {
      id: task.id,
      merchantId: task.merchantId,
      audienceId: task.audienceId ?? snapshot.legacyAudienceId ?? null,
      audienceName: task.audienceName ?? snapshot.audienceName ?? null,
      text: typeof payload.text === 'string' ? payload.text : '',
      imageAssetId: typeof imageAssetId === 'string' ? imageAssetId : null,
      imageMeta: imageAssetId
        ? {
            fileName: media.fileName ?? null,
            mimeType: media.mimeType ?? null,
          }
        : null,
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

  private normalizePortalPermissions(state: any) {
    if (!state) return {};
    if (state.allowAll) return { __all__: ['*'] };
    const result: Record<string, string[]> = {};
    const entries: Array<[string, unknown]> =
      state.resources instanceof Map
        ? Array.from(state.resources.entries()).map(
            ([key, value]) => [String(key), value] as [string, unknown],
          )
        : Object.entries(state.resources || {});
    for (const [resourceKey, actionsRaw] of entries) {
      const resource = String(resourceKey || '').trim();
      if (!resource) continue;
      let actions: string[] = [];
      if (actionsRaw instanceof Set) actions = Array.from(actionsRaw);
      else if (Array.isArray(actionsRaw)) actions = actionsRaw.slice();
      else if (actionsRaw && typeof actionsRaw === 'object') {
        actions = Object.keys(actionsRaw).filter((key) => actionsRaw[key]);
      }
      const normalized = Array.from(
        new Set(
          actions
            .map((a) =>
              String(a || '')
                .toLowerCase()
                .trim(),
            )
            .filter((a) => !!a),
        ),
      ).sort();
      if (normalized.length) result[resource.toLowerCase()] = normalized;
    }
    return result;
  }

  @Get('me')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        role: { type: 'string' },
        actor: { type: 'string' },
        adminImpersonation: { type: 'boolean' },
        staff: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            name: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            role: { type: 'string', nullable: true },
            groups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  scope: { type: 'string' },
                },
              },
            },
          },
        },
        permissions: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  })
  me(@Req() req: any) {
    const actor = req.portalActor || 'MERCHANT';
    const staff =
      actor === 'STAFF'
        ? {
            id: String(req.portalStaffId || ''),
            name:
              typeof req.portalStaffName === 'string'
                ? req.portalStaffName
                : null,
            email:
              typeof req.portalStaffEmail === 'string'
                ? req.portalStaffEmail
                : null,
            role:
              typeof req.portalStaffRole === 'string'
                ? req.portalStaffRole
                : null,
            groups: Array.isArray(req.portalAccessGroups)
              ? req.portalAccessGroups
              : [],
          }
        : null;
    return {
      merchantId: this.getMerchantId(req),
      role: req.portalRole || 'MERCHANT',
      actor,
      adminImpersonation: !!req.portalAdminImpersonation,
      staff,
      permissions: this.normalizePortalPermissions(req.portalPermissions),
    };
  }

  // Customer search by phone (CRM helper)
  @Get('customer/search')
  @ApiOkResponse({
    schema: {
      oneOf: [
        {
          type: 'object',
          properties: {
            customerId: { type: 'string' },
            phone: { type: 'string', nullable: true },
            balance: { type: 'number' },
          },
        },
        { type: 'null' },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  customerSearch(@Req() req: any, @Query('phone') phone: string) {
    return this.service.findCustomerByPhone(
      this.getMerchantId(req),
      String(phone || ''),
    );
  }

  // ===== Customers CRUD =====
  @Get('customers')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  listCustomers(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('segmentId') segmentId?: string,
    @Query('registeredOnly') registeredOnlyStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const offset = offsetStr ? Math.max(parseInt(offsetStr, 10) || 0, 0) : 0;
    let registeredOnly: boolean | undefined;
    if (typeof registeredOnlyStr === 'string') {
      registeredOnly = !['0', 'false', 'no'].includes(
        registeredOnlyStr.trim().toLowerCase(),
      );
    }
    return this.customersService.list(this.getMerchantId(req), {
      search,
      limit,
      offset,
      segmentId,
      registeredOnly,
    });
  }

  @Get('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  getCustomer(@Req() req: any, @Param('customerId') customerId: string) {
    return this.customersService.get(
      this.getMerchantId(req),
      String(customerId || ''),
    );
  }

  @Post('customers')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createCustomer(
    @Req() req: any,
    @Body()
    body: {
      phone?: string;
      email?: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      birthday?: string;
      gender?: string;
      tags?: string[];
      comment?: string;
      accrualsBlocked?: boolean;
    },
  ) {
    return this.customersService.create(this.getMerchantId(req), body || {});
  }

  @Put('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  updateCustomer(
    @Req() req: any,
    @Param('customerId') customerId: string,
    @Body()
    body: {
      phone?: string;
      email?: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      birthday?: string;
      gender?: string;
      tags?: string[];
      comment?: string;
      accrualsBlocked?: boolean;
    },
  ) {
    return this.customersService.update(
      this.getMerchantId(req),
      String(customerId || ''),
      body || {},
    );
  }

  @Post('customers/:customerId/transactions/accrual')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  manualAccrual(
    @Req() req: any,
    @Param('customerId') customerId: string,
    @Body() body: any,
  ) {
    return this.customersService.accrueManual(
      this.getMerchantId(req),
      String(customerId || ''),
      req.portalStaffId ?? null,
      {
        purchaseAmount: body?.purchaseAmount,
        points: body?.points,
        receiptNumber: body?.receiptNumber,
        outletId: body?.outletId,
        comment: body?.comment,
      },
    );
  }

  @Post('customers/:customerId/transactions/redeem')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  manualRedeem(
    @Req() req: any,
    @Param('customerId') customerId: string,
    @Body() body: any,
  ) {
    return this.customersService.redeemManual(
      this.getMerchantId(req),
      String(customerId || ''),
      req.portalStaffId ?? null,
      {
        points: body?.points,
        outletId: body?.outletId,
        comment: body?.comment,
      },
    );
  }

  @Post('customers/:customerId/transactions/complimentary')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  manualComplimentary(
    @Req() req: any,
    @Param('customerId') customerId: string,
    @Body() body: any,
  ) {
    return this.customersService.issueComplimentary(
      this.getMerchantId(req),
      String(customerId || ''),
      req.portalStaffId ?? null,
      {
        points: body?.points,
        expiresInDays: body?.expiresInDays,
        outletId: body?.outletId,
        comment: body?.comment,
      },
    );
  }

  @Delete('customers/:customerId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteCustomer(@Req() req: any, @Param('customerId') customerId: string) {
    return this.customersService.remove(
      this.getMerchantId(req),
      String(customerId || ''),
    );
  }

  // Promocodes (POINTS) — list/issue/deactivate
  @Get('promocodes')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  promocodesList(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    return this.promoCodes.listForPortal(
      this.getMerchantId(req),
      status,
      limit,
    );
  }
  @Post('promocodes/issue')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, promoCodeId: { type: 'string' } },
    },
  })
  promocodesIssue(@Req() req: any, @Body() body: PortalPromoCodePayload) {
    return this.promoCodes
      .createFromPortal(this.getMerchantId(req), body)
      .then((created) => ({ ok: true, promoCodeId: created.id }));
  }
  @Post('promocodes/deactivate')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  promocodesDeactivate(
    @Req() req: any,
    @Body() body: { promoCodeId?: string; code?: string },
  ) {
    if (!body?.promoCodeId) throw new NotFoundException('Промокод не найден');
    return this.promoCodes.changeStatus(
      this.getMerchantId(req),
      body.promoCodeId,
      PromoCodeStatus.ARCHIVED,
    );
  }
  @Post('promocodes/activate')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  promocodesActivate(
    @Req() req: any,
    @Body() body: { promoCodeId?: string; code?: string },
  ) {
    if (!body?.promoCodeId) throw new NotFoundException('Промокод не найден');
    return this.promoCodes.changeStatus(
      this.getMerchantId(req),
      body.promoCodeId,
      PromoCodeStatus.ACTIVE,
    );
  }
  @Put('promocodes/:promoCodeId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  promocodesUpdate(
    @Req() req: any,
    @Param('promoCodeId') promoCodeId: string,
    @Body() body: PortalPromoCodePayload,
  ) {
    return this.promoCodes.updateFromPortal(
      this.getMerchantId(req),
      promoCodeId,
      body,
    );
  }

  // Notifications broadcast (enqueue or dry-run)
  @Post('notifications/broadcast')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        dryRun: { type: 'boolean', nullable: true },
        estimated: { type: 'number', nullable: true },
      },
    },
  })
  notificationsBroadcast(
    @Req() req: any,
    @Body() body: Omit<BroadcastArgs, 'merchantId'>,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.notifications.broadcast({ merchantId, ...body });
  }

  // ===== Push campaigns =====
  @Get('push-campaigns')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  listPushCampaigns(@Req() req: any, @Query('scope') scope?: string) {
    const merchantId = this.getMerchantId(req);
    return this.communications
      .listChannelTasks(
        merchantId,
        CommunicationChannel.PUSH,
        this.normalizePushScope(scope),
      )
      .then((tasks) => tasks.map((task) => this.mapPushTask(task)));
  }

  @Post('push-campaigns')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createPushCampaign(
    @Req() req: any,
    @Body()
    body: {
      text?: string;
      audience?: string;
      audienceId?: string;
      audienceName?: string;
      startAt?: string;
      scheduledAt?: string;
      timezone?: string;
    },
  ) {
    const merchantId = this.getMerchantId(req);
    const scheduledAt = body?.scheduledAt ?? body?.startAt ?? null;
    const audienceId = body?.audienceId ? String(body.audienceId) : undefined;
    const audienceCode =
      typeof body?.audience === 'string' && body.audience.trim()
        ? body.audience.trim()
        : undefined;
    const audienceName =
      typeof body?.audienceName === 'string' && body.audienceName.trim()
        ? body.audienceName.trim()
        : (audienceCode ?? undefined);
    return this.communications
      .createTask(merchantId, {
        channel: CommunicationChannel.PUSH,
        scheduledAt,
        timezone: body?.timezone ?? null,
        audienceId,
        audienceCode,
        audienceName,
        payload: {
          text: body?.text ?? '',
          audience: audienceCode ?? audienceId ?? null,
        },
      })
      .then((task) => this.mapPushTask(task));
  }

  @Post('push-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelPushCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    return this.communications
      .updateTaskStatus(this.getMerchantId(req), campaignId, 'CANCELED')
      .then((task) => this.mapPushTask(task));
  }

  @Post('push-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archivePushCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
  ) {
    return this.communications
      .updateTaskStatus(this.getMerchantId(req), campaignId, 'ARCHIVED')
      .then((task) => this.mapPushTask(task));
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
      .duplicateTask(merchantId, campaignId, {
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
      })
      .then((task) => this.mapPushTask(task));
  }

  // ===== Telegram campaigns =====
  @Get('telegram-campaigns')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  listTelegramCampaigns(@Req() req: any, @Query('scope') scope?: string) {
    const merchantId = this.getMerchantId(req);
    return this.communications
      .listChannelTasks(
        merchantId,
        CommunicationChannel.TELEGRAM,
        this.normalizeTelegramScope(scope),
      )
      .then((tasks) => tasks.map((task) => this.mapTelegramTask(task)));
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
      media?: any;
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
        media: body?.media ?? null,
      })
      .then((task) => this.mapTelegramTask(task));
  }

  @Post('telegram-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelTelegramCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
  ) {
    return this.communications
      .updateTaskStatus(this.getMerchantId(req), campaignId, 'CANCELED')
      .then((task) => this.mapTelegramTask(task));
  }

  @Post('telegram-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archiveTelegramCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
  ) {
    return this.communications
      .updateTaskStatus(this.getMerchantId(req), campaignId, 'ARCHIVED')
      .then((task) => this.mapTelegramTask(task));
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
      .duplicateTask(merchantId, campaignId, {
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
      })
      .then((task) => this.mapTelegramTask(task));
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
  updateStaffMotivation(
    @Req() req: any,
    @Body() body: UpdateStaffMotivationPayload,
  ) {
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
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        items: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  listActions(
    @Req() req: any,
    @Query('tab') tab?: string,
    @Query('search') search?: string,
  ) {
    return this.actions.list(
      this.getMerchantId(req),
      this.normalizeActionsTab(tab),
      search || undefined,
    );
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
      productIds: Array.isArray(body?.productIds)
        ? body.productIds.map((id: any) => String(id))
        : [],
      rule: {
        mode: body?.rule?.mode ?? 'FIXED',
        value: Number(body?.rule?.value ?? 0),
      },
      audienceId: body?.audienceId ?? undefined,
      audienceName: body?.audienceName ?? undefined,
      usageLimit: (body?.usageLimit ??
        'UNLIMITED') as CreateProductBonusActionPayload['usageLimit'],
      usageLimitValue:
        body?.usageLimitValue === undefined
          ? undefined
          : Number(body.usageLimitValue),
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
    return this.actions.updateStatus(this.getMerchantId(req), campaignId, {
      action,
    });
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

  @Get('referrals/program')
  referralProgramSettings(@Req() req: any) {
    return this.referrals.getProgramSettingsForMerchant(
      this.getMerchantId(req),
    );
  }

  @Put('referrals/program')
  updateReferralProgramSettings(@Req() req: any, @Body() body: any) {
    const payload = this.normalizeReferralProgramPayload(body);
    return this.referrals.updateProgramSettingsFromPortal(
      this.getMerchantId(req),
      payload,
    );
  }

  // ===== Operations journal =====
  @Get('operations/log')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        items: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  getOperationsLog(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('staffId') staffId?: string,
    @Query('outletId') outletId?: string,
    @Query('direction') direction?: string,
    @Query('receiptNumber') receiptNumber?: string,
    @Query('operationType') operationType?: string,
    @Query('carrier') carrier?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const offset = this.getTimezoneOffsetMinutes(req);
    const fromDate = from
      ? this.parseLocalDate(from, offset, false)
      : undefined;
    const toDate = to ? this.parseLocalDate(to, offset, true) : undefined;
    const filters: OperationsLogFilters = {
      from: fromDate || undefined,
      to: toDate || undefined,
      staffId: staffId || undefined,
      outletId: outletId || undefined,
      direction: this.normalizeDirection(direction),
      receiptNumber: receiptNumber || undefined,
      operationType: operationType || undefined,
      carrier: carrier || undefined,
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

  @Post('operations/log/:receiptId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelOperation(@Req() req: any, @Param('receiptId') receiptId: string) {
    const merchantId = this.getMerchantId(req);
    const staffId: string | null = req.portalStaffId ?? null;
    return this.operations.cancelOperation(merchantId, receiptId, staffId);
  }

  // ===== Analytics wrappers (portal-friendly) =====
  @Get('analytics/dashboard')
  dashboard(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getDashboard(
      merchantId,
      this.computePeriod(req, period, from, to),
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }
  @Get('analytics/portrait')
  portrait(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('segmentId') segmentId?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getCustomerPortrait(
      merchantId,
      this.computePeriod(req, period, from, to),
      segmentId,
    );
  }
  @Get('analytics/repeat')
  repeat(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getRepeatPurchases(
      merchantId,
      this.computePeriod(req, period, from, to),
      outletId,
    );
  }
  @Get('analytics/birthdays')
  birthdays(
    @Req() req: any,
    @Query('withinDays') withinDays?: string,
    @Query('limit') limit?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const d = Math.max(
      1,
      Math.min(parseInt(withinDays || '30', 10) || 30, 365),
    );
    const l = Math.max(1, Math.min(parseInt(limit || '100', 10) || 100, 1000));
    return this.analytics.getBirthdays(merchantId, d, l);
  }
  @Get('analytics/referral')
  referral(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getReferralSummary(
      merchantId,
      this.computePeriod(req, period, from, to),
    );
  }
  @Get('analytics/operations')
  analyticsOperations(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getOperationalMetrics(
      merchantId,
      this.computePeriod(req, period, from, to),
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }
  @Get('analytics/revenue')
  revenue(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    return this.analytics.getRevenueMetrics(
      merchantId,
      this.computePeriod(req, period, from, to),
      this.normalizeGrouping(group),
      timezoneCode,
    );
  }
  @Get('analytics/customers')
  customers(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getCustomerMetrics(
      merchantId,
      this.computePeriod(req, period, from, to),
    );
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
    return this.analytics.getAutoReturnMetrics(
      merchantId,
      this.computePeriod(req, period, from, to),
      outletId,
    );
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
    return this.analytics.getBirthdayMechanicMetrics(
      merchantId,
      this.computePeriod(req, period, from, to),
      outletId,
    );
  }
  @Get('analytics/time/recency')
  analyticsTimeRecency(
    @Req() req: any,
    @Query('group') group?: string,
    @Query('limit') limit?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const grouping: RecencyGrouping =
      group === 'week' || group === 'month' ? group : 'day';
    const parsedLimit = Number.parseInt(String(limit ?? ''), 10);
    const effectiveLimit = Number.isFinite(parsedLimit)
      ? parsedLimit
      : undefined;
    return this.analytics.getPurchaseRecencyDistribution(
      merchantId,
      grouping,
      effectiveLimit,
    );
  }
  @Get('analytics/time/activity')
  analyticsTimeActivity(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getTimeActivityMetrics(
      merchantId,
      this.computePeriod(req, period, from, to),
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }

  @Get('analytics/loyalty')
  loyalty(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    return this.analytics.getLoyaltyMetrics(
      merchantId,
      this.computePeriod(req, period, from, to),
      this.normalizeGrouping(group),
      timezoneCode,
    );
  }
  @Get('analytics/cohorts')
  cohorts(
    @Req() req: any,
    @Query('by') by?: 'month' | 'week',
    @Query('limit') limitStr?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const limit = Math.min(Math.max(parseInt(limitStr || '6', 10) || 6, 1), 24);
    return this.analytics.getRetentionCohorts(
      merchantId,
      by === 'week' ? 'week' : 'month',
      limit,
    );
  }
  @Get('analytics/rfm')
  rfmAnalytics(@Req() req: any) {
    return this.analytics.getRfmGroupsAnalytics(this.getMerchantId(req));
  }
  @Put('analytics/rfm/settings')
  updateRfmAnalyticsSettings(
    @Req() req: any,
    @Body() dto: UpdateRfmSettingsDto,
  ) {
    return this.analytics.updateRfmSettings(this.getMerchantId(req), dto);
  }
  @Get('analytics/rfm-heatmap')
  rfmHeatmap(@Req() req: any) {
    const merchantId = this.getMerchantId(req);
    return this.analytics.getRfmHeatmap(merchantId);
  }

  // Integrations
  @Get('integrations')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          provider: { type: 'string' },
          isActive: { type: 'boolean' },
          lastSync: { type: 'string', nullable: true },
          errorCount: { type: 'number' },
        },
      },
    },
  })
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
    return this.telegramIntegration.connect(
      this.getMerchantId(req),
      body?.token || '',
    );
  }

  // ===== Telegram staff notifications (global bot) =====
  @Get('settings/telegram-notify/state')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        configured: { type: 'boolean' },
        botUsername: { type: 'string', nullable: true },
        botLink: { type: 'string', nullable: true },
      },
    },
  })
  telegramNotifyState(@Req() req: any) {
    return this.telegramNotify.getState(this.getMerchantId(req));
  }

  @Post('settings/telegram-notify/invite')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        startUrl: { type: 'string' },
        startGroupUrl: { type: 'string' },
        token: { type: 'string' },
      },
    },
  })
  telegramNotifyInvite(@Req() req: any, @Body() body: { forceNew?: boolean }) {
    const actor = this.resolveTelegramActor(req);
    const staffId = actor.kind === 'STAFF' ? actor.staffId : null;
    return this.telegramNotify.issueInvite(this.getMerchantId(req), {
      forceNew: !!body?.forceNew,
      staffId,
    });
  }

  @Get('settings/telegram-notify/subscribers')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  telegramNotifySubscribers(@Req() req: any) {
    return this.telegramNotify.listSubscribers(this.getMerchantId(req));
  }

  @Get('settings/telegram-notify/preferences')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        notifyOrders: { type: 'boolean' },
        notifyReviews: { type: 'boolean' },
        notifyDailyDigest: { type: 'boolean' },
        notifyFraud: { type: 'boolean' },
      },
    },
  })
  telegramNotifyPreferences(@Req() req: any) {
    const actor = this.resolveTelegramActor(req);
    return this.telegramNotify.getPreferences(this.getMerchantId(req), actor);
  }

  @Post('settings/telegram-notify/preferences')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        notifyOrders: { type: 'boolean' },
        notifyReviews: { type: 'boolean' },
        notifyDailyDigest: { type: 'boolean' },
        notifyFraud: { type: 'boolean' },
      },
    },
  })
  telegramNotifyUpdatePreferences(
    @Req() req: any,
    @Body()
    body: {
      notifyOrders?: boolean;
      notifyReviews?: boolean;
      notifyDailyDigest?: boolean;
      notifyFraud?: boolean;
    },
  ) {
    const actor = this.resolveTelegramActor(req);
    return this.telegramNotify.updatePreferences(
      this.getMerchantId(req),
      actor,
      {
        notifyOrders: body?.notifyOrders,
        notifyReviews: body?.notifyReviews,
        notifyDailyDigest: body?.notifyDailyDigest,
        notifyFraud: body?.notifyFraud,
      },
    );
  }

  @Post('settings/telegram-notify/subscribers/:id/deactivate')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  telegramNotifyDeactivate(@Req() req: any, @Param('id') id: string) {
    return this.telegramNotify.deactivateSubscriber(
      this.getMerchantId(req),
      String(id || ''),
    );
  }

  @Post('integrations/telegram-mini-app/check')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @ApiBadRequestResponse({ type: ErrorDto })
  telegramMiniAppCheck(@Req() req: any) {
    return this.telegramIntegration.check(this.getMerchantId(req));
  }

  @Post('integrations/telegram-mini-app/link')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        deepLink: { type: 'string' },
        startParam: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  telegramMiniAppLink(@Req() req: any, @Body() body: { outletId?: string }) {
    return this.telegramIntegration.generateLink(
      this.getMerchantId(req),
      body?.outletId,
    );
  }

  @Post('integrations/telegram-mini-app/setup-menu')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  telegramMiniAppSetupMenu(@Req() req: any) {
    return this.telegramIntegration.setupMenu(this.getMerchantId(req));
  }

  @Delete('integrations/telegram-mini-app')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  telegramMiniAppDisconnect(@Req() req: any) {
    return this.telegramIntegration.disconnect(this.getMerchantId(req));
  }

  // Gifts (portal list)
  @Get('gifts')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  giftsList(@Req() req: any) {
    return this.gifts.listGifts(this.getMerchantId(req));
  }

  // Settings
  @Get('settings')
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  getSettings(@Req() req: any) {
    return this.service.getSettings(this.getMerchantId(req));
  }

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

  @Get('settings/timezone')
  async getTimezoneSetting(@Req() req: any) {
    const merchantId = this.getMerchantId(req);
    const timezone = await this.service.getTimezone(merchantId);
    return {
      timezone,
      options: RUSSIA_TIMEZONES.map((tz) => serializeTimezone(tz.code)),
    };
  }

  @Put('settings/timezone')
  async updateTimezoneSetting(@Req() req: any, @Body() dto: UpdateTimezoneDto) {
    const merchantId = this.getMerchantId(req);
    const timezone = await this.service.updateTimezone(merchantId, dto.code);
    return {
      ok: true,
      timezone,
      options: RUSSIA_TIMEZONES.map((tz) => serializeTimezone(tz.code)),
    };
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
  updateCatalogCategory(
    @Req() req: any,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalog.updateCategory(
      this.getMerchantId(req),
      categoryId,
      dto,
    );
  }
  @Post('catalog/categories/reorder')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, updated: { type: 'number' } },
    },
  })
  reorderCatalogCategories(@Req() req: any, @Body() dto: ReorderCategoriesDto) {
    return this.catalog.reorderCategories(this.getMerchantId(req), dto);
  }
  @Delete('catalog/categories/:categoryId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteCatalogCategory(
    @Req() req: any,
    @Param('categoryId') categoryId: string,
  ) {
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
  updateCatalogProduct(
    @Req() req: any,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(this.getMerchantId(req), productId, dto);
  }
  @Delete('catalog/products/:productId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteCatalogProduct(@Req() req: any, @Param('productId') productId: string) {
    return this.catalog.deleteProduct(this.getMerchantId(req), productId);
  }
  @Post('catalog/products/bulk')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, updated: { type: 'number' } },
    },
  })
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
    const normalized: 'active' | 'inactive' | 'all' =
      status === 'active'
        ? 'active'
        : status === 'inactive'
          ? 'inactive'
          : 'all';
    return this.catalog.listOutlets(
      this.getMerchantId(req),
      normalized,
      search,
    );
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
  updateOutlet(
    @Req() req: any,
    @Param('outletId') outletId: string,
    @Body() dto: UpdatePortalOutletDto,
  ) {
    return this.catalog.updateOutlet(this.getMerchantId(req), outletId, dto);
  }
  @Delete('outlets/:outletId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteOutlet(@Req() req: any, @Param('outletId') outletId: string) {
    return this.service.deleteOutlet(this.getMerchantId(req), outletId);
  }

  @Post('outlets/:outletId/bridge-secret')
  @ApiOkResponse({
    schema: { type: 'object', properties: { secret: { type: 'string' } } },
  })
  issueOutletBridgeSecret(
    @Req() req: any,
    @Param('outletId') outletId: string,
  ) {
    return this.service.issueOutletBridgeSecret(
      this.getMerchantId(req),
      outletId,
    );
  }
  @Delete('outlets/:outletId/bridge-secret')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  revokeOutletBridgeSecret(
    @Req() req: any,
    @Param('outletId') outletId: string,
  ) {
    return this.service.revokeOutletBridgeSecret(
      this.getMerchantId(req),
      outletId,
    );
  }
  @Post('outlets/:outletId/bridge-secret/next')
  @ApiOkResponse({
    schema: { type: 'object', properties: { secret: { type: 'string' } } },
  })
  issueOutletBridgeSecretNext(
    @Req() req: any,
    @Param('outletId') outletId: string,
  ) {
    return this.service.issueOutletBridgeSecretNext(
      this.getMerchantId(req),
      outletId,
    );
  }
  @Delete('outlets/:outletId/bridge-secret/next')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  revokeOutletBridgeSecretNext(
    @Req() req: any,
    @Param('outletId') outletId: string,
  ) {
    return this.service.revokeOutletBridgeSecretNext(
      this.getMerchantId(req),
      outletId,
    );
  }
  @Put('outlets/:outletId/pos')
  @ApiOkResponse({ type: PortalOutletDto })
  updateOutletPos(
    @Req() req: any,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateOutletPosDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.service
      .updateOutletPos(merchantId, outletId, dto)
      .then(() => this.catalog.getOutlet(merchantId, outletId));
  }
  @Put('outlets/:outletId/status')
  @ApiOkResponse({ type: PortalOutletDto })
  updateOutletStatus(
    @Req() req: any,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateOutletStatusDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.service
      .updateOutletStatus(merchantId, outletId, dto.status)
      .then(() => this.catalog.getOutlet(merchantId, outletId));
  }

  // Transactions & Receipts (read-only)
  @Get('transactions')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(TransactionItemDto) },
    },
  })
  listTransactions(
    @Req() req: any,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('type') type?: string,
    @Query('customerId') customerId?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const id = this.getMerchantId(req);
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

  @Get('receipts')
  @ApiOkResponse({ type: ReceiptDto, isArray: true })
  listReceipts(
    @Req() req: any,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const id = this.getMerchantId(req);
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    return this.service.listReceipts(id, {
      limit,
      before,
      orderId,
      customerId,
    });
  }

  @Get('ledger')
  @ApiOkResponse({ type: LedgerEntryDto, isArray: true })
  listLedger(
    @Req() req: any,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('customerId') customerId?: string,
    @Query('type') type?: string,
  ) {
    const id = this.getMerchantId(req);
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
}
