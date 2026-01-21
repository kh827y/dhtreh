import { BadRequestException, Logger } from '@nestjs/common';
import { Prisma, TxnType, WalletType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { fetchReceiptAggregates } from '../../../shared/common/receipt-aggregates.util';
import { ensureBaseTier } from '../utils/tier-defaults.util';
import { LoyaltyTierService } from './loyalty-tier.service';
import { StaffMotivationEngine } from '../../staff-motivation/staff-motivation.engine';
import type { OptionalModelsClient } from './loyalty-ops.types';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

export class LoyaltyQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiers: LoyaltyTierService,
    private readonly staffMotivation: StaffMotivationEngine,
    private readonly logger: Logger,
  ) {}

  async balance(merchantId: string, customerId: string) {
    const customer = await this.prisma.customer
      .findUnique({
        where: { id: customerId },
        select: { id: true, merchantId: true },
      })
      .catch((err) => {
        logIgnoredError(err, 'LoyaltyQueriesService balance', this.logger, 'debug');
        return null;
      });
    if (!customer || customer.merchantId !== merchantId)
      throw new BadRequestException('merchant customer not found');
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId: customer.id,
        merchantId,
        type: WalletType.POINTS,
      },
    });
    return {
      merchantId,
      customerId,
      balance: wallet?.balance ?? 0,
    };
  }

  async getBaseRatesForCustomer(
    merchantId: string,
    customerId: string,
    _opts?: { outletId?: string | null; eligibleAmount?: number },
  ) {
    const mid = typeof merchantId === 'string' ? merchantId.trim() : '';
    const cid = typeof customerId === 'string' ? customerId.trim() : '';
    if (!mid) throw new BadRequestException('merchantId required');
    if (!cid) throw new BadRequestException('customerId required');

    await ensureBaseTier(this.prisma, mid).catch((err) => {
      logIgnoredError(
        err,
        'LoyaltyQueriesService ensure base tier',
        this.logger,
        'debug',
      );
      return null;
    });
    const { earnBps, redeemLimitBps, tierMinPayment } =
      await this.tiers.resolveTierRatesForCustomer(mid, cid);
    const toPercent = (bps: number) =>
      Math.round(Math.max(0, Number(bps) || 0)) / 100;
    return {
      earnBps,
      redeemLimitBps,
      earnPercent: toPercent(earnBps),
      redeemLimitPercent: toPercent(redeemLimitBps),
      tierMinPayment,
    };
  }

  async getCustomerAnalytics(merchantId: string, customerId: string) {
    const mid = typeof merchantId === 'string' ? merchantId.trim() : '';
    const cid = typeof customerId === 'string' ? customerId.trim() : '';
    if (!mid) throw new BadRequestException('merchantId required');
    if (!cid) throw new BadRequestException('customerId required');

    const aggregates = await fetchReceiptAggregates(this.prisma, {
      merchantId: mid,
      customerIds: [cid],
      includeImportedBase: true,
    });
    let row =
      Array.isArray(aggregates) && aggregates.length ? aggregates[0] : null;
    if (!row) {
      const stats = await this.prisma.customerStats.findUnique({
        where: { merchantId_customerId: { merchantId: mid, customerId: cid } },
      });
      if (stats) {
        row = {
          customerId: cid,
          visits: Number(stats.visits ?? 0),
          totalSpent: Number(stats.totalSpent ?? 0),
          firstPurchaseAt: stats.firstSeenAt ?? null,
          lastPurchaseAt:
            stats.lastOrderAt ?? stats.lastSeenAt ?? stats.firstSeenAt ?? null,
        };
      }
    }
    const visitCount = row?.visits ?? 0;
    const totalAmount = Math.max(0, Number(row?.totalSpent ?? 0));
    const avgBillRaw =
      visitCount > 0 ? Math.max(0, totalAmount) / visitCount : 0;
    const avgBill = Math.round(avgBillRaw * 100) / 100;
    const firstDate = row?.firstPurchaseAt ?? null;
    const lastDate = row?.lastPurchaseAt ?? firstDate;
    let visitFrequencyDays: number | null = null;
    if (visitCount > 1 && firstDate && lastDate) {
      const diffDays = Math.max(
        0,
        Math.round((lastDate.getTime() - firstDate.getTime()) / 86_400_000),
      );
      if (diffDays > 0) {
        visitFrequencyDays =
          Math.round((diffDays / (visitCount - 1)) * 100) / 100;
      }
    }
    return {
      visitCount,
      totalAmount,
      avgBill,
      visitFrequencyDays,
    };
  }

  async getStaffMotivationConfig(merchantId: string) {
    return this.staffMotivation.getSettings(this.prisma, merchantId);
  }

  async getStaffMotivationLeaderboard(
    merchantId: string,
    options?: { outletId?: string | null; limit?: number },
  ) {
    return this.staffMotivation.getLeaderboard(merchantId, options);
  }

  async outletTransactions(
    merchantId: string,
    outletId: string,
    limit = 20,
    before?: Date,
  ) {
    const allowSameReceipt = await this.tiers.isAllowSameReceipt(merchantId);
    const formatStaff = (staff?: {
      firstName?: string | null;
      lastName?: string | null;
      login?: string | null;
    }): string | null => {
      if (!staff) return null;
      const name = [staff.firstName, staff.lastName]
        .map((p) => (p || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      return name || staff.login?.trim() || null;
    };
    const formatDevice = (device?: { code?: string | null }): string | null => {
      if (!device?.code) return null;
      const code = device.code.trim();
      return code.length > 0 ? code : null;
    };
    const formatCustomer = (customer?: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
    }): string | null => {
      if (!customer) return null;
      return (
        customer.name?.trim() ||
        customer.phone?.trim() ||
        customer.email?.trim() ||
        null
      );
    };
    const hardLimit = Math.min(Math.max(limit, 1), 100);
    const whereTx: Prisma.TransactionWhereInput = {
      merchantId,
      outletId,
      canceledAt: null,
      type: { in: [TxnType.EARN, TxnType.REDEEM, TxnType.REFUND] },
    };
    if (before) whereTx.createdAt = { lt: before };

    const txItems = await this.prisma.transaction.findMany({
      where: whereTx,
      orderBy: { createdAt: 'desc' },
      take: hardLimit,
      include: {
        outlet: { select: { name: true } },
        staff: { select: { firstName: true, lastName: true, login: true } },
        device: { select: { code: true } },
        customer: { select: { name: true, phone: true, email: true } },
      },
    });

    const orderIdsForReceipts = Array.from(
      new Set(
        txItems
          .map((entity) => {
            if (typeof entity.orderId !== 'string') return null;
            const trimmed = entity.orderId.trim();
            return trimmed.length > 0 ? trimmed : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const receiptMetaByOrderId = new Map<
      string,
      {
        receiptNumber: string | null;
        createdAt: string;
        total: number;
        earnApplied: number;
        redeemApplied: number;
        staffName: string | null;
        staffId: string | null;
        deviceCode: string | null;
        customerName: string | null;
        outletName: string | null;
      }
    >();
    if (orderIdsForReceipts.length > 0) {
      const receipts = await this.prisma.receipt.findMany({
        where: { merchantId, orderId: { in: orderIdsForReceipts } },
        select: {
          orderId: true,
          receiptNumber: true,
          createdAt: true,
          total: true,
          earnApplied: true,
          redeemApplied: true,
          outlet: { select: { name: true } },
          staff: { select: { firstName: true, lastName: true, login: true } },
          staffId: true,
          device: { select: { code: true } },
          customer: { select: { name: true, phone: true, email: true } },
        },
      });
      for (const receipt of receipts) {
        if (!receipt.orderId) continue;
        const key = receipt.orderId;
        const normalized =
          typeof receipt.receiptNumber === 'string' &&
          receipt.receiptNumber.trim().length > 0
            ? receipt.receiptNumber.trim()
            : null;
        receiptMetaByOrderId.set(key, {
          receiptNumber: normalized,
          createdAt: receipt.createdAt.toISOString(),
          total: Number(receipt.total ?? 0),
          earnApplied: Math.max(0, Number(receipt.earnApplied ?? 0)),
          redeemApplied: Math.max(0, Number(receipt.redeemApplied ?? 0)),
          staffName: formatStaff(receipt.staff ?? undefined),
          staffId: receipt.staffId ?? null,
          deviceCode: formatDevice(receipt.device ?? undefined),
          customerName: formatCustomer(receipt.customer ?? undefined),
          outletName: receipt.outlet?.name?.trim() || null,
        });
      }
    }

    const normalizedTxs = txItems.map((entity) => {
      const orderId =
        typeof entity.orderId === 'string' && entity.orderId.trim().length > 0
          ? entity.orderId.trim()
          : null;
      const receiptMeta = orderId ? receiptMetaByOrderId.get(orderId) : null;
      const staffName =
        formatStaff(entity.staff ?? undefined) ||
        receiptMeta?.staffName ||
        formatDevice(entity.device ?? undefined) ||
        receiptMeta?.deviceCode ||
        null;
      return {
        id: entity.id,
        mode: 'TXN' as const,
        type: entity.type,
        amount: entity.amount,
        orderId,
        receiptNumber: orderId ? (receiptMeta?.receiptNumber ?? null) : null,
        createdAt: entity.createdAt.toISOString(),
        outletId: entity.outletId ?? null,
        outletName: entity.outlet?.name ?? null,
        purchaseAmount: orderId ? (receiptMeta?.total ?? null) : null,
        earnApplied: orderId ? (receiptMeta?.earnApplied ?? null) : null,
        redeemApplied: orderId ? (receiptMeta?.redeemApplied ?? null) : null,
        staffId: entity.staffId ?? receiptMeta?.staffId ?? null,
        staffName,
        customerName:
          formatCustomer(entity.customer ?? undefined) ||
          receiptMeta?.customerName ||
          null,
      };
    });

    // агрегируем покупки и возвраты по чеку
    const purchaseEntries = Array.from(receiptMetaByOrderId.entries()).map(
      ([orderId, meta]) => {
        const change = (meta.earnApplied ?? 0) - (meta.redeemApplied ?? 0);
        return {
          id: `purchase:${orderId}`,
          mode: 'PURCHASE' as const,
          type: null,
          amount: change,
          orderId,
          receiptNumber: meta.receiptNumber ?? null,
          createdAt: meta.createdAt,
          outletId,
          outletName: meta.outletName ?? null,
          purchaseAmount: meta.total ?? null,
          earnApplied: meta.earnApplied ?? null,
          redeemApplied: meta.redeemApplied ?? null,
          refundEarn: null,
          refundRedeem: null,
          staffId: meta.staffId ?? null,
          staffName: meta.staffName ?? meta.deviceCode ?? null,
          customerName: meta.customerName ?? null,
        };
      },
    );

    type RefundGroup = {
      earn: number;
      redeem: number;
      createdAt: string;
      receiptNumber: string | null;
      staffId: string | null;
      staffName: string | null;
      customerName: string | null;
    };
    const refundGrouped = new Map<string, RefundGroup>();
    for (const tx of normalizedTxs) {
      if (tx.type !== TxnType.REFUND) continue;
      const orderId = tx.orderId ?? 'unknown';
      const group = refundGrouped.get(orderId) ?? {
        earn: 0,
        redeem: 0,
        createdAt: tx.createdAt,
        receiptNumber: tx.receiptNumber ?? null,
        staffId: tx.staffId ?? null,
        staffName: tx.staffName ?? null,
        customerName: tx.customerName ?? null,
      };
      const amount = Number(tx.amount ?? 0);
      if (amount > 0) group.redeem += amount;
      else if (amount < 0) group.earn += Math.abs(amount);
      if (tx.createdAt > group.createdAt) group.createdAt = tx.createdAt;
      if (!group.receiptNumber && tx.receiptNumber)
        group.receiptNumber = tx.receiptNumber;
      if (!group.staffId && tx.staffId) group.staffId = tx.staffId;
      if (!group.staffName && tx.staffName) group.staffName = tx.staffName;
      if (!group.customerName && tx.customerName)
        group.customerName = tx.customerName;
      refundGrouped.set(orderId, group);
    }

    const refundEntries = Array.from(refundGrouped.entries()).map(
      ([orderId, meta]) => {
        const receiptMeta = receiptMetaByOrderId.get(orderId);
        const purchaseAmount = receiptMeta?.total ?? null;
        return {
          id: `refund:${orderId}`,
          mode: 'REFUND' as const,
          type: null,
          amount: (meta.redeem ?? 0) - (meta.earn ?? 0),
          orderId: orderId === 'unknown' ? null : orderId,
          receiptNumber:
            meta.receiptNumber ?? receiptMeta?.receiptNumber ?? null,
          createdAt: meta.createdAt,
          outletId,
          outletName: receiptMeta?.outletName ?? null,
          purchaseAmount,
          earnApplied: null,
          redeemApplied: null,
          refundEarn: meta.earn ?? 0,
          refundRedeem: meta.redeem ?? 0,
          staffId: meta.staffId ?? receiptMeta?.staffId ?? null,
          staffName:
            meta.staffName ??
            receiptMeta?.staffName ??
            receiptMeta?.deviceCode ??
            null,
          customerName: meta.customerName ?? receiptMeta?.customerName ?? null,
        };
      },
    );

    const isolatedTx = normalizedTxs.filter(
      (tx) =>
        tx.mode === 'TXN' &&
        (!tx.orderId || !receiptMetaByOrderId.has(tx.orderId)),
    );

    const merged = [...purchaseEntries, ...refundEntries, ...isolatedTx].sort(
      (a, b) =>
        a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    const sliced = merged.slice(0, hardLimit);
    const nextBefore =
      sliced.length > 0 ? sliced[sliced.length - 1].createdAt : null;
    return { items: sliced, nextBefore, allowSameReceipt };
  }

  async transactions(
    merchantId: string,
    customerId: string,
    limit = 20,
    before?: Date,
    filters?: { outletId?: string | null; staffId?: string | null },
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, merchantId: true },
    });
    if (!customer || customer.merchantId !== merchantId)
      throw new BadRequestException('customer not found');
    const hardLimit = Math.min(Math.max(limit, 1), 100);
    const now = new Date();

    // 1) Обычные транзакции
    const whereTx: Prisma.TransactionWhereInput = { merchantId, customerId };
    if (before) whereTx.createdAt = { lt: before };
    if (filters?.outletId) whereTx.outletId = filters.outletId;
    if (filters?.staffId) whereTx.staffId = filters.staffId;
    const txItems = await this.prisma.transaction.findMany({
      where: whereTx,
      orderBy: { createdAt: 'desc' },
      take: hardLimit,
      include: {
        device: { select: { code: true } },
        reviews: { select: { id: true, rating: true, createdAt: true } },
      },
    });

    // Отмеченные закрытые окна отзыва (кросс-девайс подавление показа)
    const reviewDismissedByTxId = new Map<string, string>();
    const txIds = txItems.map((item) => item.id).filter(Boolean);
    if (txIds.length > 0) {
      try {
        type LoyaltyRealtimeRecord = {
          transactionId?: string | null;
          emittedAt?: unknown;
          createdAt?: unknown;
          updatedAt?: unknown;
          payload?: unknown;
        };
        const optionalClient = this.prisma as OptionalModelsClient;
        const records =
          ((await optionalClient.loyaltyRealtimeEvent?.findMany?.({
            where: {
              merchantId,
              customerId,
              transactionId: { in: txIds },
              eventType: 'loyalty.review.dismissed',
            },
            select: {
              transactionId: true,
              emittedAt: true,
              createdAt: true,
              updatedAt: true,
              payload: true,
            },
          })) as LoyaltyRealtimeRecord[]) || [];
        const normalizeDate = (value: unknown): string | null => {
          if (value instanceof Date) return value.toISOString();
          if (typeof value === 'string' && value.trim()) {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
          }
          return null;
        };
        for (const record of records) {
          if (!record?.transactionId) continue;
          const payload =
            record.payload &&
            typeof record.payload === 'object' &&
            !Array.isArray(record.payload)
              ? (record.payload as Record<string, unknown>)
              : null;
          const ts =
            normalizeDate(payload?.dismissedAt) ||
            normalizeDate(record.emittedAt) ||
            normalizeDate(record.updatedAt) ||
            normalizeDate(record.createdAt);
          if (!ts) continue;
          const existing = reviewDismissedByTxId.get(record.transactionId);
          if (!existing || ts > existing) {
            reviewDismissedByTxId.set(record.transactionId, ts);
          }
        }
      } catch (err) {
        this.logger.debug(
          `transactions: load realtime review events failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // 2) «Отложенные начисления» (EarnLot.status = PENDING)
    const whereLots: Prisma.EarnLotWhereInput = {
      merchantId,
      customerId,
      status: 'PENDING',
    };
    if (before) whereLots.createdAt = { lt: before };
    if (filters?.outletId) whereLots.outletId = filters.outletId;
    if (filters?.staffId) whereLots.staffId = filters.staffId;
    const pendingLots = await this.prisma.earnLot.findMany({
      where: whereLots,
      orderBy: { createdAt: 'desc' },
      take: hardLimit,
      select: {
        id: true,
        merchantId: true,
        customerId: true,
        points: true,
        orderId: true,
        outletId: true,
        staffId: true,
        createdAt: true,
        maturesAt: true,
        device: { select: { code: true } },
      },
    });
    const orderIdsForReceipts = Array.from(
      new Set(
        txItems
          .map((entity) => {
            if (typeof entity.orderId !== 'string') return null;
            const trimmed = entity.orderId.trim();
            return trimmed.length > 0 ? trimmed : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const receiptMetaByOrderId = new Map<
      string,
      {
        receiptNumber: string | null;
        createdAt: string;
        total: number | null;
        redeemApplied: number | null;
      }
    >();
    if (orderIdsForReceipts.length > 0) {
      const receipts = await this.prisma.receipt.findMany({
        where: { merchantId, orderId: { in: orderIdsForReceipts } },
        select: {
          orderId: true,
          receiptNumber: true,
          createdAt: true,
          total: true,
          redeemApplied: true,
        },
      });
      for (const receipt of receipts) {
        if (!receipt.orderId) continue;
        const key = receipt.orderId;
        const normalized =
          typeof receipt.receiptNumber === 'string' &&
          receipt.receiptNumber.trim().length > 0
            ? receipt.receiptNumber.trim()
            : null;
        receiptMetaByOrderId.set(key, {
          receiptNumber: normalized,
          createdAt: receipt.createdAt.toISOString(),
          total:
            typeof receipt.total === 'number' && Number.isFinite(receipt.total)
              ? receipt.total
              : null,
          redeemApplied:
            typeof receipt.redeemApplied === 'number' &&
            Number.isFinite(receipt.redeemApplied)
              ? receipt.redeemApplied
              : null,
        });
      }
    }

    // 3) Нормализация
    const refundOrderIds = Array.from(
      new Set(
        txItems
          .map((entity) => {
            if (entity.type !== TxnType.REFUND) return null;
            if (typeof entity.orderId !== 'string') return null;
            const trimmed = entity.orderId.trim();
            return trimmed.length > 0 ? trimmed : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const refundOriginsByOrderId = new Map<string, string>();
    for (const order of refundOrderIds) {
      const meta = receiptMetaByOrderId.get(order);
      if (meta?.createdAt) {
        refundOriginsByOrderId.set(order, meta.createdAt);
      }
    }
    const fallbackOriginsByOrderId = new Map<string, string>();
    for (const entity of txItems) {
      if (entity.type === TxnType.REFUND) continue;
      if (typeof entity.orderId !== 'string') continue;
      const trimmed = entity.orderId.trim();
      if (!trimmed) continue;
      const iso = entity.createdAt.toISOString();
      const existing = fallbackOriginsByOrderId.get(trimmed);
      if (!existing || iso < existing) {
        fallbackOriginsByOrderId.set(trimmed, iso);
      }
    }

    const normalizedTxs = txItems.map((entity) => {
      const orderId =
        typeof entity.orderId === 'string' && entity.orderId.trim().length > 0
          ? entity.orderId.trim()
          : null;
      const metadataValue = entity.metadata;
      const metadata =
        metadataValue &&
        typeof metadataValue === 'object' &&
        !Array.isArray(metadataValue)
          ? (metadataValue as Record<string, unknown>)
          : null;
      const rawSource =
        typeof metadata?.source === 'string' &&
        metadata.source.trim().length > 0
          ? metadata.source.trim()
          : null;
      const source = rawSource ? rawSource.toUpperCase() : null;
      const comment =
        typeof metadata?.comment === 'string' &&
        metadata.comment.trim().length > 0
          ? metadata.comment.trim()
          : null;

      return {
        id: entity.id,
        type:
          entity.orderId === 'registration_bonus'
            ? ('REGISTRATION' as const)
            : entity.type,
        amount: entity.amount,
        orderId,
        receiptNumber: orderId
          ? (receiptMetaByOrderId.get(orderId)?.receiptNumber ?? null)
          : null,
        receiptTotal: orderId
          ? (receiptMetaByOrderId.get(orderId)?.total ?? null)
          : null,
        redeemApplied: orderId
          ? (receiptMetaByOrderId.get(orderId)?.redeemApplied ?? null)
          : null,
        customerId: entity.customerId,
        createdAt: entity.createdAt.toISOString(),
        outletId: entity.outletId ?? null,
        staffId: entity.staffId ?? null,
        deviceId: entity.device?.code ?? null,
        reviewId: entity.reviews?.[0]?.id ?? null,
        reviewRating: entity.reviews?.[0]?.rating ?? null,
        reviewCreatedAt: entity.reviews?.[0]?.createdAt
          ? entity.reviews[0].createdAt.toISOString()
          : null,
        reviewDismissedAt: reviewDismissedByTxId.get(entity.id) ?? null,
        pending: undefined,
        maturesAt: undefined,
        daysUntilMature: undefined,
        source,
        comment,
        canceledAt: entity.canceledAt ? entity.canceledAt.toISOString() : null,
        relatedOperationAt:
          entity.type === TxnType.REFUND && orderId
            ? (refundOriginsByOrderId.get(orderId) ??
              fallbackOriginsByOrderId.get(orderId) ??
              null)
            : null,
      };
    });

    const normalizedPending = pendingLots.map((lot) => {
      const mat = lot.maturesAt ?? null;
      const daysUntil = mat
        ? Math.max(
            0,
            Math.ceil((mat.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
          )
        : null;
      return {
        id: `lot:${lot.id}`,
        type: lot.orderId === 'registration_bonus' ? 'REGISTRATION' : 'EARN',
        amount: lot.points,
        orderId: lot.orderId ?? null,
        customerId: lot.customerId,
        createdAt: lot.createdAt.toISOString(),
        outletId: lot.outletId ?? null,
        staffId: lot.staffId ?? null,
        deviceId: lot.device?.code ?? null,
        reviewId: null,
        reviewRating: null,
        reviewCreatedAt: null,
        pending: true,
        maturesAt: mat ? mat.toISOString() : null,
        daysUntilMature: daysUntil,
        source: null,
        comment: null,
        canceledAt: null,
        relatedOperationAt: null,
        reviewDismissedAt: null,
      };
    });

    // 4) Слияние, сортировка, пагинация
    const merged = [...normalizedTxs, ...normalizedPending].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    const sliced = merged.slice(0, hardLimit);
    const nextBefore =
      sliced.length > 0 ? sliced[sliced.length - 1].createdAt : null;
    return { items: sliced, nextBefore };
  }
}
