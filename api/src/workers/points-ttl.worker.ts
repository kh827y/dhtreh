import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, TxnType, WalletType } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { MetricsService } from '../core/metrics/metrics.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from '../shared/pg-lock.util';

@Injectable()
export class PointsTtlWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PointsTtlWorker.name);
  private timer: NodeJS.Timeout | null = null;
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
    if (process.env.POINTS_TTL_FEATURE !== '1') {
      this.logger.log('POINTS_TTL_FEATURE disabled');
      return;
    }
    const intervalMs = Number(
      process.env.POINTS_TTL_INTERVAL_MS || 6 * 60 * 60 * 1000,
    ); // каждые 6 часов
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    try {
      if (this.timer && typeof this.timer.unref === 'function')
        this.timer.unref();
    } catch {}
    this.logger.log(`PointsTtlWorker started, interval=${intervalMs}ms`);
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
      try {
        this.metrics.setGauge(
          'loyalty_worker_last_tick_seconds',
          Math.floor(Date.now() / 1000),
          { worker: 'points_ttl' },
        );
      } catch {}
      lock = await pgTryAdvisoryLock(this.prisma, 'worker:points_ttl_preview');
      if (!lock.ok) return;
      const merchants = await this.prisma.merchantSettings.findMany({
        where: { pointsTtlDays: { not: null } },
      });
      const now = Date.now();
      const lotBatchSize = Math.max(
        100,
        Number(process.env.POINTS_TTL_BATCH || '2000'),
      );
      const outboxBatchSize = Math.max(
        50,
        Number(process.env.POINTS_TTL_OUTBOX_BATCH || '500'),
      );
      for (const s of merchants) {
        const ttlDays = s.pointsTtlDays;
        if (!ttlDays || ttlDays <= 0) continue;
        const previewDate = new Date(now).toISOString().slice(0, 10);
        const existingKeys = new Set<string>();
        const outboxBatch: Prisma.EventOutboxCreateManyInput[] = [];
        const flushOutbox = async () => {
          if (!outboxBatch.length) return;
          const prisma = this.prisma as Partial<PrismaService>;
          const outbox = prisma.eventOutbox;
          if (outbox?.createMany) {
            await outbox.createMany({ data: outboxBatch });
          } else if (outbox?.create) {
            for (const row of outboxBatch) {
              await outbox.create({ data: row });
            }
          }
          outboxBatch.length = 0;
        };
        try {
          const existing = await this.prisma.eventOutbox.findMany({
            where: {
              merchantId: s.merchantId,
              eventType: 'loyalty.points_ttl.preview',
              payload: {
                path: ['previewDate'],
                equals: previewDate,
              } satisfies Prisma.JsonFilter,
            },
            select: { payload: true },
          });
          for (const row of existing) {
            const payload = this.toRecord(row.payload);
            const customerId = this.asString(payload?.customerId);
            const mode = this.asString(payload?.mode);
            const ttl = this.asNumber(payload?.ttlDays);
            if (customerId && ttl != null) {
              existingKeys.add(
                `${customerId}|${String(ttl)}|${String(mode)}|${previewDate}`,
              );
            }
          }
        } catch {}
        const cutoff = new Date(now - ttlDays * 24 * 60 * 60 * 1000);
        const purchaseOnly = {
          orderId: { not: null },
          NOT: [
            { orderId: 'registration_bonus' },
            { orderId: { startsWith: 'birthday:' } },
            { orderId: { startsWith: 'auto_return:' } },
            { orderId: { startsWith: 'complimentary:' } },
          ],
        };
        const useLots = process.env.EARN_LOTS_FEATURE === '1';
        if (useLots) {
          type EarnLotRow = {
            id: string;
            customerId: string;
            points: number;
            consumedPoints: number;
          };
          const conditions = [
            { expiresAt: { lte: new Date(now) } },
            {
              expiresAt: null,
              earnedAt: { lt: cutoff },
              ...purchaseOnly,
            },
          ];
          // Точный превью: неиспользованные lot'ы, «заработанные» ранее cutoff
          const byCustomer = new Map<string, number>();
          let cursor: string | undefined = undefined;
          while (true) {
            const lots: EarnLotRow[] = await this.prisma.earnLot.findMany({
              where: {
                merchantId: s.merchantId,
                status: 'ACTIVE',
                OR: conditions,
              },
              select: {
                id: true,
                customerId: true,
                points: true,
                consumedPoints: true,
              },
              orderBy: { id: 'asc' },
              take: lotBatchSize,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });
            if (!lots.length) break;
            for (const lot of lots) {
              const remain = Math.max(0, lot.points - lot.consumedPoints);
              if (remain <= 0) continue;
              byCustomer.set(
                lot.customerId,
                (byCustomer.get(lot.customerId) || 0) + remain,
              );
            }
            cursor = lots[lots.length - 1].id;
          }
          for (const [customerId, expiringPoints] of byCustomer.entries()) {
            const key = `${customerId}|${String(ttlDays)}|lots|${previewDate}`;
            if (existingKeys.has(key)) continue;
            outboxBatch.push({
              merchantId: s.merchantId,
              eventType: 'loyalty.points_ttl.preview',
              payload: {
                merchantId: s.merchantId,
                customerId,
                ttlDays,
                expiringPoints,
                previewDate,
                computedAt: new Date().toISOString(),
                mode: 'lots',
              },
            });
            existingKeys.add(key);
            if (outboxBatch.length >= outboxBatchSize) {
              await flushOutbox();
            }
          }
          await flushOutbox();
        } else {
          // Приблизённый превью от баланса/начислений за период
          const wallets = await this.prisma.wallet.findMany({
            where: {
              merchantId: s.merchantId,
              type: WalletType.POINTS,
              balance: { gt: 0 },
            },
            select: { id: true, customerId: true, balance: true },
          });
          const recentEarn = await this.prisma.transaction.groupBy({
            by: ['customerId'],
            where: {
              merchantId: s.merchantId,
              type: TxnType.EARN,
              ...purchaseOnly,
              createdAt: { gte: cutoff },
            },
            _sum: { amount: true },
          });
          const recentEarnByCustomer = new Map<string, number>();
          for (const row of recentEarn) {
            if (!row.customerId) continue;
            recentEarnByCustomer.set(row.customerId, row._sum.amount || 0);
          }
          for (const w of wallets) {
            try {
              const recent = recentEarnByCustomer.get(w.customerId) || 0;
              const tentativeExpire = Math.max(0, (w.balance || 0) - recent);
              if (tentativeExpire > 0) {
                const key = `${w.customerId}|${String(ttlDays)}|approx|${previewDate}`;
                if (existingKeys.has(key)) continue;
                outboxBatch.push({
                  merchantId: s.merchantId,
                  eventType: 'loyalty.points_ttl.preview',
                  payload: {
                    merchantId: s.merchantId,
                    customerId: w.customerId,
                    walletId: w.id,
                    ttlDays,
                    tentativeExpire,
                    previewDate,
                    computedAt: new Date().toISOString(),
                    mode: 'approx',
                  },
                });
                existingKeys.add(key);
                if (outboxBatch.length >= outboxBatchSize) {
                  await flushOutbox();
                }
              }
            } catch {}
          }
          await flushOutbox();
        }
      }
    } finally {
      this.running = false;
      if (lock?.ok) {
        await pgAdvisoryUnlock(this.prisma, lock.key);
      }
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
}
