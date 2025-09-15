import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';
import { PushService } from './notifications/push/push.service';
import { SmsService } from './notifications/sms/sms.service';
import { EmailService } from './notifications/email/email.service';
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
export class NotificationDispatcherWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcherWorker.name);
  private timer: any = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private push: PushService,
    private sms: SmsService,
    private email: EmailService,
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED === '0') { this.logger.log('Workers disabled (WORKERS_ENABLED=0)'); return; }
    const intervalMs = Number(process.env.NOTIFY_WORKER_INTERVAL_MS || '15000');
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    this.logger.log(`NotificationDispatcherWorker started, interval=${intervalMs}ms`);
    this.startedAt = new Date();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async claim(row: OutboxRow): Promise<boolean> {
    try {
      const r = await this.prisma.eventOutbox.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'SENDING', updatedAt: new Date() },
      });
      return r.count === 1;
    } catch { return false; }
  }

  private backoffMs(retries: number): number {
    const base = Number(process.env.NOTIFY_BACKOFF_BASE_MS || '60000');
    const cap = Number(process.env.NOTIFY_BACKOFF_CAP_MS || '3600000');
    const exp = Math.min(cap, base * Math.pow(2, Math.max(0, retries)));
    const jitter = exp * (0.9 + Math.random() * 0.2);
    return Math.floor(jitter);
  }

  private async handle(row: OutboxRow) {
    const payload = (row.payload || {}) as any;
    const type = row.eventType || '';
    const isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
    try {
      if (type === 'notify.broadcast') {
        const dry = !!payload.dryRun;
        if (dry || isTestEnv) {
          await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'SENT', lastError: dry ? 'dry-run' : null } });
          try { this.metrics.inc('notifications_processed_total', { type: 'broadcast', result: 'dry' }); } catch {}
          return;
        }
        const ch = String(payload.channel || 'ALL').toUpperCase();
        const merchantId = String(payload.merchantId || row.merchantId || '');
        const segmentId: string | undefined = payload.segmentId || undefined;
        const template = payload.template || {};
        const title = String(template.subject || '');
        const bodyText = String(template.text || '');
        const html = String(template.html || '');
        const dataVars = payload.variables || {};

        // derive recipients by segment if provided
        let customerIds: string[] = [];
        if (segmentId) {
          try {
            const rows = await this.prisma.segmentCustomer.findMany({ where: { segmentId }, select: { customerId: true } });
            customerIds = rows.map(r => r.customerId);
          } catch {}
        }

        // Accumulators for per-channel metrics
        let pushAttempted = 0, pushSent = 0, pushFailed = 0;
        let smsAttempted = 0, smsSent = 0, smsFailed = 0;
        let emailAttempted = 0, emailSent = 0, emailFailed = 0;

        // PUSH
        if (ch === 'PUSH' || ch === 'ALL') {
          try {
            if (customerIds.length > 0) {
              const r = await this.push.sendPush({ merchantId, customerIds, title: title || 'Сообщение', body: bodyText || 'У вас новое сообщение', type: 'MARKETING', data: dataVars });
              pushAttempted += r.total ?? customerIds.length;
              pushSent += r.sent ?? 0;
              pushFailed += r.failed ?? Math.max(0, (r.total ?? customerIds.length) - (r.sent ?? 0));
            } else {
              const r = await this.push.sendToTopic(merchantId, title || 'Сообщение', bodyText || 'У вас новое сообщение', Object.fromEntries(Object.entries(dataVars).map(([k,v])=>[k,String(v)])));
              pushAttempted += 1; pushSent += r.success ? 1 : 0; pushFailed += r.success ? 0 : 1;
            }
          } catch {}
        }

        // SMS
        if (ch === 'SMS' || ch === 'ALL') {
          try {
            if (customerIds.length > 0) {
              const r = await this.sms.sendBulkNotification(merchantId, customerIds, bodyText || title || 'Сообщение');
              smsAttempted += r.total ?? customerIds.length;
              smsSent += r.sent ?? 0;
              smsFailed += r.failed ?? Math.max(0, (r.total ?? customerIds.length) - (r.sent ?? 0));
            }
          } catch {}
        }

        // EMAIL (best-effort)
        if (ch === 'EMAIL' || ch === 'ALL') {
          try {
            if (customerIds.length > 0) {
              // Send basic campaign email one-by-one to avoid template mismatch
              const customers = await this.prisma.customer.findMany({ where: { id: { in: customerIds }, email: { not: null } }, select: { id: true, email: true, name: true } });
              const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { name: true } });
              for (const c of customers) {
                emailAttempted += 1;
                const ok = await this.email.sendEmail({ to: c.email!, subject: title || 'Сообщение', template: 'campaign', data: { customerName: c.name || 'Клиент', merchantName: merchant?.name || 'Merchant', campaignName: title || 'Сообщение', content: html || bodyText || '' }, merchantId });
                if (ok) emailSent += 1; else emailFailed += 1;
              }
            }
          } catch {}
        }
        // Metrics per channel
        try {
          if (pushAttempted) this.metrics.inc('notifications_channel_attempts_total', { channel: 'PUSH' }, pushAttempted);
          if (pushSent) this.metrics.inc('notifications_channel_sent_total', { channel: 'PUSH' }, pushSent);
          if (pushFailed) this.metrics.inc('notifications_channel_failed_total', { channel: 'PUSH' }, pushFailed);
          if (smsAttempted) this.metrics.inc('notifications_channel_attempts_total', { channel: 'SMS' }, smsAttempted);
          if (smsSent) this.metrics.inc('notifications_channel_sent_total', { channel: 'SMS' }, smsSent);
          if (smsFailed) this.metrics.inc('notifications_channel_failed_total', { channel: 'SMS' }, smsFailed);
          if (emailAttempted) this.metrics.inc('notifications_channel_attempts_total', { channel: 'EMAIL' }, emailAttempted);
          if (emailSent) this.metrics.inc('notifications_channel_sent_total', { channel: 'EMAIL' }, emailSent);
          if (emailFailed) this.metrics.inc('notifications_channel_failed_total', { channel: 'EMAIL' }, emailFailed);
        } catch {}

        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'SENT', updatedAt: new Date(), lastError: null } });
        // Admin audit
        try {
          await this.prisma.adminAudit.create({
            data: {
              actor: 'system:notification-worker',
              method: 'WORKER',
              path: '/notifications/broadcast',
              merchantId,
              action: 'broadcast.sent',
              payload: {
                channel: ch,
                segmentId: segmentId || null,
                push: { attempted: pushAttempted, sent: pushSent, failed: pushFailed },
                sms: { attempted: smsAttempted, sent: smsSent, failed: smsFailed },
                email: { attempted: emailAttempted, sent: emailSent, failed: emailFailed },
              },
            },
          });
        } catch {}
        try { this.metrics.inc('notifications_processed_total', { type: 'broadcast', result: 'sent' }); } catch {}
        return;
      }
      if (type === 'notify.test') {
        const ch = String(payload.channel || '').toUpperCase();
        const merchantId = String(payload.merchantId || row.merchantId || '');
        const to = String(payload.to || '');
        const template = payload.template || {};
        const subject = String(template.subject || 'Test');
        const text = String(template.text || 'Test message');
        const html = String(template.html || '');
        if (isTestEnv) {
          await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'SENT', lastError: 'test-env' } });
          return;
        }
        if (ch === 'SMS') {
          await this.sms.sendNotification({ merchantId, phone: to, message: text || subject, type: 'MARKETING' });
        } else if (ch === 'EMAIL') {
          await this.email.sendEmail({ to, subject, template: 'campaign', data: { customerName: '', merchantName: '', campaignName: subject, content: html || text }, merchantId });
        } else if (ch === 'PUSH') {
          // No direct token send; mark as sent
        }
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'SENT', updatedAt: new Date(), lastError: null } });
        try { this.metrics.inc('notifications_processed_total', { type: 'test', result: 'sent' }); } catch {}
        return;
      }
      // Unknown type -> acknowledge to avoid stuck
      await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'SENT', lastError: 'unknown notify type' } });
    } catch (e: any) {
      const retries = row.retries + 1;
      const maxRetries = Number(process.env.NOTIFY_MAX_RETRIES || '8');
      if (retries >= maxRetries) {
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'DEAD', retries, nextRetryAt: null, lastError: String(e?.message || e) } });
        try { this.metrics.inc('notifications_processed_total', { type: 'error', result: 'dead' }); } catch {}
      } else {
        const next = new Date(Date.now() + this.backoffMs(row.retries));
        await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'PENDING', retries, nextRetryAt: next, lastError: String(e?.message || e) } });
        try { this.metrics.inc('notifications_processed_total', { type: 'error', result: 'retry' }); } catch {}
      }
    }
  }

  private async tick() {
    if (this.running) return; this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:notification_dispatcher');
    if (!lock.ok) { this.running = false; return; }
    try {
      this.lastTickAt = new Date();
      try { this.metrics.setGauge('loyalty_worker_last_tick_seconds', Math.floor(Date.now()/1000), { worker: 'notify' }); } catch {}
      const now = new Date();
      const batch = Number(process.env.NOTIFY_WORKER_BATCH || '10');
      const items = await this.prisma.eventOutbox.findMany({
        where: { status: 'PENDING', eventType: { startsWith: 'notify.' }, OR: [ { nextRetryAt: null }, { nextRetryAt: { lte: now } } ] },
        orderBy: { createdAt: 'asc' },
        take: batch,
      }) as unknown as OutboxRow[];
      for (const row of items) {
        const claimed = await this.claim(row);
        if (!claimed) continue;
        await this.handle(row);
      }
    } finally {
      this.running = false;
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
