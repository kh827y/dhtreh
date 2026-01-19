import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { MetricsService } from '../core/metrics/metrics.service';
import { PushService } from '../modules/notifications/push/push.service';
import { EmailService } from '../modules/notifications/email/email.service';
import { isSystemAllAudience } from '../modules/customer-audiences/audience.utils';
import {
  TelegramStaffNotificationsService,
  type StaffNotificationPayload,
} from '../modules/telegram/staff-notifications.service';
import type { EventOutbox } from '@prisma/client';

type OutboxRow = EventOutbox;

@Injectable()
export class NotificationDispatcherWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationDispatcherWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;
  private rpsDefault = 0; // 0 = unlimited
  private rpsByMerchant = new Map<string, number>();
  private rpsWindow = new Map<string, { startMs: number; count: number }>();

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private push: PushService,
    private email: EmailService,
    private staffNotify: TelegramStaffNotificationsService,
  ) {}

  private applyVars(tpl: string, vars: Record<string, unknown>): string {
    if (!tpl) return '';
    return tpl.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_m, key) => {
      const path = String(key).split('.');
      let cur: unknown = vars;
      for (const k of path) {
        const record = this.toRecord(cur);
        if (record && k in record) {
          cur = record[k];
        } else {
          cur = '';
          break;
        }
      }
      return this.stringifyValue(cur);
    });
  }

  private applyRegistrationTemplate(
    template: string,
    vars: { username: string; bonus: string },
  ): string {
    const name = vars.username || 'Уважаемый клиент';
    const bonus = vars.bonus || '';
    return template.replace(/%username%/gi, name).replace(/%bonus%/gi, bonus);
  }

  onModuleInit() {
    if (process.env.WORKERS_ENABLED !== '1') {
      this.logger.log('Workers disabled (WORKERS_ENABLED!=1)');
      return;
    }
    this.loadRpsConfig();
    const intervalMs = Number(process.env.NOTIFY_WORKER_INTERVAL_MS || '3000');
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    try {
      if (this.timer && typeof this.timer.unref === 'function')
        this.timer.unref();
    } catch {}
    this.logger.log(
      `NotificationDispatcherWorker started, interval=${intervalMs}ms`,
    );
    this.startedAt = new Date();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async claim(row: OutboxRow): Promise<boolean> {
    try {
      const r = await this.prisma.eventOutbox.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'SENDING', updatedAt: new Date() },
      });
      return r.count === 1;
    } catch {
      return false;
    }
  }

  private backoffMs(retries: number): number {
    const base = Number(process.env.NOTIFY_BACKOFF_BASE_MS || '60000');
    const cap = Number(process.env.NOTIFY_BACKOFF_CAP_MS || '3600000');
    const exp = Math.min(cap, base * Math.pow(2, Math.max(0, retries)));
    const jitter = exp * (0.9 + Math.random() * 0.2);
    return Math.floor(jitter);
  }

  private loadRpsConfig() {
    const d = Number(process.env.NOTIFY_RPS_DEFAULT || '0');
    this.rpsDefault = Number.isFinite(d) && d >= 0 ? d : 0;
    this.rpsByMerchant.clear();
    const raw = process.env.NOTIFY_RPS_BY_MERCHANT || '';
    for (const part of raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const [k, v] = part.split('=');
      const n = Number(v);
      if (k && Number.isFinite(n) && n >= 0) this.rpsByMerchant.set(k, n);
    }
  }

  private getRps(merchantId: string): number {
    return this.rpsByMerchant.get(merchantId) ?? this.rpsDefault;
  }

  private canPassRps(merchantId: string): boolean {
    const rps = this.getRps(merchantId);
    if (!rps || rps <= 0) return true; // unlimited
    const now = Date.now();
    const win = this.rpsWindow.get(merchantId) || { startMs: now, count: 0 };
    // If window older than 1s, reset
    if (now - win.startMs >= 1000) {
      win.startMs = now;
      win.count = 0;
    }
    if (win.count >= rps) return false;
    // reserve a slot
    win.count += 1;
    this.rpsWindow.set(merchantId, win);
    return true;
  }

  private async handle(row: OutboxRow) {
    const payload = this.toRecord(row.payload) ?? {};
    const type = row.eventType || '';
    const isTestEnv =
      process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
    try {
      if (type === 'notify.broadcast') {
        const dry = this.asBoolean(payload.dryRun) ?? false;
        if (dry) {
          await this.prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: 'SENT', lastError: 'dry-run' },
          });
          try {
            this.metrics.inc('notifications_processed_total', {
              type: 'broadcast',
              result: 'dry',
            });
          } catch {}
          return;
        }
        const ch = (this.asString(payload.channel) ?? 'ALL').toUpperCase();
        const merchantId =
          this.asString(payload.merchantId) ?? row.merchantId ?? '';
        // RPS throttle per merchant
        if (!this.canPassRps(merchantId)) {
          const delayMs = 1000; // retry next second window
          await this.prisma.eventOutbox.update({
            where: { id: row.id },
            data: {
              status: 'PENDING',
              nextRetryAt: new Date(Date.now() + delayMs),
              lastError: 'throttled',
            },
          });
          try {
            this.metrics.inc('notifications_processed_total', {
              type: 'broadcast',
              result: 'throttled',
            });
          } catch {}
          return;
        }
        const segmentId = this.asString(payload.segmentId) ?? undefined;
        const template = this.toRecord(payload.template) ?? {};
        const titleRaw = this.asString(template.subject) ?? '';
        const textRaw = this.asString(template.text) ?? '';
        const htmlRaw = this.asString(template.html) ?? '';
        const dataVars = this.toRecord(payload.variables) ?? {};
        const dispatchErrors: string[] = [];

        // derive recipients by segment if provided
        let customerIds: string[] = [];
        if (segmentId) {
          try {
            const segment = await this.prisma.customerSegment.findFirst({
              where: { id: segmentId, merchantId },
              select: { id: true, isSystem: true, systemKey: true },
            });
            if (segment && isSystemAllAudience(segment)) {
              const rows = await this.prisma.customerStats.findMany({
                where: { merchantId, customer: { erasedAt: null } },
                select: { customerId: true },
              });
              customerIds = rows.map((r) => r.customerId);
            } else {
              const rows = await this.prisma.segmentCustomer.findMany({
                where: { segmentId, customer: { erasedAt: null } },
                select: { customerId: true },
              });
              customerIds = rows.map((r) => r.customerId);
            }
          } catch {}
        }

        // Accumulators for per-channel metrics
        let pushAttempted = 0,
          pushSent = 0,
          pushFailed = 0;
        let emailAttempted = 0,
          emailSent = 0,
          emailFailed = 0;

        // PUSH
        if (ch === 'PUSH' || ch === 'ALL') {
          try {
            if (customerIds.length > 0) {
              const r = await this.push.sendPush({
                merchantId,
                customerIds,
                title: this.applyVars(titleRaw, dataVars) || 'Сообщение',
                body:
                  this.applyVars(textRaw, dataVars) || 'У вас новое сообщение',
                type: 'MARKETING',
                data: this.toStringRecord(dataVars),
              });
              pushAttempted += r.total ?? customerIds.length;
              pushSent += r.sent ?? 0;
              pushFailed +=
                r.failed ??
                Math.max(0, (r.total ?? customerIds.length) - (r.sent ?? 0));
            } else {
              const r = await this.push.sendToTopic(
                merchantId,
                this.applyVars(titleRaw, dataVars) || 'Сообщение',
                this.applyVars(textRaw, dataVars) || 'У вас новое сообщение',
                this.toStringRecord(dataVars),
              );
              pushAttempted += 1;
              pushSent += r.success ? 1 : 0;
              pushFailed += r.success ? 0 : 1;
            }
          } catch (error: unknown) {
            dispatchErrors.push(`push: ${this.formatErrorMessage(error)}`);
          }
        }

        // EMAIL (best-effort)
        if (ch === 'EMAIL' || ch === 'ALL') {
          try {
            if (customerIds.length > 0) {
              let emailCustomerIds = customerIds;
              try {
                const consentCount = await this.prisma.customerConsent.count({
                  where: { merchantId, channel: 'EMAIL' },
                });
                if (consentCount > 0) {
                  const consentRows =
                    await this.prisma.customerConsent.findMany({
                      where: {
                        merchantId,
                        channel: 'EMAIL',
                        status: 'GRANTED',
                        customerId: { in: customerIds },
                      },
                      select: { customerId: true },
                    });
                  emailCustomerIds = consentRows.map((row) => row.customerId);
                }
              } catch {}
              if (emailCustomerIds.length) {
                // Send basic campaign email one-by-one to avoid template mismatch
                const customers = await this.prisma.customer.findMany({
                  where: {
                    id: { in: emailCustomerIds },
                    email: { not: null },
                    erasedAt: null,
                  },
                  select: { id: true, email: true, name: true },
                });
                const merchant = await this.prisma.merchant.findUnique({
                  where: { id: merchantId },
                  select: { name: true },
                });
                for (const c of customers) {
                  emailAttempted += 1;
                  const ctx = {
                    ...dataVars,
                    customerName: c.name || 'Клиент',
                    merchantName: merchant?.name || 'Merchant',
                  };
                  const subj = this.applyVars(titleRaw, ctx) || 'Сообщение';
                  const content = this.applyVars(htmlRaw || textRaw, ctx) || '';
                  const ok = await this.email.sendEmail({
                    to: c.email!,
                    subject: subj,
                    template: 'campaign',
                    data: {
                      customerName: ctx.customerName,
                      merchantName: ctx.merchantName,
                      campaignName: subj,
                      content,
                    },
                    merchantId,
                  });
                  if (ok) emailSent += 1;
                  else emailFailed += 1;
                }
              }
            }
          } catch (error: unknown) {
            dispatchErrors.push(`email: ${this.formatErrorMessage(error)}`);
          }
        }
        // Metrics per channel
        try {
          if (pushAttempted)
            this.metrics.inc(
              'notifications_channel_attempts_total',
              { channel: 'PUSH', merchantId },
              pushAttempted,
            );
          if (pushSent)
            this.metrics.inc(
              'notifications_channel_sent_total',
              { channel: 'PUSH', merchantId },
              pushSent,
            );
          if (pushFailed)
            this.metrics.inc(
              'notifications_channel_failed_total',
              { channel: 'PUSH', merchantId },
              pushFailed,
            );
          if (emailAttempted)
            this.metrics.inc(
              'notifications_channel_attempts_total',
              { channel: 'EMAIL', merchantId },
              emailAttempted,
            );
          if (emailSent)
            this.metrics.inc(
              'notifications_channel_sent_total',
              { channel: 'EMAIL', merchantId },
              emailSent,
            );
          if (emailFailed)
            this.metrics.inc(
              'notifications_channel_failed_total',
              { channel: 'EMAIL', merchantId },
              emailFailed,
            );
        } catch {}

        if (dispatchErrors.length) {
          throw new Error(dispatchErrors.join('; '));
        }

        await this.prisma.eventOutbox.update({
          where: { id: row.id },
          data: { status: 'SENT', updatedAt: new Date(), lastError: null },
        });
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
                push: {
                  attempted: pushAttempted,
                  sent: pushSent,
                  failed: pushFailed,
                },
                email: {
                  attempted: emailAttempted,
                  sent: emailSent,
                  failed: emailFailed,
                },
              },
            },
          });
        } catch {}
        try {
          this.metrics.inc('notifications_processed_total', {
            type: 'broadcast',
            result: 'sent',
          });
        } catch {}
        return;
      }
      if (type === 'notify.registration_bonus') {
        const merchantId =
          this.asString(payload.merchantId) ?? row.merchantId ?? '';
        const customerId = this.asString(payload.customerId) ?? '';
        const pointsRaw = this.asNumber(payload.points) ?? 0;
        const points = Math.max(0, pointsRaw);
        if (!merchantId || !customerId) {
          throw new Error(
            'merchantId/customerId missing for notify.registration_bonus',
          );
        }
        if (!this.canPassRps(merchantId)) {
          const delayMs = 1000;
          await this.prisma.eventOutbox.update({
            where: { id: row.id },
            data: {
              status: 'PENDING',
              nextRetryAt: new Date(Date.now() + delayMs),
              lastError: 'throttled',
            },
          });
          try {
            this.metrics.inc('notifications_processed_total', {
              type: 'registration_bonus',
              result: 'throttled',
            });
          } catch {}
          return;
        }

        const settings = await this.prisma.merchantSettings.findUnique({
          where: { merchantId },
          select: { rulesJson: true },
        });
        const rules = this.toRecord(settings?.rulesJson);
        const registration = this.toRecord(rules?.registration);
        const pushEnabled = registration
          ? Object.prototype.hasOwnProperty.call(registration, 'pushEnabled')
            ? (this.asBoolean(registration.pushEnabled) ?? true)
            : true
          : false;
        const template = this.asString(registration?.text)?.trim() ?? '';
        if (!pushEnabled || !template) {
          await this.prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: 'SENT', lastError: 'disabled' },
          });
          try {
            this.metrics.inc('notifications_processed_total', {
              type: 'registration_bonus',
              result: 'skipped',
            });
          } catch {}
          return;
        }

        const customer = await this.prisma.customer.findFirst({
          where: { id: customerId, merchantId, erasedAt: null },
          select: { name: true },
        });
        if (!customer) {
          await this.prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: 'SENT', lastError: 'customer not found' },
          });
          return;
        }

        const merchant = await this.prisma.merchant.findUnique({
          where: { id: merchantId },
          select: { telegramBotEnabled: true },
        });
        if (!merchant?.telegramBotEnabled) {
          await this.prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: 'SENT', lastError: 'telegram disabled' },
          });
          return;
        }

        const bonusText = points.toLocaleString('ru-RU');
        const body = this.applyRegistrationTemplate(template, {
          username: customer.name?.trim() || '',
          bonus: bonusText,
        });
        await this.push.sendPush({
          merchantId,
          customerId,
          title: '',
          body,
          type: 'SYSTEM',
          data: {
            type: 'registration_bonus',
            amount: String(points),
          },
        });
        await this.prisma.eventOutbox.update({
          where: { id: row.id },
          data: { status: 'SENT', lastError: null },
        });
        try {
          this.metrics.inc('notifications_processed_total', {
            type: 'registration_bonus',
            result: 'sent',
          });
        } catch {}
        return;
      }
      if (type === 'notify.test') {
        const ch = (this.asString(payload.channel) ?? '').toUpperCase();
        const merchantId =
          this.asString(payload.merchantId) ?? row.merchantId ?? '';
        const to = this.asString(payload.to) ?? '';
        const template = this.toRecord(payload.template) ?? {};
        const subject = this.asString(template.subject) ?? 'Test';
        const text = this.asString(template.text) ?? 'Test message';
        const html = this.asString(template.html) ?? '';
        if (isTestEnv) {
          await this.prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: 'SENT', lastError: 'test-env' },
          });
          return;
        }
        if (ch === 'EMAIL') {
          await this.email.sendEmail({
            to,
            subject,
            template: 'campaign',
            data: {
              customerName: '',
              merchantName: '',
              campaignName: subject,
              content: html || text,
            },
            merchantId,
          });
        } else if (ch === 'PUSH') {
          await this.prisma.eventOutbox.update({
            where: { id: row.id },
            data: {
              status: 'FAILED',
              updatedAt: new Date(),
              lastError: 'push test not supported',
            },
          });
          try {
            this.metrics.inc('notifications_processed_total', {
              type: 'test',
              result: 'failed',
            });
          } catch {}
          return;
        }
        await this.prisma.eventOutbox.update({
          where: { id: row.id },
          data: { status: 'SENT', updatedAt: new Date(), lastError: null },
        });
        try {
          this.metrics.inc('notifications_processed_total', {
            type: 'test',
            result: 'sent',
          });
        } catch {}
        return;
      }
      if (type === 'notify.staff.telegram') {
        const merchantId =
          this.asString(payload.merchantId) ?? row.merchantId ?? '';
        if (!merchantId) {
          await this.prisma.eventOutbox.update({
            where: { id: row.id },
            data: { status: 'FAILED', lastError: 'merchantId missing' },
          });
          throw new Error('merchantId missing for notify.staff.telegram');
        }
        const staffPayload = payload as StaffNotificationPayload;
        const result = await this.staffNotify.dispatch(
          merchantId,
          staffPayload,
        );
        await this.prisma.eventOutbox.update({
          where: { id: row.id },
          data: { status: 'SENT', lastError: null },
        });
        try {
          this.metrics.inc('notifications_processed_total', {
            type: 'staff',
            result: result.delivered > 0 ? 'sent' : 'skipped',
          });
        } catch {}
        return;
      }
      // Unknown type -> acknowledge to avoid stuck
      await this.prisma.eventOutbox.update({
        where: { id: row.id },
        data: { status: 'SENT', lastError: 'unknown notify type' },
      });
    } catch (error: unknown) {
      const retries = row.retries + 1;
      const maxRetries = Number(process.env.NOTIFY_MAX_RETRIES || '8');
      if (retries >= maxRetries) {
        await this.prisma.eventOutbox.update({
          where: { id: row.id },
          data: {
            status: 'DEAD',
            retries,
            nextRetryAt: null,
            lastError: this.formatErrorMessage(error),
          },
        });
        try {
          this.metrics.inc('notifications_processed_total', {
            type: 'error',
            result: 'dead',
          });
        } catch {}
      } else {
        const next = new Date(Date.now() + this.backoffMs(row.retries));
        await this.prisma.eventOutbox.update({
          where: { id: row.id },
          data: {
            status: 'PENDING',
            retries,
            nextRetryAt: next,
            lastError: this.formatErrorMessage(error),
          },
        });
        try {
          this.metrics.inc('notifications_processed_total', {
            type: 'error',
            result: 'retry',
          });
        } catch {}
      }
    }
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      this.lastTickAt = new Date();
      try {
        this.metrics.setGauge(
          'loyalty_worker_last_tick_seconds',
          Math.floor(Date.now() / 1000),
          { worker: 'notify' },
        );
      } catch {}
      const now = new Date();
      const staleMs = Number(process.env.NOTIFY_SENDING_STALE_MS || '300000');
      if (Number.isFinite(staleMs) && staleMs > 0) {
        const staleBefore = new Date(Date.now() - staleMs);
        await this.prisma.eventOutbox.updateMany({
          where: {
            status: 'SENDING',
            eventType: { startsWith: 'notify.' },
            updatedAt: { lt: staleBefore },
          },
          data: {
            status: 'PENDING',
            updatedAt: new Date(),
            lastError: 'stale sending',
          },
        });
      }
      const batch = Number(process.env.NOTIFY_WORKER_BATCH || '10');
      const items = await this.prisma.eventOutbox.findMany({
        where: {
          status: 'PENDING',
          eventType: { startsWith: 'notify.' },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: batch,
      });
      for (const row of items) {
        const claimed = await this.claim(row);
        if (!claimed) continue;
        await this.handle(row);
      }
    } finally {
      this.running = false;
    }
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
    return null;
  }

  private asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private asBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (!trimmed) return null;
      if (['true', '1', 'yes', 'y', 'да', 'on'].includes(trimmed)) return true;
      if (['false', '0', 'no', 'n', 'нет', 'off'].includes(trimmed))
        return false;
    }
    return null;
  }

  private stringifyValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private toStringRecord(
    value: Record<string, unknown>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = this.stringifyValue(val);
    }
    return result;
  }

  private formatErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return 'unknown_error';
  }
}
