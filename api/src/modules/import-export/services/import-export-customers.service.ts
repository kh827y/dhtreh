import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TxnType, WalletType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { fetchReceiptAggregates } from '../../../shared/common/receipt-aggregates.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import {
  BulkUpdateCustomersDto,
  CustomerImportRow,
  ImportCustomersDto,
  RowRecord,
} from '../import-export.types';
import { ImportExportFileService } from './import-export-file.service';
import { ImportExportLogsService } from './import-export-logs.service';

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ImportExportCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: ImportExportFileService,
    private readonly logs: ImportExportLogsService,
  ) {}

  /**
   * Импорт клиентов из файла
   */
  async importCustomers(dto: ImportCustomersDto) {
    let rows: RowRecord[];

    try {
      if (dto.format === 'csv') {
        rows = this.files.parseCsv(dto.data);
      } else {
        rows = this.files.parseExcel(dto.data);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Ошибка парсинга файла: ${message}`);
    }

    if (rows.length === 0) {
      throw new BadRequestException('Файл не содержит данных');
    }

    const totalRows = rows.reduce(
      (count, row) => count + (this.isEmptyRow(row) ? 0 : 1),
      0,
    );
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
    let firstError: unknown = null;

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
      if (this.isEmptyRow(row)) {
        continue;
      }
      try {
        const normalized = this.normalizeRowKeys(row);
        const phoneRaw = this.asString(normalized.phone);
        if (!phoneRaw) {
          throw new Error('Телефон обязателен');
        }
        const phone = this.normalizePhone(phoneRaw);
        if (!phone) {
          throw new Error('Неверный формат телефона');
        }

        const externalId = this.asString(normalized.external_id);
        const email = this.normalizeEmail(this.asString(normalized.email));
        const name = this.asString(normalized.name);
        const comment = this.asString(normalized.comment);
        const birthdayRaw = this.asString(normalized.birthday);
        const birthday = birthdayRaw ? this.parseDate(birthdayRaw) : null;
        const gender = this.normalizeGender(this.asString(normalized.gender));
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
        const visits = this.parseInteger(
          normalized.visits_count,
          'visits_count',
        );
        const lastPurchaseAtRaw = this.asString(normalized.last_purchase_at);
        const lastPurchaseAt = lastPurchaseAtRaw
          ? this.parseDate(lastPurchaseAtRaw)
          : null;

        const operationAmount = this.parseInteger(
          normalized.operation_amount,
          'operation_amount',
        );
        const earnPoints = this.parseInteger(
          normalized.earn_points,
          'earn_points',
        );
        const redeemPoints = this.parseSignedInteger(
          normalized.redeem_points,
          'redeem_points',
        );

        const transactionDateRaw = this.asString(normalized.transaction_date);
        const transactionDate = transactionDateRaw
          ? this.parseDate(transactionDateRaw)
          : null;
        const orderId = this.asString(normalized.order_id);
        const receiptNumber = this.asString(normalized.receipt_number);
        const tags = this.parseTagsValue(this.asString(normalized.tags));

        if (
          [operationAmount, earnPoints, redeemPoints].some(
            (value) => value !== null,
          ) &&
          !orderId
        ) {
          throw new Error('ID операции обязателен');
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

          if (tags.length > 0) {
            const merged = Array.from(
              new Set([...(customer.tags || []), ...tags]),
            );
            await tx.customer.update({
              where: { id: customer.id },
              data: { tags: merged },
            });
          }

          if (normalized.level) {
            await this.applyTierAssignment(
              dto.merchantId,
              customer.id,
              String(normalized.level),
              tierCache,
              tx,
            );
          }

          const wallet = await this.ensureWallet(
            dto.merchantId,
            customer.id,
            tx,
          );

          let receiptsImported = 0;
          let receiptsSkipped = 0;
          let statsUpdated = 0;
          let receiptCacheKey: string | null = null;
          let receiptCacheValue: {
            customerId: string;
            total: number;
            earnApplied: number;
            redeemApplied: number;
            receiptNumber: string | null;
          } | null = null;

          if (balancePoints !== null) {
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: balancePoints },
            });
          }

          if (totalSpent !== null && visits !== null) {
            await this.upsertCustomerImportStats(
              {
                merchantId: dto.merchantId,
                customerId: customer.id,
                totalSpent,
                visits,
                lastPurchaseAt,
              },
              tx,
            );
            await this.refreshCustomerStats(
              { merchantId: dto.merchantId, customerId: customer.id },
              tx,
            );
            statsUpdated = 1;
          }

          if (
            operationAmount !== null ||
            earnPoints !== null ||
            redeemPoints !== null
          ) {
            if (!orderId) {
              throw new Error('ID операции обязателен');
            }
            const orderIdValue = orderId;
            const total = operationAmount ?? 0;
            const earnApplied = earnPoints ?? 0;
            const redeemApplied = Math.abs(redeemPoints ?? 0);
            const receiptCacheId = `${customer.id}_${orderIdValue}_${total}_${earnApplied}_${redeemApplied}_${receiptNumber}`;
            if (cachedReceipts.has(receiptCacheId)) {
              receiptsSkipped++;
            } else {
              const existing = await tx.receipt.findUnique({
                where: {
                  merchantId_orderId: {
                    merchantId: dto.merchantId,
                    orderId: orderIdValue,
                  },
                },
                select: {
                  id: true,
                  total: true,
                  earnApplied: true,
                  redeemApplied: true,
                  receiptNumber: true,
                },
              });
              if (existing) {
                const same =
                  Number(existing.total ?? 0) === total &&
                  Number(existing.earnApplied ?? 0) === earnApplied &&
                  Number(existing.redeemApplied ?? 0) === redeemApplied &&
                  (existing.receiptNumber ?? null) === (receiptNumber ?? null);
                if (same) {
                  receiptsSkipped++;
                } else {
                  throw new Error('order_id уже используется');
                }
              } else {
                await tx.receipt.create({
                  data: {
                    merchantId: dto.merchantId,
                    customerId: customer.id,
                    total,
                    eligibleTotal: total,
                    earnApplied,
                    redeemApplied,
                    createdAt: transactionDate ?? new Date(),
                    orderId: orderIdValue,
                    receiptNumber,
                  },
                });
                receiptsImported++;
                if (earnApplied !== 0) {
                  await tx.transaction.create({
                    data: {
                      merchantId: dto.merchantId,
                      customerId: customer.id,
                      type: TxnType.EARN,
                      amount: Math.abs(earnApplied),
                      orderId: orderIdValue,
                      createdAt: transactionDate ?? new Date(),
                    },
                  });
                }
                if (redeemApplied !== 0) {
                  await tx.transaction.create({
                    data: {
                      merchantId: dto.merchantId,
                      customerId: customer.id,
                      type: TxnType.REDEEM,
                      amount: -Math.abs(redeemApplied),
                      orderId: orderIdValue,
                      createdAt: transactionDate ?? new Date(),
                    },
                  });
                }
                await tx.wallet.update({
                  where: { id: wallet.id },
                  data: { balance: balancePoints ?? wallet.balance },
                });
                receiptCacheKey = receiptCacheId;
                receiptCacheValue = {
                  customerId: customer.id,
                  total,
                  earnApplied,
                  redeemApplied,
                  receiptNumber,
                };
              }
            }
          }

          if (!statsUpdated && (receiptsImported > 0 || receiptsSkipped > 0)) {
            await this.refreshCustomerStats(
              { merchantId: dto.merchantId, customerId: customer.id },
              tx,
            );
            statsUpdated = 1;
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

        if (
          rowResult.balanceUpdated &&
          !balanceTouched.has(rowResult.customerId)
        ) {
          balanceTouched.add(rowResult.customerId);
          results.balancesSet++;
        }

        if (rowResult.receiptCacheKey && rowResult.receiptCacheValue) {
          cachedReceipts.set(
            rowResult.receiptCacheKey,
            rowResult.receiptCacheValue,
          );
        }
      } catch (error) {
        if (!firstError) {
          firstError = error;
          logIgnoredError(
            error,
            'ImportExportCustomersService import customers',
            undefined,
            'debug',
            { merchantId: dto.merchantId, row: rowNumber },
          );
        }
        results.errors.push({
          row: rowNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.logs.writeImportExportLog({
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

    let rows: RowRecord[];
    try {
      if (dto.format === 'csv') {
        rows = this.files.parseCsv(dto.data);
      } else {
        rows = this.files.parseExcel(dto.data);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Ошибка парсинга файла: ${message}`);
    }

    if (rows.length === 0) {
      throw new BadRequestException('Файл не содержит данных');
    }

    const totalRows = rows.reduce(
      (count, row) => count + (this.isEmptyRow(row) ? 0 : 1),
      0,
    );

    const results = {
      total: totalRows,
      updated: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };
    let firstError: unknown = null;

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
      if (this.isEmptyRow(row)) {
        continue;
      }
      try {
        const normalized = this.normalizeRowKeys(row);
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
              : this.parseTagsValue(this.asString(normalized.tags));
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
        if (!firstError) {
          firstError = error;
          logIgnoredError(
            error,
            'ImportExportCustomersService bulk update customers',
            undefined,
            'debug',
            { merchantId: dto.merchantId, row: rowNumber },
          );
        }
        results.errors.push({
          row: rowNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Импорт транзакций
   */
  async importTransactions(
    merchantId: string,
    format: 'csv' | 'excel',
    data: Buffer,
  ) {
    let rows: RowRecord[];

    try {
      if (format === 'csv') {
        rows = this.files.parseCsv(data);
      } else {
        rows = this.files.parseExcel(data);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Ошибка парсинга файла: ${message}`);
    }

    const totalRows = rows.reduce(
      (count, row) => count + (this.isEmptyRow(row) ? 0 : 1),
      0,
    );
    const results = {
      total: totalRows,
      imported: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };
    let firstError: unknown = null;

    const allowedTypes = new Set(Object.values(TxnType));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;
      if (this.isEmptyRow(row)) {
        continue;
      }

      try {
        const customer = await this.findCustomerByRow(row, merchantId);

        if (!customer) {
          throw new Error('Клиент не найден');
        }

        const typeRaw = this.asString(row['Тип'] ?? row['type'] ?? row['Type']);
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

        const orderId =
          this.asString(row['ID заказа']) ?? `import_${Date.now()}_${i}`;

        await this.prisma.transaction.create({
          data: {
            merchantId,
            customerId: customer.id,
            type: type as TxnType,
            amount,
            orderId,
            metadata: { source: 'IMPORT' },
          },
        });

        results.imported++;
      } catch (error) {
        if (!firstError) {
          firstError = error;
          logIgnoredError(
            error,
            'ImportExportCustomersService import transactions',
            undefined,
            'debug',
            { merchantId, row: rowNumber },
          );
        }
        results.errors.push({
          row: rowNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.logs.writeImportExportLog({
      merchantId,
      direction: 'IN',
      endpoint: 'transactions',
      status: 'ok',
      response: results,
    });

    return results;
  }

  private normalizeRowKeys(row: RowRecord): CustomerImportRow {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = this.normalizeHeader(String(key));
      if (!normalizedKey) continue;
      normalized[this.canonicalHeader(normalizedKey)] = value;
    }
    return normalized as CustomerImportRow;
  }

  private isEmptyRow(row: RowRecord | null | undefined) {
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

  private stringifyValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return value.name || 'function';
    return '';
  }

  private toTrimmedString(value: unknown): string | null {
    const raw = this.stringifyValue(value).trim();
    return raw.length > 0 ? raw : null;
  }

  private asString(value: unknown): string | null {
    return this.toTrimmedString(value);
  }

  private normalizeEmail(value: string | null) {
    return value ? value.trim().toLowerCase() : null;
  }

  private parseInteger(value: unknown, field: string): number | null {
    const raw = this.toTrimmedString(value);
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
    const raw = this.toTrimmedString(value);
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
    const raw = this.toTrimmedString(value)?.toLowerCase() ?? '';
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
    prisma: PrismaClientLike = this.prisma,
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
      const phoneVariants = this.buildPhoneVariants(phone);
      const or: Prisma.CustomerWhereInput[] = phoneVariants.map((value) => ({
        phone: value,
      }));
      if (email) or.push({ email });
      customer = await prisma.customer.findFirst({
        where: { merchantId, OR: or },
      });
    }

    if (customer && !updateExisting) {
      throw new Error('Клиент уже существует');
    }

    if (customer) {
      const updates: Prisma.CustomerUpdateInput = {};
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
        const phoneVariants = this.buildPhoneVariants(phone);
        const clash = await prisma.customer.findFirst({
          where: {
            merchantId,
            OR: phoneVariants.map((value) => ({ phone: value })),
          },
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
      if (accrualsBlocked !== null) updates.accrualsBlocked = accrualsBlocked;
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
    prisma: PrismaClientLike = this.prisma,
  ) {
    const value = level.trim();
    if (!value) return;
    const tier = await prisma.loyaltyTier.findFirst({
      where: {
        merchantId,
        OR: [{ id: value }, { name: { equals: value, mode: 'insensitive' } }],
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
    prisma: PrismaClientLike = this.prisma,
  ) {
    return prisma.wallet.upsert({
      where: {
        customerId_merchantId_type: {
          customerId,
          merchantId,
          type: WalletType.POINTS,
        },
      },
      update: {},
      create: {
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
    prisma: PrismaClientLike = this.prisma,
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
    prisma: PrismaClientLike = this.prisma,
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
    row: CustomerImportRow,
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
      const phoneVariants = this.buildPhoneVariants(phone);
      const found = await this.prisma.customer.findFirst({
        where: {
          merchantId,
          OR: phoneVariants.map((value) => ({ phone: value })),
        },
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

  private async findCustomerByRow(row: RowRecord, merchantId: string) {
    const phone = this.normalizePhone(
      this.asString(row['Телефон клиента'] ?? row['Телефон']) || undefined,
    );
    const email = this.asString(row['Email клиента'] ?? row['Email']);

    if (!phone && !email) {
      throw new Error('Телефон или Email обязательны');
    }

    const or: Prisma.CustomerWhereInput[] = [];
    if (phone) {
      for (const value of this.buildPhoneVariants(phone)) {
        or.push({ phone: value });
      }
    }
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

  private buildPhoneVariants(phone?: string | null): string[] {
    if (!phone) return [];
    const digits = phone.replace(/\D/g, '');
    if (!digits || digits === phone) return [phone];
    return [phone, digits];
  }

  private normalizePhone(phone?: string): string | null {
    if (!phone) return null;

    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('8')) {
      cleaned = '7' + cleaned.substring(1);
    }

    if (cleaned.length === 10 && !cleaned.startsWith('7')) {
      cleaned = '7' + cleaned;
    }

    if (cleaned.length !== 11) {
      throw new Error(`Неверный формат телефона: ${phone}`);
    }

    return '+' + cleaned;
  }

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    const formats = [
      /^(\d{2})\.(\d{2})\.(\d{4})$/,
      /^(\d{2})\/(\d{2})\/(\d{4})$/,
      /^(\d{4})-(\d{2})-(\d{2})$/,
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let day = '';
        let month = '';
        let year = '';

        if (format === formats[2]) {
          [, year, month, day] = match;
        } else {
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
