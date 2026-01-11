import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { HoldStatus } from '@prisma/client';
import { MetricsService } from './metrics.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from './pg-lock.util';

@Injectable()
export class HoldGcWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HoldGcWorker.name);
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
    const intervalMs = Number(process.env.HOLD_GC_INTERVAL_MS || '30000');
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error('HoldGcWorker tick failed', error as Error);
        try {
          this.metrics.inc('loyalty_hold_gc_errors_total');
        } catch {}
      });
    }, intervalMs);
    try {
      if (this.timer && typeof this.timer.unref === 'function')
        this.timer.unref();
    } catch {}
    this.logger.log(`HoldGcWorker started, interval=${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:hold_gc');
    if (!lock.ok) {
      this.running = false;
      return;
    }
    try {
      try {
        this.metrics.setGauge(
          'loyalty_worker_last_tick_seconds',
          Math.floor(Date.now() / 1000),
          { worker: 'hold_gc' },
        );
      } catch {}
      const now = new Date();
      const expired = await this.prisma.hold.findMany({
        where: { status: HoldStatus.PENDING, expiresAt: { lt: now } },
        take: 50,
      });
      for (const h of expired) {
        try {
          await this.prisma.hold.update({
            where: { id: h.id },
            data: { status: HoldStatus.CANCELED },
          });
          this.metrics.inc('loyalty_hold_gc_canceled_total');
        } catch (error) {
          this.logger.error(
            `HoldGcWorker failed to cancel hold ${h.id}`,
            error as Error,
          );
          try {
            this.metrics.inc('loyalty_hold_gc_errors_total');
          } catch {}
        }
      }
    } catch (error) {
      this.logger.error('HoldGcWorker tick error', error as Error);
      try {
        this.metrics.inc('loyalty_hold_gc_errors_total');
      } catch {}
    } finally {
      this.running = false;
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
