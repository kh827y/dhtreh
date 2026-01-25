import { Injectable } from '@nestjs/common';
import { Prisma, TxnType } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ImportExportFileService } from './import-export-file.service';
import { ImportExportLogsService } from './import-export-logs.service';
import type { ExportCustomersDto } from '../import-export.types';

@Injectable()
export class ImportExportExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: ImportExportFileService,
    private readonly logs: ImportExportLogsService,
  ) {}

  async exportCustomers(dto: ExportCustomersDto): Promise<Buffer> {
    const where: Prisma.CustomerWhereInput = {
      wallets: {
        some: {
          merchantId: dto.merchantId,
        },
      },
    };

    if (dto.filters) {
      if (dto.filters.hasTransactions !== undefined) {
        where.transactions = dto.filters.hasTransactions
          ? { some: { merchantId: dto.merchantId } }
          : { none: { merchantId: dto.merchantId } };
      }

      if (dto.filters.createdFrom || dto.filters.createdTo) {
        const createdAt: Prisma.DateTimeFilter = {};
        if (dto.filters.createdFrom) {
          createdAt.gte = dto.filters.createdFrom;
        }
        if (dto.filters.createdTo) {
          createdAt.lte = dto.filters.createdTo;
        }
        where.createdAt = createdAt;
      }
    }

    const customers = await this.prisma.customer.findMany({
      where,
      include: {
        wallets: {
          where: { merchantId: dto.merchantId },
        },
        transactions: {
          where: { merchantId: dto.merchantId },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        segments: {
          include: {
            segment: true,
          },
        },
      },
    });

    const exportData: Array<Record<string, string | number>> = customers.map(
      (customer) => {
        const wallet = customer.wallets[0];
        const lastTransaction = customer.transactions[0];
        const segments = customer.segments
          .map((s) => s.segment.name)
          .filter(Boolean)
          .join(', ');

        const row: Record<string, string | number> = {
          ID: customer.id,
          Телефон: customer.phone || '',
          Email: customer.email || '',
          Имя: customer.name || '',
          'Дата рождения': customer.birthday?.toLocaleDateString('ru-RU') || '',
          Пол: customer.gender || '',
          Город: customer.city || '',
          'Баланс баллов': wallet?.balance || 0,
          'Дата регистрации': customer.createdAt.toLocaleDateString('ru-RU'),
          'Последняя покупка':
            lastTransaction?.createdAt.toLocaleDateString('ru-RU') || '',
          Сегменты: segments,
          Тэги: customer.tags?.join(', ') || '',
        };

        if (dto.fields && dto.fields.length > 0) {
          const filtered: Record<string, string | number> = {};
          for (const field of dto.fields) {
            if (row[field] !== undefined) {
              filtered[field] = row[field];
            }
          }
          return filtered;
        }

        return row;
      },
    );

    const exportCount = exportData.length;

    if (dto.format === 'csv') {
      const buffer = this.files.generateCsv(exportData);
      await this.logs.writeImportExportLog({
        merchantId: dto.merchantId,
        direction: 'OUT',
        endpoint: 'customers',
        status: 'ok',
        response: { exported: exportCount },
      });
      return buffer;
    }
    const buffer = this.files.generateExcel(exportData);
    await this.logs.writeImportExportLog({
      merchantId: dto.merchantId,
      direction: 'OUT',
      endpoint: 'customers',
      status: 'ok',
      response: { exported: exportCount },
    });
    return buffer;
  }

  async streamCustomersCsv(
    dto: ExportCustomersDto,
    res: Response,
    batch = 1000,
  ) {
    const where: Prisma.CustomerWhereInput = {
      wallets: { some: { merchantId: dto.merchantId } },
    };
    let createdAtFilter: Prisma.DateTimeFilter | undefined;
    if (dto.filters) {
      if (dto.filters.hasTransactions !== undefined) {
        where.transactions = dto.filters.hasTransactions
          ? { some: { merchantId: dto.merchantId } }
          : { none: { merchantId: dto.merchantId } };
      }
      if (dto.filters.createdFrom || dto.filters.createdTo) {
        createdAtFilter = {};
        if (dto.filters.createdFrom) {
          createdAtFilter.gte = dto.filters.createdFrom;
        }
        if (dto.filters.createdTo) {
          createdAtFilter.lte = dto.filters.createdTo;
        }
        where.createdAt = createdAtFilter;
      }
    }
    const allFields = [
      'ID',
      'Телефон',
      'Email',
      'Имя',
      'Дата рождения',
      'Пол',
      'Город',
      'Баланс баллов',
      'Дата регистрации',
      'Последняя покупка',
      'Сегменты',
      'Тэги',
    ];
    const fields =
      Array.isArray(dto.fields) && dto.fields.length
        ? dto.fields.filter((f) => allFields.includes(f))
        : allFields;
    res.write(fields.join(';') + '\n');
    let before: Date | undefined = undefined;
    let exported = 0;
    while (true) {
      const pageWhere: Prisma.CustomerWhereInput = before
        ? {
            ...where,
            createdAt: { ...(createdAtFilter ?? {}), lt: before },
          }
        : where;
      const page = await this.prisma.customer.findMany({
        where: pageWhere,
        include: {
          wallets: { where: { merchantId: dto.merchantId } },
          transactions: {
            where: { merchantId: dto.merchantId },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          segments: { include: { segment: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: batch,
      });
      if (!page.length) break;
      for (const customer of page) {
        const wallet = customer.wallets[0];
        const lastTransaction = customer.transactions[0];
        const segments = customer.segments
          .map((s) => s.segment.name)
          .filter(Boolean)
          .join(', ');
        const row: Record<string, string | number> = {
          ID: customer.id,
          Телефон: customer.phone || '',
          Email: customer.email || '',
          Имя: customer.name || '',
          'Дата рождения': customer.birthday
            ? customer.birthday.toLocaleDateString('ru-RU')
            : '',
          Пол: customer.gender || '',
          Город: customer.city || '',
          'Баланс баллов': wallet?.balance || 0,
          'Дата регистрации': customer.createdAt.toLocaleDateString('ru-RU'),
          'Последняя покупка': lastTransaction?.createdAt
            ? lastTransaction.createdAt.toLocaleDateString('ru-RU')
            : '',
          Сегменты: segments,
          Тэги: customer.tags?.join(', ') || '',
        };
        const line = fields
          .map((f) => this.files.csvCell(String(row[f] ?? '')))
          .join(';');
        res.write(line + '\n');
        exported++;
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }

    await this.logs.writeImportExportLog({
      merchantId: dto.merchantId,
      direction: 'OUT',
      endpoint: 'customers',
      status: 'ok',
      response: { exported },
    });
  }

  async streamTransactionsCsv(
    params: {
      merchantId: string;
      from?: Date;
      to?: Date;
      type?: string;
      customerId?: string;
      outletId?: string;
      staffId?: string;
    },
    res: Response,
    batch = 1000,
  ) {
    const where: Prisma.TransactionWhereInput = {
      merchantId: params.merchantId,
    };
    if (params.type) where.type = params.type as TxnType;
    if (params.customerId) where.customerId = params.customerId;
    if (params.outletId) where.outletId = params.outletId;
    if (params.staffId) where.staffId = params.staffId;
    if (params.from || params.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (params.from) createdAt.gte = params.from;
      if (params.to) createdAt.lte = params.to;
      where.createdAt = createdAt;
    }
    res.write(
      [
        'id',
        'type',
        'amount',
        'orderId',
        'customerId',
        'createdAt',
        'outletId',
        'staffId',
      ].join(';') + '\n',
    );
    let before: Date | undefined = undefined;
    let exported = 0;
    while (true) {
      const pageWhere: Prisma.TransactionWhereInput = before
        ? {
            ...where,
            createdAt: {
              ...((where.createdAt as Prisma.DateTimeFilter | undefined) ?? {}),
              lt: before,
            },
          }
        : where;
      const page = await this.prisma.transaction.findMany({
        where: pageWhere,
        orderBy: { createdAt: 'desc' },
        take: batch,
      });
      if (!page.length) break;
      for (const t of page) {
        const row = [
          t.id,
          t.type,
          t.amount,
          t.orderId || '',
          t.customerId || '',
          t.createdAt.toISOString(),
          t.outletId || '',
          t.staffId || '',
        ]
          .map((v) => this.files.csvCell(String(v ?? '')))
          .join(';');
        res.write(row + '\n');
        exported++;
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }

    await this.logs.writeImportExportLog({
      merchantId: params.merchantId,
      direction: 'OUT',
      endpoint: 'transactions',
      status: 'ok',
      response: { exported },
    });
  }
}
