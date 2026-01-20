import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { hashPassword } from '../../shared/password.util';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import {
  TxnType,
  StaffRole,
  WalletType,
  Prisma,
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
import { MerchantsAccessService } from './services/merchants-access.service';
import { MerchantsStaffService } from './services/merchants-staff.service';
import { MerchantsOutletsService } from './services/merchants-outlets.service';
import { MerchantsOutboxService } from './services/merchants-outbox.service';
import {
  ensureUniqueCashierLogin,
  normalizePhone,
  randomPin4,
  secureToken,
  sha256,
  slugify,
} from './merchants.helpers';

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
  private readonly config = new AppConfigService();
  constructor(
    private prisma: PrismaService,
    private readonly settings: MerchantsSettingsService,
    private readonly cache: LookupCacheService,
    private readonly access: MerchantsAccessService,
    private readonly staff: MerchantsStaffService,
    private readonly outlets: MerchantsOutletsService,
    private readonly outbox: MerchantsOutboxService,
  ) {}

  async getCashierCredentials(merchantId: string) {
    return this.access.getCashierCredentials(merchantId);
  }
  async setCashierCredentials(merchantId: string, login: string) {
    return this.access.setCashierCredentials(merchantId, login);
  }
  async rotateCashierCredentials(
    merchantId: string,
    regenerateLogin?: boolean,
  ) {
    return this.access.rotateCashierCredentials(merchantId, regenerateLogin);
  }

  async issueCashierActivationCodes(merchantId: string, count: number) {
    return this.access.issueCashierActivationCodes(merchantId, count);
  }

  async listCashierActivationCodes(merchantId: string, limit = 50) {
    return this.access.listCashierActivationCodes(merchantId, limit);
  }

  async revokeCashierActivationCode(merchantId: string, codeId: string) {
    return this.access.revokeCashierActivationCode(merchantId, codeId);
  }

  async listCashierDeviceSessions(merchantId: string, limit = 50) {
    return this.access.listCashierDeviceSessions(merchantId, limit);
  }

  async revokeCashierDeviceSession(merchantId: string, sessionId: string) {
    return this.access.revokeCashierDeviceSession(merchantId, sessionId);
  }

  async activateCashierDeviceByCode(
    merchantLogin: string,
    activationCode: string,
    context?: { ip?: string | null; userAgent?: string | null },
  ) {
    return this.access.activateCashierDeviceByCode(
      merchantLogin,
      activationCode,
      context,
    );
  }

  async getCashierDeviceSessionByToken(token: string) {
    return this.access.getCashierDeviceSessionByToken(token);
  }

  async revokeCashierDeviceSessionByToken(token: string) {
    return this.access.revokeCashierDeviceSessionByToken(token);
  }

  async startCashierSessionByMerchantId(
    merchantId: string,
    pinCode: string,
    rememberPin?: boolean,
    context?: { ip?: string | null; userAgent?: string | null },
    deviceSessionId?: string | null,
  ) {
    return this.access.startCashierSessionByMerchantId(
      merchantId,
      pinCode,
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

  async listOutlets(merchantId: string) {
    return this.outlets.listOutlets(merchantId);
  }
  async createOutlet(merchantId: string, name: string) {
    return this.outlets.createOutlet(merchantId, name);
  }
  async updateOutlet(
    merchantId: string,
    outletId: string,
    dto: UpdateOutletDto,
  ) {
    return this.outlets.updateOutlet(merchantId, outletId, dto);
  }
  async deleteOutlet(merchantId: string, outletId: string) {
    return this.outlets.deleteOutlet(merchantId, outletId);
  }

  async updateOutletStatus(
    merchantId: string,
    outletId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    return this.outlets.updateOutletStatus(merchantId, outletId, status);
  }

  // Staff
  async listStaff(merchantId: string) {
    return this.staff.listStaff(merchantId);
  }
  async createStaff(merchantId: string, dto: CreateStaffDto) {
    return this.staff.createStaff(merchantId, dto);
  }
  async updateStaff(merchantId: string, staffId: string, dto: UpdateStaffDto) {
    return this.staff.updateStaff(merchantId, staffId, dto);
  }
  async deleteStaff(merchantId: string, staffId: string) {
    return this.staff.deleteStaff(merchantId, staffId);
  }

  // Staff ↔ Outlet access management (PINs)
  async listStaffAccess(merchantId: string, staffId: string) {
    return this.access.listStaffAccess(merchantId, staffId);
  }
  async addStaffAccess(merchantId: string, staffId: string, outletId: string) {
    return this.access.addStaffAccess(merchantId, staffId, outletId);
  }
  async removeStaffAccess(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    return this.access.removeStaffAccess(merchantId, staffId, outletId);
  }
  async regenerateStaffPersonalPin(merchantId: string, staffId: string) {
    return this.access.regenerateStaffPersonalPin(merchantId, staffId);
  }
  async regenerateStaffPin(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    return this.access.regenerateStaffPin(merchantId, staffId, outletId);
  }

  async getStaffAccessByPin(
    merchantId: string,
    pinCode: string,
    deviceSessionId?: string | null,
  ) {
    return this.access.getStaffAccessByPin(
      merchantId,
      pinCode,
      deviceSessionId,
    );
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
    return this.outbox.listOutbox(
      merchantId,
      status,
      limit,
      type,
      since,
      cursor,
    );
  }
  async retryOutbox(merchantId: string, eventId: string) {
    return this.outbox.retryOutbox(merchantId, eventId);
  }
  async getOutboxEvent(merchantId: string, eventId: string) {
    return this.outbox.getOutboxEvent(merchantId, eventId);
  }
  async deleteOutbox(merchantId: string, eventId: string) {
    return this.outbox.deleteOutbox(merchantId, eventId);
  }
  async retryAll(merchantId: string, status?: string) {
    return this.outbox.retryAll(merchantId, status);
  }

  async retrySince(
    merchantId: string,
    params: { status?: string; since?: string },
  ) {
    return this.outbox.retrySince(merchantId, params);
  }

  async exportOutboxCsv(
    merchantId: string,
    params: { status?: string; since?: string; type?: string; limit?: number },
  ) {
    return this.outbox.exportOutboxCsv(merchantId, params);
  }

  async pauseOutbox(merchantId: string, minutes?: number, untilISO?: string) {
    return this.outbox.pauseOutbox(merchantId, minutes, untilISO);
  }
  async resumeOutbox(merchantId: string) {
    return this.outbox.resumeOutbox(merchantId);
  }

  async outboxStats(merchantId: string, since?: Date) {
    return this.outbox.outboxStats(merchantId, since);
  }
  async listOutboxByOrder(merchantId: string, orderId: string, limit = 100) {
    return this.outbox.listOutboxByOrder(merchantId, orderId, limit);
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
    const token = secureToken(48);
    const hash = sha256(token);
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

  async getCashierSessionByToken(token: string) {
    return this.access.getCashierSessionByToken(token);
  }

  async endCashierSessionByToken(token: string, reason = 'logout') {
    return this.access.endCashierSessionByToken(token, reason);
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
    const windowDaysRaw = this.config.getTtlReconciliationWindowDays();
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
    const normalized = normalizePhone(raw);
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
    const baseSlug = slugify(name.trim());
    const uniqueSlug = await ensureUniqueCashierLogin(this.prisma, baseSlug);
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
      const pinCode = randomPin4();
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
    const key = secureToken(48);
    const hash = sha256(key);
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
