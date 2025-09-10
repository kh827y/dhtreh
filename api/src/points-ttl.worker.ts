import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from './pg-lock.util';

@Injectable()
export class PointsTtlWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PointsTtlWorker.name);
  private timer: any = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;

  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  onModuleInit() {
    if (process.env.POINTS_TTL_FEATURE !== '1') {
      this.logger.log('POINTS_TTL_FEATURE disabled');
      return;
    }
    const intervalMs = Number(process.env.POINTS_TTL_INTERVAL_MS || (6 * 60 * 60 * 1000)); // каждые 6 часов
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    this.logger.log(`PointsTtlWorker started, interval=${intervalMs}ms`);
    this.startedAt = new Date();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async tick() {
    if (this.running) return; this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:points_ttl_preview');
    if (!lock.ok) { this.running = false; return; }
    try {
      this.lastTickAt = new Date();
      const merchants = await this.prisma.merchantSettings.findMany({ where: { pointsTtlDays: { not: null } } });
      const now = Date.now();
      for (const s of merchants) {
        const ttlDays = (s as any).pointsTtlDays as number | null;
        if (!ttlDays || ttlDays <= 0) continue;
        const cutoff = new Date(now - ttlDays * 24 * 60 * 60 * 1000);
        const useLots = process.env.EARN_LOTS_FEATURE === '1';
        if (useLots) {
          // Точный превью: неиспользованные lot'ы, «заработанные» ранее cutoff
          const lots = await this.prisma.earnLot.findMany({ where: { merchantId: s.merchantId, earnedAt: { lt: cutoff } } });
          const byCustomer = new Map<string, number>();
          for (const lot of lots) {
            const remain = Math.max(0, lot.points - lot.consumedPoints);
            if (remain <= 0) continue;
            byCustomer.set(lot.customerId, (byCustomer.get(lot.customerId) || 0) + remain);
          }
          for (const [customerId, expiringPoints] of byCustomer.entries()) {
            await this.prisma.eventOutbox.create({ data: {
              merchantId: s.merchantId,
              eventType: 'loyalty.points_ttl.preview',
              payload: { merchantId: s.merchantId, customerId, ttlDays, expiringPoints, computedAt: new Date().toISOString(), mode: 'lots' } as any,
            }});
          }
        } else {
          // Приблизённый превью от баланса/начислений за период
          const wallets = await this.prisma.wallet.findMany({ where: { merchantId: s.merchantId, type: 'POINTS' as any } });
          for (const w of wallets) {
            try {
              const recentEarn = await this.prisma.transaction.aggregate({ _sum: { amount: true }, where: { merchantId: s.merchantId, customerId: w.customerId, type: 'EARN' as any, createdAt: { gte: cutoff } } });
              const recent = recentEarn._sum.amount || 0;
              const tentativeExpire = Math.max(0, (w.balance || 0) - recent);
              if (tentativeExpire > 0) {
                await this.prisma.eventOutbox.create({ data: { merchantId: s.merchantId, eventType: 'loyalty.points_ttl.preview', payload: { merchantId: s.merchantId, customerId: w.customerId, walletId: w.id, ttlDays, tentativeExpire, computedAt: new Date().toISOString(), mode: 'approx' } as any } });
              }
            } catch {}
          }
        }
      }
    } finally { this.running = false; await pgAdvisoryUnlock(this.prisma, lock.key); }
  }
}
