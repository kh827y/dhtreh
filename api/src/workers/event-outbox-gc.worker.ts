import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from '../shared/pg-lock.util';
import { AppConfigService } from '../core/config/app-config.service';

@Injectable()
export class EventOutboxGcWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventOutboxGcWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

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
      this.config.getNumber('OUTBOX_GC_INTERVAL_MS', 3600000) ?? 3600000;
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error('EventOutboxGcWorker tick failed', error as Error);
      });
    }, intervalMs);
    try {
      if (this.timer && typeof this.timer.unref === 'function')
        this.timer.unref();
    } catch {}
    this.logger.log(`EventOutboxGcWorker started, interval=${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:outbox_gc');
    if (!lock.ok) {
      this.running = false;
      return;
    }
    try {
      const days = Math.max(
        1,
        this.config.getNumber('OUTBOX_RETENTION_DAYS', 30) ?? 30,
      );
      const olderThan = new Date(Date.now() - days * 24 * 3600 * 1000);
      await this.prisma.eventOutbox.deleteMany({
        where: {
          status: { in: ['SENT', 'DEAD'] },
          updatedAt: { lt: olderThan },
        },
      });
    } catch (error) {
      this.logger.error('EventOutboxGcWorker tick error', error as Error);
    } finally {
      this.running = false;
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
