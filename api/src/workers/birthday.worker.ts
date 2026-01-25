import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  BirthdayGreeting,
  LedgerAccount,
  Prisma,
  TxnType,
  WalletType,
} from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { MetricsService } from '../core/metrics/metrics.service';
import { PushService } from '../modules/notifications/push/push.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../shared/pg-lock.util';
import { getRulesSection } from '../shared/rules-json.util';
import { AppConfigService } from '../core/config/app-config.service';
import {
  DEFAULT_TIMEZONE_CODE,
  findTimezone,
  type RussiaTimezone,
} from '../shared/timezone/russia-timezones';
import { logIgnoredError } from '../shared/logging/ignore-error.util';

type BirthdayConfig = {
  enabled: boolean;
  daysBefore: number;
  onlyBuyers: boolean;
  text: string;
  giftPoints: number;
  giftTtlDays: number;
};

type MerchantConfig = {
  id: string;
  name: string | null;
  config: BirthdayConfig;
  timezone: RussiaTimezone;
};

type Candidate = {
  customerId: string;
  customerName: string | null;
  birthdayDate: Date;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const readErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint'
  ) {
    return String(error);
  }
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  return Object.prototype.toString.call(error) as string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BirthdayWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BirthdayWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;
  private readonly batchLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly push: PushService,
    private readonly config: AppConfigService,
  ) {
    const batchRaw =
      this.config.getNumber('BIRTHDAY_WORKER_BATCH_SIZE', 200) ?? 200;
    this.batchLimit = Math.max(1, Math.floor(batchRaw));
  }

  onModuleInit() {
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) {
      this.logger.log('BirthdayWorker disabled (WORKERS_ENABLED!=1)');
      return;
    }
    const rawInterval = this.config.getNumber('BIRTHDAY_WORKER_INTERVAL_MS');
    const intervalMs =
      typeof rawInterval === 'number' &&
      Number.isFinite(rawInterval) &&
      rawInterval > 0
        ? Math.max(60_000, rawInterval)
        : 6 * 60 * 60 * 1000; // 6 часов по умолчанию

    this.timer = setInterval(
      () =>
        this.tick().catch((err) =>
          logIgnoredError(err, 'BirthdayWorker tick', this.logger),
        ),
      intervalMs,
    );
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(
      `BirthdayWorker started, interval=${Math.round(intervalMs / 1000)}s`,
    );
    this.startedAt = new Date();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    this.lastTickAt = new Date();

    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:birthday');
    if (!lock.ok) {
      this.running = false;
      return;
    }

    try {
      const merchants = await this.loadMerchantConfigs();
      const now = new Date();
      for (const merchant of merchants) {
        const targetDate = this.startOfDayInTimezone(now, merchant.timezone);
        try {
          await this.resumePending(merchant, targetDate);
        } catch (error: unknown) {
          const message = readErrorMessage(error);
          this.logger.error(
            `Failed to resume pending greetings for merchant=${merchant.id}: ${message}`,
          );
        }
        try {
          await this.processMerchant(merchant, targetDate);
        } catch (error: unknown) {
          const message = readErrorMessage(error);
          this.logger.error(
            `Failed to process birthday greetings for merchant=${merchant.id}: ${message}`,
          );
        }
      }
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
      this.running = false;
    }
  }

  private async loadMerchantConfigs(): Promise<MerchantConfig[]> {
    const rows = await this.prisma.merchant.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        telegramBotEnabled: true,
        settings: { select: { rulesJson: true, timezone: true } },
      },
    });

    const result: MerchantConfig[] = [];
    for (const row of rows) {
      const config = this.parseConfig(row.settings?.rulesJson);
      if (!config) continue;
      if (!row.telegramBotEnabled) {
        this.logger.warn(
          `Skip merchant=${row.id}: birthday mechanic enabled but Telegram bot disabled`,
        );
        continue;
      }
      const timezone = findTimezone(
        row.settings?.timezone ?? DEFAULT_TIMEZONE_CODE,
      );
      result.push({ id: row.id, name: row.name ?? null, config, timezone });
    }
    return result;
  }

  private parseConfig(raw: unknown): BirthdayConfig | null {
    const birthday = getRulesSection(raw, 'birthday');
    if (!birthday) return null;

    const enabled = Boolean(birthday.enabled ?? false);
    if (!enabled) return null;

    const daysBefore = Math.max(
      0,
      Math.floor(Number(birthday.daysBefore ?? birthday.days ?? 5) || 5),
    );
    const onlyBuyers = Boolean(
      birthday.onlyBuyers ??
        birthday.buyersOnly ??
        birthday.onlyCustomers ??
        false,
    );
    const text = readString(birthday.text);
    const normalizedText =
      text && text.trim().length
        ? text.trim()
        : 'С днём рождения! Мы подготовили для вас подарок в любимой кофейне.';
    const giftPoints = Math.max(
      0,
      Math.floor(Number(birthday.giftPoints ?? 0) || 0),
    );
    const giftTtlDays = Math.max(
      0,
      Math.floor(Number(birthday.giftTtlDays ?? birthday.giftTtl ?? 0) || 0),
    );

    return {
      enabled,
      daysBefore,
      onlyBuyers,
      text: normalizedText,
      giftPoints,
      giftTtlDays,
    };
  }

  private toLocalDate(date: Date, timezone: RussiaTimezone): Date {
    const offsetMs = timezone.utcOffsetMinutes * 60 * 1000;
    return new Date(date.getTime() + offsetMs);
  }

  private startOfDayInTimezone(date: Date, timezone: RussiaTimezone): Date {
    const offsetMs = timezone.utcOffsetMinutes * 60 * 1000;
    const local = this.toLocalDate(date, timezone);
    local.setUTCHours(0, 0, 0, 0);
    return new Date(local.getTime() - offsetMs);
  }

  private startOfYearInTimezone(year: number, timezone: RussiaTimezone): Date {
    const offsetMs = timezone.utcOffsetMinutes * 60 * 1000;
    const local = new Date(Date.UTC(year, 0, 1));
    local.setUTCHours(0, 0, 0, 0);
    return new Date(local.getTime() - offsetMs);
  }

  private getLocalYear(date: Date, timezone: RussiaTimezone): number {
    return this.toLocalDate(date, timezone).getUTCFullYear();
  }

  private normalizeBirthdayDate(
    birthDate: Date,
    year: number,
    timezone: RussiaTimezone,
  ): Date | null {
    const month = birthDate.getMonth();
    const day = birthDate.getDate();
    const candidateLocal = new Date(Date.UTC(year, month, day));

    if (candidateLocal.getUTCMonth() !== month) {
      // Обработка 29 февраля — fallback на 28 февраля в невисокосные годы
      if (month === 1 && day === 29) {
        const fallbackLocal = new Date(Date.UTC(year, 1, 28));
        const offsetMs = timezone.utcOffsetMinutes * 60 * 1000;
        fallbackLocal.setUTCHours(0, 0, 0, 0);
        return new Date(fallbackLocal.getTime() - offsetMs);
      }
      return null;
    }

    const offsetMs = timezone.utcOffsetMinutes * 60 * 1000;
    candidateLocal.setUTCHours(0, 0, 0, 0);
    return new Date(candidateLocal.getTime() - offsetMs);
  }

  private resolveBirthdayEvent(
    birthDate: Date,
    config: BirthdayConfig,
    target: Date,
    timezone: RussiaTimezone,
  ): Date | null {
    const targetYear = this.getLocalYear(target, timezone);
    const years = [targetYear, targetYear + 1];
    for (const year of years) {
      const actual = this.normalizeBirthdayDate(birthDate, year, timezone);
      if (!actual) continue;
      const sendDate = this.startOfDayInTimezone(
        new Date(actual.getTime() - config.daysBefore * DAY_MS),
        timezone,
      );
      if (sendDate.getTime() === target.getTime()) {
        return actual;
      }
    }
    return null;
  }

  private applyPlaceholders(
    template: string,
    vars: { username: string; bonus: string },
  ): string {
    const name = vars.username || 'Уважаемый клиент';
    const bonus = vars.bonus || '';
    return template.replace(/%username%/gi, name).replace(/%bonus%/gi, bonus);
  }

  private async resumePending(merchant: MerchantConfig, target: Date) {
    const pending = await this.prisma.birthdayGreeting.findMany({
      where: {
        merchantId: merchant.id,
        customer: { erasedAt: null },
        status: { in: ['PENDING', 'FAILED'] },
        sentAt: null,
        sendDate: { lte: target },
      },
      orderBy: { createdAt: 'asc' },
      take: this.batchLimit,
    });

    for (const greeting of pending) {
      await this.sendGreeting(merchant, greeting);
    }
  }

  private async processMerchant(
    merchant: MerchantConfig,
    target: Date,
  ): Promise<void> {
    const candidates = await this.collectCandidates(merchant, target);
    if (!candidates.length) return;

    const candidateIds = Array.from(
      new Set(candidates.map((c) => c.customerId)),
    );
    const years = Array.from(
      new Set(
        candidates.map((c) =>
          this.getLocalYear(c.birthdayDate, merchant.timezone),
        ),
      ),
    );
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const existing = await this.prisma.birthdayGreeting.findMany({
      where: {
        merchantId: merchant.id,
        customer: { erasedAt: null },
        customerId: { in: candidateIds },
        birthdayDate: {
          gte: this.startOfYearInTimezone(minYear, merchant.timezone),
          lt: this.startOfYearInTimezone(maxYear + 1, merchant.timezone),
        },
      },
      select: { customerId: true, birthdayDate: true },
    });

    const existingKeys = new Set(
      existing.map(
        (item) =>
          `${item.customerId}|${this.getLocalYear(item.birthdayDate, merchant.timezone)}`,
      ),
    );

    const fresh = candidates.filter(
      (candidate) =>
        !existingKeys.has(
          `${candidate.customerId}|${this.getLocalYear(candidate.birthdayDate, merchant.timezone)}`,
        ),
    );

    if (!fresh.length) return;
    fresh.sort((a, b) => a.customerId.localeCompare(b.customerId));
    const queue = fresh.slice(0, this.batchLimit);

    for (const candidate of queue) {
      const { record, giftIssued } = await this.createGreeting(
        merchant,
        candidate,
        target,
      );
      if (!record) continue;
      this.metrics.inc('birthday_greetings_created_total', {
        merchantId: merchant.id,
      });
      if (giftIssued > 0) {
        this.metrics.inc(
          'birthday_points_issued_total',
          { merchantId: merchant.id },
          giftIssued,
        );
      }
      await this.sendGreeting(merchant, record);
    }
  }

  private async collectCandidates(
    merchant: MerchantConfig,
    target: Date,
  ): Promise<Candidate[]> {
    // Customer теперь per-merchant, поля напрямую
    const rows = await this.prisma.customer.findMany({
      where: {
        merchantId: merchant.id,
        erasedAt: null,
        tgId: { not: null },
        birthday: { not: null },
        accrualsBlocked: false,
      },
      select: {
        id: true,
        name: true,
        birthday: true,
      },
    });

    const candidates: Candidate[] = [];
    for (const row of rows) {
      if (!row.birthday) continue;
      const actual = this.resolveBirthdayEvent(
        row.birthday,
        merchant.config,
        target,
        merchant.timezone,
      );
      if (!actual) continue;
      candidates.push({
        customerId: row.id,
        customerName: row.name ?? null,
        birthdayDate: actual,
      });
    }

    if (!candidates.length) return [];

    if (!merchant.config.onlyBuyers) {
      return candidates;
    }

    const ids = Array.from(new Set(candidates.map((c) => c.customerId)));
    if (!ids.length) return [];

    const receipts = await this.prisma.receipt.findMany({
      where: {
        merchantId: merchant.id,
        customerId: { in: ids },
        total: { gt: 0 },
        canceledAt: null,
      },
      select: { customerId: true },
      distinct: ['customerId'],
    });
    const eligible = new Set(receipts.map((r) => r.customerId));

    return candidates.filter((candidate) => eligible.has(candidate.customerId));
  }

  private async createGreeting(
    merchant: MerchantConfig,
    candidate: Candidate,
    target: Date,
  ): Promise<{ record: BirthdayGreeting | null; giftIssued: number }> {
    const username =
      candidate.customerName || candidate.customerName || 'Уважаемый клиент';
    const giftIssued =
      merchant.config.giftPoints > 0 ? merchant.config.giftPoints : 0;
    const message = this.applyPlaceholders(merchant.config.text, {
      username: username.trim() || 'Уважаемый клиент',
      bonus: giftIssued > 0 ? String(giftIssued) : '',
    });
    const sendDate = new Date(target);
    const giftExpiresAt =
      merchant.config.giftTtlDays > 0
        ? new Date(Date.now() + merchant.config.giftTtlDays * DAY_MS)
        : null;

    try {
      const record = await this.prisma.$transaction(async (tx) => {
        let created = await tx.birthdayGreeting.create({
          data: {
            merchantId: merchant.id,
            customerId: candidate.customerId,
            sendDate,
            birthdayDate: candidate.birthdayDate,
            message,
            giftPoints: merchant.config.giftPoints,
            giftExpiresAt,
            status: 'PENDING',
          },
        });

        if (giftIssued > 0) {
          await tx.wallet.upsert({
            where: {
              customerId_merchantId_type: {
                customerId: candidate.customerId,
                merchantId: merchant.id,
                type: WalletType.POINTS,
              },
            },
            update: {
              balance: { increment: giftIssued },
            },
            create: {
              merchantId: merchant.id,
              customerId: candidate.customerId,
              type: WalletType.POINTS,
              balance: giftIssued,
            },
          });

          const transaction = await tx.transaction.create({
            data: {
              merchantId: merchant.id,
              customerId: candidate.customerId,
              type: TxnType.CAMPAIGN,
              amount: giftIssued,
              orderId: `birthday:${created.id}`,
              outletId: null,
              staffId: null,
            },
          });

          if (this.config.getBoolean('LEDGER_FEATURE', false)) {
            await tx.ledgerEntry.create({
              data: {
                merchantId: merchant.id,
                customerId: candidate.customerId,
                debit: LedgerAccount.MERCHANT_LIABILITY,
                credit: LedgerAccount.CUSTOMER_BALANCE,
                amount: giftIssued,
                orderId: `birthday:${created.id}`,
                meta: { mode: 'BIRTHDAY', greetingId: created.id },
              },
            });
            this.metrics.inc(
              'loyalty_ledger_entries_total',
              { type: 'earn', source: 'birthday' },
              1,
            );
            this.metrics.inc(
              'loyalty_ledger_amount_total',
              { type: 'earn', source: 'birthday' },
              giftIssued,
            );
          }

          if (this.config.getBoolean('EARN_LOTS_FEATURE', false)) {
            type EarnLotDelegate = {
              create: (args: Prisma.EarnLotCreateArgs) => Promise<unknown>;
            };
            const earnLot =
              (tx as unknown as { earnLot?: EarnLotDelegate }).earnLot ??
              (this.prisma as unknown as { earnLot?: EarnLotDelegate }).earnLot;
            if (earnLot) {
              await earnLot.create({
                data: {
                  merchantId: merchant.id,
                  customerId: candidate.customerId,
                  points: giftIssued,
                  consumedPoints: 0,
                  earnedAt: sendDate,
                  maturesAt: null,
                  expiresAt: giftExpiresAt,
                  orderId: `birthday:${created.id}`,
                  receiptId: null,
                  status: 'ACTIVE',
                },
              });
            }
          }

          created = await tx.birthdayGreeting.update({
            where: { id: created.id },
            data: {
              giftTransactionId: transaction.id,
              giftExpiresAt,
            },
          });
        }

        return created;
      });

      return { record, giftIssued };
    } catch (error: unknown) {
      const errorCode = isRecord(error) ? error.code : null;
      if (typeof errorCode === 'string' && errorCode === 'P2002') {
        this.logger.debug(
          `Birthday greeting already exists (merchant=${merchant.id}, customer=${candidate.customerId}, birthday=${candidate.birthdayDate.toISOString()})`,
        );
        return { record: null, giftIssued: 0 };
      }
      const message = readErrorMessage(error);
      this.logger.error(
        `Failed to create birthday greeting (merchant=${merchant.id}, customer=${candidate.customerId}): ${
          message
        }`,
      );
      return { record: null, giftIssued: 0 };
    }
  }

  private async sendGreeting(
    merchant: MerchantConfig,
    greeting: BirthdayGreeting,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: greeting.customerId,
        merchantId: merchant.id,
        erasedAt: null,
      },
      select: { id: true },
    });
    if (!customer) {
      await this.prisma.birthdayGreeting.update({
        where: { id: greeting.id },
        data: {
          status: 'FAILED',
          error: 'customer erased',
        },
      });
      this.metrics.inc('birthday_push_failed_total', {
        merchantId: merchant.id,
        reason: 'customer_erased',
      });
      return;
    }
    const body = greeting.message?.trim()
      ? greeting.message.trim()
      : 'С днём рождения! Мы подготовили для вас подарок.';

    try {
      const result = await this.push.sendPush({
        merchantId: merchant.id,
        customerId: greeting.customerId,
        title: '',
        body,
        type: 'CAMPAIGN',
        data: {
          type: 'BIRTHDAY',
          greetingId: greeting.id,
          birthdayDate: greeting.birthdayDate.toISOString(),
          giftPoints: String(greeting.giftPoints || 0),
        },
        priority: 'high',
      });

      if (result.sent > 0) {
        await this.prisma.birthdayGreeting.update({
          where: { id: greeting.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            error: null,
          },
        });
        this.metrics.inc(
          'birthday_push_sent_total',
          { merchantId: merchant.id },
          result.sent,
        );
      } else {
        await this.prisma.birthdayGreeting.update({
          where: { id: greeting.id },
          data: {
            status: 'FAILED',
            error: 'no recipients',
          },
        });
        this.metrics.inc('birthday_push_failed_total', {
          merchantId: merchant.id,
          reason: 'no_recipients',
        });
      }
    } catch (error: unknown) {
      const message = readErrorMessage(error);
      await this.prisma.birthdayGreeting.update({
        where: { id: greeting.id },
        data: {
          status: 'FAILED',
          error: message,
        },
      });
      this.metrics.inc('birthday_push_failed_total', {
        merchantId: merchant.id,
        reason: 'error',
      });
      this.logger.error(
        `Failed to send birthday greeting (merchant=${merchant.id}, greeting=${greeting.id}): ${message}`,
      );
    }
  }
}
