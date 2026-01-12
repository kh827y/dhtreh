import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  NotFoundException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
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
import {
  assertPortalPermissions,
  hasPortalPermission,
} from '../portal-auth/portal-permissions.util';
import { MerchantsService } from '../merchants/merchants.service';
import {
  LedgerEntryDto,
  MerchantSettingsRespDto,
  ReceiptDto,
  UpdateMerchantSettingsDto,
  UpdateMerchantNameDto,
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
  ImportCatalogDto,
} from './catalog.dto';
import { CommunicationsService } from '../communications/communications.service';
import {
  StaffMotivationService,
  type UpdateStaffMotivationPayload,
} from './services/staff-motivation.service';
import { PortalRestApiIntegrationService } from './services/rest-api-integration.service';
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
import { ImportExportService } from '../import-export/import-export.service';
import {
  DEFAULT_TIMEZONE_CODE,
  RUSSIA_TIMEZONES,
  serializeTimezone,
} from '../timezone/russia-timezones';
import { UpdateRfmSettingsDto } from '../analytics/dto/update-rfm-settings.dto';
import { SubscriptionService } from '../subscription/subscription.service';
import { AllowInactiveSubscription } from '../guards/subscription.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../prisma.service';

@ApiTags('portal')
@Controller('portal')
@ApiExtraModels(TransactionItemDto)
@UseGuards(PortalGuard)
export class PortalController {
  constructor(
    private readonly service: MerchantsService,
    private readonly prisma: PrismaService,
    private readonly promoCodes: PromoCodesService,
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly catalog: PortalCatalogService,
    private readonly communications: CommunicationsService,
    private readonly staffMotivation: StaffMotivationService,
    private readonly operations: OperationsLogService,
    private readonly restApiIntegration: PortalRestApiIntegrationService,
    private readonly customersService: PortalCustomersService,
    private readonly telegramIntegration: PortalTelegramIntegrationService,
    private readonly telegramNotify: PortalTelegramNotifyService,
    private readonly referrals: ReferralService,
    private readonly reviews: PortalReviewsService,
    private readonly subscriptions: SubscriptionService,
    private readonly importExport: ImportExportService,
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

  private parseDateParam(
    req: any,
    value?: string,
    endOfDay = false,
  ): Date | undefined {
    if (!value) return undefined;
    const raw = String(value).trim();
    if (!raw) return undefined;
    const offset = this.getTimezoneOffsetMinutes(req);
    const local = this.parseLocalDate(raw, offset, endOfDay);
    const parsed = local ?? new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Некорректный формат даты');
    }
    return parsed;
  }

  private normalizePromocodePayload(
    req: any,
    body: PortalPromoCodePayload,
  ): PortalPromoCodePayload {
    const offset = this.getTimezoneOffsetMinutes(req);
    const payload: PortalPromoCodePayload = { ...body };
    if (typeof body?.validFrom === 'string' && body.validFrom) {
      const parsed = this.parseLocalDate(body.validFrom, offset, false);
      if (parsed) payload.validFrom = parsed.toISOString();
    }
    if (typeof body?.validUntil === 'string' && body.validUntil) {
      const parsed = this.parseLocalDate(body.validUntil, offset, true);
      if (parsed) payload.validUntil = parsed.toISOString();
    }
    return payload;
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
          const maxRangeDays = 366;
          const rangeMs = from.getTime() - to.getTime();
          const maxRangeMs = maxRangeDays * 24 * 60 * 60 * 1000;
          if (rangeMs > maxRangeMs) {
            throw new BadRequestException(
              'Слишком большой период. Максимум 1 год.',
            );
          }
          return { from: to, to: from, type: 'custom' as const };
        }
        const maxRangeDays = 366;
        const rangeMs = to.getTime() - from.getTime();
        const maxRangeMs = maxRangeDays * 24 * 60 * 60 * 1000;
        if (rangeMs > maxRangeMs) {
          throw new BadRequestException(
            'Слишком большой период. Максимум 1 год.',
          );
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

  private normalizeDirection(
    direction?: string,
  ): OperationsLogFilters['direction'] {
    const upper = String(direction || '').toUpperCase();
    if (upper === 'EARN' || upper === 'REDEEM') return upper;
    return 'ALL';
  }

  private normalizeStaffStatus(
    status?: string,
  ): OperationsLogFilters['staffStatus'] {
    const value = String(status || '').toLowerCase();
    if (value === 'current' || value === 'active') return 'current';
    if (value === 'former' || value === 'fired' || value === 'archived')
      return 'former';
    return 'all';
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

  @Get('subscription')
  @AllowInactiveSubscription()
  async subscription(@Req() req: any) {
    const merchantId = this.getMerchantId(req);
    const { state } = await this.subscriptions.describeSubscription(merchantId);
    return {
      planId: state.planId,
      planName: state.planName,
      status: state.status,
      currentPeriodEnd: state.currentPeriodEnd,
      daysLeft: state.daysLeft,
      expiresSoon: state.expiresSoon,
      expired: state.expired,
    };
  }

  @Get('reviews')
  async listReviews(
    @Req() req: any,
    @Query('withCommentOnly') withCommentOnly?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.reviews.list(merchantId, {
      withCommentOnly: withCommentOnly === '1' || withCommentOnly === 'true',
      outletId: outletId || undefined,
      staffId: staffId || undefined,
      deviceId: deviceId || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  private mapPushTask(task: any) {
    const payload = this.asRecord(task?.payload);
    const stats = this.asRecord(task?.stats);
    const snapshot = this.asRecord(task?.audienceSnapshot);
    const audienceIdRaw = task?.audienceId ?? snapshot.audienceId ?? null;
    const audienceId = audienceIdRaw ? String(audienceIdRaw) : null;
    const audienceName =
      typeof task?.audienceName === 'string'
        ? task.audienceName
        : typeof snapshot.audienceName === 'string'
          ? snapshot.audienceName
          : null;
    const audienceRaw =
      audienceName ??
      snapshot.code ??
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
      audienceId,
      audienceName,
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
      audienceId: task.audienceId ?? snapshot.audienceId ?? null,
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

  private stableStringify(value: any): string {
    if (value === undefined) return 'undefined';
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  private assertSettingsReadAccess(req: any) {
    assertPortalPermissions(
      req,
      [
        'system_settings',
        'mechanic_birthday',
        'mechanic_auto_return',
        'mechanic_registration_bonus',
        'mechanic_redeem_limits',
        'mechanic_ttl',
        'antifraud',
        'integrations',
        'feedback',
      ],
      'read',
      'any',
    );
  }

  private maskSettingsSecrets(req: any, settings: any) {
    if (!settings) return settings;
    return {
      ...settings,
      webhookSecret: null,
      webhookSecretNext: null,
      telegramBotToken: null,
    };
  }

  private filterSettingsByPermissions(req: any, settings: any) {
    if (!settings) return settings;
    if (req.portalActor !== 'STAFF') return settings;
    if (hasPortalPermission(req.portalPermissions, 'system_settings', 'read')) {
      return settings;
    }

    const filtered: Record<string, any> = {
      merchantId: settings.merchantId,
    };
    const rulesJson =
      settings.rulesJson &&
      typeof settings.rulesJson === 'object' &&
      !Array.isArray(settings.rulesJson)
        ? (settings.rulesJson as Record<string, any>)
        : null;
    const nextRules: Record<string, any> = {};
    const pickRule = (key: string, allowed: boolean) => {
      if (!allowed || !rulesJson) return;
      if (Object.prototype.hasOwnProperty.call(rulesJson, key)) {
        nextRules[key] = rulesJson[key];
      }
    };

    const allowTtl = hasPortalPermission(
      req.portalPermissions,
      'mechanic_ttl',
      'read',
    );
    if (allowTtl) {
      filtered.pointsTtlDays = settings.pointsTtlDays ?? null;
      pickRule('burnReminder', true);
    }

    const allowRedeemLimits = hasPortalPermission(
      req.portalPermissions,
      'mechanic_redeem_limits',
      'read',
    );
    if (allowRedeemLimits) {
      filtered.earnDelayDays = settings.earnDelayDays ?? null;
      pickRule('allowEarnRedeemSameReceipt', true);
      pickRule('disallowEarnRedeemSameReceipt', true);
    }

    pickRule(
      'birthday',
      hasPortalPermission(req.portalPermissions, 'mechanic_birthday', 'read'),
    );
    pickRule(
      'autoReturn',
      hasPortalPermission(
        req.portalPermissions,
        'mechanic_auto_return',
        'read',
      ),
    );
    pickRule(
      'registration',
      hasPortalPermission(
        req.portalPermissions,
        'mechanic_registration_bonus',
        'read',
      ),
    );
    pickRule(
      'af',
      hasPortalPermission(req.portalPermissions, 'antifraud', 'read'),
    );
    pickRule(
      'reviews',
      hasPortalPermission(req.portalPermissions, 'feedback', 'read'),
    );
    pickRule(
      'reviewsShare',
      hasPortalPermission(req.portalPermissions, 'feedback', 'read'),
    );
    pickRule(
      'levelsPeriodDays',
      hasPortalPermission(req.portalPermissions, 'mechanic_levels', 'read'),
    );

    if (Object.keys(nextRules).length) {
      filtered.rulesJson = nextRules;
    }

    if (
      hasPortalPermission(req.portalPermissions, 'integrations', 'read')
    ) {
      filtered.telegramBotUsername = settings.telegramBotUsername ?? null;
      filtered.telegramStartParamRequired =
        settings.telegramStartParamRequired ?? null;
      filtered.miniappBaseUrl = settings.miniappBaseUrl ?? null;
      filtered.miniappThemePrimary = settings.miniappThemePrimary ?? null;
      filtered.miniappThemeBg = settings.miniappThemeBg ?? null;
      filtered.miniappLogoUrl = settings.miniappLogoUrl ?? null;
    }

    return filtered;
  }

  private resolveSettingsUpdateResources(
    current: any,
    dto: UpdateMerchantSettingsDto,
  ) {
    const required = new Set<string>();
    const currentSettings = current || {};
    const setSystemIfDifferent = (next: any, currentValue: any) => {
      if (next === undefined) return;
      if (this.stableStringify(next) !== this.stableStringify(currentValue)) {
        required.add('system_settings');
      }
    };

    if (
      dto.earnBps !== undefined &&
      Number(dto.earnBps) !== Number(currentSettings.earnBps ?? 0)
    ) {
      required.add('system_settings');
    }
    if (
      dto.redeemLimitBps !== undefined &&
      Number(dto.redeemLimitBps) !==
        Number(currentSettings.redeemLimitBps ?? 0)
    ) {
      required.add('system_settings');
    }

    setSystemIfDifferent(dto.qrTtlSec, currentSettings.qrTtlSec);
    setSystemIfDifferent(dto.webhookUrl, currentSettings.webhookUrl);
    setSystemIfDifferent(dto.webhookSecret, currentSettings.webhookSecret);
    setSystemIfDifferent(dto.webhookKeyId, currentSettings.webhookKeyId);
    setSystemIfDifferent(dto.webhookSecretNext, currentSettings.webhookSecretNext);
    setSystemIfDifferent(dto.webhookKeyIdNext, currentSettings.webhookKeyIdNext);
    setSystemIfDifferent(dto.useWebhookNext, currentSettings.useWebhookNext);
    setSystemIfDifferent(dto.redeemCooldownSec, currentSettings.redeemCooldownSec);
    setSystemIfDifferent(dto.earnCooldownSec, currentSettings.earnCooldownSec);
    setSystemIfDifferent(dto.redeemDailyCap, currentSettings.redeemDailyCap);
    setSystemIfDifferent(dto.earnDailyCap, currentSettings.earnDailyCap);
    setSystemIfDifferent(dto.requireJwtForQuote, currentSettings.requireJwtForQuote);
    setSystemIfDifferent(dto.telegramBotToken, currentSettings.telegramBotToken);
    setSystemIfDifferent(
      dto.telegramBotUsername,
      currentSettings.telegramBotUsername,
    );
    setSystemIfDifferent(
      dto.telegramStartParamRequired,
      currentSettings.telegramStartParamRequired,
    );
    setSystemIfDifferent(dto.miniappBaseUrl, currentSettings.miniappBaseUrl);
    setSystemIfDifferent(
      dto.miniappThemePrimary,
      currentSettings.miniappThemePrimary,
    );
    setSystemIfDifferent(dto.miniappThemeBg, currentSettings.miniappThemeBg);
    setSystemIfDifferent(dto.miniappLogoUrl, currentSettings.miniappLogoUrl);
    setSystemIfDifferent(dto.timezone, currentSettings.timezone);

    if (
      dto.pointsTtlDays !== undefined &&
      Number(dto.pointsTtlDays ?? 0) !==
        Number(currentSettings.pointsTtlDays ?? 0)
    ) {
      required.add('mechanic_ttl');
    }
    if (
      dto.earnDelayDays !== undefined &&
      Number(dto.earnDelayDays ?? 0) !==
        Number(currentSettings.earnDelayDays ?? 0)
    ) {
      required.add('mechanic_redeem_limits');
    }

    if (dto.rulesJson !== undefined) {
      const currentRules =
        currentSettings.rulesJson &&
        typeof currentSettings.rulesJson === 'object'
          ? Array.isArray(currentSettings.rulesJson)
            ? {}
            : (currentSettings.rulesJson as Record<string, any>)
          : null;
      const nextRules =
        dto.rulesJson && typeof dto.rulesJson === 'object'
          ? Array.isArray(dto.rulesJson)
            ? {}
            : (dto.rulesJson as Record<string, any>)
          : null;
      if (!currentRules || !nextRules) {
        if (
          this.stableStringify(currentSettings.rulesJson) !==
          this.stableStringify(dto.rulesJson)
        ) {
          required.add('system_settings');
        }
      } else {
        const rulesKeys = new Set([
          ...Object.keys(currentRules),
          ...Object.keys(nextRules),
        ]);
        const rulesMap: Record<string, string> = {
          birthday: 'mechanic_birthday',
          autoReturn: 'mechanic_auto_return',
          registration: 'mechanic_registration_bonus',
          burnReminder: 'mechanic_ttl',
          af: 'antifraud',
          reviews: 'feedback',
          reviewsShare: 'feedback',
          allowEarnRedeemSameReceipt: 'mechanic_redeem_limits',
          disallowEarnRedeemSameReceipt: 'mechanic_redeem_limits',
          levelsPeriodDays: 'mechanic_levels',
        };
        for (const key of rulesKeys) {
          const before = currentRules[key];
          const after = nextRules[key];
          if (this.stableStringify(before) === this.stableStringify(after)) {
            continue;
          }
          const resource = rulesMap[key];
          required.add(resource || 'system_settings');
        }
      }
    }

    return required;
  }

  private assertSettingsUpdateAccess(
    req: any,
    current: any,
    dto: UpdateMerchantSettingsDto,
  ) {
    if (req.portalActor !== 'STAFF' || req.portalPermissions?.allowAll) {
      return;
    }
    if (hasPortalPermission(req.portalPermissions, 'system_settings', 'manage')) {
      return;
    }
    const required = this.resolveSettingsUpdateResources(current, dto);
    if (required.size === 0) {
      this.assertSettingsReadAccess(req);
      return;
    }
    for (const resource of required) {
      assertPortalPermissions(req, [resource], 'manage');
    }
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
    @Query('excludeMiniapp') excludeMiniappStr?: string,
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
    let excludeMiniapp: boolean | undefined;
    if (typeof excludeMiniappStr === 'string') {
      excludeMiniapp = !['0', 'false', 'no'].includes(
        excludeMiniappStr.trim().toLowerCase(),
      );
    }
    return this.customersService.list(this.getMerchantId(req), {
      search,
      limit,
      offset,
      segmentId,
      registeredOnly,
      excludeMiniapp,
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

  @Post('customers/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  importCustomers(@Req() req: any, @UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }
    const name = String(file.originalname || '').toLowerCase();
    const format = name.endsWith('.xlsx') ? 'excel' : 'csv';
    const updateExistingRaw = String(req?.body?.updateExisting || '')
      .trim()
      .toLowerCase();
    const updateExisting = ['1', 'true', 'yes', 'y', 'on'].includes(
      updateExistingRaw,
    );
    return this.importExport.importCustomers({
      merchantId: this.getMerchantId(req),
      format,
      data: file.buffer,
      updateExisting,
    });
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
      redemptionsBlocked?: boolean;
      levelId?: string | null;
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
      redemptionsBlocked?: boolean;
      levelId?: string | null;
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
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const offset = offsetStr
      ? Math.max(parseInt(offsetStr, 10) || 0, 0)
      : 0;
    return this.promoCodes.listForPortal(
      this.getMerchantId(req),
      status,
      limit,
      offset,
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
    const payload = this.normalizePromocodePayload(req, body);
    return this.promoCodes
      .createFromPortal(this.getMerchantId(req), payload)
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
    const payload = this.normalizePromocodePayload(req, body);
    return this.promoCodes.updateFromPortal(
      this.getMerchantId(req),
      promoCodeId,
      payload,
    );
  }

  @Get('loyalty/ttl/forecast')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
        daysBefore: { type: 'number' },
      },
    },
  })
  async ttlReminderForecast(
    @Req() req: any,
    @Query('daysBefore') daysBeforeStr?: string,
  ) {
    assertPortalPermissions(req, ['mechanic_ttl'], 'read');
    const merchantId = this.getMerchantId(req);
    const rawDays = Number(daysBeforeStr ?? NaN);
    const daysBefore = Number.isFinite(rawDays)
      ? Math.min(90, Math.max(1, Math.floor(rawDays)))
      : 3;

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { telegramBotEnabled: true },
    });
    if (!merchant?.telegramBotEnabled) {
      return { count: 0, daysBefore };
    }

    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { pointsTtlDays: true },
    });
    const ttlDaysRaw = Number(settings?.pointsTtlDays ?? 0);
    const ttlDays =
      Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0
        ? Math.floor(ttlDaysRaw)
        : 0;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000);

    const conditions: any[] = [
      { expiresAt: { gt: now, lte: windowEnd } },
    ];
    if (ttlDays > 0) {
      const lowerBound = new Date(
        now.getTime() - ttlDays * 24 * 60 * 60 * 1000,
      );
      const upperBound = new Date(
        windowEnd.getTime() - ttlDays * 24 * 60 * 60 * 1000,
      );
      conditions.push({
        expiresAt: null,
        earnedAt: { gt: lowerBound, lte: upperBound },
        orderId: { not: null },
        NOT: [
          { orderId: 'registration_bonus' },
          { orderId: { startsWith: 'birthday:' } },
          { orderId: { startsWith: 'auto_return:' } },
          { orderId: { startsWith: 'complimentary:' } },
        ],
      });
    }

    const lots = await this.prisma.earnLot.findMany({
      where: {
        merchantId,
        status: 'ACTIVE',
        OR: conditions,
      },
      select: {
        customerId: true,
        points: true,
        consumedPoints: true,
        earnedAt: true,
        expiresAt: true,
      },
    });

    if (!lots.length) {
      return { count: 0, daysBefore };
    }

    const ttlMs = ttlDays > 0 ? ttlDays * 24 * 60 * 60 * 1000 : 0;
    const customers = new Map<string, number>();
    for (const lot of lots) {
      const remaining = Math.max(0, lot.points - (lot.consumedPoints || 0));
      if (remaining <= 0) continue;
      const burnDate =
        lot.expiresAt ??
        (ttlMs > 0 ? new Date(lot.earnedAt.getTime() + ttlMs) : null);
      if (!burnDate) continue;
      if (burnDate <= now || burnDate > windowEnd) continue;
      const burnTime = burnDate.getTime();
      const existing = customers.get(lot.customerId);
      if (existing == null || burnTime < existing) {
        customers.set(lot.customerId, burnTime);
      }
    }

    const customerIds = Array.from(customers.keys());
    if (!customerIds.length) {
      return { count: 0, daysBefore };
    }

    const count = await this.prisma.customer.count({
      where: {
        merchantId,
        id: { in: customerIds },
        tgId: { not: null },
      },
    });

    return { count, daysBefore };
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
    return this.communications.deleteTask(
      this.getMerchantId(req),
      campaignId,
    );
  }

  @Post('push-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archivePushCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
  ) {
    return this.communications.deleteTask(
      this.getMerchantId(req),
      campaignId,
    );
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
          audienceId: body?.audienceId ?? null,
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
    return this.communications.deleteTask(
      this.getMerchantId(req),
      campaignId,
    );
  }

  @Post('telegram-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archiveTelegramCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
  ) {
    return this.communications.deleteTask(
      this.getMerchantId(req),
      campaignId,
    );
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
    @Query('staffStatus') staffStatus?: string,
    @Query('outletId') outletId?: string,
    @Query('deviceId') deviceId?: string,
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
      staffStatus: this.normalizeStaffStatus(staffStatus),
      outletId: outletId || undefined,
      deviceId: deviceId || undefined,
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
    const periodKey = typeof period === 'string' ? period.trim().toLowerCase() : '';
    if (periodKey === 'all' || periodKey === 'all-time' || periodKey === 'alltime') {
      return this.analytics.getCustomerPortrait(
        merchantId,
        { from: new Date(0), to: new Date(), type: 'custom' },
        segmentId,
      );
    }
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
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    return this.analytics.getReferralSummary(
      merchantId,
      this.computePeriod(req, period, from, to),
      timezoneCode,
    );
  }
  @Get('analytics/referral/leaderboard')
  referralLeaderboard(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    const parsedOffset = Math.max(0, Number.parseInt(offset || '0', 10) || 0);
    const parsedLimit = Math.max(1, Math.min(Number.parseInt(limit || '50', 10) || 50, 200));
    return this.analytics.getReferralLeaderboard(
      merchantId,
      this.computePeriod(req, period, from, to),
      timezoneCode,
      parsedOffset,
      parsedLimit,
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
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
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

  @Get('integrations/rest-api')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        status: { type: 'string' },
        integrationId: { type: 'string', nullable: true },
        apiKeyMask: { type: 'string', nullable: true },
        baseUrl: { type: 'string', nullable: true },
        issuedAt: { type: 'string', format: 'date-time', nullable: true },
        availableEndpoints: {
          type: 'array',
          items: { type: 'string' },
        },
        rateLimits: {
          type: 'object',
          properties: {
            code: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                ttl: { type: 'number' },
              },
            },
            calculate: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                ttl: { type: 'number' },
              },
            },
            bonus: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                ttl: { type: 'number' },
              },
            },
            refund: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                ttl: { type: 'number' },
              },
            },
          },
        },
        message: { type: 'string', nullable: true },
      },
    },
  })
  restApiIntegrationState(@Req() req: any) {
    return this.restApiIntegration.getState(this.getMerchantId(req));
  }

  @Post('integrations/rest-api/issue')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', nullable: true },
      },
      additionalProperties: true,
    },
  })
  restApiIntegrationIssue(@Req() req: any) {
    return this.restApiIntegration.issueKey(this.getMerchantId(req));
  }

  @Delete('integrations/rest-api')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  restApiIntegrationDisable(@Req() req: any) {
    return this.restApiIntegration.disable(this.getMerchantId(req));
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
        notifyReviewThreshold: { type: 'number' },
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
      notifyReviewThreshold?: number;
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
        notifyReviewThreshold: body?.notifyReviewThreshold,
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

  // Settings
  @Get('settings')
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  getSettings(@Req() req: any) {
    this.assertSettingsReadAccess(req);
    return this.service
      .getSettings(this.getMerchantId(req))
      .then((data) =>
        this.filterSettingsByPermissions(req, this.maskSettingsSecrets(req, data)),
      );
  }

  @Put('settings')
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async updateSettings(
    @Req() req: any,
    @Body() dto: UpdateMerchantSettingsDto,
  ) {
    const id = this.getMerchantId(req);
    const current = await this.prisma.merchantSettings.findUnique({
      where: { merchantId: id },
    });
    this.assertSettingsUpdateAccess(req, current, dto);
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
      dto,
    );
  }

  @Get('settings/name')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        initialName: { type: 'string' },
      },
    },
  })
  async getMerchantName(@Req() req: any) {
    return this.service.getMerchantName(this.getMerchantId(req));
  }

  @Put('settings/name')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        name: { type: 'string' },
        initialName: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  async updateMerchantName(
    @Req() req: any,
    @Body() dto: UpdateMerchantNameDto,
  ) {
    const payload = await this.service.updateMerchantName(
      this.getMerchantId(req),
      dto.name,
    );
    return { ok: true, ...payload };
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

  @Get('settings/support')
  async getSupportSetting(@Req() req: any) {
    const merchantId = this.getMerchantId(req);
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const rules =
      settings?.rulesJson &&
      typeof settings.rulesJson === 'object' &&
      !Array.isArray(settings.rulesJson)
        ? (settings.rulesJson as Record<string, any>)
        : {};
    const supportTelegramRaw =
      rules?.miniapp && typeof rules.miniapp === 'object'
        ? (rules.miniapp as Record<string, any>)?.supportTelegram
        : null;
    const supportTelegram =
      typeof supportTelegramRaw === 'string' && supportTelegramRaw.trim()
        ? supportTelegramRaw.trim()
        : null;
    return { supportTelegram };
  }

  @Put('settings/support')
  async updateSupportSetting(@Req() req: any, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    const rawValue =
      typeof body?.supportTelegram === 'string' ? body.supportTelegram : '';
    const supportTelegram = rawValue.trim() ? rawValue.trim() : null;
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const rules =
      settings?.rulesJson &&
      typeof settings.rulesJson === 'object' &&
      !Array.isArray(settings.rulesJson)
        ? { ...(settings.rulesJson as Record<string, any>) }
        : {};
    const miniapp =
      rules.miniapp && typeof rules.miniapp === 'object'
        ? { ...(rules.miniapp as Record<string, any>) }
        : {};
    miniapp.supportTelegram = supportTelegram;
    const nextRules = { ...rules, miniapp };
    this.service.validateRules(nextRules);
    await this.prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: {
        id: merchantId,
        name: merchantId,
        initialName: merchantId,
      },
    });
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { rulesJson: nextRules },
      create: { merchantId, rulesJson: nextRules },
    });
    return { supportTelegram };
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

  @Post('catalog/import/commerce-ml')
  importCommerceMl(@Req() req: any, @Body() dto: ImportCatalogDto) {
    return this.catalog.importCatalog(
      this.getMerchantId(req),
      'COMMERCE_ML',
      dto,
    );
  }

  @Post('catalog/import/moysklad')
  importMoySklad(@Req() req: any, @Body() dto: ImportCatalogDto) {
    return this.catalog.importCatalog(this.getMerchantId(req), 'MOYSKLAD', dto);
  }

  // Outlets
  @Get('outlets')
  @ApiOkResponse({ type: PortalOutletListResponseDto })
  listOutlets(
    @Req() req: any,
    @Query('status') status?: 'active' | 'inactive' | 'all',
    @Query('search') search?: string,
  ) {
    const rawStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
    const normalized: 'active' | 'inactive' | 'all' =
      rawStatus === 'active'
        ? 'active'
        : rawStatus === 'inactive'
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
    const before = this.parseDateParam(req, beforeStr, true);
    const from = this.parseDateParam(req, fromStr, false);
    const to = this.parseDateParam(req, toStr, true);
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
    const before = this.parseDateParam(req, beforeStr, true);
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
    const before = this.parseDateParam(req, beforeStr, true);
    const from = this.parseDateParam(req, fromStr, false);
    const to = this.parseDateParam(req, toStr, true);
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
