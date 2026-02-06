import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from '../shared/pg-lock.util';
import { AppConfigService } from '../core/config/app-config.service';
import { logIgnoredError } from '../shared/logging/ignore-error.util';

@Injectable()
export class IdempotencyGcWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyGcWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;
  public lastProgressAt: Date | null = null;
  public lastLockMissAt: Date | null = null;
  public lockMissCount = 0;

  constructor(
    private prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  onModuleInit() {
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) {
      this.logger.log('Workers disabled (WORKERS_ENABLED!=1)');
      return;
    }
    const intervalMs =
      this.config.getNumber('IDEMPOTENCY_GC_INTERVAL_MS', 60000) ?? 60000;
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error('IdempotencyGcWorker tick failed', error as Error);
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
      logIgnoredError(
        err,
        'IdempotencyGcWorker timer unref',
        this.logger,
        'debug',
      );
    }
    this.logger.log(`IdempotencyGcWorker started, interval=${intervalMs}ms`);
    this.startedAt = new Date();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    this.lastTickAt = new Date();
    this.lastProgressAt = this.lastTickAt;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:idempotency_gc');
    if (!lock.ok) {
      this.lockMissCount += 1;
      this.lastLockMissAt = new Date();
      this.running = false;
      return;
    }
    try {
      const now = new Date();
      const ttlH = this.config.getNumber('IDEMPOTENCY_TTL_HOURS', 72) ?? 72;
      const olderThan = new Date(Date.now() - ttlH * 3600 * 1000);
      await this.prisma.idempotencyKey.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { expiresAt: null, createdAt: { lt: olderThan } },
          ],
        },
      });
      this.lastProgressAt = new Date();
    } catch (error) {
      this.logger.error('IdempotencyGcWorker tick error', error as Error);
    } finally {
      this.running = false;
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
