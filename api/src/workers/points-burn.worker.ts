import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { MetricsService } from '../core/metrics/metrics.service';
import { TxnType, LedgerAccount, Prisma, WalletType } from '@prisma/client';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from '../shared/pg-lock.util';

@Injectable()
export class PointsBurnWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PointsBurnWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED !== '1') {
      this.logger.log('Workers disabled (WORKERS_ENABLED!=1)');
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
    let lock: { ok: boolean; key: [number, number] } | null = null;
    try {
      this.lastTickAt = new Date();
      lock = await pgTryAdvisoryLock(this.prisma, 'worker:points_ttl_burn');
      if (!lock.ok) return;
      if (process.env.EARN_LOTS_FEATURE !== '1') {
        this.logger.log('EARN_LOTS_FEATURE not enabled, skip TTL burn');
        return;
      }
      const settings = await this.prisma.merchantSettings.findMany({
        where: { pointsTtlDays: { not: null } },
      });
      const now = Date.now();
      for (const s of settings) {
        const days = s.pointsTtlDays;
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
        const conditions: Prisma.EarnLotWhereInput[] = [
          { expiresAt: { lte: new Date(now) } },
          {
            expiresAt: null,
            earnedAt: { lt: cutoff },
            ...purchaseOnly,
          },
        ];
        // Выберем клиентов, у кого есть неиспользованные lot'ы до cutoff
        const lots = await this.prisma.earnLot.findMany({
          where: {
            merchantId: s.merchantId,
            status: 'ACTIVE',
            OR: conditions,
          },
          select: {
            customerId: true,
            points: true,
            consumedPoints: true,
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
                type: WalletType.POINTS,
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
                status: 'ACTIVE',
                OR: conditions,
              },
              orderBy: { earnedAt: 'asc' },
              select: { id: true, points: true, consumedPoints: true },
            });
            const lotUpdates: Array<{ id: string; consumedPoints: number }> =
              [];
            for (const lot of expLots) {
              if (toBurn <= 0) break;
              const consumed = lot.consumedPoints || 0;
              const remain = Math.max(0, (lot.points || 0) - consumed);
              if (remain <= 0) continue;
              const take = Math.min(remain, toBurn);
              lotUpdates.push({ id: lot.id, consumedPoints: consumed + take });
              toBurn -= take;
            }
            const burnAmount = Math.max(0, initialBurn - toBurn);
            if (burnAmount <= 0) return 0;
            const updatedWallet = await tx.wallet.updateMany({
              where: { id: wallet.id, balance: { gte: burnAmount } },
              data: { balance: { decrement: burnAmount } },
            });
            if (!updatedWallet.count) return 0;
            for (const upd of lotUpdates) {
              await tx.earnLot.update({
                where: { id: upd.id },
                data: { consumedPoints: upd.consumedPoints },
              });
            }
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
                },
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
      if (lock?.ok) {
        await pgAdvisoryUnlock(this.prisma, lock.key);
      }
    }
  }
}
