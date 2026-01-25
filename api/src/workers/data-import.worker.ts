import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../core/prisma/prisma.service';
import { ImportExportService } from '../modules/import-export/import-export.service';
import { AppConfigService } from '../core/config/app-config.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../shared/pg-lock.util';
import { logIgnoredError } from '../shared/logging/ignore-error.util';
import { DataImportStatus, DataImportType } from '@prisma/client';

@Injectable()
export class DataImportWorker implements OnModuleInit {
  private readonly logger = new Logger(DataImportWorker.name);
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly importer: ImportExportService,
    private readonly config: AppConfigService,
  ) {}

  onModuleInit() {
    this.startedAt = new Date();
  }

  private async recoverStaleJobs() {
    const staleMs = Math.max(
      60_000,
      this.config.getNumber('DATA_IMPORT_STALE_MS', 2 * 60 * 60 * 1000) ??
        2 * 60 * 60 * 1000,
    );
    if (!Number.isFinite(staleMs) || staleMs <= 0) return;
    const staleBefore = new Date(Date.now() - staleMs);
    const retryStale = this.config.getBoolean(
      'DATA_IMPORT_RETRY_STALE',
      false,
    );
    const staleJobs = await this.prisma.dataImportJob.findMany({
      where: {
        status: DataImportStatus.PROCESSING,
        startedAt: { lt: staleBefore },
      },
      select: { id: true, merchantId: true, startedAt: true },
      take: 50,
    });
    if (!staleJobs.length) return;
    for (const job of staleJobs) {
      try {
        if (retryStale) {
          await this.prisma.dataImportJob.update({
            where: { id: job.id },
            data: {
              status: DataImportStatus.UPLOADED,
              startedAt: null,
              completedAt: null,
              processedAt: null,
              errorSummary: [
                {
                  row: 0,
                  error: 'stale processing: auto requeue',
                },
              ],
            },
          });
          this.logger.warn(
            `Requeued stale import job ${job.id} (merchant=${job.merchantId})`,
          );
        } else {
          await this.prisma.dataImportJob.update({
            where: { id: job.id },
            data: {
              status: DataImportStatus.FAILED,
              completedAt: new Date(),
              processedAt: new Date(),
              errorSummary: [
                {
                  row: 0,
                  error: 'stale processing: manual retry required',
                },
              ],
            },
          });
          this.logger.warn(
            `Marked stale import job ${job.id} as failed (merchant=${job.merchantId})`,
          );
        }
      } catch (err) {
        logIgnoredError(
          err,
          'DataImportWorker stale recovery',
          this.logger,
          'debug',
        );
      }
    }
  }

  @Cron('*/1 * * * *')
  async tick() {
    if (!this.config.isWorkersEnabled()) return;
    this.lastTickAt = new Date();
    await this.recoverStaleJobs();
    const lock = await pgTryAdvisoryLock(this.prisma, 'data-import-worker');
    if (!lock.ok) return;
    try {
      const job = await this.prisma.dataImportJob.findFirst({
        where: {
          type: DataImportType.CUSTOMERS,
          status: DataImportStatus.UPLOADED,
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!job) return;
      await this.importer.processImportJob(job.id);
      this.logger.log(`Processed import job ${job.id}`);
    } catch (err) {
      logIgnoredError(err, 'DataImportWorker tick', this.logger, 'debug');
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }
}
