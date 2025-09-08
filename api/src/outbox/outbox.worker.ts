import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { createHmac } from 'crypto';
import { MetricsService } from '../metrics.service';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: any = null;
  private running = false;

  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  onModuleInit() {
    const intervalMs = Number(process.env.OUTBOX_INTERVAL_MS || '2000');
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    this.logger.log(`OutboxWorker started, interval=${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      // Возьмем немного событий для отправки
      const batch = await this.prisma.eventOutbox.findMany({
        where: { status: 'PENDING', OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      const pendingCount = await this.prisma.eventOutbox.count({ where: { status: 'PENDING' } });
      this.metrics.setGauge('loyalty_outbox_pending', pendingCount);
      for (const ev of batch) {
        // Попробуем атомарно пометить как SENDING, чтобы не схватить гонку в одном процессе
        const locked = await this.prisma.eventOutbox.updateMany({
          where: { id: ev.id, status: 'PENDING' },
          data: { status: 'SENDING' },
        });
        if (!locked.count) continue;

        try {
          const settings = await this.prisma.merchantSettings.findUnique({ where: { merchantId: ev.merchantId } });
          const url = settings?.webhookUrl;
          const secret = settings?.webhookSecret;
          if (!url || !secret) {
            throw new Error('Webhook not configured');
          }
          const body = JSON.stringify(ev.payload as any);
          const ts = Math.floor(Date.now() / 1000).toString();
          const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('base64');
          const r = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Loyalty-Signature': `v1,ts=${ts},sig=${sig}`,
              'X-Merchant-Id': ev.merchantId,
              'X-Signature-Timestamp': ts,
              'X-Event-Id': ev.id,
              ...(settings?.webhookKeyId ? { 'X-Signature-Key-Id': settings.webhookKeyId } : {}),
            },
            body,
          });
          if (r.ok) {
            await this.prisma.eventOutbox.update({ where: { id: ev.id }, data: { status: 'SENT', retries: ev.retries, lastError: null, nextRetryAt: null } });
            this.metrics.inc('loyalty_outbox_sent_total');
          } else {
            const errText = await r.text().catch(() => `${r.status} ${r.statusText}`);
            await this.failWithBackoff(ev.id, ev.retries, errText);
            this.metrics.inc('loyalty_outbox_failed_total');
          }
        } catch (e: any) {
          await this.failWithBackoff(ev.id, ev.retries, String(e?.message || e));
          this.metrics.inc('loyalty_outbox_failed_total');
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async failWithBackoff(id: string, retries: number, error: string) {
    const nextRetries = retries + 1;
    const maxRetries = Number(process.env.OUTBOX_MAX_RETRIES || '8');
    if (nextRetries >= maxRetries) {
      await this.prisma.eventOutbox.update({ where: { id }, data: { status: 'FAILED', retries: nextRetries, nextRetryAt: null, lastError: error } });
      return;
    }
    const next = this.nextRetryAt(nextRetries);
    await this.prisma.eventOutbox.update({ where: { id }, data: { status: 'PENDING', retries: nextRetries, nextRetryAt: next, lastError: error } });
  }

  private nextRetryAt(retry: number) {
    const base = 5000; // 5s
    const max = 10 * 60 * 1000; // 10m
    const backoff = Math.min(max, base * Math.pow(2, Math.max(0, retry - 1)));
    const jitter = Math.floor(Math.random() * 1000);
    return new Date(Date.now() + backoff + jitter);
  }
}
