import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StaffStatus,
  Transaction,
  TxnType,
  WalletType,
} from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import { planRevoke, planUnconsume } from '../../loyalty/lots.util';

export interface OperationsLogFilters {
  from?: string | Date;
  to?: string | Date;
  staffId?: string;
  staffStatus?: 'all' | 'current' | 'former';
  outletId?: string;
  deviceId?: string;
  operationType?: string;
  direction?: 'ALL' | 'EARN' | 'REDEEM';
  carrier?: string;
  receiptNumber?: string;
  limit?: number;
  offset?: number;
}

export interface OperationsLogItemDto {
  id: string;
  occurredAt: string;
  outlet?: { id: string; name: string | null } | null;
  customer: { id: string; name: string | null; phone: string | null };
  staff?: { id: string; name: string | null; status: string } | null;
  device?: { id: string; code: string } | null;
  rating?: number | null;
  redeem: { amount: number; source?: string | null };
  earn: { amount: number; source?: string | null };
  totalAmount: number;
  receiptNumber?: string | null;
  orderId: string;
  change: number;
  kind: string;
  details?: string | null;
  note?: string | null;
  carrier?: {
    type: string;
    code?: string | null;
    label?: string | null;
  } | null;
  canceledAt: string | null;
  canceledBy?: { id: string; name: string | null } | null;
}

export interface OperationsLogListDto {
  total: number;
  items: OperationsLogItemDto[];
}

export interface OperationDetailsDto {
  operation: OperationsLogItemDto;
  receipt?: OperationsLogItemDto;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    createdAt: string;
  }>;
  canCancel: boolean;
}

@Injectable()
export class OperationsLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  private normalizeFlag(input: any): boolean {
    if (typeof input === 'string') {
      const normalized = input.trim().toLowerCase();
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    }
    if (typeof input === 'number') {
      return input !== 0;
    }
    return Boolean(input);
  }

  async list(
    merchantId: string,
    filters: OperationsLogFilters,
  ): Promise<OperationsLogListDto> {
    const allowSameReceipt = true;
    const staffStatuses = this.normalizeStaffStatuses(filters.staffStatus);
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const receiptWhere = this.buildReceiptWhere(
      merchantId,
      filters,
      staffStatuses,
    );
    const transactionWhere = this.buildTransactionWhere(
      merchantId,
      filters,
      staffStatuses,
    );

    const operationType = filters.operationType
      ? String(filters.operationType).toUpperCase()
      : null;
    const includeReceipts = !operationType || operationType === 'PURCHASE';
    const includeTransactions = !operationType || operationType !== 'PURCHASE';

    const [receiptCount, transactionCount] = await Promise.all([
      includeReceipts
        ? this.prisma.receipt.count({ where: receiptWhere })
        : Promise.resolve(0),
      includeTransactions
        ? this.prisma.transaction.count({ where: transactionWhere })
        : Promise.resolve(0),
    ]);

    const fetchLimit = Math.min(limit + offset + 20, 500);

    const [receipts, transactions] = await Promise.all([
      includeReceipts
        ? this.prisma.receipt.findMany({
            where: receiptWhere,
            orderBy: { createdAt: 'desc' },
            take: fetchLimit,
            include: {
              customer: true,
              staff: true,
              outlet: true,
              device: true,
              canceledBy: true,
            },
          })
        : Promise.resolve(
            [] as Prisma.ReceiptGetPayload<{
              include: {
                customer: true;
                staff: true;
                outlet: true;
                device: true;
                canceledBy: true;
              };
            }>[],
          ),
      includeTransactions
        ? this.prisma.transaction.findMany({
            where: transactionWhere,
            orderBy: { createdAt: 'desc' },
            take: fetchLimit,
            include: {
              customer: true,
              staff: true,
              outlet: true,
              device: true,
              canceledBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  login: true,
                  email: true,
                },
              },
            },
          })
        : Promise.resolve(
            [] as Prisma.TransactionGetPayload<{
              include: {
                customer: true;
                staff: true;
                outlet: true;
                device: true;
                canceledBy: {
                  select: {
                    id: true;
                    firstName: true;
                    lastName: true;
                    login: true;
                    email: true;
                  };
                };
              };
            }>[],
          ),
    ]);

    const ratingOrderIds = Array.from(
      new Set([
        ...receipts
          .map((r) => r.orderId)
          .filter((id): id is string => Boolean(id)),
        ...transactions
          .map((tx) => tx.orderId)
          .filter((id): id is string => Boolean(id)),
      ]),
    );
    const ratings = await this.fetchRatings(merchantId, ratingOrderIds);

    const items = [
      ...receipts.map((receipt) =>
        this.mapReceipt(receipt, ratings.get(receipt.orderId ?? '') ?? null),
      ),
      ...transactions
        .filter((tx) => {
          if (!allowSameReceipt) return true;
          const orderId =
            typeof tx.orderId === 'string' && tx.orderId.trim()
              ? tx.orderId.trim()
              : null;
          if (
            orderId &&
            receipts.find((r) => r.orderId === orderId) &&
            (tx.type === TxnType.EARN || tx.type === TxnType.REDEEM)
          ) {
            return false;
          }
          return true;
        })
        .map((tx) =>
          this.mapTransaction(tx, ratings.get(tx.orderId ?? '') ?? null),
        )
        .filter((item): item is OperationsLogItemDto => item !== null),
    ];

    let normalizedItems = items;
    if (allowSameReceipt) {
      const refundGrouped = new Map<
        string,
        {
          earn: number;
          redeem: number;
          base: OperationsLogItemDto;
          latest: string;
        }
      >();
      const nonRefund: OperationsLogItemDto[] = [];

      for (const item of items) {
        if (item.kind === 'REFUND' && item.orderId) {
          const key = item.orderId;
          const current = refundGrouped.get(key) ?? {
            earn: 0,
            redeem: 0,
            base: item,
            latest: item.occurredAt,
          };
          current.earn += Math.max(0, item.earn?.amount ?? 0);
          current.redeem += Math.max(0, item.redeem?.amount ?? 0);
          if (
            !current.latest ||
            new Date(item.occurredAt).getTime() >
              new Date(current.latest).getTime()
          ) {
            current.latest = item.occurredAt;
            current.base = { ...item };
          }
          refundGrouped.set(key, current);
        } else {
          nonRefund.push(item);
        }
      }

      const mergedRefunds = Array.from(refundGrouped.values()).map((group) => ({
        ...group.base,
        occurredAt: group.latest,
        earn: {
          amount: group.earn,
          source: group.earn > 0 ? group.base.details : null,
        },
        redeem: {
          amount: group.redeem,
          source: group.redeem > 0 ? group.base.details : null,
        },
        change: group.earn - group.redeem,
      }));

      normalizedItems = [...nonRefund, ...mergedRefunds];
    }

    normalizedItems.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    return {
      total: normalizedItems.length,
      items: normalizedItems.slice(offset, offset + limit),
    };
  }

  private buildReceiptWhere(
    merchantId: string,
    filters: OperationsLogFilters,
    staffStatuses: StaffStatus[] | null,
  ): Prisma.ReceiptWhereInput {
    const where: Prisma.ReceiptWhereInput = { merchantId };

    if (filters.from || filters.to) {
      where.createdAt = Object.assign(
        {},
        filters.from ? { gte: this.toDate(filters.from) } : {},
        filters.to ? { lte: this.toDate(filters.to) } : {},
      );
    }

    if (filters.staffId) {
      where.staffId = filters.staffId;
    }

    if (filters.deviceId) {
      where.deviceId = filters.deviceId;
    }

    if (filters.outletId) {
      where.outletId = filters.outletId;
    }

    if (filters.receiptNumber) {
      where.receiptNumber = {
        contains: filters.receiptNumber,
        mode: 'insensitive',
      };
    }

    if (filters.direction === 'EARN') {
      where.earnApplied = { gt: 0 };
    }
    if (filters.direction === 'REDEEM') {
      where.redeemApplied = { gt: 0 };
    }

    if (staffStatuses && staffStatuses.length) {
      const and: Prisma.ReceiptWhereInput[] = [];
      if (where.AND) {
        and.push(...(Array.isArray(where.AND) ? where.AND : [where.AND]));
      }
      and.push(
        filters.staffId
          ? { staff: { status: { in: staffStatuses } } }
          : {
              OR: [
                { staff: { status: { in: staffStatuses } } },
                { staffId: null },
              ],
            },
      );
      where.AND = and;
    }

    return where;
  }

  private buildTransactionWhere(
    merchantId: string,
    filters: OperationsLogFilters,
    staffStatuses: StaffStatus[] | null,
  ): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = { merchantId };
    const kind = filters.operationType
      ? String(filters.operationType).toUpperCase()
      : null;

    if (filters.from || filters.to) {
      where.createdAt = Object.assign(
        {},
        filters.from ? { gte: this.toDate(filters.from) } : {},
        filters.to ? { lte: this.toDate(filters.to) } : {},
      );
    }

    if (filters.staffId) {
      where.staffId = filters.staffId;
    }

    if (filters.deviceId) {
      where.deviceId = filters.deviceId;
    }

    if (filters.outletId) {
      where.outletId = filters.outletId;
    }

    if (filters.direction === 'EARN') {
      where.amount = { gt: 0 };
    }
    if (filters.direction === 'REDEEM') {
      where.amount = { lt: 0 };
    }

    const receiptSearch = filters.receiptNumber?.trim();

    const manualRedeem: Prisma.TransactionWhereInput = {
      type: TxnType.REDEEM,
      OR: [
        { orderId: { startsWith: 'manual_redeem:' } },
        { metadata: { path: ['source'], equals: 'MANUAL_REDEEM' } },
      ],
    };

    const registrationEarn: Prisma.TransactionWhereInput = {
      type: TxnType.EARN,
      OR: [
        { orderId: 'registration_bonus' },
        { metadata: { path: ['source'], equals: 'REGISTRATION' } },
      ],
    };

    const baseOr: Prisma.TransactionWhereInput[] = [
      { type: TxnType.CAMPAIGN },
      { type: TxnType.REFERRAL },
      { type: TxnType.REFUND },
      { type: TxnType.ADJUST },
      { type: TxnType.EARN },
      { type: TxnType.REDEEM },
      manualRedeem,
      registrationEarn,
    ];

    if (receiptSearch) {
      const receiptFilters: Prisma.TransactionWhereInput[] = [
        { orderId: { contains: receiptSearch, mode: 'insensitive' } },
        {
          metadata: {
            path: ['receiptNumber'],
            string_contains: receiptSearch,
          } as Prisma.JsonFilter,
        },
      ];
      const receiptNumeric = Number(receiptSearch);
      if (Number.isFinite(receiptNumeric)) {
        receiptFilters.push({
          metadata: {
            path: ['receiptNumber'],
            equals: receiptNumeric,
          } as Prisma.JsonFilter,
        });
      }
      baseOr.push({ OR: receiptFilters });
    }

    if (kind && kind !== 'PURCHASE') {
      const andConditions: Prisma.TransactionWhereInput[] = [];
      switch (kind) {
        case 'MANUAL_REDEEM':
          andConditions.push(manualRedeem);
          break;
        case 'MANUAL_ACCRUAL':
          andConditions.push({
            type: TxnType.CAMPAIGN,
            OR: [
              { metadata: { path: ['source'], equals: 'MANUAL_ACCRUAL' } },
              { orderId: { startsWith: 'manual_accrual:' } },
            ],
          });
          break;
        case 'COMPLIMENTARY':
          andConditions.push({
            type: TxnType.CAMPAIGN,
            metadata: { path: ['source'], equals: 'COMPLIMENTARY' },
          });
          break;
        case 'BIRTHDAY':
          andConditions.push({
            type: TxnType.CAMPAIGN,
            orderId: { startsWith: 'birthday:' },
          });
          break;
        case 'AUTO_RETURN':
          andConditions.push({
            type: TxnType.CAMPAIGN,
            orderId: { startsWith: 'auto_return:' },
          });
          break;
        case 'REGISTRATION':
          andConditions.push(registrationEarn);
          break;
        case 'REFERRAL':
          andConditions.push({ type: TxnType.REFERRAL });
          break;
        case 'REFUND':
          andConditions.push({ type: TxnType.REFUND });
          break;
        case 'BURN':
          andConditions.push({ type: TxnType.ADJUST, amount: { lt: 0 } });
          break;
        case 'ADJUST':
          andConditions.push({ type: TxnType.ADJUST, amount: { gte: 0 } });
          break;
        case 'PROMOCODE':
          andConditions.push({
            type: TxnType.EARN,
            metadata: { path: ['source'], equals: 'PROMOCODE' },
          });
          break;
        case 'EARN':
          andConditions.push({ type: TxnType.EARN });
          andConditions.push({
            NOT: [
              { orderId: 'registration_bonus' },
              { metadata: { path: ['source'], equals: 'REGISTRATION' } },
            ],
          });
          break;
        case 'REDEEM':
          andConditions.push({ type: TxnType.REDEEM });
          andConditions.push({ NOT: manualRedeem });
          break;
        case 'CAMPAIGN':
          andConditions.push({ type: TxnType.CAMPAIGN });
          andConditions.push({
            NOT: {
              OR: [
                { metadata: { path: ['source'], equals: 'MANUAL_ACCRUAL' } },
                { metadata: { path: ['source'], equals: 'COMPLIMENTARY' } },
                { orderId: { startsWith: 'birthday:' } },
                { orderId: { startsWith: 'auto_return:' } },
              ],
            },
          });
          break;
        case 'OTHER':
          andConditions.push({
            NOT: {
              OR: [
                manualRedeem,
                registrationEarn,
                { type: TxnType.CAMPAIGN },
                { type: TxnType.REFERRAL },
                { type: TxnType.REFUND },
                { type: TxnType.ADJUST },
                { type: TxnType.EARN },
                { type: TxnType.REDEEM },
              ],
            },
          });
          break;
        default:
          break;
      }
      if (andConditions.length) {
        const existingAnd = where.AND
          ? Array.isArray(where.AND)
            ? where.AND
            : [where.AND]
          : [];
        where.AND = [...existingAnd, ...andConditions];
      } else {
        where.OR = baseOr;
      }
      return where;
    }

    where.OR = baseOr;

    if (staffStatuses && staffStatuses.length) {
      const and: Prisma.TransactionWhereInput[] = [];
      if (where.AND) {
        and.push(...(Array.isArray(where.AND) ? where.AND : [where.AND]));
      }
      and.push(
        filters.staffId
          ? { staff: { status: { in: staffStatuses } } }
          : {
              OR: [
                { staff: { status: { in: staffStatuses } } },
                { staffId: null },
              ],
            },
      );
      where.AND = and;
    }

    return where;
  }

  private mapTransaction(
    tx: Prisma.TransactionGetPayload<{
      include: {
        customer: true;
        staff: true;
        outlet: true;
        device: true;
        canceledBy: {
          select: {
            id: true;
            firstName: true;
            lastName: true;
            login: true;
            email: true;
          };
        };
      };
    }>,
    rating: number | null,
  ): OperationsLogItemDto | null {
    const amount = Number(tx.amount ?? 0);
    if (!Number.isFinite(amount)) {
      return null;
    }

    const metadata = this.asRecord((tx as any)?.metadata);
    const descriptor = this.describeTransaction(tx, metadata);

    const staffName = tx.staff
      ? [tx.staff.firstName, tx.staff.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        tx.staff.login ||
        tx.staff.email ||
        tx.staff.id
      : null;

    const canceledByName = tx.canceledBy
      ? [tx.canceledBy.firstName, tx.canceledBy.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        tx.canceledBy.login ||
        tx.canceledBy.email ||
        tx.canceledBy.id
      : null;

    const earnAmount = amount > 0 ? amount : 0;
    const redeemAmount = amount < 0 ? Math.abs(amount) : 0;

    const receiptNumber =
      typeof metadata?.receiptNumber === 'string'
        ? metadata?.receiptNumber?.trim() || null
        : null;

    const outlet = tx.outlet
      ? { id: tx.outlet.id, name: tx.outlet.name ?? tx.outlet.code ?? null }
      : null;

    return {
      id: tx.id,
      occurredAt: tx.createdAt.toISOString(),
      outlet,
      customer: {
        id: tx.customer.id,
        name: tx.customer.name ?? tx.customer.phone ?? null,
        phone: tx.customer.phone ?? null,
      },
      staff: tx.staff
        ? { id: tx.staff.id, name: staffName, status: tx.staff.status }
        : null,
      device: tx.device ? { id: tx.device.id, code: tx.device.code } : null,
      rating,
      redeem: {
        amount: redeemAmount,
        source: redeemAmount > 0 ? descriptor.details : null,
      },
      earn: {
        amount: earnAmount,
        source: earnAmount > 0 ? descriptor.details : null,
      },
      totalAmount: descriptor.purchaseAmount ?? Math.abs(amount),
      receiptNumber,
      orderId: tx.orderId ?? tx.id,
      change: amount,
      kind: descriptor.kind,
      details: descriptor.details,
      note: descriptor.note ?? null,
      carrier: tx.device
        ? {
            type: 'DEVICE',
            code: tx.device.code,
            label: tx.device.code,
          }
        : outlet
          ? {
              type: 'OUTLET',
              code: tx.outlet?.code ?? tx.outlet?.id ?? null,
              label: outlet.name,
            }
          : null,
      canceledAt: tx.canceledAt ? tx.canceledAt.toISOString() : null,
      canceledBy: tx.canceledBy
        ? {
            id: tx.canceledBy.id,
            name: canceledByName,
          }
        : null,
    };
  }

  private describeTransaction(
    tx:
      | Prisma.TransactionGetPayload<{
          include: { customer: true; staff: true; outlet: true };
        }>
      | Transaction,
    metadata: Record<string, any> | null,
  ): {
    details: string;
    kind: string;
    note?: string | null;
    purchaseAmount?: number | null;
  } {
    const change = Number((tx as any)?.amount ?? 0) || 0;
    const purchaseAmount = this.parseAmount(metadata?.purchaseAmount);
    const sourceRaw = metadata?.source;
    const source =
      typeof sourceRaw === 'string' ? sourceRaw.trim().toUpperCase() : null;

    let details = 'Операция с баллами';
    let kind = 'OTHER';
    let note: string | null = null;

    if (source === 'PROMOCODE') {
      details = 'Начисление по промокоду';
      kind = 'PROMOCODE';
      const code =
        typeof metadata?.code === 'string' && metadata.code.trim()
          ? metadata.code.trim()
          : null;
      note = code ? `Промокод ${code}` : this.extractComment(metadata);
      return { details, kind, note, purchaseAmount };
    }

    if (tx.type === TxnType.REFERRAL) {
      if (source === 'REFERRAL_ROLLBACK') {
        details = 'Возврат реферала';
        kind = 'REFERRAL_ROLLBACK';
      } else {
        details = 'Реферальное начисление';
        kind = 'REFERRAL';
      }
      return { details, kind, note, purchaseAmount };
    }

    if (tx.type === TxnType.REFUND) {
      details = 'Возврат покупки';
      kind = 'REFUND';
      return { details, kind, note, purchaseAmount };
    }

    if (tx.type === TxnType.ADJUST) {
      if (change < 0) {
        details = 'Сгорание баллов';
        kind = 'BURN';
      } else {
        details = 'Корректировка баланса';
        kind = 'ADJUST';
      }
      return { details, kind, note, purchaseAmount };
    }

    if (tx.type === TxnType.REDEEM) {
      if (source === 'MANUAL_REDEEM') {
        details = 'Списание администратором';
        kind = 'MANUAL_REDEEM';
        note = this.extractComment(metadata);
      } else {
        details = 'Списание баллов';
        kind = 'REDEEM';
      }
      return { details, kind, note, purchaseAmount };
    }

    if (tx.type === TxnType.CAMPAIGN) {
      if (
        typeof tx.orderId === 'string' &&
        tx.orderId.startsWith('birthday:')
      ) {
        details = 'Баллы за день рождения';
        kind = 'BIRTHDAY';
      } else if (
        typeof tx.orderId === 'string' &&
        tx.orderId.startsWith('auto_return:')
      ) {
        details = 'Баллы за автовозврат';
        kind = 'AUTO_RETURN';
      } else if (source === 'COMPLIMENTARY') {
        details = 'Подарочные баллы';
        kind = 'COMPLIMENTARY';
        note = this.extractComment(metadata);
      } else if (source === 'MANUAL_ACCRUAL') {
        details = 'Начислено администратором';
        kind = 'MANUAL_ACCRUAL';
        note = this.extractComment(metadata);
      } else {
        details = 'Баллы по акции';
        kind = 'CAMPAIGN';
      }
      return { details, kind, note, purchaseAmount };
    }

    if (tx.type === TxnType.EARN) {
      if (tx.orderId === 'registration_bonus' || source === 'REGISTRATION') {
        details = 'Баллы за регистрацию';
        kind = 'REGISTRATION';
      } else {
        details = 'Начисление баллов';
        kind = 'EARN';
      }
      note = this.extractComment(metadata);
      return { details, kind, note, purchaseAmount };
    }

    return { details, kind, note, purchaseAmount };
  }

  private extractComment(metadata: Record<string, any> | null): string | null {
    if (!metadata) return null;
    const value = metadata.comment;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private asRecord(value: unknown): Record<string, any> | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    if (Array.isArray(value)) return null;
    return value as Record<string, any>;
  }

  private parseAmount(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.round(num);
  }

  async getDetails(
    merchantId: string,
    operationId: string,
  ): Promise<OperationDetailsDto> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: operationId },
      include: {
        customer: true,
        staff: true,
        outlet: true,
        device: true,
        canceledBy: true,
      },
    });

    if (receipt && receipt.merchantId === merchantId) {
      const ratings = await this.fetchRatings(
        merchantId,
        receipt.orderId ? [receipt.orderId] : [],
      );

      const transactions = await this.prisma.transaction.findMany({
        where: { merchantId, orderId: receipt.orderId ?? undefined },
        orderBy: { createdAt: 'asc' },
        select: { id: true, type: true, amount: true, createdAt: true },
      });

      const receiptDto = this.mapReceipt(
        receipt,
        ratings.get(receipt.orderId ?? '') ?? null,
      );

      return {
        operation: receiptDto,
        receipt: receiptDto,
        transactions: transactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          createdAt: tx.createdAt.toISOString(),
        })),
        canCancel: !receipt.canceledAt,
      };
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: operationId },
      include: {
        customer: true,
        staff: true,
        outlet: true,
        device: true,
        canceledBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            login: true,
            email: true,
          },
        },
      },
    });

    if (!transaction || transaction.merchantId !== merchantId) {
      throw new NotFoundException('Операция не найдена');
    }

    const ratings = await this.fetchRatings(
      merchantId,
      transaction.orderId ? [transaction.orderId] : [],
    );

    const operationDto = this.mapTransaction(
      transaction,
      ratings.get(transaction.orderId ?? '') ?? null,
    );

    if (!operationDto) {
      throw new NotFoundException('Операция не найдена');
    }

    return {
      operation: operationDto,
      transactions: [
        {
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          createdAt: transaction.createdAt.toISOString(),
        },
      ],
      canCancel: !transaction.canceledAt && transaction.type !== TxnType.REFUND,
    };
  }

  async cancelOperation(
    merchantId: string,
    operationId: string,
    staffId?: string | null,
  ): Promise<OperationsLogItemDto> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: operationId },
      include: {
        customer: true,
        staff: true,
        outlet: true,
        device: true,
        canceledBy: true,
      },
    });

    if (receipt && receipt.merchantId === merchantId) {
      return this.cancelReceiptInternal(merchantId, receipt, staffId);
    }

    return this.cancelTransactionInternal(merchantId, operationId, staffId);
  }

  private async cancelReceiptInternal(
    merchantId: string,
    receipt: Prisma.ReceiptGetPayload<{
      include: {
        customer: true;
        staff: true;
        outlet: true;
        device: true;
        canceledBy: true;
      };
    }>,
    staffId?: string | null,
  ): Promise<OperationsLogItemDto> {
    if (receipt.canceledAt) {
      throw new BadRequestException('Операция уже отменена');
    }
    if (!receipt.orderId) {
      throw new BadRequestException(
        'Для операции не указан идентификатор заказа',
      );
    }

    try {
      await this.loyalty.refund({
        merchantId,
        invoiceNum: receipt.orderId,
        orderId: receipt.id,
      });
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Не удалось отменить операцию',
      );
    }

    const updated = await this.prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        canceledAt: new Date(),
        canceledByStaffId: staffId ?? null,
      },
      include: {
        customer: true,
        staff: true,
        outlet: true,
        device: true,
        canceledBy: true,
      },
    });

    const ratings = await this.fetchRatings(
      merchantId,
      updated.orderId ? [updated.orderId] : [],
    );

    return this.mapReceipt(updated, ratings.get(updated.orderId ?? '') ?? null);
  }

  private async cancelTransactionInternal(
    merchantId: string,
    transactionId: string,
    staffId?: string | null,
  ): Promise<OperationsLogItemDto> {
    const existing = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        customer: true,
        staff: true,
        outlet: true,
        device: true,
        canceledBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            login: true,
            email: true,
          },
        },
      },
    });

    if (!existing || existing.merchantId !== merchantId) {
      throw new NotFoundException('Операция не найдена');
    }
    if (existing.canceledAt) {
      throw new BadRequestException('Операция уже отменена');
    }
    if (existing.type === TxnType.REFUND) {
      throw new BadRequestException('Возвраты нельзя отменить');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: {
        customerId_merchantId_type: {
          customerId: existing.customerId,
          merchantId,
          type: WalletType.POINTS,
        },
      },
    });

    if (!wallet) {
      throw new BadRequestException('У клиента отсутствует кошелёк с баллами');
    }

    const delta = -existing.amount;

    if (delta < 0 && wallet.balance < -delta) {
      throw new BadRequestException(
        'Недостаточно баллов на балансе клиента для отмены операции',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const freshWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
      });
      if (!freshWallet) {
        throw new BadRequestException(
          'У клиента отсутствует кошелёк с баллами',
        );
      }
      if (delta < 0 && freshWallet.balance < -delta) {
        throw new BadRequestException(
          'Недостаточно баллов на балансе клиента для отмены операции',
        );
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: freshWallet.balance + delta },
      });

      if (process.env.EARN_LOTS_FEATURE === '1') {
        if (delta > 0) {
          await this.unconsumeLots(
            tx,
            merchantId,
            existing.customerId,
            delta,
            existing.orderId ?? null,
          );
        } else if (delta < 0) {
          await this.revokeLots(
            tx,
            merchantId,
            existing.customerId,
            Math.abs(delta),
            existing.orderId ?? null,
          );
        }
      }

      await tx.transaction.update({
        where: { id: existing.id },
        data: {
          canceledAt: new Date(),
          canceledByStaffId: staffId ?? null,
        },
      });
    });

    const updated = await this.prisma.transaction.findUnique({
      where: { id: existing.id },
      include: {
        customer: true,
        staff: true,
        outlet: true,
        device: true,
        canceledBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            login: true,
            email: true,
          },
        },
      },
    });

    const ratings = await this.fetchRatings(
      merchantId,
      updated?.orderId ? [updated.orderId] : [],
    );

    const dto = updated
      ? this.mapTransaction(updated, ratings.get(updated.orderId ?? '') ?? null)
      : null;

    if (!dto) {
      throw new NotFoundException('Операция не найдена');
    }

    return dto;
  }

  private async unconsumeLots(
    tx: Prisma.TransactionClient,
    merchantId: string,
    customerId: string,
    amount: number,
    orderId: string | null,
  ) {
    if (amount <= 0) return;
    const lots = await tx.earnLot.findMany({
      where: { merchantId, customerId, consumedPoints: { gt: 0 } },
      orderBy: { earnedAt: 'desc' },
    });
    if (!lots.length) return;

    const updates = planUnconsume(
      lots.map((lot) => ({
        id: lot.id,
        points: lot.points,
        consumedPoints: lot.consumedPoints || 0,
        earnedAt: lot.earnedAt,
      })),
      amount,
    );

    for (const update of updates) {
      const current = lots.find((lot) => lot.id === update.id);
      if (!current) continue;
      await tx.earnLot.update({
        where: { id: update.id },
        data: {
          consumedPoints: (current.consumedPoints || 0) + update.deltaConsumed,
        },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.earnlot.unconsumed',
          payload: {
            merchantId,
            customerId,
            lotId: update.id,
            unconsumed: -update.deltaConsumed,
            orderId,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  private async revokeLots(
    tx: Prisma.TransactionClient,
    merchantId: string,
    customerId: string,
    amount: number,
    orderId: string | null,
  ) {
    if (amount <= 0) return;
    const lots = await tx.earnLot.findMany({
      where: { merchantId, customerId },
      orderBy: { earnedAt: 'desc' },
    });
    if (!lots.length) return;

    const updates = planRevoke(
      lots.map((lot) => ({
        id: lot.id,
        points: lot.points,
        consumedPoints: lot.consumedPoints || 0,
        earnedAt: lot.earnedAt,
      })),
      amount,
    );

    for (const update of updates) {
      const current = lots.find((lot) => lot.id === update.id);
      if (!current) continue;
      await tx.earnLot.update({
        where: { id: update.id },
        data: {
          consumedPoints: (current.consumedPoints || 0) + update.deltaConsumed,
        },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.earnlot.revoked',
          payload: {
            merchantId,
            customerId,
            lotId: update.id,
            revoked: update.deltaConsumed,
            orderId,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  private toDate(value: string | Date): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Некорректный формат даты');
    }
    return date;
  }

  private async fetchRatings(
    merchantId: string,
    orderIds: string[],
  ): Promise<Map<string, number>> {
    if (!orderIds.length) {
      return new Map();
    }

    const reviews = await this.prisma.review.findMany({
      where: { merchantId, orderId: { in: orderIds } },
      orderBy: { createdAt: 'desc' },
      select: { orderId: true, rating: true },
    });

    const map = new Map<string, number>();
    for (const review of reviews) {
      if (!map.has(review.orderId ?? '')) {
        map.set(review.orderId ?? '', review.rating);
      }
    }
    return map;
  }

  private mapReceipt(
    receipt: Prisma.ReceiptGetPayload<{
      include: {
        customer: true;
        staff: true;
        outlet: true;
        device: true;
        canceledBy: true;
      };
    }>,
    rating: number | null,
  ): OperationsLogItemDto {
    const staffName = receipt.staff
      ? [receipt.staff.firstName, receipt.staff.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() || receipt.staff.id
      : null;
    const canceledByName = receipt.canceledBy
      ? [receipt.canceledBy.firstName, receipt.canceledBy.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        receipt.canceledBy.login ||
        receipt.canceledBy.email ||
        receipt.canceledBy.id
      : null;

    return {
      id: receipt.id,
      occurredAt: receipt.createdAt.toISOString(),
      outlet: receipt.outlet
        ? { id: receipt.outlet.id, name: receipt.outlet.name }
        : null,
      customer: {
        id: receipt.customer.id,
        name: receipt.customer.name ?? null,
        phone: receipt.customer.phone ?? null,
      },
      staff: receipt.staff
        ? {
            id: receipt.staff.id,
            name: staffName,
            status: receipt.staff.status,
          }
        : null,
      device: receipt.device
        ? { id: receipt.device.id, code: receipt.device.code }
        : null,
      rating,
      redeem: {
        amount: receipt.redeemApplied,
        source: receipt.redeemApplied > 0 ? 'Покупка' : null,
      },
      earn: {
        amount: receipt.earnApplied,
        source: receipt.earnApplied > 0 ? 'Покупка' : null,
      },
      totalAmount: receipt.total,
      receiptNumber: receipt.receiptNumber ? String(receipt.receiptNumber).trim() : null,
      orderId: receipt.orderId ?? receipt.id,
      change: receipt.earnApplied - receipt.redeemApplied,
      kind: 'PURCHASE',
      details: 'Покупка',
      note: null,
      carrier: this.buildCarrier(receipt),
      canceledAt: receipt.canceledAt ? receipt.canceledAt.toISOString() : null,
      canceledBy: receipt.canceledBy
        ? {
            id: receipt.canceledBy.id,
            name: canceledByName,
          }
        : null,
    };
  }

  private buildCarrier(
    receipt: Prisma.ReceiptGetPayload<{
      include: { customer: true; outlet: true; device: true; canceledBy: true };
    }>,
  ): OperationsLogItemDto['carrier'] {
    const devCode =
      (receipt as any)?.device && (receipt as any).device?.code
        ? String((receipt as any).device.code)
        : null;
    if (devCode) {
      return {
        type: 'DEVICE',
        code: devCode,
        label: devCode,
      };
    }
    if (receipt.outlet) {
      const posType = (receipt.outlet.posType as string | null) ?? null;
      return {
        type: posType ?? 'OUTLET',
        code:
          receipt.outlet.code ?? receipt.outlet.externalId ?? receipt.outlet.id,
        label: receipt.outlet.name ?? null,
      };
    }
    if (receipt.customer.phone) {
      return {
        type: 'PHONE',
        code: receipt.customer.phone,
      };
    }
    return null;
  }

  private normalizeStaffStatuses(
    scope?: OperationsLogFilters['staffStatus'],
  ): StaffStatus[] | null {
    const normalized =
      typeof scope === 'string' ? scope.trim().toLowerCase() : '';
    if (normalized === 'current' || normalized === 'active') {
      return [StaffStatus.ACTIVE, StaffStatus.PENDING, StaffStatus.SUSPENDED];
    }
    if (normalized === 'former' || normalized === 'fired') {
      return [StaffStatus.FIRED, StaffStatus.ARCHIVED];
    }
    return null;
  }

  private async isAllowSameReceipt(merchantId: string): Promise<boolean> {
    let allowSame = true;
    try {
      const ms = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { rulesJson: true },
      });
      const rules =
        ms?.rulesJson && typeof ms.rulesJson === 'object'
          ? (ms.rulesJson as Record<string, any>)
          : null;
      if (
        rules &&
        Object.prototype.hasOwnProperty.call(
          rules,
          'allowEarnRedeemSameReceipt',
        )
      ) {
        allowSame = this.normalizeFlag(
          (rules as any).allowEarnRedeemSameReceipt,
        );
      }
    } catch {}
    return allowSame;
  }
}
