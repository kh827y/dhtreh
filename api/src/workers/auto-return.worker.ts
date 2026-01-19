import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  LedgerAccount,
  TxnType,
  WalletType,
  AutoReturnAttempt,
} from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { MetricsService } from '../core/metrics/metrics.service';
import { PushService } from '../modules/notifications/push/push.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../shared/pg-lock.util';

type AutoReturnConfig = {
  enabled: boolean;
  days: number;
  text: string;
  giftPoints: number;
  giftTtlDays: number;
  repeatEnabled: boolean;
  repeatDays: number;
};

type MerchantConfig = {
  id: string;
  name: string | null;
  config: AutoReturnConfig;
};

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AutoReturnWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoReturnWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;
  private readonly batchLimit = Math.max(
    1,
    Number(process.env.AUTO_RETURN_BATCH_SIZE || '200'),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED !== '1') {
      this.logger.log('AutoReturnWorker disabled (WORKERS_ENABLED!=1)');
      return;
    }
    const rawInterval = Number(process.env.AUTO_RETURN_WORKER_INTERVAL_MS);
    const intervalMs =
      Number.isFinite(rawInterval) && rawInterval > 0
        ? Math.max(60_000, rawInterval)
        : DAY_MS;
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.startedAt = new Date();
    this.logger.log(
      `AutoReturnWorker started, interval=${Math.round(intervalMs / 1000)}s`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:auto_return');
    if (!lock.ok) {
      this.running = false;
      return;
    }
    try {
      this.lastTickAt = new Date();
      const merchants = await this.loadActiveConfigs();
      for (const merchant of merchants) {
        await this.processMerchant(merchant).catch((error: unknown) => {
          this.logger.error(
            `Failed to process auto-return for merchant=${merchant.id}: ${this.formatErrorMessage(
              error,
            )}`,
          );
        });
      }
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
      this.running = false;
    }
  }

  private async loadActiveConfigs(): Promise<MerchantConfig[]> {
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
          `Skip merchant=${row.id}: auto-return enabled but Telegram bot disabled`,
        );
        continue;
      }
      result.push({ id: row.id, name: row.name, config });
    }
    return result;
  }

  private parseConfig(raw: unknown): AutoReturnConfig | null {
    const root = this.toRecord(raw);
    if (!root) return null;
    const autoReturn = this.toRecord(root.autoReturn);
    if (!autoReturn) return null;
    const enabled = this.asBoolean(autoReturn.enabled) ?? false;
    if (!enabled) return null;
    const daysValue =
      this.asNumber(autoReturn.days ?? autoReturn.thresholdDays) ?? 45;
    const days = Math.max(1, Math.floor(daysValue || 45));
    const textRaw =
      this.asString(autoReturn.text) ??
      'Мы скучаем! Возвращайтесь и получите бонусные баллы.';
    let giftPoints = Math.max(
      0,
      Math.floor(this.asNumber(autoReturn.giftPoints) ?? 0),
    );
    let giftTtlDays = Math.max(
      0,
      Math.floor(this.asNumber(autoReturn.giftTtlDays) ?? 0),
    );
    const giftEnabledFlag = this.asBoolean(autoReturn.giftEnabled);
    const giftBurnEnabledFlag = this.asBoolean(autoReturn.giftBurnEnabled);
    const giftEnabled =
      giftEnabledFlag !== null ? giftEnabledFlag : giftPoints > 0;
    const giftBurnEnabled =
      giftBurnEnabledFlag !== null ? giftBurnEnabledFlag : giftTtlDays > 0;
    if (!giftEnabled) {
      giftPoints = 0;
      giftTtlDays = 0;
    } else if (!giftBurnEnabled) {
      giftTtlDays = 0;
    }
    const repeatRaw = this.toRecord(autoReturn.repeat);
    const repeatValue =
      this.asNumber(
        repeatRaw?.days ?? autoReturn.repeatDays ?? autoReturn.repeatAfterDays,
      ) ?? 0;
    const repeatEnabledFlag = this.asBoolean(autoReturn.repeatEnabled);
    const repeatEnabled =
      repeatEnabledFlag !== null
        ? repeatEnabledFlag
        : (this.asBoolean(repeatRaw?.enabled) ?? repeatValue > 0);
    const repeatDays = repeatEnabled
      ? Math.max(1, Math.floor(repeatValue || 0))
      : 0;
    return {
      enabled: true,
      days,
      text: textRaw,
      giftPoints,
      giftTtlDays,
      repeatEnabled,
      repeatDays,
    };
  }

  private applyPlaceholders(
    template: string,
    vars: { username: string; bonus: string },
  ): string {
    const safeName = vars.username || 'Уважаемый клиент';
    const safeBonus = vars.bonus || '';
    return template
      .replace(/%username\|обращение_по_умолчанию%/gi, safeName)
      .replace(/%username%/gi, safeName)
      .replace(/%bonus%/gi, safeBonus);
  }

  private async processMerchant(merchant: MerchantConfig) {
    const { id: merchantId, config } = merchant;
    const now = new Date();
    const thresholdDate = new Date(now.getTime() - config.days * DAY_MS);

    const attempts = await this.prisma.autoReturnAttempt.findMany({
      where: { merchantId, customer: { erasedAt: null } },
      orderBy: { invitedAt: 'asc' },
    });

    const stateByCustomer = new Map<
      string,
      {
        attempts: AutoReturnAttempt[];
        active?: AutoReturnAttempt;
        maxAttempt: number;
      }
    >();

    for (const attempt of attempts) {
      const entry =
        stateByCustomer.get(attempt.customerId) ??
        ({ attempts: [], maxAttempt: 0 } as {
          attempts: AutoReturnAttempt[];
          active?: AutoReturnAttempt;
          maxAttempt: number;
        });
      entry.attempts.push(attempt);
      if (attempt.attemptNumber > entry.maxAttempt)
        entry.maxAttempt = attempt.attemptNumber;
      if (
        (attempt.status === 'PENDING' || attempt.status === 'SENT') &&
        (!entry.active ||
          attempt.attemptNumber > (entry.active?.attemptNumber ?? 0))
      ) {
        entry.active = attempt;
      }
      stateByCustomer.set(attempt.customerId, entry);
    }

    // Resume pending attempts
    const pendingAttempts = attempts.filter(
      (attempt) => attempt.status === 'PENDING',
    );
    for (const attempt of pendingAttempts) {
      await this.sendAttemptPush(merchant, attempt);
      const entry = stateByCustomer.get(attempt.customerId);
      if (entry && entry.active && entry.active.id === attempt.id) {
        entry.active =
          (await this.prisma.autoReturnAttempt.findUnique({
            where: { id: attempt.id },
          })) ?? undefined;
      }
    }

    // Refresh state after pending processing
    if (pendingAttempts.length) {
      const refreshed = await this.prisma.autoReturnAttempt.findMany({
        where: { merchantId, id: { in: pendingAttempts.map((a) => a.id) } },
      });
      for (const attempt of refreshed) {
        const entry = stateByCustomer.get(attempt.customerId);
        if (!entry) continue;
        const idx = entry.attempts.findIndex((a) => a.id === attempt.id);
        if (idx >= 0) entry.attempts[idx] = attempt;
        if (
          entry.active &&
          entry.active.id === attempt.id &&
          (attempt.status === 'SENT' || attempt.status === 'PENDING')
        ) {
          entry.active = attempt;
        } else if (entry.active && entry.active.id === attempt.id) {
          entry.active = undefined;
        }
      }
    }

    // Check for returns
    const activeAttempts = Array.from(stateByCustomer.values())
      .map((entry) => entry.active)
      .filter(
        (attempt): attempt is AutoReturnAttempt =>
          !!attempt && attempt.status === 'SENT',
      );

    for (const attempt of activeAttempts) {
      const purchase = await this.prisma.receipt.findFirst({
        where: {
          merchantId,
          customerId: attempt.customerId,
          createdAt: { gt: attempt.invitedAt },
          canceledAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      if (purchase) {
        await this.prisma.autoReturnAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'RETURNED',
            completedAt: purchase.createdAt,
            completionReason: 'purchase',
            lastError: null,
          },
        });
        this.metrics.inc('auto_return_completed_total', {
          merchantId,
          result: 'returned',
        });
        const entry = stateByCustomer.get(attempt.customerId);
        if (entry) {
          const idx = entry.attempts.findIndex((a) => a.id === attempt.id);
          if (idx >= 0)
            entry.attempts[idx] = {
              ...attempt,
              status: 'RETURNED',
              completedAt: purchase.createdAt,
              completionReason: 'purchase',
            };
          if (entry.active && entry.active.id === attempt.id) {
            entry.active = undefined;
          }
        }
      }
    }

    // Schedule repeats
    if (config.repeatEnabled && config.repeatDays > 0) {
      const repeatTargets = Array.from(stateByCustomer.entries())
        .map(([customerId, entry]) => ({ customerId, entry }))
        .filter(
          ({ entry }) =>
            entry.active &&
            entry.active.status === 'SENT' &&
            now.getTime() - entry.active.invitedAt.getTime() >=
              config.repeatDays * DAY_MS,
        );

      for (const { customerId, entry } of repeatTargets) {
        const active = entry.active!;
        // Ensure no purchase after attempt (should be handled already, but double-check)
        const recentPurchase = await this.prisma.receipt.findFirst({
          where: {
            merchantId,
            customerId,
            createdAt: { gt: active.invitedAt },
            canceledAt: null,
          },
          select: { id: true },
        });
        if (recentPurchase) continue;

        // Avoid creating duplicate repeat if newer attempt already exists
        const hasNewer = entry.attempts.some(
          (attempt) =>
            attempt.attemptNumber > active.attemptNumber &&
            attempt.lastPurchaseAt.getTime() ===
              active.lastPurchaseAt.getTime(),
        );
        if (hasNewer) continue;
        const hasRepeatForPurchase = entry.attempts.some(
          (attempt) =>
            attempt.lastPurchaseAt.getTime() ===
              active.lastPurchaseAt.getTime() &&
            attempt.completionReason === 'repeat_scheduled',
        );
        if (hasRepeatForPurchase) continue;

        await this.prisma.autoReturnAttempt.update({
          where: { id: active.id },
          data: {
            status: 'EXPIRED',
            completedAt: now,
            completionReason: 'repeat_scheduled',
          },
        });
        this.metrics.inc('auto_return_completed_total', {
          merchantId,
          result: 'expired',
        });

        const nextAttemptNumber = entry.maxAttempt + 1;
        const newAttempt = await this.createAttempt({
          merchant,
          customerId,
          lastPurchaseAt: active.lastPurchaseAt,
          attemptNumber: nextAttemptNumber,
          config,
          initial: false,
        });
        if (newAttempt) {
          entry.attempts.push(newAttempt);
          entry.maxAttempt = nextAttemptNumber;
          entry.active = newAttempt;
        } else {
          entry.active = undefined;
        }
      }
    }

    // Find inactive customers for initial attempts
    const inactiveRows: Array<{ customerId: string; lastPurchaseAt: Date }> =
      await this.prisma.$queryRaw<
        Array<{ customerId: string; lastPurchaseAt: Date }>
      >`
        SELECT r."customerId", MAX(r."createdAt") AS "lastPurchaseAt"
        FROM "Receipt" r
        JOIN "Customer" c
          ON c."id" = r."customerId"
         AND c."merchantId" = r."merchantId"
        WHERE r."merchantId" = ${merchantId}
          AND r."canceledAt" IS NULL
          AND c."erasedAt" IS NULL
        GROUP BY r."customerId"
        HAVING MAX(r."createdAt") <= ${thresholdDate}
        ORDER BY MAX(r."createdAt") ASC
        LIMIT ${this.batchLimit}
      `;

    for (const row of inactiveRows) {
      const entry = stateByCustomer.get(row.customerId);
      const hasActive =
        entry &&
        entry.active &&
        (entry.active.status === 'PENDING' || entry.active.status === 'SENT');
      if (hasActive) continue;
      const attemptsForPurchase = entry
        ? entry.attempts.filter(
            (attempt) =>
              attempt.lastPurchaseAt.getTime() === row.lastPurchaseAt.getTime(),
          )
        : [];
      const hasNonFailedAttempt = attemptsForPurchase.some(
        (attempt) => attempt.status !== 'FAILED',
      );
      if (hasNonFailedAttempt) continue;
      if (attemptsForPurchase.length >= 2) continue;

      const nextAttempt =
        entry && entry.maxAttempt > 0 ? entry.maxAttempt + 1 : 1;
      const attempt = await this.createAttempt({
        merchant,
        customerId: row.customerId,
        lastPurchaseAt: row.lastPurchaseAt,
        attemptNumber: nextAttempt,
        config,
        initial: true,
      });
      if (!attempt) continue;
      if (entry) {
        entry.attempts.push(attempt);
        entry.maxAttempt = nextAttempt;
        entry.active = attempt;
      } else {
        stateByCustomer.set(row.customerId, {
          attempts: [attempt],
          active: attempt,
          maxAttempt: nextAttempt,
        });
      }
    }
  }

  private async createAttempt(params: {
    merchant: MerchantConfig;
    customerId: string;
    lastPurchaseAt: Date;
    attemptNumber: number;
    config: AutoReturnConfig;
    initial: boolean;
  }): Promise<AutoReturnAttempt | null> {
    const { merchant, customerId, lastPurchaseAt, attemptNumber, config } =
      params;
    const merchantId = merchant.id;
    const invitedAt = new Date();

    // Customer теперь per-merchant модель, id = customerId
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, merchantId, erasedAt: null },
      select: { id: true, name: true, tgId: true, merchantId: true },
    });
    if (!customer || customer.merchantId !== merchantId || !customer.tgId) {
      this.logger.warn(
        `Skip auto-return attempt: merchantId=${merchantId}, customerId=${customerId}, reason=no_telegram`,
      );
      return null;
    }

    const username =
      (customer.name || 'Уважаемый клиент').trim() || 'Уважаемый клиент';
    const bonusValue = config.giftPoints > 0 ? String(config.giftPoints) : '';
    const message = this.applyPlaceholders(config.text, {
      username,
      bonus: bonusValue,
    });

    let created: AutoReturnAttempt;

    try {
      created = await this.prisma.$transaction((tx) =>
        tx.autoReturnAttempt.create({
          data: {
            merchantId,
            customerId,
            attemptNumber,
            lastPurchaseAt,
            invitedAt,
            message,
            status: 'PENDING',
            giftPoints: config.giftPoints,
            repeatAfterDays:
              config.repeatEnabled && config.repeatDays > 0
                ? config.repeatDays
                : null,
            giftExpiresAt: config.giftTtlDays
              ? new Date(invitedAt.getTime() + config.giftTtlDays * DAY_MS)
              : null,
          },
        }),
      );
    } catch (error: unknown) {
      const code = this.getErrorCode(error);
      if (code === 'P2002') {
        this.logger.warn(
          `Auto-return attempt already exists (merchant=${merchantId}, customer=${customerId}, attempt=${attemptNumber})`,
        );
        return null;
      }
      this.logger.error(
        `Failed to create auto-return attempt (merchant=${merchantId}, customer=${customerId}): ${this.formatErrorMessage(
          error,
        )}`,
      );
      return null;
    }

    this.metrics.inc(
      'auto_return_attempts_created_total',
      {
        merchantId,
        type: params.initial ? 'initial' : 'repeat',
      },
      1,
    );

    await this.sendAttemptPush(merchant, created);

    return (await this.prisma.autoReturnAttempt.findUnique({
      where: { id: created.id },
    })) as AutoReturnAttempt;
  }

  private async sendAttemptPush(
    merchant: MerchantConfig,
    attempt: AutoReturnAttempt,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: attempt.customerId,
        merchantId: merchant.id,
        erasedAt: null,
      },
      select: { id: true },
    });
    if (!customer) {
      await this.prisma.autoReturnAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'CANCELED',
          completedAt: new Date(),
          completionReason: 'customer_erased',
          lastError: 'customer erased',
        },
      });
      this.metrics.inc('auto_return_push_failed_total', {
        merchantId: merchant.id,
        reason: 'customer_erased',
      });
      return;
    }
    const pushText =
      attempt.message?.trim() || 'Возвращайтесь в нашу программу лояльности';
    const titleBase = pushText.length > 120 ? pushText.slice(0, 120) : pushText;
    try {
      const result = await this.push.sendPush({
        merchantId: merchant.id,
        customerId: attempt.customerId,
        title: titleBase,
        body: pushText,
        type: 'CAMPAIGN',
        data: {
          type: 'AUTO_RETURN',
          attemptId: attempt.id,
          attemptNumber: String(attempt.attemptNumber),
          giftPoints: String(attempt.giftPoints || 0),
        },
        priority: 'high',
      });
      if (result.sent > 0) {
        let giftTransactionId = attempt.giftTransactionId ?? null;
        let giftExpiresAt = attempt.giftExpiresAt ?? null;
        const giftPoints = Math.max(
          0,
          Math.floor(Number(attempt.giftPoints || 0)),
        );

        if (!giftTransactionId && giftPoints > 0) {
          const issued = await this.prisma.$transaction(async (tx) => {
            const fresh = await tx.autoReturnAttempt.findUnique({
              where: { id: attempt.id },
            });
            if (!fresh) {
              return {
                giftTransactionId: null,
                giftExpiresAt: null,
                issued: false,
              };
            }
            if (fresh.giftTransactionId) {
              return {
                giftTransactionId: fresh.giftTransactionId,
                giftExpiresAt: fresh.giftExpiresAt ?? null,
                issued: false,
              };
            }

            const expiresAt =
              fresh.giftExpiresAt ??
              (merchant.config.giftTtlDays
                ? new Date(
                    fresh.invitedAt.getTime() +
                      merchant.config.giftTtlDays * DAY_MS,
                  )
                : null);

            await tx.wallet.upsert({
              where: {
                customerId_merchantId_type: {
                  customerId: fresh.customerId,
                  merchantId: fresh.merchantId,
                  type: WalletType.POINTS,
                },
              },
              update: { balance: { increment: giftPoints } },
              create: {
                merchantId: fresh.merchantId,
                customerId: fresh.customerId,
                type: WalletType.POINTS,
                balance: giftPoints,
              },
            });

            const transaction = await tx.transaction.create({
              data: {
                merchantId: fresh.merchantId,
                customerId: fresh.customerId,
                type: TxnType.CAMPAIGN,
                amount: giftPoints,
                orderId: `auto_return:${fresh.id}`,
                outletId: null,
                staffId: null,
              },
            });

            if (process.env.LEDGER_FEATURE === '1') {
              await tx.ledgerEntry.create({
                data: {
                  merchantId: fresh.merchantId,
                  customerId: fresh.customerId,
                  debit: LedgerAccount.MERCHANT_LIABILITY,
                  credit: LedgerAccount.CUSTOMER_BALANCE,
                  amount: giftPoints,
                  orderId: `auto_return:${fresh.id}`,
                  meta: { mode: 'AUTO_RETURN', attemptId: fresh.id },
                },
              });
              this.metrics.inc('loyalty_ledger_entries_total', {
                type: 'earn',
                source: 'auto_return',
              });
              this.metrics.inc(
                'loyalty_ledger_amount_total',
                { type: 'earn', source: 'auto_return' },
                giftPoints,
              );
            }

            if (process.env.EARN_LOTS_FEATURE === '1') {
              await tx.earnLot.create({
                data: {
                  merchantId: fresh.merchantId,
                  customerId: fresh.customerId,
                  points: giftPoints,
                  consumedPoints: 0,
                  earnedAt: fresh.invitedAt,
                  maturesAt: null,
                  expiresAt,
                  orderId: `auto_return:${fresh.id}`,
                  receiptId: null,
                  status: 'ACTIVE',
                },
              });
            }

            await tx.autoReturnAttempt.update({
              where: { id: fresh.id },
              data: {
                giftTransactionId: transaction.id,
                giftExpiresAt: expiresAt,
              },
            });

            return {
              giftTransactionId: transaction.id,
              giftExpiresAt: expiresAt,
              issued: true,
            };
          });

          if (issued.issued) {
            giftTransactionId = issued.giftTransactionId;
            giftExpiresAt = issued.giftExpiresAt;
            this.metrics.inc(
              'auto_return_points_issued_total',
              { merchantId: merchant.id },
              giftPoints,
            );
          }
        }

        await this.prisma.autoReturnAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'SENT',
            lastError: null,
            giftTransactionId,
            giftExpiresAt,
          },
        });
        this.metrics.inc(
          'auto_return_push_sent_total',
          { merchantId: merchant.id },
          result.sent,
        );
      } else {
        await this.prisma.autoReturnAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            lastError: 'no recipients',
          },
        });
        this.metrics.inc('auto_return_push_failed_total', {
          merchantId: merchant.id,
          reason: 'no_recipients',
        });
      }
    } catch (error: unknown) {
      await this.prisma.autoReturnAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          lastError: this.formatErrorMessage(error),
        },
      });
      this.metrics.inc('auto_return_push_failed_total', {
        merchantId: merchant.id,
        reason: 'error',
      });
      this.logger.error(
        `Failed to send auto-return push (merchant=${merchant.id}, attempt=${attempt.id}): ${this.formatErrorMessage(
          error,
        )}`,
      );
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

  private getErrorCode(error: unknown): string | null {
    const record = this.toRecord(error);
    return record ? this.asString(record.code) : null;
  }

  private formatErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return 'unknown_error';
  }
}
