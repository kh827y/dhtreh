import { Injectable, BadRequestException } from '@nestjs/common';
import { WalletType, TxnType } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { fetchReceiptAggregates } from '../common/receipt-aggregates.util';
import * as XLSX from 'xlsx';
import * as csv from 'csv-parse/sync';
import * as csvStringify from 'csv-stringify/sync';

export interface ImportCustomersDto {
  merchantId: string;
  format: 'csv' | 'excel';
  data: Buffer;
  updateExisting?: boolean;
  sendWelcome?: boolean;
}

export interface BulkUpdateCustomersDto {
  merchantId: string;
  format: 'csv' | 'excel';
  data: Buffer;
  operation: 'add_points' | 'set_balance' | 'add_tags' | 'update_fields';
  value?: string | null;
}

export interface ExportCustomersDto {
  merchantId: string;
  format: 'csv' | 'excel';
  fields?: string[];
  filters?: {
    status?: string;
    minBalance?: number;
    maxBalance?: number;
    hasTransactions?: boolean;
    createdFrom?: Date;
    createdTo?: Date;
  };
}

export interface CustomerImportRow {
  external_id?: string;
  phone?: string;
  name?: string;
  birthday?: string;
  gender?: string;
  email?: string;
  comment?: string;
  balance_points?: string | number;
  level?: string;
  accruals_blocked?: string | boolean | number;
  redemptions_blocked?: string | boolean | number;
  total_spent?: string | number;
  visits_count?: string | number;
  last_purchase_at?: string;
  operation_amount?: string | number;
  earn_points?: string | number;
  redeem_points?: string | number;
  transaction_date?: string;
  order_id?: string;
  receipt_number?: string;
}

@Injectable()
export class ImportExportService {
  constructor(private prisma: PrismaService) {}

  /**
   * Импорт клиентов из файла
   */
  async importCustomers(dto: ImportCustomersDto) {
    let rows: CustomerImportRow[];

    try {
      if (dto.format === 'csv') {
        rows = this.parseCsv(dto.data);
      } else {
        rows = this.parseExcel(dto.data);
      }
    } catch (error) {
      throw new BadRequestException(`Ошибка парсинга файла: ${error.message}`);
    }

    if (rows.length === 0) {
      throw new BadRequestException('Файл не содержит данных');
    }

    const totalRows = rows.reduce((count, row) => {
      return count + (this.isEmptyRow(row as Record<string, any>) ? 0 : 1);
    }, 0);
    const results = {
      total: totalRows,
      customersCreated: 0,
      customersUpdated: 0,
      receiptsImported: 0,
      receiptsSkipped: 0,
      statsUpdated: 0,
      balancesSet: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };

    const updateExisting = dto.updateExisting === true;
    const tierCache: { loaded: boolean; map: Map<string, string> } = {
      loaded: false,
      map: new Map<string, string>(),
    };
    const balanceTouched = new Set<string>();
    const cachedReceipts = new Map<
      string,
      {
        customerId: string;
        total: number;
        earnApplied: number;
        redeemApplied: number;
        receiptNumber: string | null;
      }
    >();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;
      if (this.isEmptyRow(row as Record<string, any>)) {
        continue;
      }
      try {
        const normalized = this.normalizeRowKeys(row as Record<string, any>);
        const phoneRaw = this.asString(normalized.phone);
        if (!phoneRaw) {
          throw new Error('Телефон обязателен');
        }

        const phone = this.normalizePhone(phoneRaw);
        if (!phone) {
          throw new Error('Телефон обязателен');
        }
        const email = this.normalizeEmail(this.asString(normalized.email));
        const name = this.asString(normalized.name);
        const externalId = this.asString(normalized.external_id);
        const comment = this.asString(normalized.comment);
        const birthday = normalized.birthday
          ? this.parseDate(this.asString(normalized.birthday) || '')
          : null;
        const gender = this.normalizeGender(this.asString(normalized.gender));
        const level = this.asString(normalized.level);
        const accrualsBlocked = this.parseBoolean(
          normalized.accruals_blocked,
          'accruals_blocked',
        );
        const redemptionsBlocked = this.parseBoolean(
          normalized.redemptions_blocked,
          'redemptions_blocked',
        );

        const balancePoints = this.parseInteger(
          normalized.balance_points,
          'balance_points',
        );

        const totalSpent = this.parseInteger(
          normalized.total_spent,
          'total_spent',
        );
        const visitsCount = this.parseInteger(
          normalized.visits_count,
          'visits_count',
        );
        const lastPurchaseAt = normalized.last_purchase_at
          ? this.parseDate(this.asString(normalized.last_purchase_at) || '')
          : null;

        const operationAmount = this.parseInteger(
          normalized.operation_amount,
          'operation_amount',
        );
        const earnPoints = this.parseInteger(
          normalized.earn_points,
          'earn_points',
        );
        const redeemPoints = this.parseInteger(
          normalized.redeem_points,
          'redeem_points',
        );
        const orderId = this.asString(normalized.order_id);
        const receiptNumber = this.asString(normalized.receipt_number);
        const transactionDate = normalized.transaction_date
          ? this.parseDate(this.asString(normalized.transaction_date) || '')
          : null;

        const hasOperation =
          operationAmount !== null ||
          orderId !== null ||
          receiptNumber !== null ||
          earnPoints !== null ||
          redeemPoints !== null ||
          transactionDate !== null;
        const hasAggregates =
          totalSpent !== null ||
          visitsCount !== null ||
          lastPurchaseAt !== null;

        if (hasOperation) {
          if (operationAmount === null) {
            throw new Error('operation_amount обязателен для операций');
          }
          if (!orderId) {
            throw new Error('order_id обязателен для операций');
          }
        }

        if (hasAggregates) {
          if (totalSpent === null || visitsCount === null) {
            throw new Error('total_spent и visits_count обязательны для агрегатов');
          }
        }

        const rowResult = await this.prisma.$transaction(async (tx) => {
          const { customer, created } = await this.upsertCustomer(
            {
              merchantId: dto.merchantId,
              externalId,
              phone,
              email,
              name,
              birthday,
              gender,
              comment,
              accrualsBlocked,
              redemptionsBlocked,
              updateExisting,
            },
            tx,
          );

          if (level) {
            await this.applyTierAssignment(
              dto.merchantId,
              customer.id,
              level,
              tierCache,
              tx,
            );
          }

          const wallet = await this.ensureWallet(dto.merchantId, customer.id, tx);

          let receiptsImported = 0;
          let receiptsSkipped = 0;
          let receiptCacheKey: string | null = null;
          let receiptCacheValue:
            | {
                customerId: string;
                total: number;
                earnApplied: number;
                redeemApplied: number;
                receiptNumber: string | null;
              }
            | null = null;
          let receiptCreated = false;

          if (hasOperation) {
            const total = Math.max(0, Math.floor(operationAmount ?? 0));
            const earnApplied = Math.max(0, Math.floor(earnPoints ?? 0));
            const redeemApplied = Math.max(0, Math.floor(redeemPoints ?? 0));
            const receiptKey = `${dto.merchantId}:${orderId}`;
            const cached = cachedReceipts.get(receiptKey);
            if (cached) {
              const same =
                cached.customerId === customer.id &&
                cached.total === total &&
                cached.earnApplied === earnApplied &&
                cached.redeemApplied === redeemApplied &&
                cached.receiptNumber === (receiptNumber ?? null);
              if (!same) {
                throw new Error('order_id уже используется для другой операции');
              }
              receiptsSkipped++;
            } else {
              const existing = await tx.receipt.findUnique({
                where: {
                  merchantId_orderId: { merchantId: dto.merchantId, orderId: orderId! },
                },
              });
              if (existing) {
                const same =
                  existing.customerId === customer.id &&
                  Number(existing.total ?? 0) === total &&
                  Number(existing.earnApplied ?? 0) === earnApplied &&
                  Number(existing.redeemApplied ?? 0) === redeemApplied &&
                  (existing.receiptNumber ?? null) === (receiptNumber ?? null);
                if (!same) {
                  throw new Error('order_id уже используется для другой операции');
                }
                receiptsSkipped++;
                receiptCacheKey = receiptKey;
                receiptCacheValue = {
                  customerId: customer.id,
                  total,
                  earnApplied,
                  redeemApplied,
                  receiptNumber: receiptNumber ?? null,
                };
              } else {
                await tx.receipt.create({
                  data: {
                    merchantId: dto.merchantId,
                    customerId: customer.id,
                    orderId: orderId!,
                    receiptNumber: receiptNumber ?? null,
                    total,
                    eligibleTotal: total,
                    redeemApplied,
                    earnApplied,
                    createdAt: transactionDate ?? undefined,
                  },
                });
                receiptsImported++;
                receiptCreated = true;
                receiptCacheKey = receiptKey;
                receiptCacheValue = {
                  customerId: customer.id,
                  total,
                  earnApplied,
                  redeemApplied,
                  receiptNumber: receiptNumber ?? null,
                };
              }
            }

            if (receiptCreated) {
              const createdAt = transactionDate ?? new Date();
              const metadata = {
                source: 'IMPORT',
                receiptNumber: receiptNumber ?? null,
              };
              if (earnApplied > 0) {
                await tx.transaction.create({
                  data: {
                    customerId: customer.id,
                    merchantId: dto.merchantId,
                    type: TxnType.EARN,
                    amount: earnApplied,
                    orderId: orderId!,
                    createdAt,
                    metadata,
                  },
                });
              }
              if (redeemApplied > 0) {
                await tx.transaction.create({
                  data: {
                    customerId: customer.id,
                    merchantId: dto.merchantId,
                    type: TxnType.REDEEM,
                    amount: -redeemApplied,
                    orderId: orderId!,
                    createdAt,
                    metadata,
                  },
                });
              }
            }
          }

          let statsUpdated = 0;
          if (hasAggregates) {
            await this.upsertCustomerImportStats(
              {
                merchantId: dto.merchantId,
                customerId: customer.id,
                totalSpent: totalSpent ?? 0,
                visits: visitsCount ?? 0,
                lastPurchaseAt,
              },
              tx,
            );
            await this.refreshCustomerStats(
              {
                merchantId: dto.merchantId,
                customerId: customer.id,
              },
              tx,
            );
            statsUpdated = 1;
          }

          if (balancePoints !== null) {
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: balancePoints },
            });
          }

          return {
            customerId: customer.id,
            created,
            receiptsImported,
            receiptsSkipped,
            receiptCacheKey,
            receiptCacheValue,
            statsUpdated,
            balanceUpdated: balancePoints !== null,
          };
        });

        if (rowResult.created) {
          results.customersCreated++;
        } else {
          results.customersUpdated++;
        }
        results.receiptsImported += rowResult.receiptsImported;
        results.receiptsSkipped += rowResult.receiptsSkipped;
        results.statsUpdated += rowResult.statsUpdated;

        if (rowResult.balanceUpdated && !balanceTouched.has(rowResult.customerId)) {
          balanceTouched.add(rowResult.customerId);
          results.balancesSet++;
        }

        if (rowResult.receiptCacheKey && rowResult.receiptCacheValue) {
          cachedReceipts.set(rowResult.receiptCacheKey, rowResult.receiptCacheValue);
        }
      } catch (error) {
        results.errors.push({
          row: rowNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.writeImportExportLog({
      merchantId: dto.merchantId,
      direction: 'IN',
      endpoint: 'customers',
      status: 'ok',
      response: results,
    });

    return results;
  }

  /**
   * Массовое обновление клиентов
   */
  async bulkUpdateCustomers(dto: BulkUpdateCustomersDto) {
    if (dto.operation === 'update_fields') {
      return this.importCustomers({
        merchantId: dto.merchantId,
        format: dto.format,
        data: dto.data,
        updateExisting: true,
      });
    }

    let rows: CustomerImportRow[];
    try {
      if (dto.format === 'csv') {
        rows = this.parseCsv(dto.data);
      } else {
        rows = this.parseExcel(dto.data);
      }
    } catch (error) {
      throw new BadRequestException(`Ошибка парсинга файла: ${error.message}`);
    }

    if (rows.length === 0) {
      throw new BadRequestException('Файл не содержит данных');
    }

    const totalRows = rows.reduce((count, row) => {
      return count + (this.isEmptyRow(row as Record<string, any>) ? 0 : 1);
    }, 0);

    const results = {
      total: totalRows,
      updated: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };

    const valueRaw = this.asString(dto.value ?? null);
    const valueAmount =
      dto.operation === 'add_points' || dto.operation === 'set_balance'
        ? valueRaw
          ? this.parseInteger(valueRaw, 'value')
          : null
        : null;
    const valueTags =
      dto.operation === 'add_tags' ? this.parseTagsValue(valueRaw) : [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;
      if (this.isEmptyRow(row as Record<string, any>)) {
        continue;
      }
      try {
        const normalized = this.normalizeRowKeys(row as Record<string, any>);
        const customer = await this.findCustomerForBulkUpdate(
          normalized,
          dto.merchantId,
        );
        if (!customer) {
          throw new Error('Клиент не найден');
        }

        if (dto.operation === 'add_points' || dto.operation === 'set_balance') {
          const amount =
            valueAmount ??
            this.parseInteger(normalized.balance_points, 'balance_points');
          if (amount === null) {
            throw new Error('Сумма обязательна');
          }
          await this.prisma.$transaction(async (tx) => {
            const wallet = await this.ensureWallet(
              dto.merchantId,
              customer.id,
              tx,
            );
            if (dto.operation === 'add_points') {
              await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: amount } },
              });
            } else {
              await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: amount },
              });
            }
          });
        }

        if (dto.operation === 'add_tags') {
          const tags =
            valueTags.length > 0
              ? valueTags
              : this.parseTagsValue(normalized.tags);
          if (!tags.length) {
            throw new Error('Тэги обязательны');
          }
          const merged = Array.from(
            new Set([...(customer.tags || []), ...tags]),
          );
          await this.prisma.customer.update({
            where: { id: customer.id },
            data: { tags: merged },
          });
        }

        results.updated++;
      } catch (error) {
        results.errors.push({
          row: rowNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Экспорт клиентов в файл
   */
  async exportCustomers(dto: ExportCustomersDto): Promise<Buffer> {
    // Построение условий фильтрации
    const where: any = {
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
        where.createdAt = {};
        if (dto.filters.createdFrom) {
          where.createdAt.gte = dto.filters.createdFrom;
        }
        if (dto.filters.createdTo) {
          where.createdAt.lte = dto.filters.createdTo;
        }
      }
    }

    // Получаем клиентов
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

    // Подготавливаем данные для экспорта
    const exportData = customers.map((customer) => {
      const wallet = customer.wallets[0];
      const lastTransaction = customer.transactions[0];
      const segments = customer.segments
        .map((s) => s.segment.name)
        .filter(Boolean)
        .join(', ');

      const row: any = {
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

      // Фильтруем поля если указаны
      if (dto.fields && dto.fields.length > 0) {
        const filtered: any = {};
        for (const field of dto.fields) {
          if (row[field] !== undefined) {
            filtered[field] = row[field];
          }
        }
        return filtered;
      }

      return row;
    });

    const exportCount = exportData.length;

    // Генерируем файл
    if (dto.format === 'csv') {
      const buffer = this.generateCsv(exportData);
      await this.writeImportExportLog({
        merchantId: dto.merchantId,
        direction: 'OUT',
        endpoint: 'customers',
        status: 'ok',
        response: { exported: exportCount },
      });
      return buffer;
    } else {
      const buffer = this.generateExcel(exportData);
      await this.writeImportExportLog({
        merchantId: dto.merchantId,
        direction: 'OUT',
        endpoint: 'customers',
        status: 'ok',
        response: { exported: exportCount },
      });
      return buffer;
    }
  }

  /**
   * Потоковый экспорт клиентов в CSV (батчами)
   */
  async streamCustomersCsv(
    dto: ExportCustomersDto,
    res: Response,
    batch = 1000,
  ) {
    const where: any = { wallets: { some: { merchantId: dto.merchantId } } };
    if (dto.filters) {
      if (dto.filters.hasTransactions !== undefined) {
        where.transactions = dto.filters.hasTransactions
          ? { some: { merchantId: dto.merchantId } }
          : { none: { merchantId: dto.merchantId } };
      }
      if (dto.filters.createdFrom || dto.filters.createdTo) {
        where.createdAt = {};
        if (dto.filters.createdFrom)
          where.createdAt.gte = dto.filters.createdFrom;
        if (dto.filters.createdTo) where.createdAt.lte = dto.filters.createdTo;
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
      const page = await this.prisma.customer.findMany({
        where: Object.assign(
          {},
          where,
          before
            ? {
                createdAt: Object.assign({}, where.createdAt || {}, {
                  lt: before,
                }),
              }
            : {},
        ),
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
        const row: Record<string, any> = {
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
          .map((f) => this.csvCell(String(row[f] ?? '')))
          .join(';');
        res.write(line + '\n');
        exported++;
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }

    await this.writeImportExportLog({
      merchantId: dto.merchantId,
      direction: 'OUT',
      endpoint: 'customers',
      status: 'ok',
      response: { exported },
    });
  }

  /**
   * Потоковый экспорт транзакций в CSV (батчами)
   */
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
    const where: any = { merchantId: params.merchantId };
    if (params.type) where.type = params.type as any;
    if (params.customerId) where.customerId = params.customerId;
    if (params.outletId) where.outletId = params.outletId;
    if (params.staffId) where.staffId = params.staffId;
    if (params.from || params.to)
      where.createdAt = Object.assign(
        {},
        params.from ? { gte: params.from } : {},
        params.to ? { lte: params.to } : {},
      );
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
      const page = await this.prisma.transaction.findMany({
        where: Object.assign(
          {},
          where,
          before
            ? {
                createdAt: Object.assign({}, where.createdAt || {}, {
                  lt: before,
                }),
              }
            : {},
        ),
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
          .map((v) => this.csvCell(String(v ?? '')))
          .join(';');
        res.write(row + '\n');
        exported++;
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }

    await this.writeImportExportLog({
      merchantId: params.merchantId,
      direction: 'OUT',
      endpoint: 'transactions',
      status: 'ok',
      response: { exported },
    });
  }

  /**
   * Импорт транзакций
   */
  async importTransactions(
    merchantId: string,
    format: 'csv' | 'excel',
    data: Buffer,
  ) {
    let rows: any[];

    try {
      if (format === 'csv') {
        rows = this.parseCsv(data);
      } else {
        rows = this.parseExcel(data);
      }
    } catch (error) {
      throw new BadRequestException(`Ошибка парсинга файла: ${error.message}`);
    }

    const totalRows = rows.reduce((count, row) => {
      return count + (this.isEmptyRow(row as Record<string, any>) ? 0 : 1);
    }, 0);
    const results = {
      total: totalRows,
      imported: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };

    const allowedTypes = new Set(Object.values(TxnType));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (this.isEmptyRow(row as Record<string, any>)) {
        continue;
      }

      try {
        // Находим клиента по телефону или email
        const customer = await this.findCustomerByRow(row, merchantId);

        if (!customer) {
          throw new Error('Клиент не найден');
        }

        const typeRaw = this.asString(
          row['Тип'] ?? row['type'] ?? row['Type'],
        );
        if (!typeRaw) {
          throw new Error('Тип обязателен');
        }
        const type = typeRaw.toUpperCase();
        if (!allowedTypes.has(type as TxnType)) {
          throw new Error('Неверный тип транзакции');
        }

        let amount = this.parseSignedInteger(
          row['Сумма'] ?? row['Баллы'] ?? row['amount'],
          'amount',
        );
        if (amount === null) {
          throw new Error('Сумма обязательна');
        }
        if (amount === 0) {
          throw new Error('Сумма не может быть 0');
        }
        if (type === TxnType.EARN && amount < 0) {
          amount = Math.abs(amount);
        }
        if (type === TxnType.REDEEM && amount > 0) {
          amount = -amount;
        }

        // Создаем транзакцию
        await this.prisma.transaction.create({
          data: {
            merchantId,
            customerId: customer.id,
            type: type as TxnType,
            amount,
            orderId: row['ID заказа'] || `import_${Date.now()}_${i}`,
            metadata: { source: 'IMPORT' },
          },
        });

        results.imported++;
      } catch (error) {
        results.errors.push({
          row: i + 2,
          error: error.message,
        });
      }
    }

    await this.writeImportExportLog({
      merchantId,
      direction: 'IN',
      endpoint: 'transactions',
      status: 'ok',
      response: results,
    });

    return results;
  }

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

  /**
   * Получить шаблон для импорта
   */
  async getImportTemplate(
    type: 'customers' | 'transactions',
    format: 'csv' | 'excel',
  ): Promise<Buffer> {
    const templates = {
      customers: [
        {
          'ID клиента во внешней среде': 'CRM-001',
          'Номер телефона': '+7 900 123-45-67',
          ФИО: 'Иван Иванов',
          'Дата рождения': '1989-01-15',
          Пол: 'М',
          Email: 'ivan@example.com',
          Комментарий: 'VIP',
          'Баланс баллов': '1200',
          Уровень: 'Silver',
          'Блокировка начислений': 'нет',
          'Блокировка списаний': 'нет',
          'Сумма покупок': '56000',
          'Количество визитов': '14',
          'Дата последней покупки': '2024-10-12',
          'Сумма операции': '',
          'Начисленные баллы': '',
          'Списанные баллы': '',
          'Дата операции': '',
          'ID операции': '',
          'Номер чека': '',
        },
        {
          'ID клиента во внешней среде': 'CRM-001',
          'Номер телефона': '+7 900 123-45-67',
          ФИО: 'Иван Иванов',
          'Дата рождения': '',
          Пол: '',
          Email: 'ivan@example.com',
          Комментарий: '',
          'Баланс баллов': '',
          Уровень: 'Silver',
          'Блокировка начислений': '',
          'Блокировка списаний': '',
          'Сумма покупок': '',
          'Количество визитов': '',
          'Дата последней покупки': '',
          'Сумма операции': '1500',
          'Начисленные баллы': '75',
          'Списанные баллы': '0',
          'Дата операции': '2024-10-12 14:23',
          'ID операции': 'ORDER-001',
          'Номер чека': '000123',
        },
      ],
      transactions: [
        {
          'Телефон клиента*': '+7 900 123-45-67',
          Тип: 'EARN',
          Баллы: '100',
          'ID заказа': 'ORDER-001',
          Описание: 'Покупка на 1000 руб',
        },
        {
          'Телефон клиента*': '+7 900 123-45-68',
          Тип: 'REDEEM',
          Баллы: '-50',
          'ID заказа': 'ORDER-002',
          Описание: 'Списание баллов',
        },
      ],
    };

    const data = templates[type];

    if (format === 'csv') {
      return this.generateCsv(data);
    } else {
      return this.generateExcel(data);
    }
  }

  // Вспомогательные методы

  private async writeImportExportLog(params: {
    merchantId: string;
    direction: 'IN' | 'OUT';
    endpoint: string;
    status: 'ok' | 'error';
    request?: any;
    response?: any;
    error?: any;
  }) {
    try {
      await this.prisma.syncLog.create({
        data: {
          merchantId: params.merchantId,
          provider: 'IMPORT_EXPORT',
          direction: params.direction,
          endpoint: params.endpoint,
          status: params.status,
          request: params.request ?? null,
          response: params.response ?? null,
          error: params.error ? String(params.error) : null,
        },
      });
    } catch {}
  }

  private parseCsv(buffer: Buffer): any[] {
    const content = buffer.toString('utf-8');

    // Проверяем BOM и удаляем если есть
    const cleanContent =
      content.charAt(0) === '\ufeff' ? content.substring(1) : content;

    return csv.parse(cleanContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: [',', ';', '\t'], // Автоопределение разделителя
      relax_quotes: true,
      trim: true,
    });
  }

  private parseExcel(buffer: Buffer): any[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    return XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: false, // Преобразовывать даты в строки
      dateNF: 'DD.MM.YYYY',
    });
  }

  private generateCsv(data: any[]): Buffer {
    if (data.length === 0) {
      return Buffer.from('');
    }

    const safeData = data.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        const raw = value == null ? '' : String(value);
        sanitized[key] = this.sanitizeCsvValue(raw);
      }
      return sanitized;
    });

    const csv = csvStringify.stringify(safeData, {
      header: true,
      delimiter: ';',
      bom: true, // Добавляем BOM для корректного отображения в Excel
    });

    return Buffer.from(csv, 'utf-8');
  }

  private sanitizeCsvValue(value: string) {
    const trimmed = value.replace(/^[\t\r\n ]+/, '');
    if (trimmed && /^[=+\-@]/.test(trimmed)) {
      return `'${value}`;
    }
    return value;
  }

  private csvCell(s: string) {
    const safe = this.sanitizeCsvValue(s);
    const esc = safe.replace(/"/g, '""');
    return `"${esc}"`;
  }

  private generateExcel(data: any[]): Buffer {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // Устанавливаем ширину колонок
    const maxWidth = 30;
    const cols = Object.keys(data[0] || {}).map(() => ({ wch: maxWidth }));
    worksheet['!cols'] = cols;

    return Buffer.from(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    );
  }

  private normalizeRowKeys(row: Record<string, any>) {
    const normalized: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = this.normalizeHeader(String(key));
      if (!normalizedKey) continue;
      normalized[this.canonicalHeader(normalizedKey)] = value;
    }
    return normalized;
  }

  private isEmptyRow(row: Record<string, any>) {
    if (!row || typeof row !== 'object') return true;
    const values = Object.values(row);
    if (!values.length) return true;
    return values.every((value) => {
      if (value == null) return true;
      if (typeof value === 'string') return value.trim().length === 0;
      if (typeof value === 'number') return !Number.isFinite(value);
      if (typeof value === 'boolean') return false;
      if (value instanceof Date) return Number.isNaN(value.getTime());
      return false;
    });
  }

  private normalizeHeader(header: string) {
    return header
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-z0-9а-я]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private canonicalHeader(header: string) {
    const map: Record<string, string> = {
      externalid: 'external_id',
      orderid: 'order_id',
      receiptnumber: 'receipt_number',
      balancepoints: 'balance_points',
      accrualsblocked: 'accruals_blocked',
      redemptionsblocked: 'redemptions_blocked',
      totalspent: 'total_spent',
      visitscount: 'visits_count',
      lastpurchaseat: 'last_purchase_at',
      operationamount: 'operation_amount',
      earnpoints: 'earn_points',
      redeempoints: 'redeem_points',
      transactiondate: 'transaction_date',
      id_клиента_во_внешней_среде: 'external_id',
      id_клиента_во_внешней_системе: 'external_id',
      номер_телефона: 'phone',
      телефон: 'phone',
      телефон_клиента: 'phone',
      фио: 'name',
      дата_рождения: 'birthday',
      пол: 'gender',
      email: 'email',
      e_mail: 'email',
      email_клиента: 'email',
      комментарий: 'comment',
      баланс_баллов: 'balance_points',
      уровень: 'level',
      блокировка_начислений: 'accruals_blocked',
      блокировка_списаний: 'redemptions_blocked',
      сумма_покупок: 'total_spent',
      количество_визитов: 'visits_count',
      дата_последней_покупки: 'last_purchase_at',
      сумма_операции: 'operation_amount',
      начисленные_баллы: 'earn_points',
      списанные_баллы: 'redeem_points',
      дата_операции: 'transaction_date',
      id_операции: 'order_id',
      ид_операции: 'order_id',
      номер_чека: 'receipt_number',
      теги: 'tags',
      тэги: 'tags',
      tags: 'tags',
      tag: 'tags',
    };
    return map[header] ?? header;
  }

  private asString(value: unknown): string | null {
    if (value == null) return null;
    const str = String(value).trim();
    return str.length > 0 ? str : null;
  }

  private normalizeEmail(value: string | null) {
    return value ? value.trim().toLowerCase() : null;
  }

  private parseInteger(value: unknown, field: string): number | null {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = raw.replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Неверное число в поле ${field}`);
    }
    if (parsed < 0) {
      throw new Error(`Значение в поле ${field} не может быть отрицательным`);
    }
    if (!Number.isInteger(parsed)) {
      throw new Error(`Значение в поле ${field} должно быть целым числом`);
    }
    return parsed;
  }

  private parseSignedInteger(value: unknown, field: string): number | null {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = raw.replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Неверное число в поле ${field}`);
    }
    if (!Number.isInteger(parsed)) {
      throw new Error(`Значение в поле ${field} должно быть целым числом`);
    }
    return parsed;
  }

  private parseBoolean(value: unknown, field: string): boolean | null {
    if (value == null) return null;
    if (typeof value === 'boolean') return value;
    const raw = String(value).trim().toLowerCase();
    if (!raw) return null;
    if (['true', '1', 'yes', 'y', 'да', 'д', 'on'].includes(raw)) return true;
    if (['false', '0', 'no', 'n', 'нет', 'н', 'off'].includes(raw))
      return false;
    throw new Error(`Неверное булево значение в поле ${field}`);
  }

  private normalizeGender(value: string | null) {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    if (
      ['m', 'male', 'м', 'муж', 'мужчина', 'мужской', 'man'].includes(
        normalized,
      )
    )
      return 'male';
    if (
      ['f', 'female', 'ж', 'жен', 'женщина', 'женский', 'woman'].includes(
        normalized,
      )
    )
      return 'female';
    return 'unknown';
  }

  private async upsertCustomer(
    params: {
      merchantId: string;
      externalId: string | null;
      phone: string;
      email: string | null;
      name: string | null;
      birthday: Date | null;
      gender: string | null;
      comment: string | null;
      accrualsBlocked: boolean | null;
      redemptionsBlocked: boolean | null;
      updateExisting: boolean;
    },
    prisma: any = this.prisma,
  ) {
    const {
      merchantId,
      externalId,
      phone,
      email,
      name,
      birthday,
      gender,
      comment,
      accrualsBlocked,
      redemptionsBlocked,
      updateExisting,
    } = params;

    let customer =
      externalId != null
        ? await prisma.customer.findFirst({
            where: { merchantId, externalId },
          })
        : null;

    if (!customer) {
      const or: Array<Record<string, any>> = [{ phone }];
      if (email) or.push({ email });
      customer = await prisma.customer.findFirst({
        where: { merchantId, OR: or },
      });
    }

    if (customer && !updateExisting) {
      throw new Error('Клиент уже существует');
    }

    if (customer) {
      const updates: Record<string, any> = {};
      if (externalId && externalId !== customer.externalId) {
        const clash = await prisma.customer.findFirst({
          where: { merchantId, externalId },
        });
        if (clash && clash.id !== customer.id) {
          throw new Error('external_id уже используется другим клиентом');
        }
        updates.externalId = externalId;
      }
      if (phone !== customer.phone) {
        const clash = await prisma.customer.findFirst({
          where: { merchantId, phone },
        });
        if (clash && clash.id !== customer.id) {
          throw new Error('Телефон уже используется другим клиентом');
        }
        updates.phone = phone;
      }
      if (email !== null && email !== customer.email) {
        const clash = await prisma.customer.findFirst({
          where: { merchantId, email },
        });
        if (clash && clash.id !== customer.id) {
          throw new Error('Email уже используется другим клиентом');
        }
        updates.email = email;
      }
      if (name !== null) updates.name = name;
      if (birthday !== null) updates.birthday = birthday;
      if (gender !== null) updates.gender = gender;
      if (comment !== null) updates.comment = comment;
      if (accrualsBlocked !== null)
        updates.accrualsBlocked = accrualsBlocked;
      if (redemptionsBlocked !== null)
        updates.redemptionsBlocked = redemptionsBlocked;

      if (Object.keys(updates).length > 0) {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: updates,
        });
      }
      return { customer, created: false };
    }

    const created = await prisma.customer.create({
      data: {
        merchantId,
        externalId: externalId ?? null,
        phone,
        email,
        name,
        birthday,
        gender,
        comment,
        accrualsBlocked: Boolean(accrualsBlocked),
        redemptionsBlocked: Boolean(redemptionsBlocked),
      },
    });

    return { customer: created, created: true };
  }

  private async applyTierAssignment(
    merchantId: string,
    customerId: string,
    level: string,
    cache?: { loaded: boolean; map: Map<string, string> },
    prisma: any = this.prisma,
  ) {
    const value = level.trim();
    if (!value) return;
    const tier = await prisma.loyaltyTier.findFirst({
      where: {
        merchantId,
        OR: [
          { id: value },
          { name: { equals: value, mode: 'insensitive' } },
        ],
      },
    });
    if (!tier) {
      const normalized = this.normalizeTierName(value);
      if (cache && normalized) {
        if (!cache.loaded) {
          const tiers = await prisma.loyaltyTier.findMany({
            where: { merchantId },
            select: { id: true, name: true },
          });
          for (const item of tiers) {
            const key = this.normalizeTierName(item.name);
            if (!key) continue;
            if (!cache.map.has(key)) {
              cache.map.set(key, item.id);
            }
          }
          cache.loaded = true;
        }
        const cachedId = cache.map.get(normalized);
        if (cachedId) {
          const assignedAt = new Date();
          await prisma.loyaltyTierAssignment.upsert({
            where: { merchantId_customerId: { merchantId, customerId } },
            update: {
              tierId: cachedId,
              assignedAt,
              expiresAt: null,
              source: 'manual',
            },
            create: {
              merchantId,
              customerId,
              tierId: cachedId,
              assignedAt,
              expiresAt: null,
              source: 'manual',
            },
          });
          return;
        }
      }
      throw new Error(`Уровень "${level}" не найден`);
    }
    const assignedAt = new Date();
    await prisma.loyaltyTierAssignment.upsert({
      where: { merchantId_customerId: { merchantId, customerId } },
      update: {
        tierId: tier.id,
        assignedAt,
        expiresAt: null,
        source: 'manual',
      },
      create: {
        merchantId,
        customerId,
        tierId: tier.id,
        assignedAt,
        expiresAt: null,
        source: 'manual',
      },
    });
  }

  private normalizeTierName(value: string) {
    return value
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private parseTagsValue(value?: string | null) {
    if (!value) return [];
    return value
      .split(/[;,]/g)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  private async ensureWallet(
    merchantId: string,
    customerId: string,
    prisma: any = this.prisma,
  ) {
    const wallet = await prisma.wallet.findFirst({
      where: { merchantId, customerId, type: WalletType.POINTS },
    });
    if (wallet) return wallet;
    return prisma.wallet.create({
      data: {
        merchantId,
        customerId,
        type: WalletType.POINTS,
        balance: 0,
      },
    });
  }

  private async upsertCustomerImportStats(
    params: {
      merchantId: string;
      customerId: string;
      totalSpent: number;
      visits: number;
      lastPurchaseAt: Date | null;
    },
    prisma: any = this.prisma,
  ) {
    const lastSeenAt = new Date();
    await prisma.customerStats.upsert({
      where: {
        merchantId_customerId: {
          merchantId: params.merchantId,
          customerId: params.customerId,
        },
      },
      update: {
        importedTotalSpent: params.totalSpent,
        importedVisits: params.visits,
        importedLastPurchaseAt: params.lastPurchaseAt,
        lastSeenAt,
      },
      create: {
        merchantId: params.merchantId,
        customerId: params.customerId,
        importedTotalSpent: params.totalSpent,
        importedVisits: params.visits,
        importedLastPurchaseAt: params.lastPurchaseAt,
        firstSeenAt: params.lastPurchaseAt ?? new Date(),
        lastSeenAt,
      },
    });
  }

  private async refreshCustomerStats(
    params: {
      merchantId: string;
      customerId: string;
    },
    prisma: any = this.prisma,
  ) {
    const [row] = await fetchReceiptAggregates(prisma, {
      merchantId: params.merchantId,
      customerIds: [params.customerId],
      includeImportedBase: true,
    });
    const visits = Math.max(0, Math.floor(Number(row?.visits ?? 0)));
    const totalSpent = Math.max(0, Math.floor(Number(row?.totalSpent ?? 0)));
    const avgCheck = visits > 0 ? totalSpent / visits : 0;
    const lastOrderAt = row?.lastPurchaseAt ?? null;
    const lastSeenAt = new Date();

    await prisma.customerStats.upsert({
      where: {
        merchantId_customerId: {
          merchantId: params.merchantId,
          customerId: params.customerId,
        },
      },
      update: {
        visits,
        totalSpent,
        avgCheck,
        lastOrderAt,
        lastSeenAt,
      },
      create: {
        merchantId: params.merchantId,
        customerId: params.customerId,
        visits,
        totalSpent,
        avgCheck,
        lastOrderAt,
        firstSeenAt: row?.firstPurchaseAt ?? new Date(),
        lastSeenAt,
      },
    });
  }

  private async findCustomerForBulkUpdate(
    row: Record<string, any>,
    merchantId: string,
  ) {
    const externalId = this.asString(row.external_id);
    const phoneRaw = this.asString(row.phone);
    const emailRaw = this.asString(row.email);
    const phone = this.normalizePhone(phoneRaw || undefined);
    const email = this.normalizeEmail(emailRaw);

    if (externalId) {
      const found = await this.prisma.customer.findFirst({
        where: { merchantId, externalId },
        select: { id: true, tags: true },
      });
      if (found) return found;
    }

    if (phone) {
      const found = await this.prisma.customer.findFirst({
        where: { merchantId, phone },
        select: { id: true, tags: true },
      });
      if (found) return found;
    }

    if (email) {
      return this.prisma.customer.findFirst({
        where: { merchantId, email },
        select: { id: true, tags: true },
      });
    }

    return null;
  }

  private async findCustomerByRow(row: any, merchantId: string) {
    const phone = this.normalizePhone(row['Телефон клиента'] || row['Телефон']);
    const email = row['Email клиента'] || row['Email'];

    if (!phone && !email) {
      throw new Error('Телефон или Email обязательны');
    }

    const or: any[] = [];
    if (phone) or.push({ phone });
    if (email) or.push({ email });

    return this.prisma.customer.findFirst({
      where: {
        OR: or,
        wallets: {
          some: { merchantId },
        },
      },
      include: {
        wallets: {
          where: { merchantId },
        },
      },
    });
  }

  private normalizePhone(phone?: string): string | null {
    if (!phone) return null;

    // Удаляем все нецифровые символы
    let cleaned = phone.replace(/\D/g, '');

    // Если начинается с 8, заменяем на 7
    if (cleaned.startsWith('8')) {
      cleaned = '7' + cleaned.substring(1);
    }

    // Если не начинается с 7, добавляем
    if (cleaned.length === 10 && !cleaned.startsWith('7')) {
      cleaned = '7' + cleaned;
    }

    // Проверяем длину
    if (cleaned.length !== 11) {
      throw new Error(`Неверный формат телефона: ${phone}`);
    }

    return '+' + cleaned;
  }

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Пробуем разные форматы
    const formats = [
      /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let day, month, year;

        if (format === formats[2]) {
          // ISO формат
          [, year, month, day] = match;
        } else {
          // DD.MM.YYYY или DD/MM/YYYY
          [, day, month, year] = match;
        }

        const date = new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
        );

        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Пробуем нативный парсер
    const normalized = dateStr.includes(' ')
      ? dateStr.replace(' ', 'T')
      : dateStr;
    const date = new Date(normalized);
    if (!isNaN(date.getTime())) {
      return date;
    }

    throw new Error(`Неверный формат даты: ${dateStr}`);
  }
}
