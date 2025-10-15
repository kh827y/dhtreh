import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  BirthdayGreeting,
  LedgerAccount,
  TxnType,
  WalletType,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';
import { PushService } from './notifications/push/push.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from './pg-lock.util';

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
};

type Candidate = {
  customerId: string;
  merchantCustomerName: string | null;
  customerName: string | null;
  birthdayDate: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BirthdayWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BirthdayWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly batchLimit = Math.max(
    1,
    Number(process.env.BIRTHDAY_WORKER_BATCH_SIZE || '200'),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED === '0') {
      this.logger.log('BirthdayWorker disabled (WORKERS_ENABLED=0)');
      return;
    }
    const rawInterval = Number(process.env.BIRTHDAY_WORKER_INTERVAL_MS);
    const intervalMs =
      Number.isFinite(rawInterval) && rawInterval > 0
        ? Math.max(60_000, rawInterval)
        : 6 * 60 * 60 * 1000; // 6 часов по умолчанию

    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(
      `BirthdayWorker started, interval=${Math.round(intervalMs / 1000)}s`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;

    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:birthday');
    if (!lock.ok) {
      this.running = false;
      return;
    }

    try {
      const targetDate = this.startOfDay(new Date());
      const merchants = await this.loadMerchantConfigs();
      for (const merchant of merchants) {
        try {
          await this.resumePending(merchant, targetDate);
        } catch (error: any) {
          this.logger.error(
            `Failed to resume pending greetings for merchant=${merchant.id}: ${
              error?.message || error
            }`,
          );
        }
        try {
          await this.processMerchant(merchant, targetDate);
        } catch (error: any) {
          this.logger.error(
            `Failed to process birthday greetings for merchant=${merchant.id}: ${
              error?.message || error
            }`,
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
        settings: { select: { rulesJson: true } },
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
      result.push({ id: row.id, name: row.name ?? null, config });
    }
    return result;
  }

  private parseConfig(raw: any): BirthdayConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const birthday =
      raw.birthday && typeof raw.birthday === 'object' ? raw.birthday : null;
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
    const text =
      typeof birthday.text === 'string' && birthday.text.trim().length
        ? birthday.text.trim()
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
      text,
      giftPoints,
      giftTtlDays,
    };
  }

  private startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private normalizeBirthdayDate(birthDate: Date, year: number): Date | null {
    const month = birthDate.getMonth();
    const day = birthDate.getDate();
    const candidate = new Date(year, month, day);
    candidate.setHours(0, 0, 0, 0);

    if (candidate.getMonth() !== month) {
      // Обработка 29 февраля — fallback на 28 февраля в невисокосные годы
      if (month === 1 && day === 29) {
        const fallback = new Date(year, 1, 28);
        fallback.setHours(0, 0, 0, 0);
        return fallback;
      }
      return null;
    }

    return candidate;
  }

  private resolveBirthdayEvent(
    birthDate: Date,
    config: BirthdayConfig,
    target: Date,
  ): Date | null {
    const years = [target.getFullYear(), target.getFullYear() + 1];
    for (const year of years) {
      const actual = this.normalizeBirthdayDate(birthDate, year);
      if (!actual) continue;
      const sendDate = this.startOfDay(
        new Date(actual.getTime() - config.daysBefore * DAY_MS),
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
    return template
      .replace(/%username%/gi, name)
      .replace(/%bonus%/gi, bonus);
  }

  private async resumePending(merchant: MerchantConfig, target: Date) {
    const pending = await this.prisma.birthdayGreeting.findMany({
      where: {
        merchantId: merchant.id,
        status: { in: ['PENDING', 'FAILED'] },
        sentAt: null,
        sendDate: { lte: target },
      },
      orderBy: { createdAt: 'asc' },
      take: this.batchLimit,
    });

    for (const greeting of pending) {
      if (greeting.status === 'FAILED' && greeting.error === 'no recipients') {
        continue;
      }
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
    const candidateBirthdays = Array.from(
      new Set(candidates.map((c) => c.birthdayDate.toISOString())),
    ).map((iso) => new Date(iso));

    const existing = await this.prisma.birthdayGreeting.findMany({
      where: {
        merchantId: merchant.id,
        customerId: { in: candidateIds },
        birthdayDate: { in: candidateBirthdays },
      },
      select: { customerId: true, birthdayDate: true },
    });

    const existingKeys = new Set(
      existing.map(
        (item) =>
          `${item.customerId}|${this.startOfDay(item.birthdayDate).toISOString()}`,
      ),
    );

    const fresh = candidates.filter(
      (candidate) =>
        !existingKeys.has(
          `${candidate.customerId}|${candidate.birthdayDate.toISOString()}`,
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
    const rows = await this.prisma.merchantCustomer.findMany({
      where: {
        merchantId: merchant.id,
        tgId: { not: null },
        customer: { birthday: { not: null } },
      },
      select: {
        customerId: true,
        name: true,
        customer: { select: { birthday: true, name: true } },
      },
    });

    const candidates: Candidate[] = [];
    for (const row of rows) {
      const birthday = row.customer?.birthday;
      if (!birthday) continue;
      const actual = this.resolveBirthdayEvent(
        birthday,
        merchant.config,
        target,
      );
      if (!actual) continue;
      candidates.push({
        customerId: row.customerId,
        merchantCustomerName: row.name ?? null,
        customerName: row.customer?.name ?? null,
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
      },
      select: { customerId: true },
      distinct: ['customerId'],
    });
    const eligible = new Set(receipts.map((r) => r.customerId));

    return candidates.filter((candidate) =>
      eligible.has(candidate.customerId),
    );
  }

  private async createGreeting(
    merchant: MerchantConfig,
    candidate: Candidate,
    target: Date,
  ): Promise<{ record: BirthdayGreeting | null; giftIssued: number }> {
    const username =
      candidate.merchantCustomerName ||
      candidate.customerName ||
      'Уважаемый клиент';
    const giftIssued =
      merchant.config.giftPoints > 0 ? merchant.config.giftPoints : 0;
    const message = this.applyPlaceholders(merchant.config.text, {
      username: username.trim() || 'Уважаемый клиент',
      bonus: giftIssued > 0 ? String(giftIssued) : '',
    });
    const sendDate = this.startOfDay(target);
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

          if (process.env.LEDGER_FEATURE === '1') {
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

          if (process.env.EARN_LOTS_FEATURE === '1') {
            const earnLot = (tx as any).earnLot ?? (this.prisma as any).earnLot;
            if (earnLot?.create) {
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
    } catch (error: any) {
      if (error?.code === 'P2002') {
        this.logger.debug(
          `Birthday greeting already exists (merchant=${merchant.id}, customer=${candidate.customerId}, birthday=${candidate.birthdayDate.toISOString()})`,
        );
        return { record: null, giftIssued: 0 };
      }
      this.logger.error(
        `Failed to create birthday greeting (merchant=${merchant.id}, customer=${candidate.customerId}): ${
          error?.message || error
        }`,
      );
      return { record: null, giftIssued: 0 };
    }
  }

  private async sendGreeting(
    merchant: MerchantConfig,
    greeting: BirthdayGreeting,
  ) {
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
    } catch (error: any) {
      const message = error?.message ? String(error.message) : String(error);
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
