import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppConfigService } from '../core/config/app-config.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../shared/pg-lock.util';
import { logIgnoredError } from '../shared/logging/ignore-error.util';

@Injectable()
export class RetentionGcWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionGcWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  onModuleInit() {
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) {
      this.logger.log('Workers disabled (WORKERS_ENABLED!=1)');
      return;
    }
    const intervalMs =
      this.config.getNumber('RETENTION_GC_INTERVAL_MS', 21600000) ?? 21600000;
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error('RetentionGcWorker tick failed', error as Error);
      });
    }, intervalMs);
    try {
      if (this.timer && typeof this.timer.unref === 'function')
        this.timer.unref();
    } catch (err) {
      logIgnoredError(
        err,
        'RetentionGcWorker timer unref',
        this.logger,
        'debug',
      );
    }
    this.logger.log(`RetentionGcWorker started, interval=${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private toCutoff(days: number): Date | null {
    if (!Number.isFinite(days) || days <= 0) return null;
    return new Date(Date.now() - days * 24 * 3600 * 1000);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:retention_gc');
    if (!lock.ok) {
      this.running = false;
      return;
    }
    try {
      const adminDays =
        this.config.getNumber('ADMIN_AUDIT_RETENTION_DAYS', 90) ?? 90;
      const syncDays =
        this.config.getNumber('SYNC_LOG_RETENTION_DAYS', 30) ?? 30;
      const commDays =
        this.config.getNumber('COMMUNICATION_TASK_RETENTION_DAYS', 180) ?? 180;

      const adminCutoff = this.toCutoff(adminDays);
      if (adminCutoff) {
        await this.prisma.adminAudit.deleteMany({
          where: { createdAt: { lt: adminCutoff } },
        });
      }

      const syncCutoff = this.toCutoff(syncDays);
      if (syncCutoff) {
        await this.prisma.syncLog.deleteMany({
          where: { createdAt: { lt: syncCutoff } },
        });
      }

      const commCutoff = this.toCutoff(commDays);
      if (commCutoff) {
        await this.prisma.communicationTask.deleteMany({
          where: {
            status: { in: ['COMPLETED', 'FAILED'] },
            createdAt: { lt: commCutoff },
          },
        });
      }
    } catch (error) {
      this.logger.error('RetentionGcWorker tick error', error as Error);
    } finally {
      this.running = false;
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
