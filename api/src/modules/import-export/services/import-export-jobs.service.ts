import { BadRequestException, Injectable } from '@nestjs/common';
import { DataImportStatus, DataImportType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  ImportCustomersJobDto,
  ImportJobSummary,
} from '../import-export.types';
import { ImportExportCustomersService } from './import-export-customers.service';

@Injectable()
export class ImportExportJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: ImportExportCustomersService,
  ) {}

  private buildImportJobSettings(dto: ImportCustomersJobDto) {
    return {
      format: dto.format,
      updateExisting: dto.updateExisting === true,
      sendWelcome: dto.sendWelcome === true,
      dataBase64: dto.data.toString('base64'),
    };
  }

  private decodeImportJobSettings(settings: Prisma.JsonValue | null): {
    format: 'csv' | 'excel';
    data: Buffer;
    updateExisting: boolean;
    sendWelcome: boolean;
    raw: Record<string, unknown>;
  } {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new BadRequestException('Import settings not found');
    }
    const data = settings as Record<string, unknown>;
    const format =
      data.format === 'csv' || data.format === 'excel' ? data.format : null;
    const rawBase64 =
      typeof data.dataBase64 === 'string' ? data.dataBase64 : '';
    if (!format || !rawBase64) {
      throw new BadRequestException('Import settings are invalid');
    }
    return {
      format,
      data: Buffer.from(rawBase64, 'base64'),
      updateExisting: Boolean(data.updateExisting),
      sendWelcome: Boolean(data.sendWelcome),
      raw: data,
    };
  }

  private cleanupImportJobSettings(
    settings: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const next = { ...settings };
    delete next.dataBase64;
    return next as Prisma.InputJsonValue;
  }

  async enqueueImportCustomers(dto: ImportCustomersJobDto) {
    const job = await this.prisma.dataImportJob.create({
      data: {
        merchantId: dto.merchantId,
        type: DataImportType.CUSTOMERS,
        status: DataImportStatus.UPLOADED,
        sourceFileName: dto.sourceFileName ?? 'customers-import',
        sourceFileSize: dto.sourceFileSize ?? dto.data.length,
        sourceMimeType: dto.sourceMimeType ?? null,
        uploadedById: dto.uploadedById ?? null,
        settings: this.buildImportJobSettings(dto),
      },
    });
    return this.getImportJobSummary(dto.merchantId, job.id);
  }

  async getImportJobSummary(
    merchantId: string,
    jobId: string,
  ): Promise<ImportJobSummary> {
    const job = await this.prisma.dataImportJob.findFirst({
      where: { id: jobId, merchantId },
      include: { metrics: true },
    });
    if (!job) {
      throw new BadRequestException('Import job not found');
    }
    const errorSummary = Array.isArray(job.errorSummary)
      ? (job.errorSummary as Array<{ row: number; error: string }>)
      : [];
    const stats =
      job.metrics && job.metrics.stats && typeof job.metrics.stats === 'object'
        ? (job.metrics.stats as Record<string, unknown>)
        : null;
    return {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      totalRows: job.totalRows,
      successRows: job.successRows,
      failedRows: job.failedRows,
      skippedRows: job.skippedRows,
      errorSummary,
      stats,
    };
  }

  async listImportJobs(
    merchantId: string,
    limit = 20,
    offset = 0,
  ): Promise<ImportJobSummary[]> {
    const jobs = await this.prisma.dataImportJob.findMany({
      where: { merchantId, type: DataImportType.CUSTOMERS },
      include: { metrics: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      skip: Math.max(offset, 0),
    });
    return jobs.map((job) => {
      const errorSummary = Array.isArray(job.errorSummary)
        ? (job.errorSummary as Array<{ row: number; error: string }>)
        : [];
      const stats =
        job.metrics &&
        job.metrics.stats &&
        typeof job.metrics.stats === 'object'
          ? (job.metrics.stats as Record<string, unknown>)
          : null;
      return {
        jobId: job.id,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt ?? null,
        completedAt: job.completedAt ?? null,
        totalRows: job.totalRows,
        successRows: job.successRows,
        failedRows: job.failedRows,
        skippedRows: job.skippedRows,
        errorSummary,
        stats,
      };
    });
  }

  async processImportJob(jobId: string) {
    const job = await this.prisma.dataImportJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new BadRequestException('Import job not found');
    }
    if (
      job.status !== DataImportStatus.UPLOADED &&
      job.status !== DataImportStatus.VALIDATING
    ) {
      return;
    }
    const startedAt = new Date();
    await this.prisma.dataImportJob.update({
      where: { id: jobId },
      data: { status: DataImportStatus.PROCESSING, startedAt },
    });
    try {
      const settings = this.decodeImportJobSettings(job.settings ?? null);
      const result = await this.customers.importCustomers({
        merchantId: job.merchantId,
        format: settings.format,
        data: settings.data,
        updateExisting: settings.updateExisting,
        sendWelcome: settings.sendWelcome,
      });
      const errorSummary = result.errors.slice(0, 200);
      const totalRows = result.total;
      const failedRows = result.errors.length;
      const successRows = Math.max(0, totalRows - failedRows);
      await this.prisma.$transaction([
        this.prisma.dataImportMetric.upsert({
          where: { jobId },
          update: { stats: result },
          create: { jobId, stats: result },
        }),
        this.prisma.dataImportJob.update({
          where: { id: jobId },
          data: {
            status: DataImportStatus.COMPLETED,
            completedAt: new Date(),
            processedAt: new Date(),
            totalRows,
            successRows,
            failedRows,
            skippedRows: 0,
            errorSummary: errorSummary as Prisma.InputJsonValue,
            settings: this.cleanupImportJobSettings(settings.raw),
          },
        }),
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.dataImportJob.update({
        where: { id: jobId },
        data: {
          status: DataImportStatus.FAILED,
          completedAt: new Date(),
          processedAt: new Date(),
          errorSummary: [{ row: 0, error: message }],
        },
      });
      throw error;
    }
  }
}
