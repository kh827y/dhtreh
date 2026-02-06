import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { TelegramStaffNotificationsService } from './staff-notifications.service';
import {
  DEFAULT_TIMEZONE_CODE,
  findTimezone,
} from '../../shared/timezone/russia-timezones';
import { STAFF_DIGEST_LOCAL_HOUR } from './staff-digest.constants';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../../shared/pg-lock.util';
import { ensureRulesRoot, getRulesSection } from '../../shared/rules-json.util';
import { AppConfigService } from '../../core/config/app-config.service';

const toDateString = (value: Date) => {
  const y = value.getUTCFullYear();
  const m = `${value.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${value.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getLocalParts = (value: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  });
  const parts = formatter.formatToParts(value);
  const pick = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
  };
};

@Injectable()
export class TelegramStaffDigestWorker implements OnModuleInit {
  private readonly logger = new Logger(TelegramStaffDigestWorker.name);
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;
  public lastProgressAt: Date | null = null;
  public lastLockMissAt: Date | null = null;
  public lockMissCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffNotify: TelegramStaffNotificationsService,
    private readonly config: AppConfigService,
  ) {}

  onModuleInit() {
    this.startedAt = new Date();
  }

  @Cron('*/15 * * * *')
  async handleDailyDigest() {
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) return;
    if (this.running) return;
    this.running = true;
    this.lastTickAt = new Date();
    this.lastProgressAt = this.lastTickAt;
    const lock = await pgTryAdvisoryLock(
      this.prisma,
      'cron:telegram_staff_digest',
    );
    if (!lock.ok) {
      this.lockMissCount += 1;
      this.lastLockMissAt = new Date();
      this.running = false;
      return;
    }
    try {
      const merchants = await this.prisma.telegramStaffSubscriber.findMany({
        where: { isActive: true },
        select: { merchantId: true },
        distinct: ['merchantId'],
      });
      if (!merchants.length) return;
      const merchantIds = merchants
        .map((row) => row.merchantId)
        .filter((id): id is string => !!id);
      if (!merchantIds.length) return;
      const settingsRows = await this.prisma.merchantSettings.findMany({
        where: { merchantId: { in: merchantIds } },
        select: { merchantId: true, rulesJson: true, timezone: true },
      });
      const settingsMap = new Map(
        settingsRows.map((row) => [row.merchantId, row]),
      );
      const now = new Date();
      for (const row of merchants) {
        this.lastProgressAt = new Date();
        const merchantId = row.merchantId;
        if (!merchantId) continue;
        try {
          const settings = settingsMap.get(merchantId);
          const tz = findTimezone(settings?.timezone ?? DEFAULT_TIMEZONE_CODE);
          const localParts = getLocalParts(now, tz.iana);
          if (!localParts.year || !localParts.month || !localParts.day) {
            continue;
          }
          if (localParts.hour < STAFF_DIGEST_LOCAL_HOUR) continue;
          const localDate = `${localParts.year}-${String(
            localParts.month,
          ).padStart(2, '0')}-${String(localParts.day).padStart(2, '0')}`;
          const rules = ensureRulesRoot(settings?.rulesJson);
          const digestMeta = getRulesSection(rules, 'staffNotifyDigest') ?? {};
          const lastSentLocalDate =
            typeof digestMeta.lastSentLocalDate === 'string'
              ? digestMeta.lastSentLocalDate
              : null;
          if (lastSentLocalDate === localDate) continue;
          const targetLocal = new Date(
            Date.UTC(localParts.year, localParts.month - 1, localParts.day),
          );
          targetLocal.setUTCDate(targetLocal.getUTCDate() - 1);
          const isoDate = toDateString(targetLocal);
          await this.staffNotify.enqueueEvent(merchantId, {
            kind: 'DIGEST',
            date: isoDate,
          });
          this.lastProgressAt = new Date();
          digestMeta.lastSentLocalDate = localDate;
          digestMeta.lastSentAt = new Date().toISOString();
          rules.staffNotifyDigest = digestMeta;
          const rulesJson = rules as Prisma.InputJsonValue;
          await this.prisma.merchantSettings.upsert({
            where: { merchantId },
            create: { merchantId, rulesJson },
            update: { rulesJson },
          });
        } catch (error) {
          this.logger.debug(
            `Failed to enqueue daily digest for merchant=${merchantId}: ${error}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`handleDailyDigest failed: ${error}`);
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
      this.running = false;
    }
  }
}
