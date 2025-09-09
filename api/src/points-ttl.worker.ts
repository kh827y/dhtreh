import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';

@Injectable()
export class PointsTtlWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PointsTtlWorker.name);
  private timer: any = null;
  private running = false;

  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  onModuleInit() {
    if (process.env.POINTS_TTL_FEATURE !== '1') {
      this.logger.log('POINTS_TTL_FEATURE disabled');
      return;
    }
    const intervalMs = Number(process.env.POINTS_TTL_INTERVAL_MS || (6 * 60 * 60 * 1000)); // каждые 6 часов
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    this.logger.log(`PointsTtlWorker started, interval=${intervalMs}ms`);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async tick() {
    if (this.running) return; this.running = true;
    try {
      const merchants = await this.prisma.merchantSettings.findMany({ where: { pointsTtlDays: { not: null } } });
      const now = Date.now();
      for (const s of merchants) {
        const ttlDays = (s as any).pointsTtlDays as number | null;
        if (!ttlDays || ttlDays <= 0) continue;
        const cutoff = new Date(now - ttlDays * 24 * 60 * 60 * 1000);
        // Приближённая оценка: «старые» баллы ~ max(0, wallet.balance - earn за последние ttlDays)
        const wallets = await this.prisma.wallet.findMany({ where: { merchantId: s.merchantId, type: 'POINTS' as any } });
        for (const w of wallets) {
          try {
            const recentEarn = await this.prisma.transaction.aggregate({
              _sum: { amount: true },
              where: { merchantId: s.merchantId, customerId: w.customerId, type: 'EARN' as any, createdAt: { gte: cutoff } },
            });
            const recent = recentEarn._sum.amount || 0;
            const tentativeExpire = Math.max(0, (w.balance || 0) - recent);
            if (tentativeExpire > 0) {
              await this.prisma.eventOutbox.create({
                data: {
                  merchantId: s.merchantId,
                  eventType: 'loyalty.points_ttl.preview',
                  payload: {
                    merchantId: s.merchantId,
                    customerId: w.customerId,
                    walletId: w.id,
                    ttlDays,
                    tentativeExpire,
                    computedAt: new Date().toISOString(),
                  } as any,
                },
              });
            }
          } catch {}
        }
      }
    } finally { this.running = false; }
  }
}

