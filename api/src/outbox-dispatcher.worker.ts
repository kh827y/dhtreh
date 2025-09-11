import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from './pg-lock.util';

type OutboxRow = {
  id: string;
  merchantId: string;
  eventType: string;
  payload: any;
  status: string;
  retries: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

@Injectable()
export class OutboxDispatcherWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherWorker.name);
  private timer: any = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;
  private cb: Map<string, { fails: number; windowStart: number; openUntil: number }> = new Map();
  private parsedTypeConcurrency: Map<string, number> | null = null;
  private rpsByMerchantCache: Map<string, number> | null = null;
  private rateWin: Map<string, { windowStart: number; count: number }> = new Map();

  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED === '0') { this.logger.log('Workers disabled (WORKERS_ENABLED=0)'); return; }
    const intervalMs = Number(process.env.OUTBOX_WORKER_INTERVAL_MS || '15000');
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    this.logger.log(`OutboxDispatcherWorker started, interval=${intervalMs}ms`);
    this.startedAt = new Date();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private backoffMs(retries: number): number {
    const base = Number(process.env.OUTBOX_BACKOFF_BASE_MS || '60000'); // 60s
    const cap = Number(process.env.OUTBOX_BACKOFF_CAP_MS || '3600000'); // 1h
    const exp = Math.min(cap, base * Math.pow(2, Math.max(0, retries)));
    // немного джиттера ±10%
    const jitter = exp * (0.9 + Math.random() * 0.2);
    return Math.floor(jitter);
  }

  private isCircuitOpen(merchantId: string): boolean {
    const s = this.cb.get(merchantId);
    return !!s && s.openUntil > Date.now();
  }

  private noteFailure(merchantId: string) {
    const threshold = Math.max(1, Number(process.env.OUTBOX_CB_THRESHOLD || '5'));
    const windowMs = Math.max(1000, Number(process.env.OUTBOX_CB_WINDOW_MS || '60000'));
    const cooldownMs = Math.max(1000, Number(process.env.OUTBOX_CB_COOLDOWN_MS || '120000'));
    const now = Date.now();
    const s = this.cb.get(merchantId) || { fails: 0, windowStart: now, openUntil: 0 };
    if (now - s.windowStart > windowMs) { s.fails = 0; s.windowStart = now; }
    s.fails++;
    const wasClosed = !(s.openUntil > now);
    if (s.fails >= threshold) { s.openUntil = now + cooldownMs; s.fails = 0; s.windowStart = now; if (wasClosed) { this.onBreakerOpen(merchantId).catch(()=>{}); } }
    this.cb.set(merchantId, s);
  }

  private noteSuccess(merchantId: string) {
    const s = this.cb.get(merchantId);
    if (s) { s.fails = 0; s.windowStart = Date.now(); s.openUntil = 0; this.cb.set(merchantId, s); }
  }

  private nextRetryFromHeaders(res: Response, current: number): number {
    try {
      const ra = res.headers.get('retry-after');
      if (!ra) return current;
      const n = Number(ra);
      if (!isNaN(n) && n > 0) return Math.max(current, Date.now() + n * 1000);
      const d = new Date(ra).getTime();
      if (!isNaN(d) && d > Date.now()) return Math.max(current, d);
    } catch {}
    return current;
  }

  private parseTypeConcurrency(): Map<string, number> {
    if (this.parsedTypeConcurrency) return this.parsedTypeConcurrency;
    const m = new Map<string, number>();
    const raw = process.env.OUTBOX_EVENT_CONCURRENCY || '';
    for (const part of raw.split(',').map(s=>s.trim()).filter(Boolean)) {
      const i = part.indexOf('=');
      if (i <= 0) continue;
      const key = part.slice(0, i);
      const val = Math.max(1, parseInt(part.slice(i+1), 10) || 1);
      m.set(key, val);
    }
    this.parsedTypeConcurrency = m;
    return m;
  }

  private concurrencyForType(eventType: string): number {
    const map = this.parseTypeConcurrency();
    if (map.has(eventType)) return map.get(eventType)!;
    if (map.has('*')) return map.get('*')!;
    return Math.max(1, Number(process.env.OUTBOX_WORKER_CONCURRENCY || '3'));
  }

  private async onBreakerOpen(merchantId: string) {
    try {
      const mins = Number(process.env.OUTBOX_AUTO_PAUSE_MINS || '0');
      if (!mins || mins <= 0) return;
      const until = new Date(Date.now() + mins * 60 * 1000);
      await this.prisma.merchantSettings.update({ where: { merchantId }, data: { outboxPausedUntil: until } });
      this.logger.warn(`Outbox circuit opened for merchant=${merchantId}, auto-paused until ${until.toISOString()}`);
    } catch {}
  }

  private async claim(row: OutboxRow): Promise<boolean> {
    try {
      const r = await this.prisma.eventOutbox.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'SENDING', updatedAt: new Date() },
      });
      return r.count === 1;
    } catch { return false; }
  }

  private async send(row: OutboxRow) {
    const settings = await this.prisma.merchantSettings.findUnique({ where: { merchantId: row.merchantId } });
    const url = settings?.webhookUrl || '';
    const useNext = Boolean((settings as any)?.useWebhookNext) && !!(settings as any)?.webhookSecretNext;
    const secret = (useNext ? (settings as any)?.webhookSecretNext : settings?.webhookSecret) || '';
    const maxRetries = Number(process.env.OUTBOX_MAX_RETRIES || '10');
    const pausedUntil = (settings as any)?.outboxPausedUntil as Date | null;
    if (pausedUntil && pausedUntil > new Date()) {
      const next = pausedUntil;
      await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'PENDING', nextRetryAt: next, lastError: 'Paused by merchant until ' + next.toISOString() } });
      return;
    }
    if (!url || !secret) {
      // ничего не отправляем — парковка и лёгкий бэк‑офф
      const retries = row.retries + 1;
      if (retries >= maxRetries) {
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'DEAD', retries, nextRetryAt: null, lastError: 'Webhook not configured' } });
        this.metrics.inc('loyalty_outbox_dead_total');
      } else {
        const next = new Date(Date.now() + this.backoffMs(row.retries));
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'PENDING', retries, nextRetryAt: next, lastError: 'Webhook not configured' } });
      }
      return;
    }
    const body = JSON.stringify(row.payload ?? {});
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = require('crypto').createHmac('sha256', secret).update(`${ts}.${body}`).digest('base64');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Loyalty-Signature': `v1,ts=${ts},sig=${sig}`,
      'X-Merchant-Id': row.merchantId,
      'X-Signature-Timestamp': ts,
      'X-Event-Id': row.id,
    };
    const kid = useNext ? (settings as any)?.webhookKeyIdNext : settings?.webhookKeyId;
    if (kid) headers['X-Signature-Key-Id'] = kid as string;

    try {
      const timeoutMs = Number(process.env.OUTBOX_HTTP_TIMEOUT_MS || '10000');
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), Math.max(1000, timeoutMs));
      const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: ac.signal as any });
      clearTimeout(to);
      if (res.ok) {
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'SENT', updatedAt: new Date(), lastError: null } });
        this.metrics.inc('loyalty_outbox_sent_total');
        try { this.metrics.inc('loyalty_outbox_events_total', { type: row.eventType, result: 'sent' }); } catch {}
        this.noteSuccess(row.merchantId);
      } else {
        const text = await res.text().catch(() => '');
        const retries = row.retries + 1;
        if (retries >= maxRetries) {
          await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'DEAD', retries, nextRetryAt: null, lastError: `${res.status} ${res.statusText} ${text}` } });
          this.metrics.inc('loyalty_outbox_dead_total');
          try { this.metrics.inc('loyalty_outbox_events_total', { type: row.eventType, result: 'dead' }); } catch {}
        } else {
          let nextTime = Date.now() + this.backoffMs(row.retries);
          if (res.status === 429 || res.status === 503) {
            nextTime = this.nextRetryFromHeaders(res, nextTime);
          }
          const next = new Date(nextTime);
          await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', retries, nextRetryAt: next, lastError: `${res.status} ${res.statusText} ${text}` } });
          if (res.status >= 500 || res.status === 429) this.noteFailure(row.merchantId);
        }
        this.metrics.inc('loyalty_outbox_failed_total');
        try { this.metrics.inc('loyalty_outbox_events_total', { type: row.eventType, result: 'failed' }); } catch {}
      }
    } catch (e: any) {
      const retries = row.retries + 1;
      if (retries >= maxRetries) {
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'DEAD', retries, nextRetryAt: null, lastError: String(e?.message || e) } });
        this.metrics.inc('loyalty_outbox_dead_total');
        try { this.metrics.inc('loyalty_outbox_events_total', { type: row.eventType, result: 'dead' }); } catch {}
      } else {
        const next = new Date(Date.now() + this.backoffMs(row.retries));
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', retries, nextRetryAt: next, lastError: String(e?.message || e) } });
        this.noteFailure(row.merchantId);
      }
      this.metrics.inc('loyalty_outbox_failed_total');
      try { this.metrics.inc('loyalty_outbox_events_total', { type: row.eventType, result: 'failed' }); } catch {}
    }
  }

  private async tick() {
    if (this.running) return; this.running = true;
    // лидер-лок между инстансами
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:outbox_dispatcher');
    if (!lock.ok) { this.running = false; return; }
    try {
      this.lastTickAt = new Date();
      try { this.metrics.setGauge('loyalty_worker_last_tick_seconds', Math.floor(Date.now()/1000), { worker: 'outbox' }); } catch {}
      const now = new Date();
      // обновим gauge pending
      try {
        const pending = await this.prisma.eventOutbox.count({ where: { status: 'PENDING' } });
        this.metrics.setGauge('loyalty_outbox_pending', pending);
      } catch {}

      const batch = Number(process.env.OUTBOX_WORKER_BATCH || '10');
      const items = await this.prisma.eventOutbox.findMany({
        where: { status: 'PENDING', OR: [ { nextRetryAt: null }, { nextRetryAt: { lte: now } } ] },
        orderBy: { createdAt: 'asc' },
        take: batch,
      }) as unknown as OutboxRow[];

      const ready = items.filter(it => !this.isCircuitOpen(it.merchantId));
      const skipped = items.filter(it => this.isCircuitOpen(it.merchantId));
      for (const row of skipped) {
        try {
          const openUntil = this.cb.get(row.merchantId)?.openUntil || (Date.now() + 60000);
          await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'PENDING', nextRetryAt: new Date(openUntil), lastError: 'circuit open' } });
          try { this.metrics.inc('loyalty_outbox_events_total', { type: row.eventType, result: 'circuit_open' }); } catch {}
        } catch {}
      }
      // Group by eventType and apply per-type concurrency
      const byType = new Map<string, OutboxRow[]>();
      for (const r of ready) {
        const arr = byType.get(r.eventType) || [];
        arr.push(r); byType.set(r.eventType, arr);
      }
      for (const [type, arr] of byType.entries()) {
        const conc = this.concurrencyForType(type);
        for (let i = 0; i < arr.length; i += conc) {
          const slice = arr.slice(i, i + conc);
          await Promise.all(slice.map(async (row) => {
            // rate-limit per merchant
            if (this.rateLimited(row.merchantId)) {
              try {
                const ns = this.nextRateWindow(row.merchantId);
                await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'PENDING', nextRetryAt: new Date(ns), lastError: 'rate limited' } });
                this.metrics.inc('loyalty_outbox_rate_limited_total');
                try { this.metrics.inc('loyalty_outbox_events_total', { type: row.eventType, result: 'rate_limited' }); } catch {}
              } catch {}
              return;
            }
            const claimed = await this.claim(row);
            if (!claimed) return;
            await this.send(row);
            this.noteRate(row.merchantId);
          }));
        }
      }
      // export breaker open count as gauge
      try {
        const openCount = Array.from(this.cb.values()).filter(s => s.openUntil > Date.now()).length;
        this.metrics.setGauge('loyalty_outbox_circuit_open', openCount);
      } catch {}
    } finally { this.running = false; }
    await pgAdvisoryUnlock(this.prisma, lock.key);
  }

  private parseRpsByMerchant(): Map<string, number> {
    if (this.rpsByMerchantCache) return this.rpsByMerchantCache;
    const m = new Map<string, number>();
    const raw = process.env.OUTBOX_RPS_BY_MERCHANT || '';
    for (const part of raw.split(',').map(s=>s.trim()).filter(Boolean)) {
      const i = part.indexOf('=');
      if (i <= 0) continue;
      const key = part.slice(0, i);
      const val = Math.max(1, parseInt(part.slice(i+1), 10) || 1);
      m.set(key, val);
    }
    this.rpsByMerchantCache = m;
    return m;
  }

  private rpsForMerchant(merchantId: string): number {
    const map = this.parseRpsByMerchant();
    if (map.has(merchantId)) return map.get(merchantId)!;
    return Math.max(0, Number(process.env.OUTBOX_RPS_DEFAULT || '0')); // 0 = unlimited
  }

  private rateLimited(merchantId: string): boolean {
    const limit = this.rpsForMerchant(merchantId);
    if (!limit) return false;
    const now = Date.now();
    const s = this.rateWin.get(merchantId) || { windowStart: now, count: 0 };
    if (now - s.windowStart >= 1000) {
      s.windowStart = now;
      s.count = 0;
    }
    return s.count >= limit;
  }

  private nextRateWindow(merchantId: string): number {
    const s = this.rateWin.get(merchantId);
    const now = Date.now();
    if (!s) return now;
    const base = s.windowStart + 1000;
    const jitter = Math.floor(Math.random()*200);
    return Math.max(base, now + jitter);
  }

  private noteRate(merchantId: string) {
    const limit = this.rpsForMerchant(merchantId);
    if (!limit) return;
    const now = Date.now();
    const s = this.rateWin.get(merchantId) || { windowStart: now, count: 0 };
    if (now - s.windowStart >= 1000) { s.windowStart = now; s.count = 0; }
    s.count++;
    this.rateWin.set(merchantId, s);
  }
}
