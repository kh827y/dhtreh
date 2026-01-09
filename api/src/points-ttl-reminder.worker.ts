import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';
import { PushService } from './notifications/push/push.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from './pg-lock.util';

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
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED === '0') {
      this.logger.log('PointsTtlReminderWorker disabled (WORKERS_ENABLED=0)');
      return;
    }
    if (process.env.POINTS_TTL_REMINDER !== '1') {
      this.logger.log('POINTS_TTL_REMINDER flag disabled');
      return;
    }
    const rawInterval = Number(process.env.POINTS_TTL_REMINDER_INTERVAL_MS);
    const intervalMs =
      Number.isFinite(rawInterval) && rawInterval > 0
        ? Math.max(60_000, Math.floor(rawInterval))
        : 6 * 60 * 60 * 1000; // default 6h
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
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
    const lock = await pgTryAdvisoryLock(
      this.prisma,
      'worker:points_ttl_reminder',
    );
    if (!lock.ok) {
      this.running = false;
      return;
    }
    try {
      this.lastTickAt = new Date();
      try {
        this.metrics.setGauge(
          'loyalty_worker_last_tick_seconds',
          Math.floor(Date.now() / 1000),
          { worker: 'points_ttl_reminder' },
        );
      } catch {}
      const configs = await this.loadConfigs();
      for (const config of configs) {
        await this.processMerchant(config).catch((error) => {
          this.logger.error(
            `Failed to process TTL reminders for merchant=${config.merchantId}: ${
              error?.message || error
            }`,
          );
        });
      }
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
      this.running = false;
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
      const rules =
        settings.rulesJson && typeof settings.rulesJson === 'object'
          ? (settings.rulesJson as any)
          : null;
      const reminder =
        rules &&
        typeof rules === 'object' &&
        rules.burnReminder &&
        typeof rules.burnReminder === 'object'
          ? rules.burnReminder
          : null;
      if (!reminder || !reminder.enabled) continue;
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
        } catch {}
      } catch (error) {
        this.logger.error(
          `Failed to send TTL reminder for merchant=${config.merchantId}, customer=${reminder.customerId}: ${
            error?.message || error
          }`,
        );
        try {
          this.metrics.inc('loyalty_points_ttl_reminder_failed_total', {
            merchantId: config.merchantId,
          });
        } catch {}
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
    } catch {
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
          type: 'TTL_REMINDER',
          createdAt: { gte: since },
          data: {
            path: ['burnDate'],
            equals: burnDateIso,
          } as Prisma.JsonNullableFilter,
        },
        select: { id: true },
      });
      return Boolean(existing);
    } catch (error) {
      this.logger.warn(
        `Failed to check TTL reminder duplicates for merchant=${merchantId}, customer=${customerId}: ${
          error?.message || error
        }`,
      );
      return false;
    }
  }
}
