import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';
import { LedgerAccount, TxnType } from '@prisma/client';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from './pg-lock.util';

@Injectable()
export class EarnActivationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EarnActivationWorker.name);
  private timer: any = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED === '0') {
      this.logger.log('Workers disabled (WORKERS_ENABLED=0)');
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
            if (fresh.expiresAt && fresh.expiresAt.getTime() <= Date.now()) {
              await tx.earnLot.update({
                where: { id: fresh.id },
                data: {
                  status: 'ACTIVE',
                  earnedAt: fresh.maturesAt,
                  consumedPoints: points,
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
                  type: 'POINTS' as any,
                } as any,
              },
              update: { balance: { increment: points } },
              create: {
                merchantId: fresh.merchantId,
                customerId: fresh.customerId,
                type: 'POINTS' as any,
                balance: points,
              },
            } as any);

            // Обновляем статус лота на ACTIVE
            await tx.earnLot.update({
              where: { id: fresh.id },
              data: { status: 'ACTIVE', earnedAt: fresh.maturesAt },
            });

            // Транзакция начисления (CAMPAIGN или EARN?) — считаем как EARN (отложенное начисление)
            await tx.transaction.create({
              data: {
                merchantId: fresh.merchantId,
                customerId: fresh.customerId,
                type: TxnType.EARN,
                amount: points,
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
                  amount: points,
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
                  points,
                  earnLotId: fresh.id,
                  activatedAt: new Date().toISOString(),
                  outletId: fresh.outletId ?? null,
                } as any,
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
                    points,
                  },
                },
              });
            }
          });
          try {
            this.metrics.inc('loyalty_delayed_earn_activated_total');
          } catch {}
        } catch (error: any) {
          this.logger.error(
            `Failed to activate earn lot (id=${lot.id}): ${
              error?.message || error
            }`,
          );
        }
      }
    } finally {
      this.running = false;
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
