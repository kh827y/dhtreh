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
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';
import { PushService } from './notifications/push/push.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from './pg-lock.util';

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
    if (process.env.WORKERS_ENABLED === '0') {
      this.logger.log('AutoReturnWorker disabled (WORKERS_ENABLED=0)');
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
        await this.processMerchant(merchant).catch((error) => {
          this.logger.error(
            `Failed to process auto-return for merchant=${merchant.id}: ${
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

  private parseConfig(raw: any): AutoReturnConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const autoReturn =
      raw.autoReturn && typeof raw.autoReturn === 'object'
        ? raw.autoReturn
        : null;
    if (!autoReturn) return null;
    const enabled = Boolean(autoReturn.enabled ?? false);
    if (!enabled) return null;
    const days = Math.max(
      1,
      Math.floor(
        Number(autoReturn.days ?? autoReturn.thresholdDays ?? 45) || 45,
      ),
    );
    const textRaw =
      typeof autoReturn.text === 'string' && autoReturn.text.trim().length
        ? autoReturn.text.trim()
        : 'Мы скучаем! Возвращайтесь и получите бонусные баллы.';
    let giftPoints = Math.max(
      0,
      Math.floor(Number(autoReturn.giftPoints ?? 0) || 0),
    );
    let giftTtlDays = Math.max(
      0,
      Math.floor(Number(autoReturn.giftTtlDays ?? 0) || 0),
    );
    const giftEnabledFlag = autoReturn.giftEnabled;
    const giftBurnEnabledFlag = autoReturn.giftBurnEnabled;
    const giftEnabled =
      giftEnabledFlag !== undefined ? Boolean(giftEnabledFlag) : giftPoints > 0;
    const giftBurnEnabled =
      giftBurnEnabledFlag !== undefined
        ? Boolean(giftBurnEnabledFlag)
        : giftTtlDays > 0;
    if (!giftEnabled) {
      giftPoints = 0;
      giftTtlDays = 0;
    } else if (!giftBurnEnabled) {
      giftTtlDays = 0;
    }
    const repeatRaw =
      autoReturn.repeat && typeof autoReturn.repeat === 'object'
        ? autoReturn.repeat
        : null;
    const repeatValue =
      repeatRaw?.days ??
      autoReturn.repeatDays ??
      autoReturn.repeatAfterDays ??
      0;
    const repeatEnabledFlag = autoReturn.repeatEnabled;
    const repeatEnabled =
      repeatEnabledFlag !== undefined
        ? Boolean(repeatEnabledFlag)
        : Boolean(
            repeatRaw?.enabled ??
              (Number.isFinite(Number(repeatValue))
                ? Number(repeatValue) > 0
                : false),
          );
    const repeatDays = repeatEnabled
      ? Math.max(1, Math.floor(Number(repeatValue) || 0))
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
      where: { merchantId },
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

    // Resume pending attempts (with already credited points but push not sent)
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
        SELECT "customerId", MAX("createdAt") AS "lastPurchaseAt"
        FROM "Receipt"
        WHERE "merchantId" = ${merchantId}
        GROUP BY "customerId"
        HAVING MAX("createdAt") <= ${thresholdDate}
        ORDER BY MAX("createdAt") ASC
        LIMIT ${this.batchLimit}
      `;

    for (const row of inactiveRows) {
      const entry = stateByCustomer.get(row.customerId);
      const hasActive =
        entry &&
        entry.active &&
        (entry.active.status === 'PENDING' || entry.active.status === 'SENT');
      if (hasActive) continue;
      const alreadyAttempted =
        entry &&
        entry.attempts.some(
          (attempt) =>
            attempt.lastPurchaseAt.getTime() === row.lastPurchaseAt.getTime(),
        );
      if (alreadyAttempted) continue;

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
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
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

    let created: AutoReturnAttempt | null = null;
    let giftTransactionId: string | null = null;
    let giftExpiresAt: Date | null = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        created = await tx.autoReturnAttempt.create({
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
        });

        if (config.giftPoints > 0) {
          let wallet = await tx.wallet.findFirst({
            where: {
              merchantId,
              customerId,
              type: WalletType.POINTS,
            },
          });
          if (!wallet) {
            wallet = await tx.wallet.create({
              data: {
                merchantId,
                customerId,
                type: WalletType.POINTS,
                balance: 0,
              },
            });
          }
          const freshWallet = await tx.wallet.findUnique({
            where: { id: wallet.id },
          });
          const balance = (freshWallet?.balance || 0) + config.giftPoints;
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance },
          });

          const transaction = await tx.transaction.create({
            data: {
              merchantId,
              customerId,
              type: TxnType.CAMPAIGN,
              amount: config.giftPoints,
              orderId: `auto_return:${created.id}`,
              outletId: null,
              staffId: null,
            },
          });
          giftTransactionId = transaction.id;

          if (process.env.LEDGER_FEATURE === '1') {
            await tx.ledgerEntry.create({
              data: {
                merchantId,
                customerId,
                debit: LedgerAccount.MERCHANT_LIABILITY,
                credit: LedgerAccount.CUSTOMER_BALANCE,
                amount: config.giftPoints,
                orderId: `auto_return:${created.id}`,
                meta: { mode: 'AUTO_RETURN', attemptId: created.id },
              },
            });
            this.metrics.inc('loyalty_ledger_entries_total', {
              type: 'earn',
              source: 'auto_return',
            });
            this.metrics.inc(
              'loyalty_ledger_amount_total',
              { type: 'earn', source: 'auto_return' },
              config.giftPoints,
            );
          }

          if (process.env.EARN_LOTS_FEATURE === '1' && config.giftPoints > 0) {
            const earnLot = tx.earnLot ?? (this.prisma as any).earnLot;
            if (earnLot?.create) {
              const expiresAt = config.giftTtlDays
                ? new Date(invitedAt.getTime() + config.giftTtlDays * DAY_MS)
                : null;
              giftExpiresAt = expiresAt;
              await earnLot.create({
                data: {
                  merchantId,
                  customerId,
                  points: config.giftPoints,
                  consumedPoints: 0,
                  earnedAt: invitedAt,
                  maturesAt: null,
                  expiresAt,
                  orderId: `auto_return:${created.id}`,
                  receiptId: null,
                  status: 'ACTIVE',
                },
              });
            }
          }

          await tx.autoReturnAttempt.update({
            where: { id: created.id },
            data: {
              giftTransactionId,
              giftExpiresAt,
            },
          });
        }
      });
    } catch (error: any) {
      const code = error?.code;
      if (code === 'P2002') {
        this.logger.warn(
          `Auto-return attempt already exists (merchant=${merchantId}, customer=${customerId}, attempt=${attemptNumber})`,
        );
        return null;
      }
      this.logger.error(
        `Failed to create auto-return attempt (merchant=${merchantId}, customer=${customerId}): ${
          error?.message || error
        }`,
      );
      return null;
    }

    if (!created) return null;

    this.metrics.inc(
      'auto_return_attempts_created_total',
      {
        merchantId,
        type: params.initial ? 'initial' : 'repeat',
      },
      1,
    );
    if (config.giftPoints > 0) {
      this.metrics.inc(
        'auto_return_points_issued_total',
        { merchantId },
        config.giftPoints,
      );
    }

    const baseAttempt = created as AutoReturnAttempt;
    const attemptWithGift: AutoReturnAttempt = {
      ...baseAttempt,
      giftTransactionId:
        giftTransactionId ?? baseAttempt.giftTransactionId ?? null,
      giftExpiresAt: giftExpiresAt ?? baseAttempt.giftExpiresAt ?? null,
    };

    await this.sendAttemptPush(merchant, attemptWithGift);

    return (await this.prisma.autoReturnAttempt.findUnique({
      where: { id: attemptWithGift.id },
    })) as AutoReturnAttempt;
  }

  private async sendAttemptPush(
    merchant: MerchantConfig,
    attempt: AutoReturnAttempt,
  ) {
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
        await this.prisma.autoReturnAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'SENT',
            lastError: null,
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
    } catch (error: any) {
      await this.prisma.autoReturnAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          lastError: error?.message || String(error),
        },
      });
      this.metrics.inc('auto_return_push_failed_total', {
        merchantId: merchant.id,
        reason: 'error',
      });
      this.logger.error(
        `Failed to send auto-return push (merchant=${merchant.id}, attempt=${attempt.id}): ${
          error?.message || error
        }`,
      );
    }
  }
}
