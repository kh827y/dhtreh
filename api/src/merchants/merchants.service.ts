import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateDeviceDto, UpdateMerchantSettingsDto, UpdateOutletDto, UpdateStaffDto } from './dto';
// Lazy Ajv import to avoid TS2307 when dependency isn't installed yet
const __AjvLib: any = (() => { try { return require('ajv'); } catch { return null; } })();

@Injectable()
export class MerchantsService {
  constructor(private prisma: PrismaService) {
    const AjvCtor: any = __AjvLib?.default || __AjvLib;
    this.ajv = AjvCtor ? new AjvCtor({ allErrors: true, coerceTypes: true, removeAdditional: 'failing' }) : {
      validate: () => true,
      errorsText: () => '',
      errors: []
    };
  }
  private ajv: { validate: (schema: any, data: any) => boolean; errorsText: (errs?: any, opts?: any) => string; errors?: any };
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
            weekdayIn: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
            minEligible: { type: 'number', minimum: 0 },
            categoryIn: { type: 'array', items: { type: 'string' } },
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
          anyOf: [ { required: ['earnBps'] }, { required: ['redeemLimitBps'] } ],
        },
      },
      required: ['then'],
    },
  } as const;

  async getSettings(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { settings: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const s = merchant.settings ?? { earnBps: 500, redeemLimitBps: 5000, qrTtlSec: 120 } as any;
    return {
      merchantId,
      earnBps: s.earnBps,
      redeemLimitBps: s.redeemLimitBps,
      qrTtlSec: s.qrTtlSec,
      webhookUrl: s.webhookUrl ?? null,
      webhookSecret: s.webhookSecret ?? null,
      webhookKeyId: s.webhookKeyId ?? null,
      webhookSecretNext: (s as any).webhookSecretNext ?? null,
      webhookKeyIdNext: (s as any).webhookKeyIdNext ?? null,
      useWebhookNext: (s as any).useWebhookNext ?? false,
      requireBridgeSig: s.requireBridgeSig ?? false,
      bridgeSecret: s.bridgeSecret ?? null,
      bridgeSecretNext: (s as any).bridgeSecretNext ?? null,
      redeemCooldownSec: s.redeemCooldownSec ?? 0,
      earnCooldownSec: s.earnCooldownSec ?? 0,
      redeemDailyCap: s.redeemDailyCap ?? null,
      earnDailyCap: s.earnDailyCap ?? null,
      requireJwtForQuote: s.requireJwtForQuote ?? false,
      rulesJson: s.rulesJson ?? null,
      requireStaffKey: s.requireStaffKey ?? false,
      pointsTtlDays: (s as any).pointsTtlDays ?? null,
      telegramBotToken: (s as any).telegramBotToken ?? null,
      telegramBotUsername: (s as any).telegramBotUsername ?? null,
      telegramStartParamRequired: (s as any).telegramStartParamRequired ?? false,
      miniappBaseUrl: (s as any).miniappBaseUrl ?? null,
      miniappThemePrimary: (s as any).miniappThemePrimary ?? null,
      miniappThemeBg: (s as any).miniappThemeBg ?? null,
      miniappLogoUrl: (s as any).miniappLogoUrl ?? null,
      outboxPausedUntil: (s as any).outboxPausedUntil ?? null,
    };
  }

  validateRules(rulesJson: any) {
    if (rulesJson === undefined || rulesJson === null) return { ok: true };
    const valid = this.ajv.validate(this.rulesSchema as any, rulesJson);
    if (!valid) {
      const msg = this.ajv.errorsText(this.ajv.errors, { separator: '; ' });
      throw new BadRequestException('rulesJson invalid: ' + msg);
    }
    return { ok: true };
  }

  async updateSettings(merchantId: string, earnBps: number, redeemLimitBps: number, qrTtlSec?: number, webhookUrl?: string, webhookSecret?: string, webhookKeyId?: string, redeemCooldownSec?: number, earnCooldownSec?: number, redeemDailyCap?: number, earnDailyCap?: number, requireJwtForQuote?: boolean, rulesJson?: any, requireBridgeSig?: boolean, bridgeSecret?: string, requireStaffKey?: boolean, extras?: Partial<UpdateMerchantSettingsDto>) {
    // JSON Schema валидация правил (если переданы) — выполняем до любых DB операций
    this.validateRules(rulesJson);

    // убедимся, что мерчант есть
    await this.prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: { id: merchantId, name: merchantId },
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
        rulesJson: rulesJson ?? undefined,
        requireStaffKey: requireStaffKey ?? undefined,
        updatedAt: new Date(),
        pointsTtlDays: extras?.pointsTtlDays ?? undefined,
        telegramBotToken: extras?.telegramBotToken ?? undefined,
        telegramBotUsername: extras?.telegramBotUsername ?? undefined,
        telegramStartParamRequired: extras?.telegramStartParamRequired ?? undefined,
        miniappBaseUrl: extras?.miniappBaseUrl ?? undefined,
        miniappThemePrimary: extras?.miniappThemePrimary ?? undefined,
        miniappThemeBg: extras?.miniappThemeBg ?? undefined,
        miniappLogoUrl: extras?.miniappLogoUrl ?? undefined,
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
        rulesJson: rulesJson ?? null,
        requireStaffKey: requireStaffKey ?? false,
        pointsTtlDays: extras?.pointsTtlDays ?? null,
        telegramBotToken: extras?.telegramBotToken ?? null,
        telegramBotUsername: extras?.telegramBotUsername ?? null,
        telegramStartParamRequired: extras?.telegramStartParamRequired ?? false,
        miniappBaseUrl: extras?.miniappBaseUrl ?? null,
        miniappThemePrimary: extras?.miniappThemePrimary ?? null,
        miniappThemeBg: extras?.miniappThemeBg ?? null,
        miniappLogoUrl: extras?.miniappLogoUrl ?? null,
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
      telegramBotToken: (updated as any).telegramBotToken ?? null,
      telegramBotUsername: (updated as any).telegramBotUsername ?? null,
      telegramStartParamRequired: (updated as any).telegramStartParamRequired ?? false,
      miniappBaseUrl: (updated as any).miniappBaseUrl ?? null,
      miniappThemePrimary: (updated as any).miniappThemePrimary ?? null,
      miniappThemeBg: (updated as any).miniappThemeBg ?? null,
      miniappLogoUrl: (updated as any).miniappLogoUrl ?? null,
    };
  }

  async previewRules(merchantId: string, args: { channel: 'VIRTUAL'|'PC_POS'|'SMART'; weekday: number; eligibleTotal: number; category?: string }) {
    const s = await this.getSettings(merchantId);
    let earnBps = s.earnBps ?? 500;
    let redeemLimitBps = s.redeemLimitBps ?? 5000;
    const rules = s.rulesJson;
    if (Array.isArray(rules)) {
      for (const item of rules) {
        try {
          if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
          const cond = (item as any).if ?? {};
          if (Array.isArray(cond.channelIn) && !cond.channelIn.includes(args.channel)) continue;
          if (Array.isArray(cond.weekdayIn) && !cond.weekdayIn.includes(args.weekday)) continue;
          if (cond.minEligible != null && args.eligibleTotal < Number(cond.minEligible)) continue;
          if (Array.isArray(cond.categoryIn) && !cond.categoryIn.includes(args.category)) continue;
          const then = (item as any).then ?? {};
          if (then.earnBps != null) earnBps = Number(then.earnBps);
          if (then.redeemLimitBps != null) redeemLimitBps = Number(then.redeemLimitBps);
        } catch {}
      }
    }
    return { earnBps, redeemLimitBps };
  }

  // Outlets
  async listOutlets(merchantId: string) {
    return this.prisma.outlet.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
  }
  async createOutlet(merchantId: string, name: string, address?: string) {
    await this.ensureMerchant(merchantId);
    return this.prisma.outlet.create({ data: { merchantId, name, address: address ?? null } });
  }
  async updateOutlet(merchantId: string, outletId: string, dto: UpdateOutletDto) {
    const out = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    if (!out || out.merchantId !== merchantId) throw new NotFoundException('Outlet not found');
    return this.prisma.outlet.update({ where: { id: outletId }, data: { name: dto.name ?? undefined, address: dto.address ?? undefined } });
  }
  async deleteOutlet(merchantId: string, outletId: string) {
    const out = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    if (!out || out.merchantId !== merchantId) throw new NotFoundException('Outlet not found');
    await this.prisma.outlet.delete({ where: { id: outletId } });
    return { ok: true };
  }

  // Devices
  async listDevices(merchantId: string) {
    return this.prisma.device.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
  }
  async createDevice(merchantId: string, type: string, outletId?: string, label?: string) {
    await this.ensureMerchant(merchantId);
    return this.prisma.device.create({ data: { merchantId, type: type as any, outletId: outletId ?? null, label: label ?? null } });
  }
  async updateDevice(merchantId: string, deviceId: string, dto: UpdateDeviceDto) {
    const dev = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!dev || dev.merchantId !== merchantId) throw new NotFoundException('Device not found');
    return this.prisma.device.update({ where: { id: deviceId }, data: { outletId: dto.outletId ?? undefined, label: dto.label ?? undefined } });
  }
  async deleteDevice(merchantId: string, deviceId: string) {
    const dev = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!dev || dev.merchantId !== merchantId) throw new NotFoundException('Device not found');
    await this.prisma.device.delete({ where: { id: deviceId } });
    return { ok: true };
  }

  async issueDeviceSecret(merchantId: string, deviceId: string) {
    const dev = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!dev || dev.merchantId !== merchantId) throw new NotFoundException('Device not found');
    const secret = this.randToken();
    await this.prisma.device.update({ where: { id: deviceId }, data: { bridgeSecret: secret } });
    return { secret };
  }
  async revokeDeviceSecret(merchantId: string, deviceId: string) {
    const dev = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!dev || dev.merchantId !== merchantId) throw new NotFoundException('Device not found');
    await this.prisma.device.update({ where: { id: deviceId }, data: { bridgeSecret: null } });
    return { ok: true };
  }

  // Staff
  async listStaff(merchantId: string) {
    return this.prisma.staff.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
  }
  async createStaff(merchantId: string, dto: { login?: string; email?: string; role?: string }) {
    await this.ensureMerchant(merchantId);
    return this.prisma.staff.create({ data: { merchantId, login: dto.login ?? null, email: dto.email ?? null, role: (dto.role as any) ?? 'CASHIER' } });
  }
  async updateStaff(merchantId: string, staffId: string, dto: UpdateStaffDto) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId) throw new NotFoundException('Staff not found');
    return this.prisma.staff.update({ where: { id: staffId }, data: { login: dto.login ?? undefined, email: dto.email ?? undefined, role: (dto.role as any) ?? undefined, status: dto.status ?? undefined, allowedOutletId: dto.allowedOutletId ?? undefined, allowedDeviceId: dto.allowedDeviceId ?? undefined } });
  }
  async deleteStaff(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId) throw new NotFoundException('Staff not found');
    await this.prisma.staff.delete({ where: { id: staffId } });
    return { ok: true };
  }

  private async ensureMerchant(merchantId: string) {
    await this.prisma.merchant.upsert({ where: { id: merchantId }, update: {}, create: { id: merchantId, name: merchantId } });
  }

  // Outbox monitor
  async listOutbox(merchantId: string, status?: string, limit = 50, type?: string, since?: string) {
    const where: any = { merchantId };
    if (status) where.status = status;
    if (type) where.eventType = type;
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) where.createdAt = { gte: d };
    }
    return this.prisma.eventOutbox.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
  }
  async retryOutbox(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({ where: { id: eventId } });
    if (!ev || ev.merchantId !== merchantId) throw new NotFoundException('Event not found');
    await this.prisma.eventOutbox.update({ where: { id: eventId }, data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null } });
    return { ok: true };
  }
  async getOutboxEvent(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({ where: { id: eventId } });
    if (!ev || ev.merchantId !== merchantId) throw new NotFoundException('Event not found');
    return ev;
  }
  async deleteOutbox(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({ where: { id: eventId } });
    if (!ev || ev.merchantId !== merchantId) throw new NotFoundException('Event not found');
    await this.prisma.eventOutbox.delete({ where: { id: eventId } });
    return { ok: true };
  }
  async retryAll(merchantId: string, status?: string) {
    const where: any = { merchantId };
    if (status) where.status = status;
    const updated = await this.prisma.eventOutbox.updateMany({ where, data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null } });
    return { ok: true, updated: updated.count };
  }

  async retrySince(merchantId: string, params: { status?: string; since?: string }) {
    const where: any = { merchantId };
    if (params.status) where.status = params.status;
    if (params.since) {
      const d = new Date(params.since);
      if (!isNaN(d.getTime())) where.createdAt = { gte: d };
    }
    const updated = await this.prisma.eventOutbox.updateMany({ where, data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null } });
    return { ok: true, updated: updated.count };
  }

  async exportOutboxCsv(merchantId: string, params: { status?: string; since?: string; type?: string; limit?: number }) {
    const limit = params.limit ? Math.min(Math.max(params.limit, 1), 5000) : 1000;
    const items = await this.listOutbox(merchantId, params.status, limit, params.type, params.since);
    const lines = [ 'id,eventType,status,retries,nextRetryAt,lastError,createdAt' ];
    for (const ev of items) {
      const row = [ ev.id, ev.eventType, ev.status, ev.retries, ev.nextRetryAt?ev.nextRetryAt.toISOString():'', ev.lastError||'', ev.createdAt.toISOString() ]
        .map(x => `"${String(x).replaceAll('"','""')}"`).join(',');
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  async pauseOutbox(merchantId: string, minutes?: number, untilISO?: string) {
    const until = untilISO ? new Date(untilISO) : new Date(Date.now() + (Math.max(1, minutes || 60) * 60 * 1000));
    await this.prisma.merchantSettings.update({ where: { merchantId }, data: { outboxPausedUntil: until, updatedAt: new Date() } });
    // Отложим текущие pending, чтобы worker их не схватил ранее
    await this.prisma.eventOutbox.updateMany({ where: { merchantId, status: 'PENDING' }, data: { nextRetryAt: until, lastError: 'Paused by merchant until ' + until.toISOString() } });
    return { ok: true, until: until.toISOString() };
  }
  async resumeOutbox(merchantId: string) {
    await this.prisma.merchantSettings.update({ where: { merchantId }, data: { outboxPausedUntil: null, updatedAt: new Date() } });
    await this.prisma.eventOutbox.updateMany({ where: { merchantId, status: 'PENDING' }, data: { nextRetryAt: new Date(), lastError: null } });
    return { ok: true };
  }

  async outboxStats(merchantId: string, since?: Date) {
    const base = { merchantId } as any;
    const where = since ? { ...base, createdAt: { gte: since } } : base;
    const statuses = ['PENDING','SENDING','FAILED','DEAD','SENT'];
    const counts: Record<string, number> = {};
    for (const st of statuses) {
      counts[st] = await this.prisma.eventOutbox.count({ where: { ...where, status: st } });
    }
    // by eventType counts (top)
    let typeCounts: Record<string, number> = {};
    try {
      const grouped = await (this.prisma as any).eventOutbox.groupBy({ by: ['eventType'], where, _count: { eventType: true } });
      for (const g of grouped) typeCounts[g.eventType] = (g._count?.eventType || 0);
    } catch {}
    const lastDead = await this.prisma.eventOutbox.findFirst({ where: { merchantId, status: 'DEAD' }, orderBy: { createdAt: 'desc' } });
    return { merchantId, since: since?.toISOString() || null, counts, typeCounts, lastDeadAt: lastDead?.createdAt?.toISOString?.() || null };
  }
  async listOutboxByOrder(merchantId: string, orderId: string, limit = 100) {
    const items = await this.prisma.eventOutbox.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' }, take: limit });
    return items.filter(i => {
      try { return (i.payload as any)?.orderId === orderId; } catch { return false; }
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
  async issueStaffToken(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId) throw new NotFoundException('Staff not found');
    const token = this.randToken();
    const hash = this.sha256(token);
    await this.prisma.staff.update({ where: { id: staffId }, data: { apiKeyHash: hash } });
    return { token };
  }
  async revokeStaffToken(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId) throw new NotFoundException('Staff not found');
    await this.prisma.staff.update({ where: { id: staffId }, data: { apiKeyHash: null } });
    return { ok: true };
  }

  async listTransactions(merchantId: string, params: { limit: number; before?: Date; type?: string; customerId?: string; outletId?: string; deviceId?: string; staffId?: string }) {
    const where: any = { merchantId };
    if (params.type) where.type = params.type as any;
    if (params.customerId) where.customerId = params.customerId;
    if (params.outletId) where.outletId = params.outletId;
    if (params.deviceId) where.deviceId = params.deviceId;
    if (params.staffId) where.staffId = params.staffId;
    if (params.before) where.createdAt = { lt: params.before };
    return this.prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' }, take: params.limit });
  }

  async listReceipts(merchantId: string, params: { limit: number; before?: Date; orderId?: string; customerId?: string }) {
    const where: any = { merchantId };
    if (params.orderId) where.orderId = params.orderId;
    if (params.customerId) where.customerId = params.customerId;
    if (params.before) where.createdAt = { lt: params.before };
    return this.prisma.receipt.findMany({ where, orderBy: { createdAt: 'desc' }, take: params.limit });
  }
  async getReceipt(merchantId: string, receiptId: string) {
    const r = await this.prisma.receipt.findUnique({ where: { id: receiptId } });
    if (!r || r.merchantId !== merchantId) throw new NotFoundException('Receipt not found');
    const tx = await this.prisma.transaction.findMany({ where: { merchantId, orderId: r.orderId }, orderBy: { createdAt: 'asc' } });
    return { receipt: r, transactions: tx };
  }

  // Ledger
  async listLedger(merchantId: string, params: { limit: number; before?: Date; customerId?: string; from?: Date; to?: Date; type?: string }) {
    const where: any = { merchantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.before) where.createdAt = { lt: params.before };
    if (params.from || params.to) {
      where.createdAt = Object.assign(where.createdAt || {}, params.from ? { gte: params.from } : {}, params.to ? { lte: params.to } : {});
    }
    if (params.type) {
      // приблизительное сопоставление по мета.type
      where.meta = { path: ['mode'], equals: params.type === 'earn' || params.type === 'redeem' ? params.type.toUpperCase() : 'REFUND' } as any;
    }
    return this.prisma.ledgerEntry.findMany({ where, orderBy: { createdAt: 'desc' }, take: params.limit });
  }

  async exportLedgerCsv(merchantId: string, params: { limit: number; before?: Date; customerId?: string; from?: Date; to?: Date; type?: string }) {
    const items = await this.listLedger(merchantId, params);
    const lines = [ 'id,customerId,debit,credit,amount,orderId,receiptId,createdAt,outletId,deviceId,staffId' ];
    for (const e of items) {
      const row = [ e.id, e.customerId||'', e.debit, e.credit, e.amount, e.orderId||'', e.receiptId||'', e.createdAt.toISOString(), e.outletId||'', e.deviceId||'', e.staffId||'' ]
        .map(x => `"${String(x).replaceAll('"','""')}"`).join(',');
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  // ===== TTL reconciliation (burn vs. expired lots) =====
  async ttlReconciliation(merchantId: string, cutoffISO: string) {
    const cutoff = new Date(cutoffISO);
    if (isNaN(cutoff.getTime())) throw new Error('Bad cutoff date');
    // expired lots (earnedAt < cutoff)
    const lots = await this.prisma.earnLot.findMany({ where: { merchantId, earnedAt: { lt: cutoff } } });
    const remainByCustomer = new Map<string, number>();
    for (const lot of lots) {
      const remain = Math.max(0, (lot.points || 0) - (lot.consumedPoints || 0));
      if (remain > 0) remainByCustomer.set(lot.customerId, (remainByCustomer.get(lot.customerId) || 0) + remain);
    }
    // burned from outbox events with matching cutoff
    const events = await this.prisma.eventOutbox.findMany({ where: { merchantId, eventType: 'loyalty.points_ttl.burned' } });
    const burnedByCustomer = new Map<string, number>();
    for (const ev of events) {
      try {
        const p: any = ev.payload as any;
        if (p && p.cutoff && String(p.cutoff) === cutoff.toISOString()) {
          const cid = String(p.customerId || '');
          const amt = Number(p.amount || 0);
          if (cid && amt > 0) burnedByCustomer.set(cid, (burnedByCustomer.get(cid) || 0) + amt);
        }
      } catch {}
    }
    const customers = new Set<string>([...remainByCustomer.keys(), ...burnedByCustomer.keys()]);
    const items = Array.from(customers).map((customerId) => ({
      customerId,
      expiredRemain: remainByCustomer.get(customerId) || 0,
      burned: burnedByCustomer.get(customerId) || 0,
      diff: (remainByCustomer.get(customerId) || 0) - (burnedByCustomer.get(customerId) || 0),
    }));
    const totals = items.reduce((acc, it) => ({ expiredRemain: acc.expiredRemain + it.expiredRemain, burned: acc.burned + it.burned, diff: acc.diff + it.diff }), { expiredRemain: 0, burned: 0, diff: 0 });
    return { merchantId, cutoff: cutoff.toISOString(), items, totals };
  }

  async exportTtlReconciliationCsv(merchantId: string, cutoffISO: string, onlyDiff = false) {
    const r = await this.ttlReconciliation(merchantId, cutoffISO);
    const lines = [ 'merchantId,cutoff,customerId,expiredRemain,burned,diff' ];
    const arr = onlyDiff ? r.items.filter(it => it.diff !== 0) : r.items;
    for (const it of arr) {
      const row = [ r.merchantId, r.cutoff, it.customerId, it.expiredRemain, it.burned, it.diff ]
        .map(x => `"${String(x).replaceAll('"','""')}"`).join(',');
      lines.push(row);
    }
    lines.push([r.merchantId, r.cutoff, 'TOTALS', r.totals.expiredRemain, r.totals.burned, r.totals.diff].map(x => `"${String(x).replaceAll('"','""')}"`).join(','));
    return lines.join('\n') + '\n';
  }

  // Earn lots (admin)
  async listEarnLots(merchantId: string, params: { limit: number; before?: Date; customerId?: string; activeOnly?: boolean }) {
    const where: any = { merchantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.before) where.createdAt = { lt: params.before };
    if (params.activeOnly) where.OR = [ { consumedPoints: null }, { consumedPoints: { lt: (undefined as any) } } ] as any; // prisma workaround placeholder
    return this.prisma.earnLot.findMany({ where, orderBy: { earnedAt: 'desc' }, take: params.limit });
  }
  async exportEarnLotsCsv(merchantId: string, params: { limit: number; before?: Date; customerId?: string; activeOnly?: boolean }) {
    const items = await this.listEarnLots(merchantId, params);
    const lines = [ 'id,customerId,points,consumedPoints,earnedAt,expiresAt,orderId,receiptId,outletId,deviceId,staffId' ];
    for (const e of items) {
      const row = [ e.id, e.customerId, e.points, e.consumedPoints||0, e.earnedAt.toISOString(), e.expiresAt?e.expiresAt.toISOString():'', e.orderId||'', e.receiptId||'', e.outletId||'', e.deviceId||'', e.staffId||'' ]
        .map(x => `"${String(x).replaceAll('"','""')}"`).join(',');
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  async getBalance(merchantId: string, customerId: string) {
    const w = await this.prisma.wallet.findFirst({ where: { merchantId, customerId, type: 'POINTS' as any } });
    return w?.balance ?? 0;
  }
  async findCustomerByPhone(merchantId: string, phone: string) {
    const c = await this.prisma.customer.findFirst({ where: { phone } });
    if (!c) return null;
    const bal = await this.getBalance(merchantId, c.id);
    return { customerId: c.id, phone: c.phone, balance: bal };
  }
}
