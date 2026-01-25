import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { HoldStatus } from '@prisma/client';
import { MetricsService } from '../core/metrics/metrics.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from '../shared/pg-lock.util';
import { AppConfigService } from '../core/config/app-config.service';
import { logIgnoredError } from '../shared/logging/ignore-error.util';

@Injectable()
export class HoldGcWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HoldGcWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private readonly config: AppConfigService,
  ) {}

  onModuleInit() {
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) {
      this.logger.log('Workers disabled (WORKERS_ENABLED!=1)');
      return;
    }
    const intervalMs =
      this.config.getNumber('HOLD_GC_INTERVAL_MS', 30000) ?? 30000;
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error('HoldGcWorker tick failed', error as Error);
        try {
          this.metrics.inc('loyalty_hold_gc_errors_total');
        } catch (err) {
          logIgnoredError(err, 'HoldGcWorker metrics', this.logger, 'debug');
        }
      });
    }, intervalMs);
    try {
      if (
        this.timer &&
        'unref' in this.timer &&
        typeof this.timer.unref === 'function'
      ) {
        this.timer.unref();
      }
    } catch (err) {
      logIgnoredError(err, 'HoldGcWorker timer unref', this.logger, 'debug');
    }
    this.logger.log(`HoldGcWorker started, interval=${intervalMs}ms`);
    this.startedAt = new Date();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    this.lastTickAt = new Date();
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
      } catch (err) {
        logIgnoredError(err, 'HoldGcWorker metrics', this.logger, 'debug');
      }
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
          } catch (err) {
            logIgnoredError(err, 'HoldGcWorker metrics', this.logger, 'debug');
          }
        }
      }
    } catch (error) {
      this.logger.error('HoldGcWorker tick error', error as Error);
      try {
        this.metrics.inc('loyalty_hold_gc_errors_total');
      } catch (err) {
        logIgnoredError(err, 'HoldGcWorker metrics', this.logger, 'debug');
      }
    } finally {
      this.running = false;
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
