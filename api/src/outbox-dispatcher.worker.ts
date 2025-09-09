import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';

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

  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  onModuleInit() {
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
      const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual' });
      if (res.ok) {
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'SENT', updatedAt: new Date(), lastError: null } });
        this.metrics.inc('loyalty_outbox_sent_total');
      } else {
        const text = await res.text().catch(() => '');
        const retries = row.retries + 1;
        if (retries >= maxRetries) {
          await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'DEAD', retries, nextRetryAt: null, lastError: `${res.status} ${res.statusText} ${text}` } });
          this.metrics.inc('loyalty_outbox_dead_total');
        } else {
          const next = new Date(Date.now() + this.backoffMs(row.retries));
          await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', retries, nextRetryAt: next, lastError: `${res.status} ${res.statusText} ${text}` } });
        }
        this.metrics.inc('loyalty_outbox_failed_total');
      }
    } catch (e: any) {
      const retries = row.retries + 1;
      if (retries >= maxRetries) {
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'DEAD', retries, nextRetryAt: null, lastError: String(e?.message || e) } });
        this.metrics.inc('loyalty_outbox_dead_total');
      } else {
        const next = new Date(Date.now() + this.backoffMs(row.retries));
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', retries, nextRetryAt: next, lastError: String(e?.message || e) } });
      }
      this.metrics.inc('loyalty_outbox_failed_total');
    }
  }

  private async tick() {
    if (this.running) return; this.running = true;
    try {
      this.lastTickAt = new Date();
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

      for (const row of items) {
        const claimed = await this.claim(row);
        if (!claimed) continue;
        await this.send(row);
      }
    } finally { this.running = false; }
  }
}
