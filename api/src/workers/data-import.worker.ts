import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../core/prisma/prisma.service';
import { ImportExportService } from '../modules/import-export/import-export.service';
import { AppConfigService } from '../core/config/app-config.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../shared/pg-lock.util';
import { logIgnoredError } from '../shared/logging/ignore-error.util';
import { DataImportStatus, DataImportType } from '@prisma/client';

@Injectable()
export class DataImportWorker {
  private readonly logger = new Logger(DataImportWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importer: ImportExportService,
    private readonly config: AppConfigService,
  ) {}

  @Cron('*/1 * * * *')
  async tick() {
    if (!this.config.isWorkersEnabled()) return;
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
