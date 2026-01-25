import { BadRequestException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type {
  DashboardPeriod,
  TimeGrouping,
} from '../../analytics/analytics.service';
import type { OperationsLogFilters } from '../services/operations-log.service';
import type { ReferralProgramSettingsDto } from '../../referral/referral.service';
import type { StaffNotifyActor } from '../../telegram/staff-notifications.service';
import {
  assertPortalPermissions,
  hasPortalPermission,
} from '../../portal-auth/portal-permissions.util';
import { getRulesRoot } from '../../../shared/rules-json.util';
import type { UpdateMerchantSettingsDto } from '../../merchants/dto';
import {
  asRecord as asRecordShared,
  coerceCount as coerceCountShared,
  coerceNumber as coerceNumberShared,
  coerceString as coerceStringShared,
} from '../../../shared/common/input.util';

export type PortalPermissionsState = {
  allowAll?: boolean;
  resources?: Map<string, Set<string>> | Record<string, unknown>;
};

export type PortalAccessGroup = {
  id: string;
  name: string;
  scope: string;
};

export type PortalRequest = Request & {
  portalMerchantId?: string;
  portalTimezoneOffsetMinutes?: number;
  portalTimezone?: string;
  portalRole?: string;
  portalActor?: string;
  portalAdminImpersonation?: boolean;
  portalStaffId?: string;
  portalStaffEmail?: string | null;
  portalStaffName?: string;
  portalStaffRole?: string;
  portalAccessGroups?: PortalAccessGroup[];
  portalPermissions?: PortalPermissionsState;
};

export type UploadedFile = {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

@Injectable()
export class PortalControllerHelpers {
  getMerchantId(req: PortalRequest) {
    return String(req.portalMerchantId || '');
  }

  getTimezoneOffsetMinutes(req: PortalRequest): number {
    const raw = Number(req?.portalTimezoneOffsetMinutes ?? NaN);
    if (Number.isFinite(raw)) return raw;
    return 7 * 60; // default Барнаул (UTC+7)
  }

  buildMiniappLogoPath(merchantId: string, assetId: string) {
    return `/loyalty/miniapp-logo/${merchantId}/${assetId}`;
  }

  extractMiniappLogoAssetId(value?: string | null): string | null {
    if (!value) return null;
    const match = value.match(/\/loyalty\/miniapp-logo\/[^/]+\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  shiftToTimezone(date: Date, offsetMinutes: number) {
    return new Date(date.getTime() + offsetMinutes * 60 * 1000);
  }

  shiftFromTimezone(date: Date, offsetMinutes: number) {
    return new Date(date.getTime() - offsetMinutes * 60 * 1000);
  }

  parseLocalDate(
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

  parseDateParam(
    req: PortalRequest,
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

  parseLimit(
    value: string | number | undefined,
    options?: { defaultValue?: number; min?: number; max?: number },
  ): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    const fallback = options?.defaultValue ?? 50;
    const min = options?.min ?? 1;
    const max = options?.max ?? 200;
    const resolved = Number.isFinite(parsed) ? parsed : fallback;
    return Math.min(Math.max(resolved, min), max);
  }

  parseOptionalLimit(
    value: string | number | undefined,
    options?: { defaultValue?: number; min?: number; max?: number },
  ): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return this.parseLimit(value, options);
  }

  parseOffset(value: string | number | undefined, defaultValue = 0): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    const resolved = Number.isFinite(parsed) ? parsed : defaultValue;
    return Math.max(0, resolved);
  }

  normalizePromocodePayload(
    req: PortalRequest,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const offset = this.getTimezoneOffsetMinutes(req);
    const payload: Record<string, unknown> = { ...body };
    const validFrom = typeof body?.validFrom === 'string' ? body.validFrom : '';
    const validUntil =
      typeof body?.validUntil === 'string' ? body.validUntil : '';
    if (validFrom) {
      const parsed = this.parseLocalDate(validFrom, offset, false);
      if (parsed) payload.validFrom = parsed.toISOString();
    }
    if (validUntil) {
      const parsed = this.parseLocalDate(validUntil, offset, true);
      if (parsed) payload.validUntil = parsed.toISOString();
    }
    return payload;
  }

  computePeriod(
    req: PortalRequest,
    periodType?: string,
    fromStr?: string,
    toStr?: string,
  ): DashboardPeriod {
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
          return { from: to, to: from, type: 'custom' };
        }
        const maxRangeDays = 366;
        const rangeMs = to.getTime() - from.getTime();
        const maxRangeMs = maxRangeDays * 24 * 60 * 60 * 1000;
        if (rangeMs > maxRangeMs) {
          throw new BadRequestException(
            'Слишком большой период. Максимум 1 год.',
          );
        }
        return { from, to, type: 'custom' };
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

  normalizeGrouping(value?: string): TimeGrouping | undefined {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'week') return 'week';
    if (normalized === 'month') return 'month';
    if (normalized === 'day') return 'day';
    return undefined;
  }

  normalizePushScope(scope?: string): 'ACTIVE' | 'ARCHIVED' {
    return scope === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  }

  normalizeTelegramScope(scope?: string): 'ACTIVE' | 'ARCHIVED' {
    return scope === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  }

  resolveTelegramActor(req: PortalRequest): StaffNotifyActor {
    if (req?.portalActor === 'STAFF' && req?.portalStaffId) {
      return { kind: 'STAFF', staffId: String(req.portalStaffId) };
    }
    return { kind: 'MERCHANT' };
  }

  normalizeDirection(direction?: string): OperationsLogFilters['direction'] {
    const upper = String(direction || '').toUpperCase();
    if (upper === 'EARN' || upper === 'REDEEM') return upper;
    return 'ALL';
  }

  normalizeStaffStatus(status?: string): OperationsLogFilters['staffStatus'] {
    const value = String(status || '').toLowerCase();
    if (value === 'current' || value === 'active') return 'current';
    if (value === 'former' || value === 'fired' || value === 'archived')
      return 'former';
    return 'all';
  }

  asRecord(value: unknown): Record<string, unknown> {
    return asRecordShared(value) ?? {};
  }

  coerceCount(value: unknown): number {
    return coerceCountShared(value);
  }

  coerceNumber(value: unknown): number | null {
    return coerceNumberShared(value);
  }

  coerceString(value: unknown): string | null {
    return coerceStringShared(value);
  }

  normalizeReferralProgramPayload(body: unknown): ReferralProgramSettingsDto {
    const data = this.asRecord(body);
    const rewardTrigger: ReferralProgramSettingsDto['rewardTrigger'] =
      data.rewardTrigger === 'all' ? 'all' : 'first';
    const rewardType: ReferralProgramSettingsDto['rewardType'] =
      data.rewardType === 'PERCENT' || data.rewardType === 'percent'
        ? 'percent'
        : 'fixed';
    const rewardValueRaw = Number(data.rewardValue ?? 0);
    const friendRewardRaw = Number(data.friendReward ?? 0);
    const minPurchaseRaw = Number(data.minPurchaseAmount ?? 0);
    const placeholders = Array.isArray(data.placeholders)
      ? data.placeholders
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item: string) => item.length > 0)
      : undefined;
    const levels = Array.isArray(data.levels)
      ? data.levels.map((item) => {
          const level = this.asRecord(item);
          return {
            level: Number(level.level ?? 0),
            enabled: Boolean(level.enabled),
            reward: Number(level.reward ?? 0),
          };
        })
      : [];

    return {
      enabled: Boolean(data.enabled),
      rewardTrigger,
      rewardType,
      multiLevel: Boolean(data.multiLevel),
      rewardValue: Number.isFinite(rewardValueRaw) ? rewardValueRaw : 0,
      levels,
      friendReward: Number.isFinite(friendRewardRaw) ? friendRewardRaw : 0,
      stackWithRegistration: Boolean(data.stackWithRegistration),
      message: typeof data.message === 'string' ? data.message : '',
      placeholders,
      shareMessage:
        typeof data.shareMessage === 'string' ? data.shareMessage : undefined,
      minPurchaseAmount:
        Number.isFinite(minPurchaseRaw) && minPurchaseRaw > 0
          ? Math.round(minPurchaseRaw)
          : 0,
    };
  }

  extractMetadata(
    payload: Record<string, unknown>,
    stats: Record<string, unknown>,
  ): unknown {
    if (payload.metadata !== undefined) return payload.metadata;
    if (stats.metadata !== undefined) return stats.metadata;
    return null;
  }

  mapPushTask(task: unknown) {
    const taskRecord = this.asRecord(task);
    const payload = this.asRecord(taskRecord.payload);
    const stats = this.asRecord(taskRecord.stats);
    const snapshot = this.asRecord(taskRecord.audienceSnapshot);
    const audienceIdRaw = taskRecord.audienceId ?? snapshot.audienceId ?? null;
    const audienceId = typeof audienceIdRaw === 'string' ? audienceIdRaw : null;
    const audienceName =
      typeof taskRecord.audienceName === 'string'
        ? taskRecord.audienceName
        : typeof snapshot.audienceName === 'string'
          ? snapshot.audienceName
          : null;
    const audienceRaw =
      typeof audienceName === 'string'
        ? audienceName
        : typeof snapshot.code === 'string'
          ? snapshot.code
          : typeof snapshot.audienceName === 'string'
            ? snapshot.audienceName
            : 'ALL';
    const totalRecipients =
      typeof taskRecord.totalRecipients === 'number'
        ? taskRecord.totalRecipients
        : this.coerceCount(stats.totalRecipients ?? stats.total);
    const sent =
      typeof taskRecord.sentCount === 'number'
        ? taskRecord.sentCount
        : this.coerceCount(stats.sent ?? stats.delivered);
    const failed =
      typeof taskRecord.failedCount === 'number'
        ? taskRecord.failedCount
        : this.coerceCount(stats.failed ?? stats.errors);
    const metadata = this.extractMetadata(payload, stats);

    return {
      id: taskRecord.id,
      merchantId: taskRecord.merchantId,
      text: typeof payload.text === 'string' ? payload.text : '',
      audienceId,
      audienceName,
      audience: audienceRaw,
      scheduledAt: taskRecord.scheduledAt,
      timezone: taskRecord.timezone ?? null,
      status: taskRecord.status,
      totalRecipients,
      sent,
      failed,
      archivedAt: taskRecord.archivedAt ?? null,
      metadata: metadata ?? null,
      createdAt: taskRecord.createdAt,
      updatedAt: taskRecord.updatedAt,
    };
  }

  mapTelegramTask(task: unknown) {
    const taskRecord = this.asRecord(task);
    const payload = this.asRecord(taskRecord.payload);
    const stats = this.asRecord(taskRecord.stats);
    const snapshot = this.asRecord(taskRecord.audienceSnapshot);
    const media = this.asRecord(taskRecord.media);
    const totalRecipients =
      typeof taskRecord.totalRecipients === 'number'
        ? taskRecord.totalRecipients
        : this.coerceCount(stats.totalRecipients ?? stats.total);
    const sent =
      typeof taskRecord.sentCount === 'number'
        ? taskRecord.sentCount
        : this.coerceCount(stats.sent ?? stats.delivered);
    const failed =
      typeof taskRecord.failedCount === 'number'
        ? taskRecord.failedCount
        : this.coerceCount(stats.failed ?? stats.errors);
    const metadata = this.extractMetadata(payload, stats);
    const imageAssetId = media.assetId ?? null;

    return {
      id: taskRecord.id,
      merchantId: taskRecord.merchantId,
      text: typeof payload.text === 'string' ? payload.text : '',
      audienceId: snapshot.audienceId ?? null,
      audienceName: snapshot.audienceName ?? null,
      audience: snapshot.code ?? snapshot.audienceName ?? 'ALL',
      scheduledAt: taskRecord.scheduledAt,
      timezone: taskRecord.timezone ?? null,
      status: taskRecord.status,
      totalRecipients,
      sent,
      failed,
      archivedAt: taskRecord.archivedAt ?? null,
      metadata: metadata ?? null,
      imageAssetId,
      createdAt: taskRecord.createdAt,
      updatedAt: taskRecord.updatedAt,
    };
  }

  normalizePortalPermissions(state?: PortalPermissionsState | null) {
    if (!state) return null;
    if (state.allowAll) {
      return { '*': ['*'] } as Record<string, string[]>;
    }
    const entries = Array.isArray(state.resources)
      ? state.resources
      : state.resources instanceof Map
        ? Array.from(state.resources.entries())
        : Object.entries(this.asRecord(state.resources));
    const result: Record<string, string[]> = {};
    for (const [resource, actionsRaw] of entries) {
      if (!resource) continue;
      const actionsRecord = this.asRecord(actionsRaw);
      const actions = Array.isArray(actionsRaw)
        ? actionsRaw.filter((item) => typeof item === 'string')
        : Object.keys(actionsRecord);
      if (actions.length > 0) {
        result[String(resource)] = actions as string[];
      }
    }
    return result;
  }

  stableStringify(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    const record = this.asRecord(value);
    const entries = Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`,
      );
    return `{${entries.join(',')}}`;
  }

  assertSettingsReadAccess(req: PortalRequest) {
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

  maskSettingsSecrets(
    _req: PortalRequest,
    settings: Record<string, unknown> | null,
  ) {
    if (!settings) return settings;
    return {
      ...settings,
      webhookSecret: null,
      webhookSecretNext: null,
      telegramBotToken: null,
    };
  }

  filterSettingsByPermissions(
    req: PortalRequest,
    settings: Record<string, unknown> | null,
  ) {
    if (!settings) return settings;
    if (req.portalActor !== 'STAFF') return settings;
    if (hasPortalPermission(req.portalPermissions, 'system_settings', 'read')) {
      return settings;
    }

    const filtered: Record<string, unknown> = {
      merchantId: settings.merchantId,
    };
    const rulesJson = getRulesRoot(settings.rulesJson);
    const nextRules: Record<string, unknown> = {};
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

    if (hasPortalPermission(req.portalPermissions, 'integrations', 'read')) {
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

  resolveSettingsUpdateResources(
    current: Record<string, unknown> | null,
    dto: UpdateMerchantSettingsDto,
  ) {
    const required = new Set<string>();
    const currentSettings = this.asRecord(current);
    const setSystemIfDifferent = (next: unknown, currentValue: unknown) => {
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
      Number(dto.redeemLimitBps) !== Number(currentSettings.redeemLimitBps ?? 0)
    ) {
      required.add('system_settings');
    }

    setSystemIfDifferent(dto.qrTtlSec, currentSettings.qrTtlSec);
    setSystemIfDifferent(dto.webhookUrl, currentSettings.webhookUrl);
    setSystemIfDifferent(dto.webhookSecret, currentSettings.webhookSecret);
    setSystemIfDifferent(dto.webhookKeyId, currentSettings.webhookKeyId);
    setSystemIfDifferent(
      dto.webhookSecretNext,
      currentSettings.webhookSecretNext,
    );
    setSystemIfDifferent(
      dto.webhookKeyIdNext,
      currentSettings.webhookKeyIdNext,
    );
    setSystemIfDifferent(dto.useWebhookNext, currentSettings.useWebhookNext);
    setSystemIfDifferent(
      dto.redeemCooldownSec,
      currentSettings.redeemCooldownSec,
    );
    setSystemIfDifferent(dto.earnCooldownSec, currentSettings.earnCooldownSec);
    setSystemIfDifferent(dto.redeemDailyCap, currentSettings.redeemDailyCap);
    setSystemIfDifferent(dto.earnDailyCap, currentSettings.earnDailyCap);
    setSystemIfDifferent(
      dto.requireJwtForQuote,
      currentSettings.requireJwtForQuote,
    );
    setSystemIfDifferent(
      dto.telegramBotToken,
      currentSettings.telegramBotToken,
    );
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
      const dtoRulesJson = dto.rulesJson as unknown;
      const currentRules =
        getRulesRoot(currentSettings.rulesJson) ??
        (Array.isArray(currentSettings.rulesJson) ? {} : null);
      const nextRules =
        getRulesRoot(dtoRulesJson) ?? (Array.isArray(dtoRulesJson) ? {} : null);
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

  assertSettingsUpdateAccess(
    req: PortalRequest,
    current: Record<string, unknown> | null,
    dto: UpdateMerchantSettingsDto,
  ) {
    if (req.portalActor !== 'STAFF' || req.portalPermissions?.allowAll) {
      return;
    }
    if (
      hasPortalPermission(req.portalPermissions, 'system_settings', 'manage')
    ) {
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
}
