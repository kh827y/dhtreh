import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword, verifyPassword } from '../password.util';
import { PrismaService } from '../prisma.service';
import {
  DeviceType,
  StaffOutletAccessStatus,
  StaffStatus,
  StaffRole,
  Prisma,
  Staff,
} from '@prisma/client';
import {
  CreateStaffDto,
  UpdateMerchantSettingsDto,
  UpdateOutletDto,
  UpdateStaffDto,
  UpdateOutletPosDto,
} from './dto';
import { signPortalJwt as issuePortalJwt } from '../portal-auth/portal-jwt.util';
import {
  DEFAULT_TIMEZONE_CODE,
  findTimezone,
  serializeTimezone,
} from '../timezone/russia-timezones';
// Lazy Ajv import to avoid TS2307 when dependency isn't installed yet
const __AjvLib: any = (() => {
  try {
    return require('ajv');
  } catch {
    return null;
  }
})();

@Injectable()
export class MerchantsService {
  constructor(private prisma: PrismaService) {
    const AjvCtor: any = __AjvLib?.default || __AjvLib;
    this.ajv = AjvCtor
      ? new AjvCtor({
          allErrors: true,
          coerceTypes: true,
          removeAdditional: 'failing',
        })
      : {
          validate: () => true,
          errorsText: () => '',
          errors: [],
        };
  }

  private slugify(s: string): string {
    const map: Record<string, string> = {
      ё: 'e',
      й: 'i',
      ц: 'c',
      у: 'u',
      к: 'k',
      е: 'e',
      н: 'n',
      г: 'g',
      ш: 'sh',
      щ: 'sch',
      з: 'z',
      х: 'h',
      ъ: '',
      ф: 'f',
      ы: 'y',
      в: 'v',
      а: 'a',
      п: 'p',
      р: 'r',
      о: 'o',
      л: 'l',
      д: 'd',
      ж: 'zh',
      э: 'e',
      я: 'ya',
      ч: 'ch',
      с: 's',
      м: 'm',
      и: 'i',
      т: 't',
      ь: '',
      б: 'b',
      ю: 'yu',
    };
    const t = s
      .toLowerCase()
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('');
    const onlyLetters = t.replace(/[^a-z]+/g, '');
    return onlyLetters || 'merchant';
  }
  private letterSuffix(index: number): string {
    let n = index;
    let suffix = '';
    while (n >= 0) {
      suffix = String.fromCharCode(97 + (n % 26)) + suffix;
      n = Math.floor(n / 26) - 1;
    }
    return suffix;
  }
  private async ensureUniqueCashierLogin(slug: string): Promise<string> {
    const candidate = slug || 'merchant';
    for (let i = 0; i < 200; i++) {
      const attempt =
        i === 0 ? candidate : `${slug}${this.letterSuffix(i - 1)}`;
      const found = await this.prisma.merchant.findFirst({
        where: { cashierLogin: attempt },
      });
      if (!found) return attempt;
    }
    return `${slug}${this.letterSuffix(Math.floor(Math.random() * 1000) + 260)}`;
  }
  private random9(): string {
    let s = '';
    for (let i = 0; i < 9; i++) s += Math.floor(Math.random() * 10);
    return s;
  }
  private async generateUniqueOutletPin(
    merchantId: string,
    excludeAccessId?: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 120; attempt++) {
      const candidate = this.randomPin4();
      const clash = await this.prisma.staffOutletAccess.findFirst({
        where: {
          merchantId,
          pinCode: candidate,
          status: StaffOutletAccessStatus.ACTIVE,
          ...(excludeAccessId ? { id: { not: excludeAccessId } } : {}),
        },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new BadRequestException('Unable to generate unique PIN');
  }

  async getCashierCredentials(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { cashierLogin: true, cashierPassword9: true },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    return {
      login: m.cashierLogin || null,
      password: m.cashierPassword9 || null,
      hasPassword: !!m.cashierPassword9,
    } as any;
  }
  async rotateCashierCredentials(
    merchantId: string,
    regenerateLogin?: boolean,
  ) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, name: true, cashierLogin: true },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    let login = m.cashierLogin || this.slugify(m.name || 'merchant');
    if (regenerateLogin || !m.cashierLogin) {
      login = await this.ensureUniqueCashierLogin(
        this.slugify(m.name || 'merchant'),
      );
    }
    const password = this.random9();
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { cashierLogin: login, cashierPassword9: password },
    });
    return { login, password } as any;
  }
  async authenticateCashier(merchantLogin: string, password9: string) {
    const m = await this.prisma.merchant.findFirst({
      where: { cashierLogin: merchantLogin },
    });
    if (!m || !m.cashierPassword9 || m.cashierPassword9 !== password9)
      throw new UnauthorizedException('Invalid cashier credentials');
    return { merchantId: m.id } as any;
  }
  async issueStaffTokenByPin(
    merchantLogin: string,
    password9: string,
    staffIdOrLogin: string,
    outletId: string,
    pinCode: string,
  ) {
    const auth = await this.authenticateCashier(merchantLogin, password9);
    const merchantId = auth.merchantId;
    const searchValue = String(staffIdOrLogin || '').trim();
    let staffRecord: Staff | null = searchValue
      ? await this.prisma.staff.findFirst({
          where: {
            merchantId,
            OR: [{ id: searchValue }, { login: searchValue }],
          },
        })
      : null;

    let access = null as any;
    if (staffRecord) {
      access = await this.prisma.staffOutletAccess.findUnique({
        where: {
          merchantId_staffId_outletId: {
            merchantId,
            staffId: staffRecord.id,
            outletId,
          },
        },
      });
      if (
        !access ||
        access.pinCode !== pinCode ||
        access.status !== StaffOutletAccessStatus.ACTIVE
      ) {
        throw new UnauthorizedException('Invalid PIN or outlet access');
      }
    } else {
      const resolved = await this.resolveActiveAccessByPin(merchantId, pinCode);
      access = resolved.access;
      staffRecord = resolved.staff;
      if (access.outletId !== outletId) {
        throw new UnauthorizedException('PIN assigned to another outlet');
      }
    }

    if (!access || !staffRecord || staffRecord.merchantId !== merchantId) {
      throw new NotFoundException('Staff not found');
    }
    if (staffRecord.status && staffRecord.status !== StaffStatus.ACTIVE) {
      throw new UnauthorizedException('Staff inactive');
    }

    return this.issueStaffToken(merchantId, staffRecord.id);
  }
  private ajv: {
    validate: (schema: any, data: any) => boolean;
    errorsText: (errs?: any, opts?: any) => string;
    errors?: any;
  };
  private rulesSchema = {
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

  // Схема валидации секции reviewsShare (упрощённо; допускаем расширяемость платформ)
  private reviewsShareSchema = {
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

  async getSettings(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { settings: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const s =
      merchant.settings ??
      ({ earnBps: 300, redeemLimitBps: 5000, qrTtlSec: 120 } as any);
    const normalizedRules = this.normalizeRulesJson(s.rulesJson ?? null);
    return {
      merchantId,
      earnBps: s.earnBps,
      redeemLimitBps: s.redeemLimitBps,
      qrTtlSec: s.qrTtlSec,
      webhookUrl: s.webhookUrl ?? null,
      webhookSecret: s.webhookSecret ?? null,
      webhookKeyId: s.webhookKeyId ?? null,
      webhookSecretNext: s.webhookSecretNext ?? null,
      webhookKeyIdNext: s.webhookKeyIdNext ?? null,
      useWebhookNext: s.useWebhookNext ?? false,
      requireBridgeSig: s.requireBridgeSig ?? false,
      bridgeSecret: s.bridgeSecret ?? null,
      bridgeSecretNext: s.bridgeSecretNext ?? null,
      redeemCooldownSec: s.redeemCooldownSec ?? 0,
      earnCooldownSec: s.earnCooldownSec ?? 0,
      redeemDailyCap: s.redeemDailyCap ?? null,
      earnDailyCap: s.earnDailyCap ?? null,
      requireJwtForQuote: s.requireJwtForQuote ?? false,
      rulesJson: normalizedRules ?? null,
      requireStaffKey: s.requireStaffKey ?? false,
      pointsTtlDays: s.pointsTtlDays ?? null,
      earnDelayDays: s.earnDelayDays ?? null,
      telegramBotToken: s.telegramBotToken ?? null,
      telegramBotUsername: s.telegramBotUsername ?? null,
      telegramStartParamRequired: s.telegramStartParamRequired ?? false,
      miniappBaseUrl: s.miniappBaseUrl ?? null,
      miniappThemePrimary: s.miniappThemePrimary ?? null,
      miniappThemeBg: s.miniappThemeBg ?? null,
      miniappLogoUrl: s.miniappLogoUrl ?? null,
      outboxPausedUntil: s.outboxPausedUntil ?? null,
      timezone: s.timezone ?? DEFAULT_TIMEZONE_CODE,
    };
  }

  validateRules(rulesJson: any) {
    const normalized = this.normalizeRulesJson(rulesJson);
    if (normalized === undefined || normalized === null) return { ok: true };
    // Backward-compatible: поддерживаем оба формата
    // 1) Массив правил (старый формат)
    // 2) Объект { rules?: Rule[], af?: {...} }
    try {
      if (Array.isArray(normalized)) {
        const valid = this.ajv.validate(this.rulesSchema as any, normalized);
        if (!valid)
          throw new Error(
            this.ajv.errorsText(this.ajv.errors, { separator: '; ' }),
          );
        return { ok: true };
      }
      if (normalized && typeof normalized === 'object') {
        const hasRulesArr = Array.isArray(normalized.rules);
        if (hasRulesArr) {
          const valid = this.ajv.validate(
            this.rulesSchema as any,
            normalized.rules,
          );
          if (!valid)
            throw new Error(
              this.ajv.errorsText(this.ajv.errors, { separator: '; ' }),
            );
        }
        // Валидация секции reviewsShare (если присутствует)
        const rs = normalized.reviewsShare;
        if (rs && typeof rs === 'object' && !Array.isArray(rs)) {
          const validShare = this.ajv.validate(
            this.reviewsShareSchema as any,
            rs,
          );
          if (!validShare)
            throw new Error(
              'reviewsShare invalid: ' +
                this.ajv.errorsText(this.ajv.errors, { separator: '; ' }),
            );
        }
        // Лёгкая валидация antifraud секции (если есть)
        const af = normalized.af;
        if (af && typeof af === 'object') {
          const check = (v: any) =>
            v == null || (Number.isFinite(Number(v)) && Number(v) >= 0);
          if (af.customer) {
            if (
              !check(af.customer.limit) ||
              !check(af.customer.windowSec) ||
              !check(af.customer.dailyCap) ||
              !check(af.customer.weeklyCap)
            )
              throw new Error('af.customer invalid');
          }
          if (af.outlet) {
            if (
              !check(af.outlet.limit) ||
              !check(af.outlet.windowSec) ||
              !check(af.outlet.dailyCap) ||
              !check(af.outlet.weeklyCap)
            )
              throw new Error('af.outlet invalid');
          }
          if (af.staff) {
            if (
              !check(af.staff.limit) ||
              !check(af.staff.windowSec) ||
              !check(af.staff.dailyCap) ||
              !check(af.staff.weeklyCap)
            )
              throw new Error('af.staff invalid');
          }
          if (af.merchant) {
            if (
              !check(af.merchant.limit) ||
              !check(af.merchant.windowSec) ||
              !check(af.merchant.dailyCap) ||
              !check(af.merchant.weeklyCap)
            )
              throw new Error('af.merchant invalid');
          }
        }
        return { ok: true };
      }
    } catch (e: any) {
      const msg = String(e?.message || e || 'rulesJson invalid');
      throw new BadRequestException('rulesJson invalid: ' + msg);
    }
    // Если формат неизвестен — не валидируем строго (для расширяемости)
    return { ok: true };
  }

  async updateSettings(
    merchantId: string,
    earnBps: number,
    redeemLimitBps: number,
    qrTtlSec?: number,
    webhookUrl?: string,
    webhookSecret?: string,
    webhookKeyId?: string,
    redeemCooldownSec?: number,
    earnCooldownSec?: number,
    redeemDailyCap?: number,
    earnDailyCap?: number,
    requireJwtForQuote?: boolean,
    rulesJson?: any,
    requireBridgeSig?: boolean,
    bridgeSecret?: string,
    requireStaffKey?: boolean,
    extras?: Partial<UpdateMerchantSettingsDto>,
  ) {
    const normalizedRulesJson = this.normalizeRulesJson(rulesJson);
    // JSON Schema валидация правил (если переданы) — выполняем до любых DB операций
    this.validateRules(normalizedRulesJson);

    // убедимся, что мерчант есть
    await this.prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: { id: merchantId, name: merchantId, initialName: merchantId },
    });

    const updated = await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: {
        earnBps,
        redeemLimitBps,
        qrTtlSec: qrTtlSec ?? undefined,
        webhookUrl,
        webhookSecret,
        webhookKeyId,
        webhookSecretNext: extras?.webhookSecretNext ?? undefined,
        webhookKeyIdNext: extras?.webhookKeyIdNext ?? undefined,
        useWebhookNext: extras?.useWebhookNext ?? undefined,
        requireBridgeSig: requireBridgeSig ?? undefined,
        bridgeSecret: bridgeSecret ?? undefined,
        bridgeSecretNext: extras?.bridgeSecretNext ?? undefined,
        redeemCooldownSec: redeemCooldownSec ?? undefined,
        earnCooldownSec: earnCooldownSec ?? undefined,
        redeemDailyCap: redeemDailyCap ?? undefined,
        earnDailyCap: earnDailyCap ?? undefined,
        requireJwtForQuote: requireJwtForQuote ?? undefined,
        rulesJson: normalizedRulesJson ?? undefined,
        requireStaffKey: requireStaffKey ?? undefined,
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
        miniappLogoUrl: extras?.miniappLogoUrl ?? undefined,
        timezone: extras?.timezone ?? undefined,
      },
      create: {
        merchantId,
        earnBps,
        redeemLimitBps,
        qrTtlSec: qrTtlSec ?? 120,
        webhookUrl: webhookUrl ?? null,
        webhookSecret: webhookSecret ?? null,
        webhookKeyId: webhookKeyId ?? null,
        webhookSecretNext: extras?.webhookSecretNext ?? null,
        webhookKeyIdNext: extras?.webhookKeyIdNext ?? null,
        useWebhookNext: extras?.useWebhookNext ?? false,
        requireBridgeSig: requireBridgeSig ?? false,
        bridgeSecret: bridgeSecret ?? null,
        bridgeSecretNext: extras?.bridgeSecretNext ?? null,
        redeemCooldownSec: redeemCooldownSec ?? 0,
        earnCooldownSec: earnCooldownSec ?? 0,
        redeemDailyCap: redeemDailyCap ?? null,
        earnDailyCap: earnDailyCap ?? null,
        requireJwtForQuote: requireJwtForQuote ?? false,
        rulesJson: normalizedRulesJson ?? null,
        requireStaffKey: requireStaffKey ?? false,
        pointsTtlDays: extras?.pointsTtlDays ?? null,
        earnDelayDays: extras?.earnDelayDays ?? null,
        telegramBotToken: extras?.telegramBotToken ?? null,
        telegramBotUsername: extras?.telegramBotUsername ?? null,
        telegramStartParamRequired: extras?.telegramStartParamRequired ?? false,
        miniappBaseUrl: extras?.miniappBaseUrl ?? null,
        miniappThemePrimary: extras?.miniappThemePrimary ?? null,
        miniappThemeBg: extras?.miniappThemeBg ?? null,
        miniappLogoUrl: extras?.miniappLogoUrl ?? null,
        timezone: extras?.timezone ?? undefined,
      },
    });
    return {
      merchantId,
      earnBps: updated.earnBps,
      redeemLimitBps: updated.redeemLimitBps,
      qrTtlSec: updated.qrTtlSec,
      webhookUrl: updated.webhookUrl,
      webhookSecret: updated.webhookSecret,
      webhookKeyId: updated.webhookKeyId,
      requireBridgeSig: updated.requireBridgeSig,
      bridgeSecret: updated.bridgeSecret,
      redeemCooldownSec: updated.redeemCooldownSec,
      earnCooldownSec: updated.earnCooldownSec,
      redeemDailyCap: updated.redeemDailyCap,
      earnDailyCap: updated.earnDailyCap,
      requireJwtForQuote: updated.requireJwtForQuote,
      rulesJson: updated.rulesJson,
      requireStaffKey: updated.requireStaffKey,
      earnDelayDays: (updated as any).earnDelayDays ?? null,
      telegramBotToken: (updated as any).telegramBotToken ?? null,
      telegramBotUsername: (updated as any).telegramBotUsername ?? null,
      telegramStartParamRequired:
        (updated as any).telegramStartParamRequired ?? false,
      miniappBaseUrl: (updated as any).miniappBaseUrl ?? null,
      miniappThemePrimary: (updated as any).miniappThemePrimary ?? null,
      miniappThemeBg: (updated as any).miniappThemeBg ?? null,
      miniappLogoUrl: (updated as any).miniappLogoUrl ?? null,
      timezone: updated.timezone ?? DEFAULT_TIMEZONE_CODE,
    };
  }

  async previewRules(
    merchantId: string,
    args: {
      channel: 'VIRTUAL' | 'PC_POS' | 'SMART';
      weekday: number;
      eligibleTotal: number;
      category?: string;
    },
  ) {
    const s = await this.getSettings(merchantId);
    let earnBps = s.earnBps ?? 300;
    let redeemLimitBps = s.redeemLimitBps ?? 5000;
    const rules = s.rulesJson;
    if (Array.isArray(rules)) {
      for (const item of rules) {
        try {
          if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
          const cond = item.if ?? {};
          if (
            Array.isArray(cond.channelIn) &&
            !cond.channelIn.includes(args.channel)
          )
            continue;
          if (
            cond.minEligible != null &&
            args.eligibleTotal < Number(cond.minEligible)
          )
            continue;
          const then = item.then ?? {};
          if (then.earnBps != null) earnBps = Number(then.earnBps);
          if (then.redeemLimitBps != null)
            redeemLimitBps = Number(then.redeemLimitBps);
        } catch {}
      }
    }
    return { earnBps, redeemLimitBps };
  }

  // Outlets
  private mapOutlet(entity: any) {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      name: entity.name,
      address: entity.address ?? null,
      status: entity.status,
      hidden: !!entity.hidden,
      posType: entity.posType ?? null,
      posLastSeenAt: entity.posLastSeenAt ?? null,
      bridgeSecretIssued: !!entity.bridgeSecret,
      bridgeSecretNextIssued: !!entity.bridgeSecretNext,
      bridgeSecretUpdatedAt: entity.bridgeSecretUpdatedAt ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    } as const;
  }

  private mapOutletMeta(
    outlet?: { posType: DeviceType | null; posLastSeenAt: Date | null } | null,
  ) {
    return {
      outletPosType: outlet?.posType ?? null,
      outletLastSeenAt: outlet?.posLastSeenAt ?? null,
    } as const;
  }

  private mapReceipt(entity: any) {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      customerId: entity.customerId,
      orderId: entity.orderId,
      receiptNumber: entity.receiptNumber ?? null,
      total: entity.total,
      eligibleTotal: entity.eligibleTotal,
      redeemApplied: entity.redeemApplied,
      earnApplied: entity.earnApplied,
      createdAt: entity.createdAt,
      outletId: entity.outletId ?? null,
      ...this.mapOutletMeta(entity.outlet ?? null),
      staffId: entity.staffId ?? null,
      deviceId:
        (entity as any)?.device?.code ?? entity.deviceId ?? null,
    } as const;
  }

  private mapTransaction(entity: any) {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      customerId: entity.customerId,
      type: entity.type,
      amount: entity.amount,
      orderId: entity.orderId ?? null,
      createdAt: entity.createdAt,
      outletId: entity.outletId ?? null,
      ...this.mapOutletMeta(entity.outlet ?? null),
      staffId: entity.staffId ?? null,
      deviceId:
        (entity as any)?.device?.code ?? entity.deviceId ?? null,
    } as const;
  }

  private normalizeRulesJson(rulesJson: any) {
    if (rulesJson == null) return rulesJson;
    if (Array.isArray(rulesJson)) return rulesJson;
    if (typeof rulesJson !== 'object') return rulesJson;

    const clone: any = { ...rulesJson };
    if (clone.af && typeof clone.af === 'object' && !Array.isArray(clone.af)) {
      const af: any = { ...clone.af };
      const outletCfg = af.outlet;
      const deviceCfg = af.device;
      if (outletCfg !== undefined) {
        af.outlet =
          typeof outletCfg === 'object' &&
          outletCfg !== null &&
          !Array.isArray(outletCfg)
            ? { ...outletCfg }
            : outletCfg;
      }
      if (deviceCfg !== undefined) {
        af.device =
          typeof deviceCfg === 'object' &&
          deviceCfg !== null &&
          !Array.isArray(deviceCfg)
            ? { ...deviceCfg }
            : deviceCfg;
      } else if (af.device === undefined && af.outlet !== undefined) {
        af.device =
          typeof af.outlet === 'object' &&
          af.outlet !== null &&
          !Array.isArray(af.outlet)
            ? { ...af.outlet }
            : af.outlet;
      }
      if (Array.isArray(af.blockFactors)) {
        af.blockFactors = af.blockFactors
          .map((factor: any) => String(factor ?? '').trim())
          .filter((factor: string) => factor.length > 0);
      }
      clone.af = af;
    }
    return clone;
  }

  private async loadOutletMeta(
    merchantId: string,
    outletIds: (string | null | undefined)[],
  ) {
    const ids = Array.from(
      new Set(outletIds.filter((id): id is string => !!id)),
    );
    if (!ids.length)
      return new Map<
        string,
        { posType: DeviceType | null; posLastSeenAt: Date | null }
      >();
    const outlets = await this.prisma.outlet.findMany({
      where: { merchantId, id: { in: ids } },
      select: { id: true, posType: true, posLastSeenAt: true },
    });
    return new Map(
      outlets.map((o) => [
        o.id,
        { posType: o.posType ?? null, posLastSeenAt: o.posLastSeenAt ?? null },
      ]),
    );
  }

  private async ensureOutlet(merchantId: string, outletId: string) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
    });
    if (!outlet || outlet.merchantId !== merchantId)
      throw new NotFoundException('Outlet not found');
    return outlet;
  }

  async listOutlets(merchantId: string) {
    const items = await this.prisma.outlet.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((out) => this.mapOutlet(out));
  }
  async createOutlet(merchantId: string, name: string, address?: string) {
    await this.ensureMerchant(merchantId);
    const created = await this.prisma.outlet.create({
      data: { merchantId, name, address: address ?? null },
    });
    return this.mapOutlet(created);
  }
  async updateOutlet(
    merchantId: string,
    outletId: string,
    dto: UpdateOutletDto,
  ) {
    await this.ensureOutlet(merchantId, outletId);
    const updated = await this.prisma.outlet.update({
      where: { id: outletId },
      data: { name: dto.name ?? undefined, address: dto.address ?? undefined },
    });
    return this.mapOutlet(updated);
  }
  async deleteOutlet(merchantId: string, outletId: string) {
    await this.ensureOutlet(merchantId, outletId);
    await this.prisma.outlet.delete({ where: { id: outletId } });
    return { ok: true };
  }

  async issueOutletBridgeSecret(merchantId: string, outletId: string) {
    await this.ensureOutlet(merchantId, outletId);
    const secret = this.randToken();
    await this.prisma.outlet.update({
      where: { id: outletId },
      data: { bridgeSecret: secret, bridgeSecretUpdatedAt: new Date() },
    });
    return { secret };
  }
  async revokeOutletBridgeSecret(merchantId: string, outletId: string) {
    await this.ensureOutlet(merchantId, outletId);
    await this.prisma.outlet.update({
      where: { id: outletId },
      data: { bridgeSecret: null, bridgeSecretUpdatedAt: new Date() },
    });
    return { ok: true };
  }
  async issueOutletBridgeSecretNext(merchantId: string, outletId: string) {
    await this.ensureOutlet(merchantId, outletId);
    const secret = this.randToken();
    await this.prisma.outlet.update({
      where: { id: outletId },
      data: { bridgeSecretNext: secret },
    });
    return { secret };
  }
  async revokeOutletBridgeSecretNext(merchantId: string, outletId: string) {
    await this.ensureOutlet(merchantId, outletId);
    await this.prisma.outlet.update({
      where: { id: outletId },
      data: { bridgeSecretNext: null },
    });
    return { ok: true };
  }

  private normalizePosType(input?: string | null) {
    if (input === undefined) return undefined;
    if (input === null || input === '') return null;
    const upper = String(input).toUpperCase();
    if (upper === 'PC_POS' || upper === 'SMART' || upper === 'VIRTUAL')
      return upper as DeviceType;
    throw new BadRequestException('Invalid posType');
  }

  async updateOutletPos(
    merchantId: string,
    outletId: string,
    dto: UpdateOutletPosDto,
  ) {
    await this.ensureOutlet(merchantId, outletId);
    const data: any = {};
    if (dto.posType !== undefined)
      data.posType = this.normalizePosType(dto.posType ?? null);
    if (dto.posLastSeenAt !== undefined)
      data.posLastSeenAt = dto.posLastSeenAt
        ? new Date(dto.posLastSeenAt)
        : null;
    const updated = await this.prisma.outlet.update({
      where: { id: outletId },
      data,
    });
    return this.mapOutlet(updated);
  }

  async updateOutletStatus(
    merchantId: string,
    outletId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    if (status !== 'ACTIVE' && status !== 'INACTIVE')
      throw new BadRequestException('Invalid status');
    await this.ensureOutlet(merchantId, outletId);
    const updated = await this.prisma.outlet.update({
      where: { id: outletId },
      data: { status },
    });
    return this.mapOutlet(updated);
  }

  // Staff
  async listStaff(merchantId: string) {
    const staff = await this.prisma.staff.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });
    // Кол-во точек доступа на сотрудника
    let accessMap = new Map<string, number>();
    try {
      const acc = await (this.prisma as any).staffOutletAccess.groupBy({
        by: ['staffId'],
        where: { merchantId },
        _count: { _all: true },
      });
      accessMap = new Map<string, number>(
        acc
          .filter((a: any) => a?.staffId)
          .map((a: any) => [
            a.staffId as string,
            (a._count?._all as number) || 0,
          ]),
      );
    } catch {}
    // Последняя активность (по транзакциям)
    let lastMap = new Map<string, Date>();
    try {
      const tx = await this.prisma.transaction.groupBy({
        by: ['staffId'],
        where: { merchantId, staffId: { not: null } },
        _max: { createdAt: true },
      });
      lastMap = new Map<string, Date>(
        tx
          .filter((t: any) => t?.staffId)
          .map((t: any) => [t.staffId as string, t._max?.createdAt as Date]),
      );
    } catch {}
    return staff.map((s) => ({
      ...s,
      outletsCount: accessMap.get(s.id) || 0,
      lastActivityAt: lastMap.get(s.id) || null,
    }));
  }
  async createStaff(merchantId: string, dto: CreateStaffDto) {
    await this.ensureMerchant(merchantId);
    const data: any = {
      merchantId,
      login:
        dto.login != null && String(dto.login).trim()
          ? String(dto.login).trim()
          : null,
      email:
        dto.email != null && String(dto.email).trim()
          ? String(dto.email).trim().toLowerCase()
          : null,
      role: (dto.role as any) ?? 'CASHIER',
      firstName:
        dto.firstName != null && String(dto.firstName).trim()
          ? String(dto.firstName).trim()
          : null,
      lastName:
        dto.lastName != null && String(dto.lastName).trim()
          ? String(dto.lastName).trim()
          : null,
      position:
        dto.position != null && String(dto.position).trim()
          ? String(dto.position).trim()
          : null,
      phone:
        dto.phone != null && String(dto.phone).trim()
          ? String(dto.phone).trim()
          : null,
      comment:
        dto.comment != null && String(dto.comment).trim()
          ? String(dto.comment).trim()
          : null,
      avatarUrl:
        dto.avatarUrl != null && String(dto.avatarUrl).trim()
          ? String(dto.avatarUrl).trim()
          : null,
      canAccessPortal: !!dto.canAccessPortal,
    };
    if (dto.password != null) {
      const password = String(dto.password);
      if (!password || password.length < 6)
        throw new BadRequestException('password too short');
      data.hash = hashPassword(password);
      data.canAccessPortal = true;
    }
    return this.prisma.staff.create({ data });
  }
  async updateStaff(merchantId: string, staffId: string, dto: UpdateStaffDto) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const data: any = {};
    if (dto.login !== undefined)
      data.login =
        dto.login != null && String(dto.login).trim()
          ? String(dto.login).trim()
          : null;
    if (dto.email !== undefined)
      data.email =
        dto.email != null && String(dto.email).trim()
          ? String(dto.email).trim().toLowerCase()
          : null;
    if (dto.role !== undefined) data.role = dto.role as any;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.allowedOutletId !== undefined)
      data.allowedOutletId = dto.allowedOutletId || null;
    if (dto.firstName !== undefined)
      data.firstName =
        dto.firstName != null && String(dto.firstName).trim()
          ? String(dto.firstName).trim()
          : null;
    if (dto.lastName !== undefined)
      data.lastName =
        dto.lastName != null && String(dto.lastName).trim()
          ? String(dto.lastName).trim()
          : null;
    if (dto.position !== undefined)
      data.position =
        dto.position != null && String(dto.position).trim()
          ? String(dto.position).trim()
          : null;
    if (dto.phone !== undefined)
      data.phone =
        dto.phone != null && String(dto.phone).trim()
          ? String(dto.phone).trim()
          : null;
    if (dto.comment !== undefined)
      data.comment =
        dto.comment != null && String(dto.comment).trim()
          ? String(dto.comment).trim()
          : null;
    if (dto.avatarUrl !== undefined)
      data.avatarUrl =
        dto.avatarUrl != null && String(dto.avatarUrl).trim()
          ? String(dto.avatarUrl).trim()
          : null;
    if (dto.canAccessPortal !== undefined) {
      data.canAccessPortal = !!dto.canAccessPortal;
      if (!dto.canAccessPortal) data.hash = null;
    }
    if (dto.password !== undefined) {
      const password = String(dto.password || '');
      if (!password || password.length < 6)
        throw new BadRequestException('password too short');
      if (dto.currentPassword !== undefined) {
        const current = String(dto.currentPassword || '');
        if (!current || !user.hash || !verifyPassword(current, user.hash))
          throw new BadRequestException('current password invalid');
      }
      data.hash = hashPassword(password);
      data.canAccessPortal = true;
    }
    return this.prisma.staff.update({ where: { id: staffId }, data });
  }
  async deleteStaff(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    await this.prisma.staff.delete({ where: { id: staffId } });
    return { ok: true };
  }

  // Staff ↔ Outlet access management (PINs)
  async listStaffAccess(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const acc = await (this.prisma as any).staffOutletAccess.findMany({
      where: { merchantId, staffId },
      orderBy: { createdAt: 'asc' },
    });
    const outletIds = acc.map((a: any) => a.outletId).filter(Boolean);
    const outlets = outletIds.length
      ? await this.prisma.outlet.findMany({
          where: { id: { in: outletIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map<string, string>(outlets.map((o) => [o.id, o.name]));
    let counters = new Map<string, number>();
    if (outletIds.length) {
      try {
        const grouped = await this.prisma.transaction.groupBy({
          by: ['staffId', 'outletId'],
          where: { merchantId, staffId, outletId: { in: outletIds } },
          _count: { _all: true },
        });
        counters = new Map<string, number>(
          grouped.map((g: any) => [
            `${g.staffId}|${g.outletId}`,
            g._count?._all || 0,
          ]),
        );
      } catch {}
    }
    return acc.map((a: any) => ({
      outletId: a.outletId as string,
      outletName: nameMap.get(a.outletId) || a.outletId,
      pinCode: a.pinCode || null,
      lastTxnAt: a.lastTxnAt || null,
      transactionsTotal: counters.get(`${a.staffId}|${a.outletId}`) || 0,
    }));
  }

  private async resolveActiveAccessByPin(
    merchantId: string,
    pinCode: string,
  ): Promise<{
    access: {
      id: string;
      outletId: string;
      pinCode: string | null;
      outlet?: { id: string; name: string | null } | null;
    };
    staff: Staff;
  }> {
    if (!merchantId) throw new BadRequestException('merchantId required');
    const normalizedPin = String(pinCode || '').trim();
    if (!normalizedPin)
      throw new BadRequestException('pinCode (4 digits) required');
    const matches = await this.prisma.staffOutletAccess.findMany({
      where: {
        merchantId,
        pinCode: normalizedPin,
        status: StaffOutletAccessStatus.ACTIVE,
      },
      include: {
        staff: true,
        outlet: { select: { id: true, name: true } },
      },
      take: 2,
    });
    if (!matches.length)
      throw new NotFoundException('Staff access by PIN not found');
    if (matches.length > 1) {
      throw new BadRequestException(
        'PIN не уникален внутри мерчанта. Сгенерируйте новый PIN для сотрудников.',
      );
    }
    const access = matches[0];
    const staff = access.staff;
    if (!staff || staff.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    if (staff.status && staff.status !== StaffStatus.ACTIVE) {
      throw new UnauthorizedException('Staff inactive');
    }
    return {
      access: {
        id: access.id,
        outletId: access.outletId,
        pinCode: access.pinCode ?? null,
        outlet: access.outlet
          ? { id: access.outlet.id, name: access.outlet.name ?? null }
          : null,
      },
      staff,
    };
  }
  async addStaffAccess(merchantId: string, staffId: string, outletId: string) {
    const [user, outlet] = await Promise.all([
      this.prisma.staff.findUnique({ where: { id: staffId } }),
      this.prisma.outlet.findUnique({ where: { id: outletId } }),
    ]);
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    if (!outlet || outlet.merchantId !== merchantId)
      throw new NotFoundException('Outlet not found');
    const existing = await (this.prisma as any).staffOutletAccess.findUnique({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
    });
    const pinCode = await this.generateUniqueOutletPin(
      merchantId,
      existing?.id,
    );
    await (this.prisma as any).staffOutletAccess.upsert({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
      update: {
        pinCode,
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
        pinUpdatedAt: new Date(),
      },
      create: {
        merchantId,
        staffId,
        outletId,
        pinCode,
        status: StaffOutletAccessStatus.ACTIVE,
      },
    });
    return {
      outletId,
      outletName: outlet.name || outletId,
      pinCode,
      lastTxnAt: null,
      transactionsTotal: 0,
    } as any;
  }
  async removeStaffAccess(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    try {
      await (this.prisma as any).staffOutletAccess.delete({
        where: {
          merchantId_staffId_outletId: { merchantId, staffId, outletId },
        },
      });
    } catch {}
    return { ok: true } as any;
  }
  async regenerateStaffPersonalPin(merchantId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, merchantId },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    const access = await this.prisma.staffOutletAccess.findFirst({
      where: { merchantId, staffId, status: StaffOutletAccessStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
    });
    if (!access) {
      throw new BadRequestException(
        'Для сотрудника нет активных торговых точек',
      );
    }
    const pinCode = await this.generateUniqueOutletPin(merchantId, access.id);
    await this.prisma.staffOutletAccess.update({
      where: { id: access.id },
      data: {
        pinCode,
        pinUpdatedAt: new Date(),
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
      },
    });
    return { pinCode } as any;
  }
  async regenerateStaffPin(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const access = await (this.prisma as any).staffOutletAccess.findUnique({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
    });
    if (!access) throw new NotFoundException('Outlet access not granted');
    const pinCode = await this.generateUniqueOutletPin(merchantId, access.id);
    await (this.prisma as any).staffOutletAccess.update({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
      data: {
        pinCode,
        pinUpdatedAt: new Date(),
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
      },
    });
    return { outletId, pinCode } as any;
  }

  async getStaffAccessByPin(merchantId: string, pinCode: string) {
    const { access, staff } = await this.resolveActiveAccessByPin(
      merchantId,
      pinCode,
    );
    const accesses = await this.listStaffAccess(merchantId, staff.id);
    const matched =
      accesses.find((item) => item.outletId === access.outletId) ?? null;
    return {
      staff: {
        id: staff.id,
        login: staff.login || undefined,
        firstName: staff.firstName || undefined,
        lastName: staff.lastName || undefined,
        role: staff.role,
        pinCode: access.pinCode || undefined,
      },
      outlet: matched
        ? {
            id: matched.outletId,
            name: matched.outletName ?? matched.outletId,
          }
        : {
            id: access.outletId,
            name: access.outlet?.name ?? access.outletId,
          },
      accesses,
    };
  }

  private async ensureMerchant(merchantId: string) {
    await this.prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: { id: merchantId, name: merchantId, initialName: merchantId },
    });
  }

  // Outbox monitor
  async listOutbox(
    merchantId: string,
    status?: string,
    limit = 50,
    type?: string,
    since?: string,
  ) {
    const where: any = { merchantId };
    if (status) where.status = status;
    if (type) where.eventType = type;
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) where.createdAt = { gte: d };
    }
    return this.prisma.eventOutbox.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
  async retryOutbox(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({
      where: { id: eventId },
    });
    if (!ev || ev.merchantId !== merchantId)
      throw new NotFoundException('Event not found');
    await this.prisma.eventOutbox.update({
      where: { id: eventId },
      data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null },
    });
    return { ok: true };
  }
  async getOutboxEvent(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({
      where: { id: eventId },
    });
    if (!ev || ev.merchantId !== merchantId)
      throw new NotFoundException('Event not found');
    return ev;
  }
  async deleteOutbox(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({
      where: { id: eventId },
    });
    if (!ev || ev.merchantId !== merchantId)
      throw new NotFoundException('Event not found');
    await this.prisma.eventOutbox.delete({ where: { id: eventId } });
    return { ok: true };
  }
  async retryAll(merchantId: string, status?: string) {
    const where: any = { merchantId };
    if (status) where.status = status;
    const updated = await this.prisma.eventOutbox.updateMany({
      where,
      data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null },
    });
    return { ok: true, updated: updated.count };
  }

  async retrySince(
    merchantId: string,
    params: { status?: string; since?: string },
  ) {
    const where: any = { merchantId };
    if (params.status) where.status = params.status;
    if (params.since) {
      const d = new Date(params.since);
      if (!isNaN(d.getTime())) where.createdAt = { gte: d };
    }
    const updated = await this.prisma.eventOutbox.updateMany({
      where,
      data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null },
    });
    return { ok: true, updated: updated.count };
  }

  async exportOutboxCsv(
    merchantId: string,
    params: { status?: string; since?: string; type?: string; limit?: number },
  ) {
    const limit = params.limit
      ? Math.min(Math.max(params.limit, 1), 5000)
      : 1000;
    const items = await this.listOutbox(
      merchantId,
      params.status,
      limit,
      params.type,
      params.since,
    );
    const lines = [
      'id,eventType,status,retries,nextRetryAt,lastError,createdAt',
    ];
    for (const ev of items) {
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
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  async pauseOutbox(merchantId: string, minutes?: number, untilISO?: string) {
    const until = untilISO
      ? new Date(untilISO)
      : new Date(Date.now() + Math.max(1, minutes || 60) * 60 * 1000);
    await this.prisma.merchantSettings.update({
      where: { merchantId },
      data: { outboxPausedUntil: until, updatedAt: new Date() },
    });
    // Отложим текущие pending, чтобы worker их не схватил ранее
    await this.prisma.eventOutbox.updateMany({
      where: { merchantId, status: 'PENDING' },
      data: {
        nextRetryAt: until,
        lastError: 'Paused by merchant until ' + until.toISOString(),
      },
    });
    return { ok: true, until: until.toISOString() };
  }
  async resumeOutbox(merchantId: string) {
    await this.prisma.merchantSettings.update({
      where: { merchantId },
      data: { outboxPausedUntil: null, updatedAt: new Date() },
    });
    await this.prisma.eventOutbox.updateMany({
      where: { merchantId, status: 'PENDING' },
      data: { nextRetryAt: new Date(), lastError: null },
    });
    return { ok: true };
  }

  async outboxStats(merchantId: string, since?: Date) {
    const base = { merchantId } as any;
    const where = since ? { ...base, createdAt: { gte: since } } : base;
    const statuses = ['PENDING', 'SENDING', 'FAILED', 'DEAD', 'SENT'];
    const counts: Record<string, number> = {};
    for (const st of statuses) {
      counts[st] = await this.prisma.eventOutbox.count({
        where: { ...where, status: st },
      });
    }
    // by eventType counts (top)
    const typeCounts: Record<string, number> = {};
    try {
      const grouped = await (this.prisma as any).eventOutbox.groupBy({
        by: ['eventType'],
        where,
        _count: { eventType: true },
      });
      for (const g of grouped)
        typeCounts[g.eventType] = g._count?.eventType || 0;
    } catch {}
    const lastDead = await this.prisma.eventOutbox.findFirst({
      where: { merchantId, status: 'DEAD' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      merchantId,
      since: since?.toISOString() || null,
      counts,
      typeCounts,
      lastDeadAt: lastDead?.createdAt?.toISOString?.() || null,
    };
  }
  async listOutboxByOrder(merchantId: string, orderId: string, limit = 100) {
    const items = await this.prisma.eventOutbox.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return items.filter((i) => {
      try {
        return (i.payload as any)?.orderId === orderId;
      } catch {
        return false;
      }
    });
  }

  // Staff tokens
  private randToken() {
    return (
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    ).slice(0, 48);
  }
  private sha256(s: string) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  }
  private randomKey(len = 48) {
    return (
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    ).slice(0, len);
  }
  private async signPortalJwt(
    merchantId: string,
    ttlSeconds = 60 * 60,
    adminImpersonation = false,
  ) {
    return issuePortalJwt({
      merchantId,
      subject: merchantId,
      actor: 'MERCHANT',
      role: 'MERCHANT',
      adminImpersonation,
      ttlSeconds,
    });
  }
  async issueStaffToken(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const token = this.randToken();
    const hash = this.sha256(token);
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { apiKeyHash: hash },
    });
    return { token };
  }
  async revokeStaffToken(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { apiKeyHash: null },
    });
    return { ok: true };
  }

  private randomSessionToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(48).toString('hex');
  }

  async startCashierSession(
    merchantLogin: string,
    password9: string,
    pinCode: string,
    rememberPin?: boolean,
    context?: { ip?: string | null; userAgent?: string | null },
  ) {
    const normalizedLogin = String(merchantLogin || '')
      .trim()
      .toLowerCase();
    const normalizedPassword = String(password9 || '').trim();
    if (
      !normalizedLogin ||
      !normalizedPassword ||
      normalizedPassword.length !== 9
    )
      throw new BadRequestException(
        'merchantLogin and 9-digit password required',
      );
    const normalizedPin = String(pinCode || '').trim();
    if (!normalizedPin || normalizedPin.length !== 4)
      throw new BadRequestException('pinCode (4 digits) required');

    const auth = await this.authenticateCashier(
      normalizedLogin,
      normalizedPassword,
    );
    const merchantId = auth.merchantId;
    const { access, staff } = await this.resolveActiveAccessByPin(
      merchantId,
      normalizedPin,
    );
    if (!access.outletId)
      throw new BadRequestException('Outlet for PIN access not found');

    const token = this.randomSessionToken();
    const hash = this.sha256(token);
    const now = new Date();
    const [session] = await this.prisma.$transaction([
      this.prisma.cashierSession.create({
        data: {
          merchantId,
          staffId: staff.id,
          outletId: access.outletId,
          pinAccessId: access.id,
          startedAt: now,
          lastSeenAt: now,
          tokenHash: hash,
          rememberPin: !!rememberPin,
          ipAddress: context?.ip ?? null,
          userAgent: context?.userAgent ?? null,
          metadata: {
            merchantLogin: normalizedLogin,
          } as Prisma.InputJsonValue,
        },
        include: {
          outlet: { select: { id: true, name: true } },
          staff: true,
        },
      }),
      this.prisma.staff.update({
        where: { id: staff.id },
        data: { lastCashierLoginAt: now },
      }),
    ]);

    const displayName =
      [session.staff.firstName, session.staff.lastName]
        .filter((part) => typeof part === 'string' && part?.trim?.())
        .map((part) => (part as string).trim())
        .join(' ') ||
      session.staff.login ||
      null;

    return {
      token,
      session: {
        id: session.id,
        merchantId,
        staff: {
          id: session.staff.id,
          login: session.staff.login ?? null,
          firstName: session.staff.firstName ?? null,
          lastName: session.staff.lastName ?? null,
          role: session.staff.role,
          displayName,
        },
        outlet: {
          id: session.outletId,
          name: session.outlet?.name ?? session.outletId ?? null,
        },
        startedAt: session.startedAt,
        rememberPin: !!rememberPin,
      },
    };
  }

  async getCashierSessionByToken(token: string) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const hash = this.sha256(raw);
    const session = await this.prisma.cashierSession.findFirst({
      where: { tokenHash: hash },
      include: {
        staff: true,
        outlet: { select: { id: true, name: true } },
      },
    });
    if (!session || session.endedAt) return null;
    if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.cashierSession.update({
        where: { id: session.id },
        data: { endedAt: new Date(), result: 'expired' },
      });
      return null;
    }
    if (session.staff.status && session.staff.status !== StaffStatus.ACTIVE) {
      await this.prisma.cashierSession.update({
        where: { id: session.id },
        data: {
          endedAt: new Date(),
          result: 'staff_inactive',
        },
      });
      return null;
    }
    const now = new Date();
    if (
      !session.lastSeenAt ||
      now.getTime() - session.lastSeenAt.getTime() > 60_000
    ) {
      try {
        await this.prisma.cashierSession.update({
          where: { id: session.id },
          data: { lastSeenAt: now },
        });
        session.lastSeenAt = now;
      } catch {}
    }
    const displayName =
      [session.staff.firstName, session.staff.lastName]
        .filter((part) => typeof part === 'string' && part?.trim?.())
        .map((part) => (part as string).trim())
        .join(' ') ||
      session.staff.login ||
      null;
    return {
      id: session.id,
      merchantId: session.merchantId,
      staff: {
        id: session.staff.id,
        login: session.staff.login ?? null,
        firstName: session.staff.firstName ?? null,
        lastName: session.staff.lastName ?? null,
        role: session.staff.role,
        displayName,
      },
      outlet: {
        id: session.outletId,
        name: session.outlet?.name ?? session.outletId ?? null,
      },
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt ?? now,
      rememberPin: !!session.rememberPin,
    };
  }

  async endCashierSessionByToken(token: string, reason = 'logout') {
    const raw = String(token || '').trim();
    if (!raw) return { ok: true };
    const hash = this.sha256(raw);
    const session = await this.prisma.cashierSession.findFirst({
      where: { tokenHash: hash, endedAt: null },
    });
    if (!session) return { ok: true };
    await this.prisma.cashierSession.update({
      where: { id: session.id },
      data: { endedAt: new Date(), result: reason },
    });
    return { ok: true };
  }

  async listTransactions(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      from?: Date;
      to?: Date;
      type?: string;
      customerId?: string;
      outletId?: string;
      staffId?: string;
    },
  ) {
    const where: any = { merchantId };
    if (params.type) where.type = params.type as any;
    if (params.customerId) where.customerId = params.customerId;
    if (params.outletId) where.outletId = params.outletId;
    if (params.staffId) where.staffId = params.staffId;
    if (params.before)
      where.createdAt = Object.assign(where.createdAt || {}, {
        lt: params.before,
      });
    if (params.from)
      where.createdAt = Object.assign(where.createdAt || {}, {
        gte: params.from,
      });
    if (params.to)
      where.createdAt = Object.assign(where.createdAt || {}, {
        lte: params.to,
      });
    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      include: {
        outlet: { select: { posType: true, posLastSeenAt: true } },
        device: { select: { code: true } },
      },
    });
    return items.map((entity) => this.mapTransaction(entity));
  }

  async listReceipts(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      orderId?: string;
      customerId?: string;
    },
  ) {
    const where: any = { merchantId };
    if (params.orderId) where.orderId = params.orderId;
    if (params.customerId) where.customerId = params.customerId;
    if (params.before) where.createdAt = { lt: params.before };
    const items = await this.prisma.receipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      include: {
        outlet: { select: { posType: true, posLastSeenAt: true } },
        device: { select: { code: true } },
      },
    });
    return items.map((entity) => this.mapReceipt(entity));
  }
  async getReceipt(merchantId: string, receiptId: string) {
    const r = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        outlet: { select: { posType: true, posLastSeenAt: true } },
        device: { select: { code: true } },
      },
    });
    if (!r || r.merchantId !== merchantId)
      throw new NotFoundException('Receipt not found');
    const tx = await this.prisma.transaction.findMany({
      where: { merchantId, orderId: r.orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        outlet: { select: { posType: true, posLastSeenAt: true } },
        device: { select: { code: true } },
      },
    });
    return {
      receipt: this.mapReceipt(r),
      transactions: tx.map((entity) => this.mapTransaction(entity)),
    };
  }

  // Ledger
  async listLedger(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      from?: Date;
      to?: Date;
      type?: string;
    },
  ) {
    const where: any = { merchantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.before) where.createdAt = { lt: params.before };
    if (params.from || params.to) {
      where.createdAt = Object.assign(
        where.createdAt || {},
        params.from ? { gte: params.from } : {},
        params.to ? { lte: params.to } : {},
      );
    }
    if (params.type) {
      // приблизительное сопоставление по мета.type
      where.meta = {
        path: ['mode'],
        equals:
          params.type === 'earn' || params.type === 'redeem'
            ? params.type.toUpperCase()
            : 'REFUND',
      } as any;
    }
    const items = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
    });
    const outletMeta = await this.loadOutletMeta(
      merchantId,
      items.map((it) => it.outletId),
    );
    return items.map((entity) => {
      const meta = entity.outletId
        ? (outletMeta.get(entity.outletId) ?? null)
        : null;
      return {
        id: entity.id,
        merchantId: entity.merchantId,
        customerId: entity.customerId ?? null,
        debit: entity.debit,
        credit: entity.credit,
        amount: entity.amount,
        orderId: entity.orderId ?? null,
        receiptId: entity.receiptId ?? null,
        outletId: entity.outletId ?? null,
        outletPosType: meta?.posType ?? null,
        outletLastSeenAt: meta?.posLastSeenAt ?? null,
        staffId: entity.staffId ?? null,
        meta: entity.meta ?? null,
        createdAt: entity.createdAt,
      } as const;
    });
  }

  async exportLedgerCsv(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      from?: Date;
      to?: Date;
      type?: string;
    },
  ) {
    const items = await this.listLedger(merchantId, params);
    const lines = [
      'id,customerId,debit,credit,amount,orderId,receiptId,createdAt,outletId,outletPosType,outletLastSeenAt,staffId',
    ];
    for (const e of items) {
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
        e.outletPosType || '',
        e.outletLastSeenAt ? new Date(e.outletLastSeenAt).toISOString() : '',
        e.staffId || '',
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(',');
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  // ===== TTL reconciliation (burn vs. expired lots) =====
  async ttlReconciliation(merchantId: string, cutoffISO: string) {
    const cutoff = new Date(cutoffISO);
    if (isNaN(cutoff.getTime())) throw new Error('Bad cutoff date');
    // expired lots (earnedAt < cutoff)
    const lots = await this.prisma.earnLot.findMany({
      where: { merchantId, earnedAt: { lt: cutoff } },
    });
    const remainByCustomer = new Map<string, number>();
    for (const lot of lots) {
      const remain = Math.max(0, (lot.points || 0) - (lot.consumedPoints || 0));
      if (remain > 0)
        remainByCustomer.set(
          lot.customerId,
          (remainByCustomer.get(lot.customerId) || 0) + remain,
        );
    }
    // burned from outbox events with matching cutoff
    const events = await this.prisma.eventOutbox.findMany({
      where: { merchantId, eventType: 'loyalty.points_ttl.burned' },
    });
    const burnedByCustomer = new Map<string, number>();
    for (const ev of events) {
      try {
        const p: any = ev.payload as any;
        if (p && p.cutoff && String(p.cutoff) === cutoff.toISOString()) {
          const cid = String(p.customerId || '');
          const amt = Number(p.amount || 0);
          if (cid && amt > 0)
            burnedByCustomer.set(cid, (burnedByCustomer.get(cid) || 0) + amt);
        }
      } catch {}
    }
    const customers = new Set<string>([
      ...remainByCustomer.keys(),
      ...burnedByCustomer.keys(),
    ]);
    const items = Array.from(customers).map((customerId) => ({
      customerId,
      expiredRemain: remainByCustomer.get(customerId) || 0,
      burned: burnedByCustomer.get(customerId) || 0,
      diff:
        (remainByCustomer.get(customerId) || 0) -
        (burnedByCustomer.get(customerId) || 0),
    }));
    const totals = items.reduce(
      (acc, it) => ({
        expiredRemain: acc.expiredRemain + it.expiredRemain,
        burned: acc.burned + it.burned,
        diff: acc.diff + it.diff,
      }),
      { expiredRemain: 0, burned: 0, diff: 0 },
    );
    return { merchantId, cutoff: cutoff.toISOString(), items, totals };
  }

  async exportTtlReconciliationCsv(
    merchantId: string,
    cutoffISO: string,
    onlyDiff = false,
  ) {
    const r = await this.ttlReconciliation(merchantId, cutoffISO);
    const lines = ['merchantId,cutoff,customerId,expiredRemain,burned,diff'];
    const arr = onlyDiff ? r.items.filter((it) => it.diff !== 0) : r.items;
    for (const it of arr) {
      const row = [
        r.merchantId,
        r.cutoff,
        it.customerId,
        it.expiredRemain,
        it.burned,
        it.diff,
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(',');
      lines.push(row);
    }
    lines.push(
      [
        r.merchantId,
        r.cutoff,
        'TOTALS',
        r.totals.expiredRemain,
        r.totals.burned,
        r.totals.diff,
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(','),
    );
    return lines.join('\n') + '\n';
  }

  // Earn lots (admin)
  async listEarnLots(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      activeOnly?: boolean;
    },
  ) {
    const where: any = { merchantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.before) where.createdAt = { lt: params.before };
    if (params.activeOnly)
      where.OR = [
        { consumedPoints: null },
        { consumedPoints: { lt: undefined as any } },
      ] as any; // prisma workaround placeholder
    const items = await this.prisma.earnLot.findMany({
      where,
      orderBy: { earnedAt: 'desc' },
      take: params.limit,
    });
    const outletMeta = await this.loadOutletMeta(
      merchantId,
      items.map((it) => it.outletId),
    );
    return items.map((entity) => {
      const meta = entity.outletId
        ? (outletMeta.get(entity.outletId) ?? null)
        : null;
      return {
        id: entity.id,
        merchantId: entity.merchantId,
        customerId: entity.customerId,
        points: entity.points,
        consumedPoints: entity.consumedPoints ?? 0,
        earnedAt: entity.earnedAt,
        expiresAt: entity.expiresAt ?? null,
        orderId: entity.orderId ?? null,
        receiptId: entity.receiptId ?? null,
        outletId: entity.outletId ?? null,
        outletPosType: meta?.posType ?? null,
        outletLastSeenAt: meta?.posLastSeenAt ?? null,
        staffId: entity.staffId ?? null,
        createdAt: entity.createdAt,
      } as const;
    });
  }
  async exportEarnLotsCsv(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      activeOnly?: boolean;
    },
  ) {
    const items = await this.listEarnLots(merchantId, params);
    const lines = [
      'id,customerId,points,consumedPoints,earnedAt,expiresAt,orderId,receiptId,outletId,outletPosType,outletLastSeenAt,staffId',
    ];
    for (const e of items) {
      const row = [
        e.id,
        e.customerId,
        e.points,
        e.consumedPoints || 0,
        e.earnedAt.toISOString(),
        e.expiresAt ? e.expiresAt.toISOString() : '',
        e.orderId || '',
        e.receiptId || '',
        e.outletId || '',
        e.outletPosType || '',
        e.outletLastSeenAt ? new Date(e.outletLastSeenAt).toISOString() : '',
        e.staffId || '',
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(',');
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  async getBalance(merchantId: string, customerId: string) {
    const w = await this.prisma.wallet.findFirst({
      where: { merchantId, customerId, type: 'POINTS' as any },
    });
    return w?.balance ?? 0;
  }
  async findCustomerByPhone(merchantId: string, phone: string) {
    // Customer теперь per-merchant модель
    const c = await this.prisma.customer.findFirst({
      where: { merchantId, phone },
    });
    if (!c) return null;
    const bal = await this.getBalance(merchantId, c.id);
    return { customerId: c.id, phone: c.phone, balance: bal };
  }

  // ===== Admin: merchants management =====
  async listMerchants() {
    return (this.prisma.merchant as any).findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        initialName: true,
        createdAt: true,
        portalLoginEnabled: true,
        portalTotpEnabled: true,
        portalEmail: true,
        settings: {
          select: {
            earnBps: true,
            redeemLimitBps: true,
            qrTtlSec: true,
            requireBridgeSig: true,
            requireStaffKey: true,
          },
        },
        subscription: { include: { plan: true } },
      },
    });
  }
  async createMerchant(
    name: string,
    email: string,
    password: string,
    ownerName?: string,
  ) {
    if (!name || !name.trim()) throw new BadRequestException('name required');
    const em = String(email || '')
      .trim()
      .toLowerCase();
    if (!em) throw new BadRequestException('email required');
    if (!password || String(password).length < 6)
      throw new BadRequestException('password too short');
    const pwd = hashPassword(String(password));
    // slug для логина кассира + уникальность
    const baseSlug = this.slugify(name.trim());
    const uniqueSlug = await this.ensureUniqueCashierLogin(baseSlug);
    const m = await (this.prisma.merchant as any).create({
      data: {
        name: name.trim(),
        initialName: name.trim(),
        portalEmail: em,
        portalPasswordHash: pwd,
        cashierLogin: uniqueSlug,
      },
    });
    // Автосоздание сотрудника-владельца с флагами и пинкодом (минимальный профиль до полной миграции UI)
    if (ownerName && ownerName.trim()) {
      const [firstName, ...rest] = ownerName.trim().split(/\s+/);
      const lastName = rest.join(' ');
      const pinCode = this.randomPin4();
      try {
        await this.prisma.staff.create({
          data: {
            merchantId: m.id,
            login: ownerName.trim(),
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            role: 'MERCHANT' as any,
            isOwner: true,
            canAccessPortal: true,
            pinCode,
          },
        });
      } catch {}
    }
    return {
      id: m.id,
      name: m.name,
      initialName: m.initialName,
      email: m.portalEmail,
    } as any;
  }

  private randomPin4(): string {
    // 4-значный пинкод, допускаем лидирующие нули
    const n = Math.floor(Math.random() * 10000);
    return n.toString().padStart(4, '0');
  }

  async updateMerchant(
    id: string,
    dto: { name?: string; email?: string; password?: string },
  ) {
    const m = await this.prisma.merchant.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Merchant not found');
    const data: any = {};
    if (dto.name != null) data.name = String(dto.name).trim();
    if (dto.email != null)
      data.portalEmail = String(dto.email).trim().toLowerCase() || null;
    if (dto.password != null) {
      if (!dto.password || String(dto.password).length < 6)
        throw new BadRequestException('password too short');
      data.portalPasswordHash = hashPassword(String(dto.password));
    }
    const res = await (this.prisma.merchant as any).update({
      where: { id },
      data,
    });
    return {
      id: res.id,
      name: res.name,
      initialName: res.initialName,
      email: res.portalEmail,
    } as any;
  }

  async getMerchantName(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { name: true, initialName: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return { name: merchant.name, initialName: merchant.initialName };
  }

  async updateMerchantName(merchantId: string, rawName: string) {
    const nextName = String(rawName || '').trim();
    if (!nextName)
      throw new BadRequestException('Название не может быть пустым');
    if (nextName.length > 120)
      throw new BadRequestException('Название должно быть короче 120 символов');

    const current = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { initialName: true },
    });
    if (!current) throw new NotFoundException('Merchant not found');

    const updated = await (this.prisma.merchant as any).update({
      where: { id: merchantId },
      data: {
        name: nextName,
        ...(current.initialName ? {} : { initialName: nextName }),
      },
      select: { name: true, initialName: true },
    });
    return updated;
  }

  async deleteMerchant(id: string) {
    const m = await this.prisma.merchant.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Merchant not found');
    try {
      await this.prisma.merchant.delete({ where: { id } });
      return { ok: true };
    } catch {
      // Fallback: мягкое отключение, если есть зависимости
      await (this.prisma.merchant as any).update({
        where: { id },
        data: { portalLoginEnabled: false, portalEmail: null },
      });
      return { ok: true };
    }
  }

  async getTimezone(merchantId: string) {
    const row = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { timezone: true },
    });
    return serializeTimezone(row?.timezone ?? DEFAULT_TIMEZONE_CODE);
  }

  async updateTimezone(merchantId: string, code: string) {
    const normalized = findTimezone(code);
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { timezone: normalized.code, updatedAt: new Date() },
      create: {
        merchantId,
        earnBps: 500,
        redeemLimitBps: 5000,
        qrTtlSec: 120,
        requireBridgeSig: false,
        bridgeSecret: null,
        requireStaffKey: false,
        redeemCooldownSec: 0,
        earnCooldownSec: 0,
        redeemDailyCap: null,
        earnDailyCap: null,
        requireJwtForQuote: false,
        rulesJson: Prisma.JsonNull,
        timezone: normalized.code,
      },
    });
    return serializeTimezone(normalized.code);
  }
  async rotatePortalKey(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    const key = this.randomKey(48);
    const hash = this.sha256(key);
    await (this.prisma.merchant as any).update({
      where: { id: merchantId },
      data: { portalKeyHash: hash },
    });
    return { key };
  }
  async setPortalLoginEnabled(merchantId: string, enabled: boolean) {
    await (this.prisma.merchant as any).update({
      where: { id: merchantId },
      data: { portalLoginEnabled: !!enabled },
    });
    return { ok: true };
  }
  async initTotp(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    const otplib = (() => {
      try {
        return require('otplib');
      } catch {
        return null;
      }
    })();
    if (!otplib) throw new Error('otplib not installed');
    const secret = otplib.authenticator.generateSecret();
    const label = encodeURIComponent(`Loyalty:${m.name || m.id}`);
    const issuer = encodeURIComponent('LoyaltyPortal');
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
    await (this.prisma.merchant as any).update({
      where: { id: merchantId },
      data: { portalTotpSecret: secret, portalTotpEnabled: false },
    });
    return { secret, otpauth };
  }
  async verifyTotp(merchantId: string, code: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    if (!(m as any).portalTotpSecret)
      throw new BadRequestException('TOTP not initialized');
    const otplib = (() => {
      try {
        return require('otplib');
      } catch {
        return null;
      }
    })();
    if (!otplib) throw new Error('otplib not installed');
    const ok = otplib.authenticator.verify({
      token: String(code || ''),
      secret: (m as any).portalTotpSecret,
    });
    if (!ok) throw new BadRequestException('Invalid TOTP code');
    await (this.prisma.merchant as any).update({
      where: { id: merchantId },
      data: { portalTotpEnabled: true },
    });
    return { ok: true };
  }
  async disableTotp(merchantId: string) {
    await (this.prisma.merchant as any).update({
      where: { id: merchantId },
      data: { portalTotpEnabled: false, portalTotpSecret: null },
    });
    return { ok: true };
  }
  async impersonatePortal(merchantId: string, ttlSec = 24 * 60 * 60) {
    // short-lived admin impersonation token
    const token = await this.signPortalJwt(merchantId, ttlSec, true);
    return { token };
  }

  // ===== Integrations (portal) =====
  async listIntegrations(merchantId: string) {
    return this.prisma.integration.findMany({
      where: { merchantId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        type: true,
        provider: true,
        isActive: true,
        lastSync: true,
        errorCount: true,
      },
    });
  }
}
