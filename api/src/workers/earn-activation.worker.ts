import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { MetricsService } from '../core/metrics/metrics.service';
import { LedgerAccount, TxnType, WalletType } from '@prisma/client';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from '../shared/pg-lock.util';

@Injectable()
export class EarnActivationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EarnActivationWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED !== '1') {
      this.logger.log('Workers disabled (WORKERS_ENABLED!=1)');
      return;
    }
    const intervalMs = Number(
      process.env.EARN_ACTIVATION_INTERVAL_MS || 15 * 60 * 1000,
    ); // каждые 15 минут
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    try {
      if (this.timer && typeof this.timer.unref === 'function')
        this.timer.unref();
    } catch {}
    this.logger.log(`EarnActivationWorker started, interval=${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:earn_activation');
    if (!lock.ok) {
      this.running = false;
      return;
    }
    try {
      const batchSize = Number(process.env.EARN_ACTIVATION_BATCH || 500);
      const maxAttempts = Math.max(
        1,
        Number(process.env.EARN_ACTIVATION_MAX_RETRIES || '5'),
      );
      const now = new Date();
      // Выбираем порцию PENDING лотов, срок которых наступил
      const lots = await this.prisma.earnLot.findMany({
        where: { status: 'PENDING', maturesAt: { lte: now } },
        orderBy: { maturesAt: 'asc' },
        take: batchSize,
      });
      if (lots.length === 0) return;

      for (const lot of lots) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Пере-выбор лота в транзакции для актуальности статуса
            const fresh = await tx.earnLot.findUnique({
              where: { id: lot.id },
            });
            if (
              !fresh ||
              fresh.status !== 'PENDING' ||
              !fresh.maturesAt ||
              fresh.maturesAt.getTime() > Date.now()
            )
              return;

            const points = Math.max(0, Number(fresh.points || 0));
            const consumedPoints = Math.max(
              0,
              Number(fresh.consumedPoints || 0),
            );
            const effectivePoints = Math.max(0, points - consumedPoints);
            if (fresh.expiresAt && fresh.expiresAt.getTime() <= Date.now()) {
              await tx.earnLot.update({
                where: { id: fresh.id },
                data: {
                  status: 'ACTIVE',
                  earnedAt: fresh.maturesAt,
                  consumedPoints: Math.max(points, consumedPoints),
                  activationAttempts: 0,
                  activationLastError: null,
                },
              });
              return;
            }
            if (effectivePoints <= 0) {
              await tx.earnLot.update({
                where: { id: fresh.id },
                data: {
                  status: 'ACTIVE',
                  earnedAt: fresh.maturesAt,
                  consumedPoints: Math.max(points, consumedPoints),
                  activationAttempts: 0,
                  activationLastError: null,
                },
              });
              return;
            }

            // Обновляем баланс кошелька (создаём при отсутствии)
            await tx.wallet.upsert({
              where: {
                customerId_merchantId_type: {
                  customerId: fresh.customerId,
                  merchantId: fresh.merchantId,
                  type: WalletType.POINTS,
                },
              },
              update: { balance: { increment: effectivePoints } },
              create: {
                merchantId: fresh.merchantId,
                customerId: fresh.customerId,
                type: WalletType.POINTS,
                balance: effectivePoints,
              },
            });

            // Обновляем статус лота на ACTIVE
            await tx.earnLot.update({
              where: { id: fresh.id },
              data: {
                status: 'ACTIVE',
                earnedAt: fresh.maturesAt,
                activationAttempts: 0,
                activationLastError: null,
              },
            });

            // Транзакция начисления (CAMPAIGN или EARN?) — считаем как EARN (отложенное начисление)
            await tx.transaction.create({
              data: {
                merchantId: fresh.merchantId,
                customerId: fresh.customerId,
                type: TxnType.EARN,
                amount: effectivePoints,
                orderId: fresh.orderId ?? undefined,
                outletId: fresh.outletId ?? undefined,
                staffId: fresh.staffId ?? undefined,
                // ВАЖНО: сохраняем порядок в истории — используем исходную дату лота
                createdAt: fresh.createdAt,
              },
            });

            if (process.env.LEDGER_FEATURE === '1') {
              await tx.ledgerEntry.create({
                data: {
                  merchantId: fresh.merchantId,
                  customerId: fresh.customerId,
                  debit: LedgerAccount.MERCHANT_LIABILITY,
                  credit: LedgerAccount.CUSTOMER_BALANCE,
                  amount: effectivePoints,
                  orderId: fresh.orderId ?? undefined,
                  outletId: fresh.outletId ?? undefined,
                  staffId: fresh.staffId ?? undefined,
                  meta: { mode: 'EARN', kind: 'DELAYED' },
                },
              });
            }

            await tx.eventOutbox.create({
              data: {
                merchantId: fresh.merchantId,
                eventType: 'loyalty.earn.activated',
                payload: {
                  merchantId: fresh.merchantId,
                  customerId: fresh.customerId,
                  points: effectivePoints,
                  earnLotId: fresh.id,
                  activatedAt: new Date().toISOString(),
                  outletId: fresh.outletId ?? null,
                },
              },
            });
            if (fresh.orderId === 'registration_bonus') {
              await tx.eventOutbox.create({
                data: {
                  merchantId: fresh.merchantId,
                  eventType: 'notify.registration_bonus',
                  payload: {
                    merchantId: fresh.merchantId,
                    customerId: fresh.customerId,
                    points: effectivePoints,
                  },
                },
              });
            }
          });
          try {
            this.metrics.inc('loyalty_delayed_earn_activated_total');
          } catch {}
        } catch (error: unknown) {
          const message =
            error && typeof error === 'object' && 'message' in error
              ? (error as { message?: unknown }).message
              : null;
          const rawMessage =
            typeof message === 'string' && message.trim()
              ? message
              : typeof error === 'string'
                ? error
                : 'Unknown error';
          const errorMessage =
            rawMessage.length > 500 ? rawMessage.slice(0, 500) : rawMessage;
          this.logger.error(
            `Failed to activate earn lot (id=${lot.id}): ${errorMessage}`,
          );
          try {
            const updated = await this.prisma.earnLot.updateMany({
              where: { id: lot.id, status: 'PENDING' },
              data: {
                activationAttempts: { increment: 1 },
                activationLastError: errorMessage || null,
              },
            });
            if (updated.count > 0) {
              const fresh = await this.prisma.earnLot.findUnique({
                where: { id: lot.id },
                select: { activationAttempts: true, status: true },
              });
              if (
                fresh?.status === 'PENDING' &&
                (fresh.activationAttempts ?? 0) >= maxAttempts
              ) {
                await this.prisma.earnLot.update({
                  where: { id: lot.id },
                  data: { status: 'FAILED' },
                });
              }
            }
          } catch {}
        }
      }
    } finally {
      this.running = false;
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
