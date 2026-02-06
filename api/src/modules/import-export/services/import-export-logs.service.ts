import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

@Injectable()
export class ImportExportLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getImportExportStats(merchantId: string) {
    const [lastImport, lastExport, totalImported, totalExported] =
      await Promise.all([
        this.prisma.syncLog.findFirst({
          where: {
            merchantId,
            provider: 'IMPORT_EXPORT',
            direction: 'IN',
            status: 'ok',
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.syncLog.findFirst({
          where: {
            merchantId,
            provider: 'IMPORT_EXPORT',
            direction: 'OUT',
            status: 'ok',
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.syncLog.count({
          where: {
            merchantId,
            provider: 'IMPORT_EXPORT',
            direction: 'IN',
            status: 'ok',
          },
        }),
        this.prisma.syncLog.count({
          where: {
            merchantId,
            provider: 'IMPORT_EXPORT',
            direction: 'OUT',
            status: 'ok',
          },
        }),
      ]);

    return {
      lastImport: lastImport?.createdAt ?? null,
      lastExport: lastExport?.createdAt ?? null,
      totalImported,
      totalExported,
    };
  }

  async writeImportExportLog(params: {
    merchantId: string;
    direction: 'IN' | 'OUT';
    endpoint: string;
    status: 'ok' | 'error';
    request?: unknown;
    response?: unknown;
    error?: unknown;
  }) {
    try {
      await this.prisma.syncLog.create({
        data: {
          merchantId: params.merchantId,
          provider: 'IMPORT_EXPORT',
          direction: params.direction,
          endpoint: params.endpoint,
          status: params.status,
          request: this.toNullableJsonInput(params.request),
          response: this.toNullableJsonInput(params.response),
          error: this.formatLogError(params.error),
        },
      });
    } catch (err) {
      logIgnoredError(
        err,
        'ImportExportLogsService sync log',
        undefined,
        'debug',
      );
    }
  }

  private formatLogError(error: unknown): string | null {
    if (error == null) return null;
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch (err) {
      logIgnoredError(
        err,
        'ImportExportLogsService formatLogError',
        undefined,
        'debug',
      );
      const fallback = Object.prototype.toString.call(error) as string;
      return fallback;
    }
  }

  private toNullableJsonInput(
    value: unknown,
  ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.DbNull;
    return this.toJsonValue(value);
  }

  private toJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
    if (value === null) return Prisma.JsonNull;
    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch (err) {
      logIgnoredError(
        err,
        'ImportExportLogsService toJsonValue',
        undefined,
        'debug',
      );
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      ) {
        return String(value);
      }
      return Object.prototype.toString.call(value) as string;
    }
  }
}
