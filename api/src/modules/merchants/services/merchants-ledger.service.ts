import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TxnType, WalletType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { normalizePhone } from '../merchants.helpers';
import { asRecord } from '../merchants.utils';

type ReceiptWithDevice = Prisma.ReceiptGetPayload<{
  include: { device: { select: { code: true } } };
}>;

type TransactionWithDevice = Prisma.TransactionGetPayload<{
  include: { device: { select: { code: true } } };
}>;

@Injectable()
export class MerchantsLedgerService {
  private readonly logger = new Logger(MerchantsLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private mapReceipt(entity: ReceiptWithDevice) {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      customerId: entity.customerId,
      orderId: entity.orderId,
      receiptNumber: entity.receiptNumber ?? null,
      total: entity.total,
      redeemApplied: entity.redeemApplied,
      earnApplied: entity.earnApplied,
      createdAt: entity.createdAt,
      outletId: entity.outletId ?? null,
      staffId: entity.staffId ?? null,
      deviceId: entity?.device?.code ?? entity.deviceId ?? null,
    } as const;
  }

  private mapTransaction(entity: TransactionWithDevice) {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      customerId: entity.customerId,
      type: entity.type,
      amount: entity.amount,
      orderId: entity.orderId ?? null,
      createdAt: entity.createdAt,
      outletId: entity.outletId ?? null,
      staffId: entity.staffId ?? null,
      deviceId: entity?.device?.code ?? entity.deviceId ?? null,
    } as const;
  }

  async listTransactions(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      from?: Date;
      to?: Date;
      type?: string;
      customerId?: string;
      outletId?: string;
      staffId?: string;
    },
  ) {
    const normalizeDate = (value?: Date) => {
      if (!value) return undefined;
      const ts = value.getTime();
      return Number.isFinite(ts) ? value : undefined;
    };
    const allowedTypes = new Set(Object.values(TxnType));
    const type =
      params.type && allowedTypes.has(params.type as TxnType)
        ? (params.type as TxnType)
        : undefined;
    const before = normalizeDate(params.before);
    const from = normalizeDate(params.from);
    const to = normalizeDate(params.to);

    const where: Prisma.TransactionWhereInput = { merchantId };
    if (type) where.type = type;
    if (params.customerId) where.customerId = params.customerId;
    if (params.outletId) where.outletId = params.outletId;
    if (params.staffId) where.staffId = params.staffId;
    if (before || from || to) {
      where.createdAt = {
        ...(before ? { lt: before } : {}),
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      include: {
        device: { select: { code: true } },
      },
    });
    return items.map((entity) => this.mapTransaction(entity));
  }

  async listReceipts(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      from?: Date;
      to?: Date;
      orderId?: string;
      customerId?: string;
    },
  ) {
    const where: Prisma.ReceiptWhereInput = { merchantId };
    if (params.orderId) where.orderId = params.orderId;
    if (params.customerId) where.customerId = params.customerId;
    if (params.before || params.from || params.to) {
      where.createdAt = {
        ...(params.before ? { lt: params.before } : {}),
        ...(params.from ? { gte: params.from } : {}),
        ...(params.to ? { lte: params.to } : {}),
      };
    }
    const items = await this.prisma.receipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      include: {
        device: { select: { code: true } },
      },
    });
    return items.map((entity) => this.mapReceipt(entity));
  }

  async getReceipt(merchantId: string, receiptId: string) {
    const r = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        device: { select: { code: true } },
      },
    });
    if (!r || r.merchantId !== merchantId)
      throw new NotFoundException('Receipt not found');
    const tx = await this.prisma.transaction.findMany({
      where: { merchantId, orderId: r.orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        device: { select: { code: true } },
      },
    });
    return {
      receipt: this.mapReceipt(r),
      transactions: tx.map((entity) => this.mapTransaction(entity)),
    };
  }

  async listLedger(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      from?: Date;
      to?: Date;
      type?: string;
    },
  ) {
    const where: Prisma.LedgerEntryWhereInput = { merchantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.before || params.from || params.to) {
      where.createdAt = {
        ...(params.before ? { lt: params.before } : {}),
        ...(params.from ? { gte: params.from } : {}),
        ...(params.to ? { lte: params.to } : {}),
      };
    }
    if (params.type) {
      // приблизительное сопоставление по мета.type
      const metaFilter: Prisma.JsonFilter<'LedgerEntry'> = {
        path: ['mode'],
        equals:
          params.type === 'earn' || params.type === 'redeem'
            ? params.type.toUpperCase()
            : 'REFUND',
      };
      where.meta = metaFilter;
    }
    const items = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
    });
    return items.map((entity) => {
      return {
        id: entity.id,
        merchantId: entity.merchantId,
        customerId: entity.customerId ?? null,
        debit: entity.debit,
        credit: entity.credit,
        amount: entity.amount,
        orderId: entity.orderId ?? null,
        receiptId: entity.receiptId ?? null,
        outletId: entity.outletId ?? null,
        staffId: entity.staffId ?? null,
        meta: entity.meta ?? null,
        createdAt: entity.createdAt,
      } as const;
    });
  }

  async exportLedgerCsv(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      from?: Date;
      to?: Date;
      type?: string;
    },
  ) {
    const items = await this.listLedger(merchantId, params);
    const lines = [
      'id,customerId,debit,credit,amount,orderId,receiptId,createdAt,outletId,staffId',
    ];
    for (const e of items) {
      const row = [
        e.id,
        e.customerId || '',
        e.debit,
        e.credit,
        e.amount,
        e.orderId || '',
        e.receiptId || '',
        e.createdAt.toISOString(),
        e.outletId || '',
        e.staffId || '',
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(',');
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  async ttlReconciliation(merchantId: string, cutoffISO: string) {
    const cutoff = new Date(cutoffISO);
    if (isNaN(cutoff.getTime())) throw new Error('Bad cutoff date');
    const windowDaysRaw = this.config.getTtlReconciliationWindowDays();
    const windowDays =
      Number.isFinite(windowDaysRaw) && windowDaysRaw > 0
        ? Math.floor(windowDaysRaw)
        : 0;
    const windowStart =
      windowDays > 0
        ? new Date(cutoff.getTime() - windowDays * 24 * 60 * 60 * 1000)
        : null;
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { pointsTtlDays: true },
    });
    const ttlDaysRaw = Number(settings?.pointsTtlDays ?? 0);
    const ttlDays =
      Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0
        ? Math.floor(ttlDaysRaw)
        : 0;
    const now =
      ttlDays > 0
        ? new Date(cutoff.getTime() + ttlDays * 24 * 60 * 60 * 1000)
        : cutoff;
    const purchaseOnly = {
      orderId: { not: null },
      NOT: [
        { orderId: 'registration_bonus' },
        { orderId: { startsWith: 'birthday:' } },
        { orderId: { startsWith: 'auto_return:' } },
        { orderId: { startsWith: 'complimentary:' } },
      ],
    };
    const expiresAtFilter = windowStart
      ? { lte: now, gte: windowStart }
      : { lte: now };
    const earnedAtFilter = windowStart
      ? { lt: cutoff, gte: windowStart }
      : { lt: cutoff };
    const conditions: Prisma.EarnLotWhereInput[] = [
      { expiresAt: expiresAtFilter },
      {
        expiresAt: null,
        earnedAt: earnedAtFilter,
        ...purchaseOnly,
      },
    ];
    // expired lots (aligned with burn logic)
    const lots = await this.prisma.earnLot.findMany({
      where: {
        merchantId,
        status: 'ACTIVE',
        OR: conditions,
      },
    });
    const remainByCustomer = new Map<string, number>();
    for (const lot of lots) {
      const remain = Math.max(0, (lot.points || 0) - (lot.consumedPoints || 0));
      if (remain > 0)
        remainByCustomer.set(
          lot.customerId,
          (remainByCustomer.get(lot.customerId) || 0) + remain,
        );
    }
    const cutoffDay = new Date(
      Date.UTC(
        cutoff.getUTCFullYear(),
        cutoff.getUTCMonth(),
        cutoff.getUTCDate(),
      ),
    );
    const cutoffDayEnd = new Date(cutoffDay.getTime() + 24 * 60 * 60 * 1000);
    // burned from outbox events with matching cutoff date
    const events = await this.prisma.eventOutbox.findMany({
      where: {
        merchantId,
        eventType: 'loyalty.points_ttl.burned',
        ...(windowStart ? { createdAt: { gte: windowStart } } : {}),
      },
    });
    const burnedByCustomer = new Map<string, number>();
    for (const ev of events) {
      try {
        const payload = asRecord(ev.payload);
        const cutoffValue = payload?.cutoff;
        let pCutoff: Date | undefined;
        if (cutoffValue instanceof Date) {
          pCutoff = cutoffValue;
        } else if (
          typeof cutoffValue === 'string' ||
          typeof cutoffValue === 'number'
        ) {
          pCutoff = new Date(cutoffValue);
        }
        if (
          pCutoff &&
          !isNaN(pCutoff.getTime()) &&
          pCutoff >= cutoffDay &&
          pCutoff < cutoffDayEnd
        ) {
          const customerIdValue = payload?.customerId;
          const cid =
            typeof customerIdValue === 'string' ? customerIdValue : '';
          const amountValue = payload?.amount;
          const amt =
            typeof amountValue === 'number'
              ? amountValue
              : typeof amountValue === 'string'
                ? Number(amountValue)
                : 0;
          if (cid && amt > 0)
            burnedByCustomer.set(cid, (burnedByCustomer.get(cid) || 0) + amt);
        }
      } catch (err) {
        logIgnoredError(
          err,
          'MerchantsLedgerService burn preview',
          this.logger,
          'debug',
        );
      }
    }
    const customers = new Set<string>([
      ...remainByCustomer.keys(),
      ...burnedByCustomer.keys(),
    ]);
    const items = Array.from(customers).map((customerId) => ({
      customerId,
      expiredRemain: remainByCustomer.get(customerId) || 0,
      burned: burnedByCustomer.get(customerId) || 0,
      diff:
        (remainByCustomer.get(customerId) || 0) -
        (burnedByCustomer.get(customerId) || 0),
    }));
    const totals = items.reduce(
      (acc, it) => ({
        expiredRemain: acc.expiredRemain + it.expiredRemain,
        burned: acc.burned + it.burned,
        diff: acc.diff + it.diff,
      }),
      { expiredRemain: 0, burned: 0, diff: 0 },
    );
    return { merchantId, cutoff: cutoff.toISOString(), items, totals };
  }

  async exportTtlReconciliationCsv(
    merchantId: string,
    cutoffISO: string,
    onlyDiff = false,
  ) {
    const r = await this.ttlReconciliation(merchantId, cutoffISO);
    const lines = ['merchantId,cutoff,customerId,expiredRemain,burned,diff'];
    const arr = onlyDiff ? r.items.filter((it) => it.diff !== 0) : r.items;
    for (const it of arr) {
      const row = [
        r.merchantId,
        r.cutoff,
        it.customerId,
        it.expiredRemain,
        it.burned,
        it.diff,
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(',');
      lines.push(row);
    }
    lines.push(
      [
        r.merchantId,
        r.cutoff,
        'TOTALS',
        r.totals.expiredRemain,
        r.totals.burned,
        r.totals.diff,
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(','),
    );
    return lines.join('\n') + '\n';
  }

  async listEarnLots(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      activeOnly?: boolean;
    },
  ) {
    const where: Prisma.EarnLotWhereInput = { merchantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.before) where.createdAt = { lt: params.before };
    if (params.activeOnly) {
      const activeFilters = [
        { consumedPoints: null },
        { consumedPoints: { lt: undefined } },
      ] as unknown as Prisma.EarnLotWhereInput[]; // prisma workaround placeholder
      where.OR = activeFilters;
    }
    const items = await this.prisma.earnLot.findMany({
      where,
      orderBy: { earnedAt: 'desc' },
      take: params.limit,
    });
    return items.map((entity) => {
      return {
        id: entity.id,
        merchantId: entity.merchantId,
        customerId: entity.customerId,
        points: entity.points,
        consumedPoints: entity.consumedPoints ?? 0,
        earnedAt: entity.earnedAt,
        expiresAt: entity.expiresAt ?? null,
        orderId: entity.orderId ?? null,
        receiptId: entity.receiptId ?? null,
        outletId: entity.outletId ?? null,
        staffId: entity.staffId ?? null,
        createdAt: entity.createdAt,
      } as const;
    });
  }

  async exportEarnLotsCsv(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      activeOnly?: boolean;
    },
  ) {
    const items = await this.listEarnLots(merchantId, params);
    const lines = [
      'id,customerId,points,consumedPoints,earnedAt,expiresAt,orderId,receiptId,outletId,staffId',
    ];
    for (const e of items) {
      const row = [
        e.id,
        e.customerId,
        e.points,
        e.consumedPoints || 0,
        e.earnedAt.toISOString(),
        e.expiresAt ? e.expiresAt.toISOString() : '',
        e.orderId || '',
        e.receiptId || '',
        e.outletId || '',
        e.staffId || '',
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(',');
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  async getBalance(merchantId: string, customerId: string) {
    const w = await this.prisma.wallet.findFirst({
      where: { merchantId, customerId, type: WalletType.POINTS },
    });
    return w?.balance ?? 0;
  }

  async findCustomerByPhone(merchantId: string, phone: string) {
    // Customer теперь per-merchant модель
    const raw = String(phone || '').trim();
    const normalized = normalizePhone(raw);
    if (!raw && !normalized) return null;
    const candidates = Array.from(
      new Set(
        [normalized, raw].filter((value): value is string => Boolean(value)),
      ),
    );
    const c = await this.prisma.customer.findFirst({
      where: { merchantId, phone: { in: candidates } },
    });
    if (!c) return null;
    const bal = await this.getBalance(merchantId, c.id);
    return { customerId: c.id, phone: c.phone, balance: bal };
  }
}
