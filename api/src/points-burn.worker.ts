import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';
import { TxnType, LedgerAccount } from '@prisma/client';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from './pg-lock.util';

@Injectable()
export class PointsBurnWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PointsBurnWorker.name);
  private timer: any = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED === '0') {
      this.logger.log('Workers disabled (WORKERS_ENABLED=0)');
      return;
    }
    if (process.env.POINTS_TTL_BURN !== '1') {
      this.logger.log('POINTS_TTL_BURN disabled');
      return;
    }
    const intervalMs = Number(
      process.env.POINTS_TTL_BURN_INTERVAL_MS || 6 * 60 * 60 * 1000,
    );
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    try {
      if (this.timer && typeof this.timer.unref === 'function')
        this.timer.unref();
    } catch {}
    this.logger.log(`PointsBurnWorker started, interval=${intervalMs}ms`);
    this.startedAt = new Date();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:points_ttl_burn');
    if (!lock.ok) {
      this.running = false;
      return;
    }
    try {
      this.lastTickAt = new Date();
      if (process.env.EARN_LOTS_FEATURE !== '1') {
        this.logger.log('EARN_LOTS_FEATURE not enabled, skip TTL burn');
        return;
      }
      const settings = await this.prisma.merchantSettings.findMany({
        where: { pointsTtlDays: { not: null } },
      });
      const now = Date.now();
      for (const s of settings) {
        const days = (s as any).pointsTtlDays as number | null;
        if (!days || days <= 0) continue;
        const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
        const purchaseOnly = {
          orderId: { not: null },
          NOT: [
            { orderId: 'registration_bonus' },
            { orderId: { startsWith: 'birthday:' } },
            { orderId: { startsWith: 'auto_return:' } },
            { orderId: { startsWith: 'complimentary:' } },
          ],
        };
        // Выберем клиентов, у кого есть неиспользованные lot'ы до cutoff
        const lots = await this.prisma.earnLot.findMany({
          where: {
            merchantId: s.merchantId,
            status: 'ACTIVE',
            earnedAt: { lt: cutoff },
            ...purchaseOnly,
          },
        });
        const map = new Map<string, number>();
        for (const lot of lots) {
          const remain = Math.max(
            0,
            (lot.points || 0) - (lot.consumedPoints || 0),
          );
          if (remain > 0)
            map.set(lot.customerId, (map.get(lot.customerId) || 0) + remain);
        }
        for (const [customerId, burnReq] of map.entries()) {
          const burnedAmount = await this.prisma.$transaction(async (tx) => {
            // актуальный баланс кошелька
            const wallet = await tx.wallet.findFirst({
              where: {
                merchantId: s.merchantId,
                customerId,
                type: 'POINTS' as any,
              },
            });
            if (!wallet) return 0;
            const initialBurn = Math.min(wallet.balance || 0, burnReq);
            let toBurn = initialBurn;
            if (toBurn <= 0) return 0;
            // отмечаем lot'ы как «сгоревшие» (увеличиваем consumedPoints)
            const expLots = await tx.earnLot.findMany({
              where: {
                merchantId: s.merchantId,
                customerId,
                earnedAt: { lt: cutoff },
                ...purchaseOnly,
              },
              orderBy: { earnedAt: 'asc' },
            });
            for (const lot of expLots) {
              if (toBurn <= 0) break;
              const consumed = lot.consumedPoints || 0;
              const remain = Math.max(0, (lot.points || 0) - consumed);
              if (remain <= 0) continue;
              const take = Math.min(remain, toBurn);
              await tx.earnLot.update({
                where: { id: lot.id },
                data: { consumedPoints: consumed + take },
              });
              toBurn -= take;
            }
            const burnedByLots = Math.max(0, initialBurn - toBurn);
            // списываем из кошелька
            const fresh = await tx.wallet.findUnique({
              where: { id: wallet.id },
            });
            const burnAmount = Math.min(fresh?.balance || 0, burnedByLots);
            if (burnAmount <= 0) return 0;
            const newBal = Math.max(0, (fresh!.balance || 0) - burnAmount);
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: newBal },
            });
            await tx.transaction.create({
              data: {
                merchantId: s.merchantId,
                customerId,
                type: TxnType.ADJUST,
                amount: -burnAmount,
                orderId: undefined,
              },
            });
            if (process.env.LEDGER_FEATURE === '1') {
              await tx.ledgerEntry.create({
                data: {
                  merchantId: s.merchantId,
                  customerId,
                  debit: LedgerAccount.CUSTOMER_BALANCE,
                  credit: LedgerAccount.MERCHANT_LIABILITY,
                  amount: burnAmount,
                  meta: { mode: 'TTL_BURN' },
                },
              });
            }
            await tx.eventOutbox.create({
              data: {
                merchantId: s.merchantId,
                eventType: 'loyalty.points_ttl.burned',
                payload: {
                  merchantId: s.merchantId,
                  customerId,
                  cutoff: cutoff.toISOString(),
                  amount: burnAmount,
                  computedAt: new Date().toISOString(),
                  mode: 'lots',
                } as any,
              },
            });
            return burnAmount;
          });
          if (burnedAmount > 0) {
            this.metrics.inc('loyalty_points_ttl_burned_total');
            this.metrics.inc(
              'loyalty_points_ttl_burned_amount_total',
              {},
              burnedAmount,
            );
          }
        }
      }
    } finally {
      this.running = false;
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
