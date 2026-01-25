import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { MetricsService } from '../core/metrics/metrics.service';
import { PushService } from '../modules/notifications/push/push.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../shared/pg-lock.util';
import { getRulesSection } from '../shared/rules-json.util';
import { AppConfigService } from '../core/config/app-config.service';
import { logIgnoredError } from '../shared/logging/ignore-error.util';
import { asRecord as asRecordShared } from '../shared/common/input.util';

type ReminderConfig = {
  merchantId: string;
  ttlDays: number;
  daysBefore: number;
  template: string;
};

type AggregatedReminder = {
  customerId: string;
  burnDate: Date;
  totalPoints: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TEMPLATE =
  'Баллы в размере %amount% сгорят %burn_date%. Успейте воспользоваться!';

@Injectable()
export class PointsTtlReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PointsTtlReminderWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly push: PushService,
    private readonly config: AppConfigService,
  ) {}

  private asRecord(value: unknown): Record<string, unknown> | null {
    return asRecordShared(value);
  }

  private toBool(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const lowered = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(lowered)) return true;
      if (['false', '0', 'no', 'off'].includes(lowered)) return false;
    }
    return fallback;
  }

  private formatErrorMessage(error: unknown): string {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? (error as { message?: unknown }).message
        : null;
    if (typeof message === 'string' && message.trim()) return message;
    return String(error);
  }

  onModuleInit() {
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) {
      this.logger.log('PointsTtlReminderWorker disabled (WORKERS_ENABLED!=1)');
      return;
    }
    if (!this.config.getBoolean('POINTS_TTL_REMINDER', false)) {
      this.logger.log('POINTS_TTL_REMINDER flag disabled');
      return;
    }
    const rawInterval = this.config.getNumber(
      'POINTS_TTL_REMINDER_INTERVAL_MS',
    );
    const intervalMs =
      typeof rawInterval === 'number' &&
      Number.isFinite(rawInterval) &&
      rawInterval > 0
        ? Math.max(60_000, Math.floor(rawInterval))
        : 6 * 60 * 60 * 1000; // default 6h
    this.timer = setInterval(
      () =>
        this.tick().catch((err) =>
          logIgnoredError(err, 'PointsTtlReminderWorker tick', this.logger),
        ),
      intervalMs,
    );
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.startedAt = new Date();
    this.logger.log(
      `PointsTtlReminderWorker started, interval=${Math.round(intervalMs / 1000)}s`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    let lock: { ok: boolean; key: [number, number] } | null = null;
    try {
      this.lastTickAt = new Date();
      try {
        this.metrics.setGauge(
          'loyalty_worker_last_tick_seconds',
          Math.floor(Date.now() / 1000),
          { worker: 'points_ttl_reminder' },
        );
      } catch (err) {
        logIgnoredError(
          err,
          'PointsTtlReminderWorker metrics',
          this.logger,
          'debug',
        );
      }
      lock = await pgTryAdvisoryLock(this.prisma, 'worker:points_ttl_reminder');
      if (!lock.ok) return;
      const configs = await this.loadConfigs();
      for (const config of configs) {
        await this.processMerchant(config).catch((error: unknown) => {
          const message = this.formatErrorMessage(error);
          this.logger.error(
            `Failed to process TTL reminders for merchant=${config.merchantId}: ${message}`,
          );
        });
      }
    } finally {
      this.running = false;
      if (lock?.ok) {
        await pgAdvisoryUnlock(this.prisma, lock.key);
      }
    }
  }

  private async loadConfigs(): Promise<ReminderConfig[]> {
    const merchants = await this.prisma.merchant.findMany({
      where: { archivedAt: null, telegramBotEnabled: true },
      select: {
        id: true,
        telegramBotEnabled: true,
        settings: {
          select: { pointsTtlDays: true, rulesJson: true },
        },
      },
    });
    const result: ReminderConfig[] = [];
    for (const merchant of merchants) {
      const settings = merchant.settings;
      if (!settings) continue;
      const ttlDaysRaw = Number(settings.pointsTtlDays ?? 0);
      const ttlDays =
        Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0
          ? Math.floor(ttlDaysRaw)
          : 0;
      const reminder = getRulesSection(settings.rulesJson, 'burnReminder');
      if (!reminder || !this.toBool(reminder.enabled, false)) continue;
      const daysBeforeRaw =
        reminder.daysBefore ?? reminder.days ?? reminder.daysBeforeBurn;
      const daysBefore = Math.max(
        1,
        Math.floor(Number(daysBeforeRaw ?? 0) || 0),
      );
      if (!Number.isFinite(daysBefore) || daysBefore <= 0) continue;
      const template =
        typeof reminder.text === 'string' && reminder.text.trim()
          ? reminder.text.trim()
          : DEFAULT_TEMPLATE;
      result.push({
        merchantId: merchant.id,
        ttlDays,
        daysBefore,
        template,
      });
    }
    return result;
  }

  private async processMerchant(config: ReminderConfig) {
    const now = new Date();
    const ttlMs = config.ttlDays > 0 ? config.ttlDays * DAY_MS : 0;
    const windowEnd = new Date(now.getTime() + config.daysBefore * DAY_MS);
    const lowerBound = ttlMs > 0 ? new Date(now.getTime() - ttlMs) : null;
    const upperBound = ttlMs > 0 ? new Date(windowEnd.getTime() - ttlMs) : null;

    const conditions: Prisma.EarnLotWhereInput[] = [
      { expiresAt: { gt: now, lte: windowEnd } },
    ];
    if (ttlMs > 0 && lowerBound && upperBound) {
      conditions.push({
        expiresAt: null,
        earnedAt: {
          gt: lowerBound,
          lte: upperBound,
        },
        orderId: { not: null },
        NOT: [
          { orderId: 'registration_bonus' },
          { orderId: { startsWith: 'birthday:' } },
          { orderId: { startsWith: 'auto_return:' } },
          { orderId: { startsWith: 'complimentary:' } },
        ],
      });
    }

    const lots = await this.prisma.earnLot.findMany({
      where: {
        merchantId: config.merchantId,
        status: 'ACTIVE',
        OR: conditions,
      },
      select: {
        customerId: true,
        points: true,
        consumedPoints: true,
        earnedAt: true,
        expiresAt: true,
      },
    });

    if (!lots.length) return;

    const reminders = this.aggregateLots(lots, ttlMs, now, windowEnd);
    if (!reminders.length) return;

    // Customer теперь per-merchant модель
    const customerIds = Array.from(new Set(reminders.map((r) => r.customerId)));
    const customers = await this.prisma.customer.findMany({
      where: {
        merchantId: config.merchantId,
        id: { in: customerIds },
      },
      select: { id: true, name: true, tgId: true },
    });
    const customerById = new Map(customers.map((c) => [c.id, c]));

    for (const reminder of reminders) {
      const customer = customerById.get(reminder.customerId);
      if (!customer?.tgId) continue; // нет миниаппы — нет push
      if (
        await this.isDuplicate(
          config.merchantId,
          reminder.customerId,
          reminder.burnDate,
        )
      ) {
        continue;
      }
      const username = customer.name?.trim() || '';
      const amountText = reminder.totalPoints.toLocaleString('ru-RU');
      const burnDateHuman = this.formatBurnDate(reminder.burnDate);
      const body = this.applyTemplate(config.template, {
        username,
        amount: amountText,
        burnDate: burnDateHuman,
      });
      const burnDateIso = reminder.burnDate.toISOString().slice(0, 10);
      try {
        await this.push.sendPush({
          merchantId: config.merchantId,
          customerId: reminder.customerId,
          customerIds: undefined,
          title: '',
          body,
          type: 'SYSTEM',
          data: {
            burnDate: burnDateIso,
            amount: String(reminder.totalPoints),
            type: 'ttl_reminder',
          },
        });
        try {
          this.metrics.inc('loyalty_points_ttl_reminder_sent_total', {
            merchantId: config.merchantId,
          });
        } catch (err) {
          logIgnoredError(
            err,
            'PointsTtlReminderWorker metrics',
            this.logger,
            'debug',
          );
        }
      } catch (error: unknown) {
        const message = this.formatErrorMessage(error);
        this.logger.error(
          `Failed to send TTL reminder for merchant=${config.merchantId}, customer=${reminder.customerId}: ${message}`,
        );
        try {
          this.metrics.inc('loyalty_points_ttl_reminder_failed_total', {
            merchantId: config.merchantId,
          });
        } catch (err) {
          logIgnoredError(
            err,
            'PointsTtlReminderWorker metrics',
            this.logger,
            'debug',
          );
        }
      }
    }
  }

  private aggregateLots(
    lots: Array<{
      customerId: string;
      points: number;
      consumedPoints: number;
      earnedAt: Date;
      expiresAt: Date | null;
    }>,
    ttlMs: number,
    now: Date,
    windowEnd: Date,
  ): AggregatedReminder[] {
    const map = new Map<string, AggregatedReminder>();
    for (const lot of lots) {
      const remaining = Math.max(0, lot.points - (lot.consumedPoints || 0));
      if (remaining <= 0) continue;
      const burnDate =
        lot.expiresAt ??
        (ttlMs > 0 ? new Date(lot.earnedAt.getTime() + ttlMs) : null);
      if (!burnDate) continue;
      if (burnDate <= now || burnDate > windowEnd) continue;
      const entry = map.get(lot.customerId);
      if (!entry) {
        map.set(lot.customerId, {
          customerId: lot.customerId,
          burnDate,
          totalPoints: remaining,
        });
      } else {
        if (burnDate.getTime() < entry.burnDate.getTime()) {
          entry.burnDate = burnDate;
          entry.totalPoints = remaining;
        } else if (burnDate.getTime() === entry.burnDate.getTime()) {
          entry.totalPoints += remaining;
        }
      }
    }
    return Array.from(map.values()).filter((r) => r.totalPoints > 0);
  }

  private applyTemplate(
    template: string,
    vars: { username: string; amount: string; burnDate: string },
  ): string {
    const safeName = vars.username?.trim()
      ? vars.username.trim()
      : 'Уважаемый клиент';
    return template
      .replace(/%username%/gi, safeName)
      .replace(/%amount%/gi, vars.amount)
      .replace(/%burn_date%/gi, vars.burnDate)
      .trim();
  }

  private formatBurnDate(date: Date): string {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date);
    } catch (err) {
      logIgnoredError(err, 'points-ttl format burn date', this.logger, 'debug');
      return date.toISOString().slice(0, 10);
    }
  }

  private async isDuplicate(
    merchantId: string,
    customerId: string,
    burnDate: Date,
  ): Promise<boolean> {
    try {
      const burnDateIso = burnDate.toISOString().slice(0, 10);
      const since = new Date(burnDate.getTime() - 30 * DAY_MS);
      const existing = await this.prisma.pushNotification.findFirst({
        where: {
          merchantId,
          customerId,
          createdAt: { gte: since },
          AND: [
            {
              data: {
                path: ['burnDate'],
                equals: burnDateIso,
              } as Prisma.JsonNullableFilter,
            },
            {
              OR: [
                { type: 'TTL_REMINDER' },
                {
                  data: {
                    path: ['type'],
                    equals: 'ttl_reminder',
                  } as Prisma.JsonNullableFilter,
                },
              ],
            },
          ],
        },
        select: { id: true },
      });
      return Boolean(existing);
    } catch (error: unknown) {
      const message = this.formatErrorMessage(error);
      this.logger.warn(
        `Failed to check TTL reminder duplicates for merchant=${merchantId}, customer=${customerId}: ${message}`,
      );
      return false;
    }
  }
}
