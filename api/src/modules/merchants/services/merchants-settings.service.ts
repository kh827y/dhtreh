import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { UpdateMerchantSettingsDto } from '../dto';
import {
  asRecord,
  formatUnknownError,
  hasOwn,
  isNonEmptyString,
} from '../merchants.utils';
import { DEFAULT_TIMEZONE_CODE } from '../../../shared/timezone/russia-timezones';

type AjvInstance = {
  validate: (schema: unknown, data: unknown) => boolean;
  errorsText: (errs?: unknown, opts?: unknown) => string;
  errors?: unknown;
};

type AjvConstructor = new (options: {
  allErrors?: boolean;
  coerceTypes?: boolean;
  removeAdditional?: boolean | 'failing';
}) => AjvInstance;

type AjvModule = {
  default?: AjvConstructor;
  new (...args: unknown[]): AjvInstance;
};

const resolveAjvConstructor = (value: unknown): AjvConstructor | null => {
  if (typeof value === 'function') {
    return value as AjvConstructor;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const maybeDefault = (value as { default?: unknown }).default;
  return typeof maybeDefault === 'function'
    ? (maybeDefault as AjvConstructor)
    : null;
};

const loadAjvConstructor = (): AjvConstructor | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
    const mod = require('ajv') as AjvModule;
    return resolveAjvConstructor(mod);
  } catch {
    return null;
  }
};

@Injectable()
export class MerchantsSettingsService {
  private readonly ajv: AjvInstance;
  private readonly rulesSchema = {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        if: {
          type: 'object',
          additionalProperties: false,
          properties: {
            channelIn: { type: 'array', items: { type: 'string' } },
            minEligible: { type: 'number', minimum: 0 },
          },
          required: [],
        },
        then: {
          type: 'object',
          additionalProperties: false,
          properties: {
            earnBps: { type: 'integer', minimum: 0, maximum: 10000 },
            redeemLimitBps: { type: 'integer', minimum: 0, maximum: 10000 },
          },
          anyOf: [{ required: ['earnBps'] }, { required: ['redeemLimitBps'] }],
        },
      },
      required: ['then'],
    },
  } as const;
  private readonly reviewsShareSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean' },
      threshold: { type: 'integer', minimum: 1, maximum: 5 },
      platforms: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: true,
          properties: {
            enabled: { type: 'boolean' },
            url: { type: 'string' },
            outlets: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  outletId: { type: 'string' },
                  url: { type: 'string' },
                },
                required: ['outletId', 'url'],
              },
            },
          },
        },
      },
    },
    required: ['enabled', 'threshold'],
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly cache: LookupCacheService,
  ) {
    const AjvCtor = loadAjvConstructor();
    this.ajv = AjvCtor
      ? new AjvCtor({ allErrors: true, coerceTypes: true })
      : ({
          validate: () => true,
          errorsText: () => '',
          errors: undefined,
        } as AjvInstance);
  }

  normalizeRulesJson(rulesJson: unknown) {
    if (rulesJson == null) return rulesJson;
    if (Array.isArray(rulesJson)) return null;
    const rulesRecord = asRecord(rulesJson);
    if (!rulesRecord) return rulesJson;

    const clone: Record<string, unknown> = { ...rulesRecord };
    const afRecord = asRecord(clone.af);
    if (afRecord) {
      const af: Record<string, unknown> = { ...afRecord };
      const outletCfg = af.outlet;
      const deviceCfg = af.device;
      if (outletCfg !== undefined) {
        const outletRecord = asRecord(outletCfg);
        af.outlet = outletRecord ? { ...outletRecord } : outletCfg;
      }
      if (deviceCfg !== undefined) {
        const deviceRecord = asRecord(deviceCfg);
        af.device = deviceRecord ? { ...deviceRecord } : deviceCfg;
      } else if (af.device === undefined && af.outlet !== undefined) {
        const outletRecord = asRecord(af.outlet);
        af.device = outletRecord ? { ...outletRecord } : af.outlet;
      }
      const blockFactors = af.blockFactors;
      if (Array.isArray(blockFactors)) {
        af.blockFactors = blockFactors
          .map((factor) => String(factor ?? '').trim())
          .filter((factor) => factor.length > 0);
      }
      clone.af = af;
    }
    return clone;
  }

  validateRules(rulesJson: unknown) {
    const normalized = this.normalizeRulesJson(rulesJson);
    if (normalized == null) return { ok: true };
    // Поддерживаем только объектный формат правил.
    try {
      const normalizedRecord = asRecord(normalized);
      if (normalizedRecord) {
        const rules = normalizedRecord.rules;
        if (Array.isArray(rules)) {
          const valid = this.ajv.validate(this.rulesSchema, rules);
          if (!valid) {
            throw new Error(
              this.ajv.errorsText(this.ajv.errors, { separator: '; ' }),
            );
          }
        }
        // Валидация секции reviewsShare (если присутствует)
        const rs = asRecord(normalizedRecord.reviewsShare);
        if (rs) {
          const validShare = this.ajv.validate(this.reviewsShareSchema, rs);
          if (!validShare) {
            throw new Error(
              'reviewsShare invalid: ' +
                this.ajv.errorsText(this.ajv.errors, { separator: '; ' }),
            );
          }
        }
        // Лёгкая валидация antifraud секции (если есть)
        const af = asRecord(normalizedRecord.af);
        if (af) {
          const check = (value: unknown) =>
            value == null ||
            (Number.isFinite(Number(value)) && Number(value) >= 0);
          const validateSection = (
            section: Record<string, unknown> | null,
            label: string,
          ) => {
            if (!section) return;
            if (
              !check(section.limit) ||
              !check(section.windowSec) ||
              !check(section.dailyCap) ||
              !check(section.weeklyCap)
            ) {
              throw new Error(`${label} invalid`);
            }
          };
          validateSection(asRecord(af.customer), 'af.customer');
          validateSection(asRecord(af.outlet), 'af.outlet');
          validateSection(asRecord(af.staff), 'af.staff');
          validateSection(asRecord(af.merchant), 'af.merchant');
        }
        return { ok: true };
      }
    } catch (e: unknown) {
      const msg = formatUnknownError(e, 'rulesJson invalid');
      throw new BadRequestException('rulesJson invalid: ' + msg);
    }
    // Если формат неизвестен — не валидируем строго (для расширяемости)
    return { ok: true };
  }

  async getSettings(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { settings: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const s = merchant.settings;
    const normalizedRules = this.normalizeRulesJson(s?.rulesJson ?? null);
    return {
      merchantId,
      earnBps: s?.earnBps ?? 300,
      redeemLimitBps: s?.redeemLimitBps ?? 5000,
      qrTtlSec: s?.qrTtlSec ?? 300,
      webhookUrl: s?.webhookUrl ?? null,
      webhookSecret: s?.webhookSecret ?? null,
      webhookKeyId: s?.webhookKeyId ?? null,
      webhookSecretNext: s?.webhookSecretNext ?? null,
      webhookKeyIdNext: s?.webhookKeyIdNext ?? null,
      useWebhookNext: s?.useWebhookNext ?? false,
      redeemCooldownSec: s?.redeemCooldownSec ?? 0,
      earnCooldownSec: s?.earnCooldownSec ?? 0,
      redeemDailyCap: s?.redeemDailyCap ?? null,
      earnDailyCap: s?.earnDailyCap ?? null,
      maxOutlets: s?.maxOutlets ?? null,
      requireJwtForQuote: s?.requireJwtForQuote ?? false,
      rulesJson: normalizedRules ?? null,
      pointsTtlDays: s?.pointsTtlDays ?? null,
      earnDelayDays: s?.earnDelayDays ?? null,
      telegramBotToken: s?.telegramBotToken ?? null,
      telegramBotUsername: s?.telegramBotUsername ?? null,
      telegramStartParamRequired: s?.telegramStartParamRequired ?? false,
      miniappBaseUrl: s?.miniappBaseUrl ?? null,
      miniappThemePrimary: s?.miniappThemePrimary ?? null,
      miniappThemeBg: s?.miniappThemeBg ?? null,
      miniappLogoUrl: s?.miniappLogoUrl ?? null,
      outboxPausedUntil: s?.outboxPausedUntil ?? null,
      timezone: s?.timezone ?? DEFAULT_TIMEZONE_CODE,
    };
  }

  async updateSettings(
    merchantId: string,
    earnBps?: number,
    redeemLimitBps?: number,
    qrTtlSec?: number,
    webhookUrl?: string,
    webhookSecret?: string,
    webhookKeyId?: string,
    redeemCooldownSec?: number,
    earnCooldownSec?: number,
    redeemDailyCap?: number,
    earnDailyCap?: number,
    requireJwtForQuote?: boolean,
    rulesJson?: unknown,
    extras?: Partial<UpdateMerchantSettingsDto>,
  ) {
    let normalizedRulesJson = this.normalizeRulesJson(rulesJson);
    const rulesProvided = rulesJson !== undefined;
    // JSON Schema валидация правил (если переданы) — выполняем до любых DB операций
    this.validateRules(normalizedRulesJson);
    const normalizedWebhookUrl =
      typeof webhookUrl === 'string' ? webhookUrl.trim() : webhookUrl;

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    if (typeof normalizedWebhookUrl === 'string' && normalizedWebhookUrl) {
      const webhookError = await this.validateWebhookUrl(normalizedWebhookUrl);
      if (webhookError) {
        throw new BadRequestException(webhookError);
      }
    }
    const currentSettings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { pointsTtlDays: true, rulesJson: true },
    });
    const normalizedRulesRecord = asRecord(normalizedRulesJson);
    if (rulesProvided && normalizedRulesRecord) {
      const currentRules = asRecord(currentSettings?.rulesJson);
      const currentRegistration = asRecord(currentRules?.registration);
      const nextRegistration = asRecord(normalizedRulesRecord.registration);
      if (nextRegistration) {
        const prevEnabled = hasOwn(currentRegistration, 'enabled')
          ? Boolean(currentRegistration?.enabled)
          : true;
        const nextEnabled = hasOwn(nextRegistration, 'enabled')
          ? Boolean(nextRegistration.enabled)
          : true;
        const prevPointsRaw =
          currentRegistration && hasOwn(currentRegistration, 'points')
            ? Number(currentRegistration.points)
            : 0;
        const prevPoints = Number.isFinite(prevPointsRaw)
          ? Math.max(0, Math.floor(prevPointsRaw))
          : 0;
        const nextPointsRaw = hasOwn(nextRegistration, 'points')
          ? Number(nextRegistration.points)
          : 0;
        const nextPoints = Number.isFinite(nextPointsRaw)
          ? Math.max(0, Math.floor(nextPointsRaw))
          : 0;
        const prevActive = prevEnabled && prevPoints > 0;
        const nextActive = nextEnabled && nextPoints > 0;
        const hasEnabledAt =
          hasOwn(nextRegistration, 'enabledAt') &&
          isNonEmptyString(nextRegistration.enabledAt);
        const prevHasEnabledAt =
          hasOwn(currentRegistration, 'enabledAt') &&
          isNonEmptyString(currentRegistration?.enabledAt);
        if (nextActive && !hasEnabledAt && (!prevActive || !prevHasEnabledAt)) {
          normalizedRulesJson = {
            ...normalizedRulesRecord,
            registration: {
              ...nextRegistration,
              enabledAt: new Date().toISOString(),
            },
          };
        }
      }
    }
    const lotsEnabled = this.config.getBoolean('EARN_LOTS_FEATURE', false);
    if (!lotsEnabled) {
      const ttlProvided = hasOwn(extras, 'pointsTtlDays');
      if (ttlProvided) {
        const nextTtlDays = Number(extras?.pointsTtlDays ?? 0) || 0;
        if (nextTtlDays > 0) {
          throw new BadRequestException(
            'Сгорание баллов недоступно без поддержки лотов',
          );
        }
      }
      if (rulesProvided) {
        const currentRules = asRecord(
          this.normalizeRulesJson(currentSettings?.rulesJson ?? null),
        );
        const currentReminderEnabled = Boolean(
          asRecord(currentRules?.burnReminder)?.enabled,
        );
        const nextRulesRecord = asRecord(normalizedRulesJson);
        const nextReminderEnabled = Boolean(
          asRecord(nextRulesRecord?.burnReminder)?.enabled,
        );
        if (nextReminderEnabled && !currentReminderEnabled) {
          throw new BadRequestException(
            'Напоминания о сгорании недоступны без поддержки лотов',
          );
        }
      }
    }

    const miniappLogoProvided = hasOwn(extras, 'miniappLogoUrl');
    const miniappLogoValue = miniappLogoProvided
      ? (extras?.miniappLogoUrl ?? null)
      : undefined;
    const normalizedRulesValue =
      normalizedRulesJson === undefined
        ? undefined
        : (normalizedRulesJson as Prisma.InputJsonValue | null);

    const updateData: Prisma.MerchantSettingsUpdateInput = {
      qrTtlSec: qrTtlSec ?? undefined,
      webhookUrl: normalizedWebhookUrl,
      webhookSecret,
      webhookKeyId,
      webhookSecretNext: extras?.webhookSecretNext ?? undefined,
      webhookKeyIdNext: extras?.webhookKeyIdNext ?? undefined,
      useWebhookNext: extras?.useWebhookNext ?? undefined,
      redeemCooldownSec: redeemCooldownSec ?? undefined,
      earnCooldownSec: earnCooldownSec ?? undefined,
      redeemDailyCap: redeemDailyCap ?? undefined,
      earnDailyCap: earnDailyCap ?? undefined,
      ...(extras?.maxOutlets !== undefined
        ? { maxOutlets: extras.maxOutlets }
        : {}),
      requireJwtForQuote: requireJwtForQuote ?? undefined,
      rulesJson: normalizedRulesValue ?? undefined,
      updatedAt: new Date(),
      pointsTtlDays: extras?.pointsTtlDays ?? undefined,
      earnDelayDays: extras?.earnDelayDays ?? undefined,
      telegramBotToken: extras?.telegramBotToken ?? undefined,
      telegramBotUsername: extras?.telegramBotUsername ?? undefined,
      telegramStartParamRequired:
        extras?.telegramStartParamRequired ?? undefined,
      miniappBaseUrl: extras?.miniappBaseUrl ?? undefined,
      miniappThemePrimary: extras?.miniappThemePrimary ?? undefined,
      miniappThemeBg: extras?.miniappThemeBg ?? undefined,
      miniappLogoUrl: miniappLogoValue,
      timezone: extras?.timezone ?? undefined,
    };
    if (earnBps !== undefined) {
      updateData.earnBps = earnBps;
    }
    if (redeemLimitBps !== undefined) {
      updateData.redeemLimitBps = redeemLimitBps;
    }

    const createData: Prisma.MerchantSettingsUncheckedCreateInput = {
      merchantId,
      qrTtlSec: qrTtlSec ?? 300,
      webhookUrl: normalizedWebhookUrl ?? null,
      webhookSecret: webhookSecret ?? null,
      webhookKeyId: webhookKeyId ?? null,
      webhookSecretNext: extras?.webhookSecretNext ?? null,
      webhookKeyIdNext: extras?.webhookKeyIdNext ?? null,
      useWebhookNext: extras?.useWebhookNext ?? false,
      redeemCooldownSec: redeemCooldownSec ?? 0,
      earnCooldownSec: earnCooldownSec ?? 0,
      redeemDailyCap: redeemDailyCap ?? null,
      earnDailyCap: earnDailyCap ?? null,
      maxOutlets: extras?.maxOutlets ?? null,
      requireJwtForQuote: requireJwtForQuote ?? false,
      rulesJson: normalizedRulesValue ?? Prisma.DbNull,
      pointsTtlDays: extras?.pointsTtlDays ?? null,
      earnDelayDays: extras?.earnDelayDays ?? null,
      telegramBotToken: extras?.telegramBotToken ?? null,
      telegramBotUsername: extras?.telegramBotUsername ?? null,
      telegramStartParamRequired: extras?.telegramStartParamRequired ?? false,
      miniappBaseUrl: extras?.miniappBaseUrl ?? null,
      miniappThemePrimary: extras?.miniappThemePrimary ?? null,
      miniappThemeBg: extras?.miniappThemeBg ?? null,
      miniappLogoUrl: miniappLogoValue ?? null,
      timezone: extras?.timezone ?? undefined,
    };
    if (earnBps !== undefined) {
      createData.earnBps = earnBps;
    }
    if (redeemLimitBps !== undefined) {
      createData.redeemLimitBps = redeemLimitBps;
    }

    const updated = await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: updateData,
      create: createData,
    });
    this.cache.invalidateSettings(merchantId);
    return {
      merchantId,
      earnBps: updated.earnBps,
      redeemLimitBps: updated.redeemLimitBps,
      qrTtlSec: updated.qrTtlSec,
      webhookUrl: updated.webhookUrl,
      webhookSecret: updated.webhookSecret,
      webhookKeyId: updated.webhookKeyId,
      redeemCooldownSec: updated.redeemCooldownSec,
      earnCooldownSec: updated.earnCooldownSec,
      redeemDailyCap: updated.redeemDailyCap,
      earnDailyCap: updated.earnDailyCap,
      maxOutlets: updated.maxOutlets ?? null,
      requireJwtForQuote: updated.requireJwtForQuote,
      rulesJson: updated.rulesJson,
      earnDelayDays: updated.earnDelayDays ?? null,
      telegramBotToken: updated.telegramBotToken ?? null,
      telegramBotUsername: updated.telegramBotUsername ?? null,
      telegramStartParamRequired: updated.telegramStartParamRequired ?? false,
      miniappBaseUrl: updated.miniappBaseUrl ?? null,
      miniappThemePrimary: updated.miniappThemePrimary ?? null,
      miniappThemeBg: updated.miniappThemeBg ?? null,
      miniappLogoUrl: updated.miniappLogoUrl ?? null,
      timezone: updated.timezone ?? DEFAULT_TIMEZONE_CODE,
    };
  }

  private isPrivateAddress(hostname: string): boolean {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return true;
    const ipType = isIP(host);
    if (ipType === 4) {
      const parts = host.split('.').map((v) => Number(v));
      if (parts.length !== 4 || parts.some((v) => Number.isNaN(v)))
        return false;
      const [a, b] = parts;
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 192 && b === 168) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      return false;
    }
    if (ipType === 6) {
      if (host === '::1') return true;
      if (host.startsWith('fe80:')) return true;
      if (host.startsWith('fc') || host.startsWith('fd')) return true;
      return false;
    }
    return false;
  }

  private async validateWebhookUrl(url: string): Promise<string | null> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return 'Invalid webhook URL';
    }
    if (parsed.protocol !== 'https:') {
      return 'Webhook URL must use https';
    }
    const host = parsed.hostname?.trim().toLowerCase();
    if (!host) {
      return 'Invalid webhook URL';
    }
    if (this.isPrivateAddress(host)) {
      return 'Webhook URL points to a private address';
    }
    if (isIP(host)) {
      return null;
    }
    let records: Array<{ address: string; family: number }> = [];
    try {
      records = await lookup(host, { all: true, verbatim: true });
    } catch {
      return 'Webhook URL host is not resolvable';
    }
    if (!records.length) {
      return 'Webhook URL host is not resolvable';
    }
    if (records.some((record) => this.isPrivateAddress(record.address))) {
      return 'Webhook URL points to a private address';
    }
    return null;
  }
}
