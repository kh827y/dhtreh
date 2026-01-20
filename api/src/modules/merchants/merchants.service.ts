import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import { hashPassword, verifyPassword } from '../../shared/password.util';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  TxnType,
  StaffOutletAccessStatus,
  StaffStatus,
  StaffRole,
  Outlet,
  WalletType,
  Prisma,
  Staff,
} from '@prisma/client';
import {
  CreateStaffDto,
  UpdateMerchantSettingsDto,
  UpdateOutletDto,
  UpdateStaffDto,
} from './dto';
import { signPortalJwt as issuePortalJwt } from '../portal-auth/portal-jwt.util';
import { ensureBaseTier } from '../loyalty/utils/tier-defaults.util';
import {
  DEFAULT_TIMEZONE_CODE,
  findTimezone,
  serializeTimezone,
} from '../../shared/timezone/russia-timezones';
import { createAccessGroupsFromPresets } from '../../shared/access-group-presets';
import { MerchantsSettingsService } from './services/merchants-settings.service';
import { asRecord } from './merchants.utils';
import { LookupCacheService } from '../../core/cache/lookup-cache.service';

type OtplibModule = {
  authenticator: {
    generateSecret: () => string;
    verify: (opts: { token: string; secret: string }) => boolean;
  };
};

const loadOtplib = (): OtplibModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
    const mod = require('otplib') as unknown;
    if (!mod || typeof mod !== 'object') return null;
    const authenticator = (mod as { authenticator?: unknown }).authenticator;
    if (!authenticator || typeof authenticator !== 'object') return null;
    const generateSecret = (authenticator as { generateSecret?: unknown })
      .generateSecret;
    const verify = (authenticator as { verify?: unknown }).verify;
    if (typeof generateSecret !== 'function' || typeof verify !== 'function') {
      return null;
    }
    return {
      authenticator: {
        generateSecret: generateSecret as () => string,
        verify: verify as (opts: { token: string; secret: string }) => boolean,
      },
    };
  } catch {
    return null;
  }
};

type ReceiptWithDevice = Prisma.ReceiptGetPayload<{
  include: { device: { select: { code: true } } };
}>;

type TransactionWithDevice = Prisma.TransactionGetPayload<{
  include: { device: { select: { code: true } } };
}>;

@Injectable()
export class MerchantsService {
  constructor(
    private prisma: PrismaService,
    private readonly settings: MerchantsSettingsService,
    private readonly cache: LookupCacheService,
  ) {}

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

  private normalizePhone(value?: string | null) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits || null;
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
  private randomDigitsSecure(length: number): string {
    const len = Math.max(1, Math.min(64, Math.floor(Number(length) || 0)));
    let out = '';
    for (let i = 0; i < len; i += 1) {
      out += String(randomInt(0, 10));
    }
    return out;
  }

  private normalizeDigits(value: string, maxLen: number): string {
    return String(value || '')
      .replace(/[^0-9]/g, '')
      .slice(0, Math.max(0, Math.floor(Number(maxLen) || 0)));
  }

  private hashPin(pin: string): string {
    return this.sha256(`pin:${pin}`);
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
      select: { cashierLogin: true },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    return {
      login: m.cashierLogin || null,
    };
  }
  async setCashierCredentials(merchantId: string, login: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    const normalized = String(login || '')
      .trim()
      .toLowerCase();
    if (!normalized) {
      throw new BadRequestException('cashier login required');
    }
    const clash = await this.prisma.merchant.findFirst({
      where: { cashierLogin: normalized, id: { not: merchantId } },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException('cashier login already used');
    }
    const updated = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { cashierLogin: normalized },
      select: { cashierLogin: true },
    });
    return { login: updated.cashierLogin };
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
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { cashierLogin: login },
    });
    return { login };
  }

  async issueCashierActivationCodes(merchantId: string, count: number) {
    const normalizedCount = Math.max(
      1,
      Math.min(50, Math.floor(Number(count) || 0)),
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3);
    const created = await this.prisma.$transaction(async (tx) => {
      const items: Array<{ id: string; code: string; tokenHint: string }> = [];
      for (let i = 0; i < normalizedCount; i += 1) {
        let issued = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const code = this.randomDigitsSecure(9);
          const tokenHash = this.sha256(code);
          const tokenHint = code.slice(-3);
          try {
            const row = await tx.cashierActivationCode.create({
              data: {
                merchantId,
                tokenHash,
                tokenHint,
                expiresAt,
              },
              select: { id: true },
            });
            items.push({ id: row.id, code, tokenHint });
            issued = true;
            break;
          } catch (e: unknown) {
            const code =
              typeof (e as { code?: unknown })?.code === 'string'
                ? (e as { code?: string }).code
                : null;
            if (code && code.toUpperCase() === 'P2002') {
              continue;
            }
            throw e;
          }
        }
        if (!issued) {
          throw new BadRequestException('Unable to issue activation codes');
        }
      }
      return items;
    });

    return {
      expiresAt: expiresAt.toISOString(),
      codes: created.map((item) => item.code),
      items: created.map((item) => ({
        id: item.id,
        tokenHint: item.tokenHint,
        expiresAt: expiresAt.toISOString(),
      })),
    };
  }

  async listCashierActivationCodes(merchantId: string, limit = 50) {
    const take = Math.max(1, Math.min(200, Math.floor(Number(limit) || 0)));
    const now = new Date();
    const rows = await this.prisma.cashierActivationCode.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        tokenHint: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        usedByDeviceSessionId: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      tokenHint: row.tokenHint ?? null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      usedAt: row.usedAt ? row.usedAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      status: row.revokedAt
        ? 'REVOKED'
        : row.usedAt
          ? 'USED'
          : row.expiresAt.getTime() <= now.getTime()
            ? 'EXPIRED'
            : 'ACTIVE',
      usedByDeviceSessionId: row.usedByDeviceSessionId ?? null,
    }));
  }

  async revokeCashierActivationCode(merchantId: string, codeId: string) {
    const id = String(codeId || '').trim();
    if (!id) throw new BadRequestException('codeId required');
    const result = await this.prisma.cashierActivationCode.updateMany({
      where: {
        merchantId,
        id,
        usedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Activation code not found or inactive');
    }
    return { ok: true };
  }

  async listCashierDeviceSessions(merchantId: string, limit = 50) {
    const take = Math.max(1, Math.min(200, Math.floor(Number(limit) || 0)));
    const now = new Date();
    const rows = await this.prisma.cashierDeviceSession.findMany({
      where: {
        merchantId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
        activationCodeId: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      expiresAt: row.expiresAt.toISOString(),
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      activationCodeId: row.activationCodeId ?? null,
      status: row.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'ACTIVE',
    }));
  }

  async revokeCashierDeviceSession(merchantId: string, sessionId: string) {
    const id = String(sessionId || '').trim();
    if (!id) throw new BadRequestException('sessionId required');
    const result = await this.prisma.cashierDeviceSession.updateMany({
      where: { merchantId, id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Device session not found or inactive');
    }
    return { ok: true };
  }

  async activateCashierDeviceByCode(
    merchantLogin: string,
    activationCode: string,
    context?: { ip?: string | null; userAgent?: string | null },
  ) {
    const normalizedLogin = String(merchantLogin || '')
      .trim()
      .toLowerCase();
    if (!normalizedLogin)
      throw new BadRequestException('merchantLogin required');
    const digits = this.normalizeDigits(String(activationCode || ''), 9);
    if (digits.length !== 9) {
      throw new BadRequestException('activationCode (9 digits) required');
    }

    const merchant = await this.prisma.merchant.findFirst({
      where: { cashierLogin: normalizedLogin },
      select: { id: true, cashierLogin: true },
    });
    if (!merchant)
      throw new UnauthorizedException('Invalid cashier merchant login');

    const tokenHash = this.sha256(digits);
    const now = new Date();
    const deviceTtlMs = 1000 * 60 * 60 * 24 * 180;
    const deviceExpiresAt = new Date(now.getTime() + deviceTtlMs);

    const token = this.randomSessionToken();
    const deviceTokenHash = this.sha256(token);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cashierActivationCode.updateMany({
        where: {
          merchantId: merchant.id,
          tokenHash,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (updated.count !== 1) {
        throw new UnauthorizedException('Invalid or expired activation code');
      }

      const device = await tx.cashierDeviceSession.create({
        data: {
          merchantId: merchant.id,
          tokenHash: deviceTokenHash,
          expiresAt: deviceExpiresAt,
          lastSeenAt: now,
          ipAddress: context?.ip ?? null,
          userAgent: context?.userAgent ?? null,
        },
        select: { id: true, merchantId: true, expiresAt: true },
      });

      await tx.cashierActivationCode.updateMany({
        where: { merchantId: merchant.id, tokenHash, usedAt: now },
        data: { usedByDeviceSessionId: device.id },
      });

      return device;
    });

    return {
      token,
      expiresAt: result.expiresAt.toISOString(),
      merchantId: result.merchantId,
      login: merchant.cashierLogin,
    };
  }

  async getCashierDeviceSessionByToken(token: string) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const hash = this.sha256(raw);
    const session = await this.prisma.cashierDeviceSession.findFirst({
      where: { tokenHash: hash, revokedAt: null },
      select: {
        id: true,
        merchantId: true,
        expiresAt: true,
        lastSeenAt: true,
        merchant: { select: { cashierLogin: true } },
      },
    });
    if (!session) return null;
    const now = new Date();
    if (session.expiresAt.getTime() <= now.getTime()) {
      try {
        await this.prisma.cashierDeviceSession.update({
          where: { id: session.id },
          data: { revokedAt: now },
        });
      } catch {}
      return null;
    }
    if (
      !session.lastSeenAt ||
      now.getTime() - session.lastSeenAt.getTime() > 60_000
    ) {
      try {
        await this.prisma.cashierDeviceSession.update({
          where: { id: session.id },
          data: { lastSeenAt: now },
        });
      } catch {}
    }
    return {
      id: session.id,
      merchantId: session.merchantId,
      login: session.merchant?.cashierLogin ?? null,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt ?? now,
    };
  }

  async revokeCashierDeviceSessionByToken(token: string) {
    const raw = String(token || '').trim();
    if (!raw) return { ok: true };
    const hash = this.sha256(raw);
    const now = new Date();
    await this.prisma.cashierDeviceSession.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: now },
    });
    return { ok: true };
  }

  async startCashierSessionByMerchantId(
    merchantId: string,
    pinCode: string,
    rememberPin?: boolean,
    context?: { ip?: string | null; userAgent?: string | null },
    deviceSessionId?: string | null,
  ) {
    const mid = String(merchantId || '').trim();
    if (!mid) throw new BadRequestException('merchantId required');
    const normalizedPin = String(pinCode || '').trim();
    if (!normalizedPin || normalizedPin.length !== 4)
      throw new BadRequestException('pinCode (4 digits) required');

    const { access, staff } = await this.resolveActiveAccessByPin(
      mid,
      normalizedPin,
      deviceSessionId,
    );
    if (!access.outletId)
      throw new BadRequestException('Outlet for PIN access not found');

    return this.createCashierSessionRecord(
      mid,
      staff,
      access,
      rememberPin,
      context,
      deviceSessionId,
    );
  }
  async getSettings(merchantId: string) {
    return this.settings.getSettings(merchantId);
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
    return this.settings.updateSettings(
      merchantId,
      earnBps,
      redeemLimitBps,
      qrTtlSec,
      webhookUrl,
      webhookSecret,
      webhookKeyId,
      redeemCooldownSec,
      earnCooldownSec,
      redeemDailyCap,
      earnDailyCap,
      requireJwtForQuote,
      rulesJson,
      extras,
    );
  }

  validateRules(rulesJson: unknown) {
    return this.settings.validateRules(rulesJson);
  }

  async resetAntifraudLimit(
    merchantId: string,
    payload: {
      scope: 'merchant' | 'customer' | 'staff' | 'device' | 'outlet';
      targetId?: string;
    },
  ) {
    const scope = String(payload?.scope || '').trim() as
      | 'merchant'
      | 'customer'
      | 'staff'
      | 'device'
      | 'outlet';
    if (
      !['merchant', 'customer', 'staff', 'device', 'outlet'].includes(scope)
    ) {
      throw new BadRequestException('scope is invalid');
    }
    if (scope !== 'merchant' && !payload?.targetId) {
      throw new BadRequestException('targetId is required');
    }
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const normalized = this.settings.normalizeRulesJson(
      settings?.rulesJson ?? null,
    );
    const normalizedRecord = asRecord(normalized);
    const rules: Record<string, unknown> = normalizedRecord
      ? { ...normalizedRecord }
      : {};
    const afRecord = asRecord(rules.af);
    const af: Record<string, unknown> = afRecord ? { ...afRecord } : {};
    const resetRecord = asRecord(af.reset);
    const reset: Record<string, unknown> = resetRecord
      ? { ...resetRecord }
      : {};
    const nowIso = new Date().toISOString();

    if (scope === 'merchant') {
      reset.merchant = nowIso;
    } else {
      const id = String(payload?.targetId || '').trim();
      const bucketRecord = asRecord(reset[scope]);
      const bucket: Record<string, unknown> = bucketRecord
        ? { ...bucketRecord }
        : {};
      bucket[id] = nowIso;
      reset[scope] = bucket;
    }

    af.reset = reset;
    rules.af = af;

    const rulesJson = rules as Prisma.InputJsonValue;
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { rulesJson, updatedAt: new Date() },
      create: { merchantId, rulesJson },
    });
    this.cache.invalidateSettings(merchantId);

    return { ok: true };
  }

  async previewRules(
    merchantId: string,
    args: {
      channel: 'VIRTUAL' | 'PC_POS' | 'SMART';
      weekday: number;
      category?: string;
    },
  ) {
    const s = await this.getSettings(merchantId);
    let earnBps = 0;
    let redeemLimitBps = 0;
    try {
      await ensureBaseTier(this.prisma, merchantId);
      const tier = await this.prisma.loyaltyTier.findFirst({
        where: { merchantId, isInitial: true },
        orderBy: { thresholdAmount: 'asc' },
      });
      if (tier) {
        if (typeof tier.earnRateBps === 'number') {
          earnBps = Math.max(0, Math.floor(Number(tier.earnRateBps)));
        }
        if (typeof tier.redeemRateBps === 'number') {
          redeemLimitBps = Math.max(0, Math.floor(Number(tier.redeemRateBps)));
        }
      }
    } catch {}
    const rules = s.rulesJson;
    if (Array.isArray(rules)) {
      for (const item of rules) {
        try {
          const rule = asRecord(item);
          if (!rule) continue;
          const cond = asRecord(rule.if);
          if (
            Array.isArray(cond?.channelIn) &&
            !cond.channelIn
              .filter((value): value is string => typeof value === 'string')
              .includes(args.channel)
          )
            continue;
          const then = asRecord(rule.then);
          if (then?.earnBps != null) earnBps = Number(then.earnBps);
          if (then?.redeemLimitBps != null)
            redeemLimitBps = Number(then.redeemLimitBps);
        } catch {}
      }
    }
    return { earnBps, redeemLimitBps };
  }

  // Outlets
  private mapOutlet(entity: Outlet) {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      name: entity.name,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    } as const;
  }

  private mapReceipt(entity: ReceiptWithDevice) {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      customerId: entity.customerId,
      orderId: entity.orderId,
      receiptNumber: entity.receiptNumber ?? null,
      total: entity.total,
      redeemApplied: entity.redeemApplied,
      earnApplied: entity.earnApplied,
      createdAt: entity.createdAt,
      outletId: entity.outletId ?? null,
      staffId: entity.staffId ?? null,
      deviceId: entity?.device?.code ?? entity.deviceId ?? null,
    } as const;
  }

  private mapTransaction(entity: TransactionWithDevice) {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      customerId: entity.customerId,
      type: entity.type,
      amount: entity.amount,
      orderId: entity.orderId ?? null,
      createdAt: entity.createdAt,
      outletId: entity.outletId ?? null,
      staffId: entity.staffId ?? null,
      deviceId: entity?.device?.code ?? entity.deviceId ?? null,
    } as const;
  }

  private async ensureOutlet(merchantId: string, outletId: string) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
    });
    if (!outlet || outlet.merchantId !== merchantId)
      throw new NotFoundException('Outlet not found');
    return outlet;
  }

  private async assertOutletLimit(merchantId: string) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { maxOutlets: true },
    });
    const limit = settings?.maxOutlets ?? null;
    if (limit == null || limit <= 0) return;
    const count = await this.prisma.outlet.count({ where: { merchantId } });
    if (count >= limit) {
      throw new BadRequestException('Вы достигли лимита торговых точек.');
    }
  }

  async listOutlets(merchantId: string) {
    const items = await this.prisma.outlet.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((out) => this.mapOutlet(out));
  }
  async createOutlet(merchantId: string, name: string) {
    await this.ensureMerchant(merchantId);
    await this.assertOutletLimit(merchantId);
    const created = await this.prisma.outlet.create({
      data: { merchantId, name },
    });
    this.cache.invalidateOutlet(merchantId, created.id);
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
      data: { name: dto.name ?? undefined },
    });
    this.cache.invalidateOutlet(merchantId, outletId);
    return this.mapOutlet(updated);
  }
  async deleteOutlet(merchantId: string, outletId: string) {
    await this.ensureOutlet(merchantId, outletId);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffOutletAccess.deleteMany({
        where: { merchantId, outletId },
      });
      await tx.productStock.deleteMany({ where: { outletId } });
      await tx.cashierSession.deleteMany({ where: { merchantId, outletId } });
      await tx.promoCodeUsage.deleteMany({ where: { merchantId, outletId } });
      await tx.promotionParticipant.deleteMany({
        where: { merchantId, outletId },
      });
      await tx.staffKpiDaily.deleteMany({ where: { outletId } });
      await tx.staffMotivationEntry.deleteMany({ where: { outletId } });
      await tx.outletKpiDaily.deleteMany({ where: { outletId } });
      await tx.pushDevice.deleteMany({ where: { outletId } });
      await tx.device.deleteMany({ where: { outletId } });
      await tx.outlet.delete({ where: { id: outletId } });
    });
    this.cache.invalidateOutlet(merchantId, outletId);
    return { ok: true };
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
    this.cache.invalidateOutlet(merchantId, outletId);
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
      const acc = await this.prisma.staffOutletAccess.groupBy({
        by: ['staffId'],
        where: { merchantId },
        _count: { _all: true },
      });
      accessMap = new Map<string, number>(
        acc.map((row) => [row.staffId, row._count?._all ?? 0]),
      );
    } catch {}
    // Последняя активность (по транзакциям)
    let lastMap = new Map<string, Date | null>();
    try {
      const tx = await this.prisma.transaction.groupBy({
        by: ['staffId'],
        where: { merchantId, staffId: { not: null } },
        _max: { createdAt: true },
      });
      lastMap = new Map<string, Date | null>(
        tx
          .filter((row) => row.staffId)
          .map((row) => [row.staffId as string, row._max?.createdAt ?? null]),
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
    const role = dto.role ? (dto.role as StaffRole) : StaffRole.CASHIER;
    const data: Prisma.StaffUncheckedCreateInput = {
      merchantId,
      login:
        dto.login != null && String(dto.login).trim()
          ? String(dto.login).trim()
          : null,
      email:
        dto.email != null && String(dto.email).trim()
          ? String(dto.email).trim().toLowerCase()
          : null,
      role,
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
    const created = await this.prisma.staff.create({ data });
    this.cache.invalidateStaff(merchantId, created.id);
    return created;
  }
  async updateStaff(merchantId: string, staffId: string, dto: UpdateStaffDto) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const data: Prisma.StaffUncheckedUpdateInput = {};
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
    if (dto.role !== undefined) data.role = dto.role as StaffRole;
    if (dto.status !== undefined) data.status = dto.status as StaffStatus;
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
    if (
      dto.canAccessPortal === false ||
      dto.password !== undefined ||
      dto.status === StaffStatus.FIRED
    ) {
      data.portalTokensRevokedAt = new Date();
      data.portalRefreshTokenHash = null;
    }
    const updated = await this.prisma.staff.update({ where: { id: staffId }, data });
    this.cache.invalidateStaff(merchantId, staffId);
    return updated;
  }
  async deleteStaff(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    await this.prisma.staff.delete({ where: { id: staffId } });
    this.cache.invalidateStaff(merchantId, staffId);
    return { ok: true };
  }

  // Staff ↔ Outlet access management (PINs)
  async listStaffAccess(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const acc = await this.prisma.staffOutletAccess.findMany({
      where: { merchantId, staffId },
      orderBy: { createdAt: 'asc' },
    });
    const outletIds = acc.map((a) => a.outletId);
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
          grouped.map((g) => [
            `${g.staffId}|${g.outletId}`,
            g._count?._all || 0,
          ]),
        );
      } catch {}
    }
    return acc.map((a) => ({
      outletId: a.outletId,
      outletName: nameMap.get(a.outletId) || a.outletId,
      pinCode: a.pinCode || null,
      lastTxnAt: a.lastTxnAt || null,
      transactionsTotal: counters.get(`${a.staffId}|${a.outletId}`) || 0,
    }));
  }

  private async resolveActiveAccessByPin(
    merchantId: string,
    pinCode: string,
    deviceSessionId?: string | null,
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
    const retryLimit = Math.max(1, Number(process.env.PIN_RETRY_LIMIT || '5'));
    const retryWindowMs = Math.max(
      60_000,
      Number(process.env.PIN_RETRY_WINDOW_MS || '900000'),
    );
    const deviceSessionKey = deviceSessionId
      ? String(deviceSessionId).trim()
      : '';
    let devicePinState: {
      pinFailedCount: number;
      pinFailedAt: Date | null;
      pinLockedUntil: Date | null;
    } | null = null;
    if (deviceSessionKey) {
      try {
        devicePinState = await this.prisma.cashierDeviceSession.findUnique({
          where: { id: deviceSessionKey },
          select: {
            pinFailedCount: true,
            pinFailedAt: true,
            pinLockedUntil: true,
          },
        });
        if (
          devicePinState?.pinLockedUntil &&
          devicePinState.pinLockedUntil.getTime() > Date.now()
        ) {
          throw new UnauthorizedException(
            'PIN временно заблокирован. Осталось попыток: 0',
          );
        }
        if (
          devicePinState?.pinLockedUntil &&
          devicePinState.pinLockedUntil.getTime() <= Date.now()
        ) {
          await this.prisma.cashierDeviceSession.update({
            where: { id: deviceSessionKey },
            data: {
              pinFailedCount: 0,
              pinFailedAt: null,
              pinLockedUntil: null,
            },
          });
          devicePinState = {
            pinFailedCount: 0,
            pinFailedAt: null,
            pinLockedUntil: null,
          };
        }
      } catch {}
    }
    const pinHash = this.hashPin(normalizedPin);
    let matches = await this.prisma.staffOutletAccess.findMany({
      where: {
        merchantId,
        pinCodeHash: pinHash,
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
      },
      include: {
        staff: true,
        outlet: { select: { id: true, name: true } },
      },
      take: 2,
    });
    if (!matches.length) {
      matches = await this.prisma.staffOutletAccess.findMany({
        where: {
          merchantId,
          pinCode: normalizedPin,
          status: StaffOutletAccessStatus.ACTIVE,
          revokedAt: null,
        },
        include: {
          staff: true,
          outlet: { select: { id: true, name: true } },
        },
        take: 2,
      });
      if (matches.length === 1 && !matches[0].pinCodeHash) {
        await this.prisma.staffOutletAccess.update({
          where: { id: matches[0].id },
          data: {
            pinCodeHash: pinHash,
            pinRetryCount: 0,
            pinUpdatedAt: new Date(),
            revokedAt: null,
          },
        });
        matches[0].pinCodeHash = pinHash;
      }
    }
    if (!matches.length) {
      let remainingAttempts: number | null = null;
      if (deviceSessionKey) {
        const now = new Date();
        const windowStart = devicePinState?.pinFailedAt ?? null;
        const withinWindow =
          windowStart && now.getTime() - windowStart.getTime() <= retryWindowMs;
        const nextCount = withinWindow
          ? (devicePinState?.pinFailedCount ?? 0) + 1
          : 1;
        const nextFirstFailedAt = withinWindow ? windowStart : now;
        const lockedUntil =
          nextCount >= retryLimit
            ? new Date(now.getTime() + retryWindowMs)
            : null;
        remainingAttempts = Math.max(0, retryLimit - nextCount);
        try {
          await this.prisma.cashierDeviceSession.update({
            where: { id: deviceSessionKey },
            data: {
              pinFailedCount: nextCount,
              pinFailedAt: nextFirstFailedAt,
              pinLockedUntil: lockedUntil,
            },
          });
        } catch {}
      }
      const message =
        remainingAttempts === null
          ? 'Staff access by PIN not found'
          : remainingAttempts === 0
            ? 'Неверный PIN. Осталось попыток: 0. PIN временно заблокирован'
            : `Неверный PIN. Осталось попыток: ${remainingAttempts}`;
      throw new NotFoundException(message);
    }
    if (matches.length > 1) {
      throw new BadRequestException(
        'PIN не уникален внутри мерчанта. Сгенерируйте новый PIN для сотрудников.',
      );
    }
    const access = matches[0];
    if (
      access.pinRetryCount >= retryLimit &&
      access.pinUpdatedAt &&
      Date.now() - access.pinUpdatedAt.getTime() < retryWindowMs
    ) {
      throw new UnauthorizedException('PIN временно заблокирован');
    }
    const staff = access.staff;
    if (!staff || staff.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    if (staff.status && staff.status !== StaffStatus.ACTIVE) {
      throw new UnauthorizedException('Staff inactive');
    }
    if (access.pinRetryCount) {
      await this.prisma.staffOutletAccess.update({
        where: { id: access.id },
        data: { pinRetryCount: 0, pinUpdatedAt: new Date() },
      });
    }
    if (
      deviceSessionKey &&
      devicePinState &&
      (devicePinState.pinFailedCount ||
        devicePinState.pinFailedAt ||
        devicePinState.pinLockedUntil)
    ) {
      try {
        await this.prisma.cashierDeviceSession.update({
          where: { id: deviceSessionKey },
          data: {
            pinFailedCount: 0,
            pinFailedAt: null,
            pinLockedUntil: null,
          },
        });
      } catch {}
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
    const existing = await this.prisma.staffOutletAccess.findUnique({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
    });
    const pinCode = await this.generateUniqueOutletPin(
      merchantId,
      existing?.id,
    );
    await this.prisma.staffOutletAccess.upsert({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
      update: {
        pinCode,
        pinCodeHash: this.hashPin(pinCode),
        pinRetryCount: 0,
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
        pinUpdatedAt: new Date(),
      },
      create: {
        merchantId,
        staffId,
        outletId,
        pinCode,
        pinCodeHash: this.hashPin(pinCode),
        pinRetryCount: 0,
        status: StaffOutletAccessStatus.ACTIVE,
        pinUpdatedAt: new Date(),
      },
    });
    this.cache.invalidateStaff(merchantId, staffId);
    return {
      outletId,
      outletName: outlet.name || outletId,
      pinCode,
      lastTxnAt: null,
      transactionsTotal: 0,
    };
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
      await this.prisma.staffOutletAccess.delete({
        where: {
          merchantId_staffId_outletId: { merchantId, staffId, outletId },
        },
      });
    } catch {}
    this.cache.invalidateStaff(merchantId, staffId);
    return { ok: true };
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
        pinCodeHash: this.hashPin(pinCode),
        pinRetryCount: 0,
        pinUpdatedAt: new Date(),
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
      },
    });
    this.cache.invalidateStaff(merchantId, staffId);
    return { pinCode };
  }
  async regenerateStaffPin(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const access = await this.prisma.staffOutletAccess.findUnique({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
    });
    if (!access) throw new NotFoundException('Outlet access not granted');
    const pinCode = await this.generateUniqueOutletPin(merchantId, access.id);
    await this.prisma.staffOutletAccess.update({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
      data: {
        pinCode,
        pinCodeHash: this.hashPin(pinCode),
        pinRetryCount: 0,
        pinUpdatedAt: new Date(),
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
      },
    });
    this.cache.invalidateStaff(merchantId, staffId);
    return { outletId, pinCode };
  }

  async getStaffAccessByPin(
    merchantId: string,
    pinCode: string,
    deviceSessionId?: string | null,
  ) {
    const { access, staff } = await this.resolveActiveAccessByPin(
      merchantId,
      pinCode,
      deviceSessionId,
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
    cursor?: { createdAt: Date; id: string } | null,
  ) {
    const where: Prisma.EventOutboxWhereInput = { merchantId };
    const normalizedStatus = status ? String(status).toUpperCase() : undefined;
    if (normalizedStatus) where.status = normalizedStatus;
    if (type) where.eventType = type;
    const and: Prisma.EventOutboxWhereInput[] = [];
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) and.push({ createdAt: { gte: d } });
    }
    if (cursor?.createdAt && cursor?.id) {
      and.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    if (and.length) where.AND = and;
    return this.prisma.eventOutbox.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
  async retryOutbox(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({
      where: { id: eventId },
    });
    if (!ev || ev.merchantId !== merchantId)
      throw new NotFoundException('Event not found');
    if (ev.status === 'SENT') {
      throw new BadRequestException('Event already delivered');
    }
    if (ev.status === 'SENDING') {
      throw new BadRequestException('Event is being delivered');
    }
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
    const where: Prisma.EventOutboxWhereInput = { merchantId };
    const normalizedStatus = status ? String(status).toUpperCase() : undefined;
    if (normalizedStatus) {
      if (normalizedStatus === 'SENT' || normalizedStatus === 'SENDING') {
        return { ok: true, updated: 0 };
      }
      where.status = normalizedStatus;
    } else {
      where.status = { in: ['FAILED', 'DEAD'] };
    }
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
    const where: Prisma.EventOutboxWhereInput = { merchantId };
    const normalizedStatus = params.status
      ? String(params.status).toUpperCase()
      : undefined;
    if (normalizedStatus) {
      if (normalizedStatus === 'SENT' || normalizedStatus === 'SENDING') {
        return { ok: true, updated: 0 };
      }
      where.status = normalizedStatus;
    } else {
      where.status = { in: ['FAILED', 'DEAD'] };
    }
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
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { outboxPausedUntil: until, updatedAt: new Date() },
      create: { merchantId, outboxPausedUntil: until, updatedAt: new Date() },
    });
    this.cache.invalidateSettings(merchantId);
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
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { outboxPausedUntil: null, updatedAt: new Date() },
      create: { merchantId, outboxPausedUntil: null, updatedAt: new Date() },
    });
    this.cache.invalidateSettings(merchantId);
    await this.prisma.eventOutbox.updateMany({
      where: { merchantId, status: 'PENDING' },
      data: { nextRetryAt: new Date(), lastError: null },
    });
    return { ok: true };
  }

  async outboxStats(merchantId: string, since?: Date) {
    const where: Prisma.EventOutboxWhereInput = since
      ? { merchantId, createdAt: { gte: since } }
      : { merchantId };
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
      const grouped = await this.prisma.eventOutbox.groupBy({
        by: ['eventType'],
        where,
        _count: { eventType: true },
      });
      for (const g of grouped)
        typeCounts[g.eventType] = g._count?.eventType ?? 0;
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
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) return [];
    const payloadFilter: Prisma.JsonFilter<'EventOutbox'> = {
      path: ['orderId'],
      equals: normalizedOrderId,
    };
    return this.prisma.eventOutbox.findMany({
      where: {
        merchantId,
        payload: payloadFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Staff tokens
  private secureToken(len = 48) {
    const bytes = Math.ceil(len / 2);
    return randomBytes(bytes).toString('hex').slice(0, len);
  }
  private randToken() {
    return this.secureToken(48);
  }
  private sha256(s: string) {
    return createHash('sha256').update(s, 'utf8').digest('hex');
  }
  private randomKey(len = 48) {
    return this.secureToken(len);
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
    return randomBytes(48).toString('hex');
  }

  private async createCashierSessionRecord(
    merchantId: string,
    staff: Staff,
    access: { id: string; outletId: string },
    rememberPin?: boolean,
    context?: { ip?: string | null; userAgent?: string | null },
    deviceSessionId?: string | null,
    metadata?: Prisma.InputJsonValue,
  ) {
    const token = this.randomSessionToken();
    const hash = this.sha256(token);
    const now = new Date();
    const ttlMs = rememberPin
      ? 1000 * 60 * 60 * 24 * 180 // ~180 дней
      : 1000 * 60 * 60 * 12; // 12 часов
    const [session] = await this.prisma.$transaction([
      this.prisma.cashierSession.create({
        data: {
          merchantId,
          staffId: staff.id,
          outletId: access.outletId,
          pinAccessId: access.id,
          deviceSessionId: deviceSessionId ?? null,
          startedAt: now,
          lastSeenAt: now,
          tokenHash: hash,
          expiresAt: new Date(now.getTime() + ttlMs),
          rememberPin: !!rememberPin,
          ipAddress: context?.ip ?? null,
          userAgent: context?.userAgent ?? null,
          metadata: metadata ?? ({} as Prisma.InputJsonValue),
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
    const normalizeDate = (value?: Date) => {
      if (!value) return undefined;
      const ts = value.getTime();
      return Number.isFinite(ts) ? value : undefined;
    };
    const allowedTypes = new Set(Object.values(TxnType));
    const type =
      params.type && allowedTypes.has(params.type as TxnType)
        ? (params.type as TxnType)
        : undefined;
    const before = normalizeDate(params.before);
    const from = normalizeDate(params.from);
    const to = normalizeDate(params.to);

    const where: Prisma.TransactionWhereInput = { merchantId };
    if (type) where.type = type;
    if (params.customerId) where.customerId = params.customerId;
    if (params.outletId) where.outletId = params.outletId;
    if (params.staffId) where.staffId = params.staffId;
    if (before || from || to) {
      where.createdAt = {
        ...(before ? { lt: before } : {}),
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      include: {
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
      from?: Date;
      to?: Date;
      orderId?: string;
      customerId?: string;
    },
  ) {
    const where: Prisma.ReceiptWhereInput = { merchantId };
    if (params.orderId) where.orderId = params.orderId;
    if (params.customerId) where.customerId = params.customerId;
    if (params.before || params.from || params.to) {
      where.createdAt = {
        ...(params.before ? { lt: params.before } : {}),
        ...(params.from ? { gte: params.from } : {}),
        ...(params.to ? { lte: params.to } : {}),
      };
    }
    const items = await this.prisma.receipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      include: {
        device: { select: { code: true } },
      },
    });
    return items.map((entity) => this.mapReceipt(entity));
  }
  async getReceipt(merchantId: string, receiptId: string) {
    const r = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        device: { select: { code: true } },
      },
    });
    if (!r || r.merchantId !== merchantId)
      throw new NotFoundException('Receipt not found');
    const tx = await this.prisma.transaction.findMany({
      where: { merchantId, orderId: r.orderId },
      orderBy: { createdAt: 'asc' },
      include: {
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
    const where: Prisma.LedgerEntryWhereInput = { merchantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.before || params.from || params.to) {
      where.createdAt = {
        ...(params.before ? { lt: params.before } : {}),
        ...(params.from ? { gte: params.from } : {}),
        ...(params.to ? { lte: params.to } : {}),
      };
    }
    if (params.type) {
      // приблизительное сопоставление по мета.type
      const metaFilter: Prisma.JsonFilter<'LedgerEntry'> = {
        path: ['mode'],
        equals:
          params.type === 'earn' || params.type === 'redeem'
            ? params.type.toUpperCase()
            : 'REFUND',
      };
      where.meta = metaFilter;
    }
    const items = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
    });
    return items.map((entity) => {
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
      'id,customerId,debit,credit,amount,orderId,receiptId,createdAt,outletId,staffId',
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
    const windowDaysRaw = Number(
      process.env.TTL_RECONCILIATION_WINDOW_DAYS || '365',
    );
    const windowDays =
      Number.isFinite(windowDaysRaw) && windowDaysRaw > 0
        ? Math.floor(windowDaysRaw)
        : 0;
    const windowStart =
      windowDays > 0
        ? new Date(cutoff.getTime() - windowDays * 24 * 60 * 60 * 1000)
        : null;
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { pointsTtlDays: true },
    });
    const ttlDaysRaw = Number(settings?.pointsTtlDays ?? 0);
    const ttlDays =
      Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0
        ? Math.floor(ttlDaysRaw)
        : 0;
    const now =
      ttlDays > 0
        ? new Date(cutoff.getTime() + ttlDays * 24 * 60 * 60 * 1000)
        : cutoff;
    const purchaseOnly = {
      orderId: { not: null },
      NOT: [
        { orderId: 'registration_bonus' },
        { orderId: { startsWith: 'birthday:' } },
        { orderId: { startsWith: 'auto_return:' } },
        { orderId: { startsWith: 'complimentary:' } },
      ],
    };
    const expiresAtFilter = windowStart
      ? { lte: now, gte: windowStart }
      : { lte: now };
    const earnedAtFilter = windowStart
      ? { lt: cutoff, gte: windowStart }
      : { lt: cutoff };
    const conditions: Prisma.EarnLotWhereInput[] = [
      { expiresAt: expiresAtFilter },
      {
        expiresAt: null,
        earnedAt: earnedAtFilter,
        ...purchaseOnly,
      },
    ];
    // expired lots (aligned with burn logic)
    const lots = await this.prisma.earnLot.findMany({
      where: {
        merchantId,
        status: 'ACTIVE',
        OR: conditions,
      },
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
    const cutoffDay = new Date(
      Date.UTC(
        cutoff.getUTCFullYear(),
        cutoff.getUTCMonth(),
        cutoff.getUTCDate(),
      ),
    );
    const cutoffDayEnd = new Date(cutoffDay.getTime() + 24 * 60 * 60 * 1000);
    // burned from outbox events with matching cutoff date
    const events = await this.prisma.eventOutbox.findMany({
      where: {
        merchantId,
        eventType: 'loyalty.points_ttl.burned',
        ...(windowStart ? { createdAt: { gte: windowStart } } : {}),
      },
    });
    const burnedByCustomer = new Map<string, number>();
    for (const ev of events) {
      try {
        const payload = asRecord(ev.payload);
        const cutoffValue = payload?.cutoff;
        let pCutoff: Date | undefined;
        if (cutoffValue instanceof Date) {
          pCutoff = cutoffValue;
        } else if (
          typeof cutoffValue === 'string' ||
          typeof cutoffValue === 'number'
        ) {
          pCutoff = new Date(cutoffValue);
        }
        if (
          pCutoff &&
          !isNaN(pCutoff.getTime()) &&
          pCutoff >= cutoffDay &&
          pCutoff < cutoffDayEnd
        ) {
          const customerIdValue = payload?.customerId;
          const cid =
            typeof customerIdValue === 'string' ? customerIdValue : '';
          const amountValue = payload?.amount;
          const amt =
            typeof amountValue === 'number'
              ? amountValue
              : typeof amountValue === 'string'
                ? Number(amountValue)
                : 0;
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
    const where: Prisma.EarnLotWhereInput = { merchantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.before) where.createdAt = { lt: params.before };
    if (params.activeOnly) {
      const activeFilters = [
        { consumedPoints: null },
        { consumedPoints: { lt: undefined } },
      ] as unknown as Prisma.EarnLotWhereInput[]; // prisma workaround placeholder
      where.OR = activeFilters;
    }
    const items = await this.prisma.earnLot.findMany({
      where,
      orderBy: { earnedAt: 'desc' },
      take: params.limit,
    });
    return items.map((entity) => {
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
      'id,customerId,points,consumedPoints,earnedAt,expiresAt,orderId,receiptId,outletId,staffId',
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
      where: { merchantId, customerId, type: WalletType.POINTS },
    });
    return w?.balance ?? 0;
  }
  async findCustomerByPhone(merchantId: string, phone: string) {
    // Customer теперь per-merchant модель
    const raw = String(phone || '').trim();
    const normalized = this.normalizePhone(raw);
    if (!raw && !normalized) return null;
    const candidates = Array.from(
      new Set(
        [normalized, raw].filter((value): value is string => Boolean(value)),
      ),
    );
    const c = await this.prisma.customer.findFirst({
      where: { merchantId, phone: { in: candidates } },
    });
    if (!c) return null;
    const bal = await this.getBalance(merchantId, c.id);
    return { customerId: c.id, phone: c.phone, balance: bal };
  }

  // ===== Admin: merchants management =====
  listMerchants() {
    return this.prisma.merchant.findMany({
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
            maxOutlets: true,
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
    maxOutlets?: number | null,
  ) {
    if (!name || !name.trim()) throw new BadRequestException('name required');
    const em = String(email || '')
      .trim()
      .toLowerCase();
    if (!em) throw new BadRequestException('login required');
    if (!password || String(password).length < 6)
      throw new BadRequestException('password too short');
    const parsedMaxOutlets = maxOutlets == null ? null : Number(maxOutlets);
    if (parsedMaxOutlets != null) {
      if (
        !Number.isFinite(parsedMaxOutlets) ||
        parsedMaxOutlets < 1 ||
        !Number.isInteger(parsedMaxOutlets)
      ) {
        throw new BadRequestException('Лимит торговых точек должен быть >= 1');
      }
    }
    const pwd = hashPassword(String(password));
    // slug для логина кассира + уникальность
    const baseSlug = this.slugify(name.trim());
    const uniqueSlug = await this.ensureUniqueCashierLogin(baseSlug);
    const m = await this.prisma.merchant.create({
      data: {
        name: name.trim(),
        initialName: name.trim(),
        portalEmail: em,
        portalPasswordHash: pwd,
        cashierLogin: uniqueSlug,
      },
    });
    if (parsedMaxOutlets != null) {
      await this.prisma.merchantSettings.create({
        data: { merchantId: m.id, maxOutlets: parsedMaxOutlets },
      });
    }
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
            role: StaffRole.MERCHANT,
            isOwner: true,
            canAccessPortal: true,
            pinCode,
          },
        });
      } catch {}
    }
    await createAccessGroupsFromPresets(this.prisma, m.id);
    return {
      id: m.id,
      name: m.name,
      initialName: m.initialName,
      email: m.portalEmail,
    };
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
    const data: Prisma.MerchantUpdateInput = {};
    if (dto.name != null) data.name = String(dto.name).trim();
    if (dto.email != null)
      data.portalEmail = String(dto.email).trim().toLowerCase() || null;
    if (dto.password != null) {
      if (!dto.password || String(dto.password).length < 6)
        throw new BadRequestException('password too short');
      data.portalPasswordHash = hashPassword(String(dto.password));
    }
    if (
      data.portalEmail !== undefined ||
      data.portalPasswordHash !== undefined
    ) {
      data.portalTokensRevokedAt = new Date();
      data.portalRefreshTokenHash = null;
    }
    const res = await this.prisma.merchant.update({
      where: { id },
      data,
    });
    return {
      id: res.id,
      name: res.name,
      initialName: res.initialName,
      email: res.portalEmail,
    };
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

    const updated = await this.prisma.merchant.update({
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
      await this.prisma.merchant.update({
        where: { id },
        data: {
          portalLoginEnabled: false,
          portalEmail: null,
          portalTokensRevokedAt: new Date(),
          portalRefreshTokenHash: null,
        },
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
        earnBps: 300,
        redeemLimitBps: 5000,
        qrTtlSec: 300,
        redeemCooldownSec: 0,
        earnCooldownSec: 0,
        redeemDailyCap: null,
        earnDailyCap: null,
        requireJwtForQuote: false,
        rulesJson: Prisma.JsonNull,
        timezone: normalized.code,
      },
    });
    this.cache.invalidateSettings(merchantId);
    return serializeTimezone(normalized.code);
  }
  async rotatePortalKey(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    const key = this.randomKey(48);
    const hash = this.sha256(key);
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { portalKeyHash: hash },
    });
    return { key };
  }
  async setPortalLoginEnabled(merchantId: string, enabled: boolean) {
    const updateData: Prisma.MerchantUpdateInput = {
      portalLoginEnabled: !!enabled,
    };
    if (!enabled) {
      updateData.portalTokensRevokedAt = new Date();
      updateData.portalRefreshTokenHash = null;
    }
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: updateData,
    });
    return { ok: true };
  }
  async initTotp(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    const otplib = loadOtplib();
    if (!otplib) throw new Error('otplib not installed');
    const secret = otplib.authenticator.generateSecret();
    const label = encodeURIComponent(`Loyalty:${m.name || m.id}`);
    const issuer = encodeURIComponent('LoyaltyPortal');
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
    await this.prisma.merchant.update({
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
    if (!m.portalTotpSecret)
      throw new BadRequestException('TOTP not initialized');
    const otplib = loadOtplib();
    if (!otplib) throw new Error('otplib not installed');
    const ok = otplib.authenticator.verify({
      token: String(code || ''),
      secret: m.portalTotpSecret,
    });
    if (!ok) throw new BadRequestException('Invalid TOTP code');
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { portalTotpEnabled: true },
    });
    return { ok: true };
  }
  async disableTotp(merchantId: string) {
    await this.prisma.merchant.update({
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
