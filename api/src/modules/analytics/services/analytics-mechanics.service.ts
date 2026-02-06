import { Injectable } from '@nestjs/common';
import { Prisma, TxnType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import { AnalyticsTimezoneService } from '../analytics-timezone.service';
import { getRulesRoot } from '../../../shared/rules-json.util';
import { asRecord as asRecordShared } from '../../../shared/common/input.util';
import type { DashboardPeriod } from '../analytics.service';
import { formatDateLabel } from '../analytics-time.util';

@Injectable()
export class AnalyticsMechanicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AnalyticsCacheService,
    private readonly timezone: AnalyticsTimezoneService,
  ) {}

  private cacheKey(
    prefix: string,
    parts: Array<string | number | null | undefined>,
  ) {
    return [
      prefix,
      ...parts.map((part) => (part == null ? '' : String(part))),
    ].join('|');
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return asRecordShared(value);
  }

  async getAutoReturnMetrics(
    merchantId: string,
    period: DashboardPeriod,
    outletId?: string,
  ): Promise<{
    period: {
      from: string;
      to: string;
      type: DashboardPeriod['type'];
      thresholdDays: number;
      giftPoints: number;
      giftTtlDays: number;
      giftBurnEnabled: boolean;
    };
    summary: {
      invitations: number;
      returned: number;
      conversion: number;
      pointsCost: number;
      firstPurchaseRevenue: number;
    };
    distance: {
      customers: number;
      purchasesPerCustomer: number;
      purchasesCount: number;
      totalAmount: number;
      averageCheck: number;
    };
    rfm: Array<{ segment: string; invitations: number; returned: number }>;
    trends: {
      attempts: Array<{ date: string; invitations: number; returns: number }>;
      revenue: Array<{ date: string; total: number; firstPurchases: number }>;
      rfmReturns: Array<{ date: string; segment: string; returned: number }>;
    };
  }> {
    const cacheKey = this.cacheKey('auto-return', [
      merchantId,
      outletId,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<{
      period: {
        from: string;
        to: string;
        type: DashboardPeriod['type'];
        thresholdDays: number;
        giftPoints: number;
        giftTtlDays: number;
        giftBurnEnabled: boolean;
      };
      summary: {
        invitations: number;
        returned: number;
        conversion: number;
        pointsCost: number;
        firstPurchaseRevenue: number;
      };
      distance: {
        customers: number;
        purchasesPerCustomer: number;
        purchasesCount: number;
        totalAmount: number;
        averageCheck: number;
      };
      rfm: Array<{ segment: string; invitations: number; returned: number }>;
      trends: {
        attempts: Array<{ date: string; invitations: number; returns: number }>;
        revenue: Array<{ date: string; total: number; firstPurchases: number }>;
        rfmReturns: Array<{ date: string; segment: string; returned: number }>;
      };
    }>(cacheKey);
    if (cached) return cached;
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });

    const rules = getRulesRoot(settings?.rulesJson) ?? {};
    const autoReturn = this.asRecord(rules.autoReturn) ?? {};

    const thresholdDays = Math.max(
      1,
      Math.floor(
        Number(autoReturn.days ?? autoReturn.thresholdDays ?? 60) || 60,
      ),
    );
    const giftPoints = Math.max(
      0,
      Math.floor(Number(autoReturn.giftPoints ?? 0) || 0),
    );
    const giftBurnEnabled = Boolean(
      autoReturn.giftBurnEnabled ??
        (Number(autoReturn.giftTtlDays ?? 0) || 0) > 0,
    );
    const giftTtlDays = giftBurnEnabled
      ? Math.max(0, Math.floor(Number(autoReturn.giftTtlDays ?? 0) || 0))
      : 0;

    const from = new Date(period.from);
    const to = new Date(period.to);
    const msInDay = 24 * 60 * 60 * 1000;

    const refundOrderIds = new Set(
      (
        await this.prisma.transaction.findMany({
          where: {
            merchantId,
            type: TxnType.REFUND,
            canceledAt: null,
            orderId: { not: null },
            createdAt: { lte: to },
          },
          select: { orderId: true },
        })
      )
        .map((row) => row.orderId)
        .filter((id): id is string => Boolean(id)),
    );

    let outletCustomers: Set<string> | null = null;
    if (outletId && outletId !== 'all') {
      const outletReceipts = await this.prisma.receipt.findMany({
        where: {
          merchantId,
          outletId,
          createdAt: { lte: to },
          canceledAt: null,
          customer: { erasedAt: null },
        },
        select: { customerId: true },
      });
      outletCustomers = new Set(
        outletReceipts
          .map((row) => row.customerId)
          .filter((id): id is string => Boolean(id)),
      );
    }

    const attemptsRaw = await this.prisma.autoReturnAttempt.findMany({
      where: {
        merchantId,
        invitedAt: { gte: from, lte: to },
        status: { not: 'CANCELED' },
        customer: { erasedAt: null },
      },
      select: {
        id: true,
        customerId: true,
        invitedAt: true,
        status: true,
        giftPoints: true,
        giftExpiresAt: true,
        lastPurchaseAt: true,
      },
    });

    type AttemptInfo = {
      id: string;
      customerId: string;
      invitedAt: Date;
      giftPoints: number;
      expiresAt: Date | null;
    };

    const attemptsByCustomer = new Map<string, AttemptInfo>();
    for (const attempt of attemptsRaw) {
      if (!attempt.customerId) continue;
      if (attempt.status === 'FAILED') continue;
      if (outletCustomers && !outletCustomers.has(attempt.customerId)) continue;
      const giftPointsValue = Math.max(0, Number(attempt.giftPoints ?? 0));
      const expiresAt =
        giftBurnEnabled && giftPointsValue > 0
          ? attempt.giftExpiresAt
            ? new Date(attempt.giftExpiresAt)
            : new Date(attempt.invitedAt.getTime() + giftTtlDays * msInDay)
          : null;
      const existing = attemptsByCustomer.get(attempt.customerId);
      if (
        !existing ||
        attempt.invitedAt.getTime() < existing.invitedAt.getTime()
      ) {
        attemptsByCustomer.set(attempt.customerId, {
          id: attempt.id,
          customerId: attempt.customerId,
          invitedAt: new Date(attempt.invitedAt),
          giftPoints: giftPointsValue,
          expiresAt,
        });
      }
    }

    const attempts = Array.from(attemptsByCustomer.values());
    if (!attempts.length) {
      const empty = {
        period: {
          from: from.toISOString(),
          to: to.toISOString(),
          type: period.type,
          thresholdDays,
          giftPoints,
          giftTtlDays,
          giftBurnEnabled,
        },
        summary: {
          invitations: 0,
          returned: 0,
          conversion: 0,
          pointsCost: 0,
          firstPurchaseRevenue: 0,
        },
        distance: {
          customers: 0,
          purchasesPerCustomer: 0,
          purchasesCount: 0,
          totalAmount: 0,
          averageCheck: 0,
        },
        rfm: [],
        trends: { attempts: [], revenue: [], rfmReturns: [] },
      };
      this.cache.set(cacheKey, empty);
      return empty;
    }

    const customerIds = attempts.map((item) => item.customerId);
    const statsRows =
      customerIds.length === 0
        ? []
        : await this.prisma.customerStats.findMany({
            where: {
              merchantId,
              customerId: { in: customerIds },
              customer: { erasedAt: null },
            },
            select: { customerId: true, rfmClass: true },
          });
    const rfmByCustomer = new Map<string, string>();
    for (const row of statsRows) {
      const label =
        typeof row.rfmClass === 'string' && row.rfmClass.trim().length
          ? row.rfmClass.trim()
          : 'Не рассчитано';
      rfmByCustomer.set(row.customerId, label);
    }

    const receiptWhere: Prisma.ReceiptWhereInput = {
      merchantId,
      customerId: { in: customerIds },
      createdAt: { gte: from, lte: to },
      canceledAt: null,
      customer: { erasedAt: null },
    };
    if (outletId && outletId !== 'all') {
      receiptWhere.outletId = outletId;
    }

    const receiptsRaw = await this.prisma.receipt.findMany({
      where: receiptWhere,
      select: {
        id: true,
        customerId: true,
        createdAt: true,
        total: true,
        redeemApplied: true,
        orderId: true,
      },
    });

    const receipts = receiptsRaw.filter((row) => {
      if (!row.customerId) return false;
      if (row.orderId && refundOrderIds.has(row.orderId)) return false;
      return true;
    });

    const receiptsByCustomer = new Map<
      string,
      Array<{
        id: string;
        createdAt: Date;
        total: number;
        redeemApplied: number;
      }>
    >();
    for (const receipt of receipts) {
      const customerId = receipt.customerId;
      const arr = receiptsByCustomer.get(customerId) ?? [];
      arr.push({
        id: receipt.id,
        createdAt: new Date(receipt.createdAt),
        total: Number(receipt.total ?? 0),
        redeemApplied: Math.max(0, Number(receipt.redeemApplied ?? 0)),
      });
      receiptsByCustomer.set(customerId, arr);
    }
    for (const arr of receiptsByCustomer.values()) {
      arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    const invitesByDay = new Map<string, number>();
    const returnsByDay = new Map<string, number>();
    const revenueByDay = new Map<string, number>();
    const firstRevenueByDay = new Map<string, number>();
    const rfmTimeline = new Map<string, number>();
    const rfmCounters = new Map<
      string,
      { invitations: number; returned: number }
    >();

    let invitations = 0;
    let returned = 0;
    let pointsCost = 0;
    let firstPurchaseRevenue = 0;
    let repeatCustomers = 0;
    let purchasesAfterReturn = 0;
    let amountAfterReturn = 0;

    const timezone = await this.timezone.getTimezoneInfo(merchantId);
    const dateKey = (value: Date) => formatDateLabel(value, timezone);

    for (const attempt of attempts) {
      const customerId = attempt.customerId;
      const segment = rfmByCustomer.get(customerId) ?? 'Не рассчитано';
      if (!rfmCounters.has(segment)) {
        rfmCounters.set(segment, { invitations: 0, returned: 0 });
      }
      rfmCounters.get(segment)!.invitations += 1;

      invitations += 1;
      const inviteBucket = dateKey(attempt.invitedAt);
      invitesByDay.set(inviteBucket, (invitesByDay.get(inviteBucket) ?? 0) + 1);

      const customerReceipts =
        receiptsByCustomer
          .get(customerId)
          ?.filter((receipt) => receipt.createdAt >= attempt.invitedAt) ?? [];
      if (!customerReceipts.length) continue;

      const giftSpentByReceipt = new Map<string, number>();
      let availableGift = Math.max(0, attempt.giftPoints);
      const burnActive = giftBurnEnabled && attempt.giftPoints > 0;
      const expireAt = burnActive ? attempt.expiresAt : null;

      for (const receipt of customerReceipts) {
        let spent = 0;
        if (
          availableGift > 0 &&
          (!burnActive ||
            !expireAt ||
            receipt.createdAt.getTime() <= expireAt.getTime())
        ) {
          spent = Math.min(availableGift, receipt.redeemApplied);
          availableGift -= spent;
        }
        giftSpentByReceipt.set(receipt.id, spent);
        pointsCost += spent;
      }

      const firstReceipt = customerReceipts[0];
      if (!firstReceipt) continue;
      const giftSpentFirst = giftSpentByReceipt.get(firstReceipt.id) ?? 0;
      const isExpired =
        burnActive &&
        expireAt &&
        firstReceipt.createdAt.getTime() > expireAt.getTime();
      if (isExpired) continue;

      returned += 1;
      rfmCounters.get(segment)!.returned += 1;

      const firstBucket = dateKey(firstReceipt.createdAt);
      returnsByDay.set(firstBucket, (returnsByDay.get(firstBucket) ?? 0) + 1);
      rfmTimeline.set(
        `${firstBucket}|${segment}`,
        (rfmTimeline.get(`${firstBucket}|${segment}`) ?? 0) + 1,
      );

      const firstNet = Math.max(0, firstReceipt.total - giftSpentFirst);
      firstPurchaseRevenue += firstNet;
      firstRevenueByDay.set(
        firstBucket,
        (firstRevenueByDay.get(firstBucket) ?? 0) + firstNet,
      );

      for (const receipt of customerReceipts) {
        const spent = giftSpentByReceipt.get(receipt.id) ?? 0;
        const net = Math.max(0, receipt.total - spent);
        const bucket = dateKey(receipt.createdAt);
        revenueByDay.set(bucket, (revenueByDay.get(bucket) ?? 0) + net);
      }

      const afterFirst = customerReceipts.filter(
        (receipt) =>
          receipt.createdAt.getTime() > firstReceipt.createdAt.getTime(),
      );
      if (afterFirst.length > 0) {
        repeatCustomers += 1;
        purchasesAfterReturn += afterFirst.length;
        amountAfterReturn += afterFirst.reduce(
          (sum, receipt) => sum + receipt.total,
          0,
        );
      }
    }

    const daysCount = Math.max(
      1,
      Math.floor((to.getTime() - from.getTime()) / msInDay) + 1,
    );
    const attemptsTrend: Array<{
      date: string;
      invitations: number;
      returns: number;
    }> = [];
    const revenueTrend: Array<{
      date: string;
      total: number;
      firstPurchases: number;
    }> = [];
    for (let i = 0; i < daysCount; i += 1) {
      const current = new Date(from.getTime() + i * msInDay);
      const key = dateKey(current);
      attemptsTrend.push({
        date: key,
        invitations: invitesByDay.get(key) ?? 0,
        returns: returnsByDay.get(key) ?? 0,
      });
      revenueTrend.push({
        date: key,
        total: revenueByDay.get(key) ?? 0,
        firstPurchases: firstRevenueByDay.get(key) ?? 0,
      });
    }

    const rfmReturns = Array.from(rfmTimeline.entries())
      .map(([key, count]) => {
        const [date, ...segmentParts] = key.split('|');
        return { date, segment: segmentParts.join('|'), returned: count ?? 0 };
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.segment.localeCompare(b.segment),
      );

    const conversion = invitations > 0 ? (returned / invitations) * 100 : 0;
    const purchasesPerCustomer =
      returned > 0 ? purchasesAfterReturn / returned : 0;
    const averageCheck =
      purchasesAfterReturn > 0
        ? Math.round(amountAfterReturn / purchasesAfterReturn)
        : 0;

    const summary = {
      invitations,
      returned,
      conversion: Math.round(conversion * 10) / 10,
      pointsCost: Math.round(pointsCost),
      firstPurchaseRevenue: Math.round(firstPurchaseRevenue),
    };

    const distance = {
      customers: repeatCustomers,
      purchasesPerCustomer:
        Math.round(Math.max(0, purchasesPerCustomer) * 10) / 10,
      purchasesCount: purchasesAfterReturn,
      totalAmount: Math.round(amountAfterReturn),
      averageCheck,
    };

    const rfm = Array.from(rfmCounters.entries())
      .map(([segment, counters]) => ({
        segment,
        invitations: counters.invitations,
        returned: counters.returned,
      }))
      .sort(
        (a, b) =>
          (b.invitations ?? 0) - (a.invitations ?? 0) ||
          a.segment.localeCompare(b.segment),
      );

    const result = {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        type: period.type,
        thresholdDays,
        giftPoints,
        giftTtlDays,
        giftBurnEnabled,
      },
      summary,
      distance,
      rfm,
      trends: {
        attempts: attemptsTrend,
        revenue: revenueTrend,
        rfmReturns,
      },
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  async getBirthdayMechanicMetrics(
    merchantId: string,
    period: DashboardPeriod,
    outletId?: string,
  ): Promise<{
    period: {
      from: string;
      to: string;
      type: DashboardPeriod['type'];
      daysBefore: number;
      onlyBuyers: boolean;
      giftPoints: number;
      giftTtlDays: number;
      purchaseWindowDays: number;
    };
    summary: {
      greetings: number;
      giftPurchasers: number;
      revenueNet: number;
      averageCheck: number;
      giftPointsSpent: number;
      receiptsWithGifts: number;
    };
    timeline: Array<{ date: string; greetings: number; purchases: number }>;
    revenue: Array<{ date: string; revenue: number }>;
  }> {
    const cacheKey = this.cacheKey('birthday-mechanic', [
      merchantId,
      outletId,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<{
      period: {
        from: string;
        to: string;
        type: DashboardPeriod['type'];
        daysBefore: number;
        onlyBuyers: boolean;
        giftPoints: number;
        giftTtlDays: number;
        purchaseWindowDays: number;
      };
      summary: {
        greetings: number;
        giftPurchasers: number;
        revenueNet: number;
        averageCheck: number;
        giftPointsSpent: number;
        receiptsWithGifts: number;
      };
      timeline: Array<{ date: string; greetings: number; purchases: number }>;
      revenue: Array<{ date: string; revenue: number }>;
    }>(cacheKey);
    if (cached) return cached;
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });

    const rules = getRulesRoot(settings?.rulesJson) ?? {};
    const birthday = this.asRecord(rules.birthday) ?? {};

    const daysBefore = Math.max(
      0,
      Math.floor(Number(birthday.daysBefore ?? birthday.days ?? 5) || 5),
    );
    const onlyBuyers = Boolean(
      birthday.onlyBuyers ??
        birthday.buyersOnly ??
        birthday.onlyCustomers ??
        false,
    );
    const giftPoints = Math.max(
      0,
      Math.floor(Number(birthday.giftPoints ?? 0) || 0),
    );
    const giftTtlDays = Math.max(
      0,
      Math.floor(Number(birthday.giftTtlDays ?? birthday.giftTtl ?? 0) || 0),
    );
    const purchaseWindowDays = Math.max(7, daysBefore + 7);
    const basePeriod = {
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        type: period.type,
        daysBefore,
        onlyBuyers,
        giftPoints,
        giftTtlDays,
        purchaseWindowDays,
      },
    };

    const empty = {
      ...basePeriod,
      summary: {
        greetings: 0,
        giftPurchasers: 0,
        revenueNet: 0,
        averageCheck: 0,
        giftPointsSpent: 0,
        receiptsWithGifts: 0,
      },
      timeline: [],
      revenue: [],
    };

    const dateKey = (value: Date) => value.toISOString().slice(0, 10);

    const refundOrderIds = new Set(
      (
        await this.prisma.transaction.findMany({
          where: {
            merchantId,
            type: TxnType.REFUND,
            canceledAt: null,
            orderId: { not: null },
            createdAt: { lte: period.to },
          },
          select: { orderId: true },
        })
      )
        .map((row) => row.orderId)
        .filter((id): id is string => Boolean(id)),
    );

    let outletCustomers: Set<string> | null = null;
    if (outletId && outletId !== 'all') {
      const outletReceipts = await this.prisma.receipt.findMany({
        where: {
          merchantId,
          outletId,
          createdAt: { lte: period.to },
          canceledAt: null,
        },
        select: { customerId: true },
      });
      outletCustomers = new Set(
        outletReceipts
          .map((row) => row.customerId)
          .filter((id): id is string => Boolean(id)),
      );
    }

    const greetingsRaw = await this.prisma.birthdayGreeting.findMany({
      where: {
        merchantId,
        sendDate: { gte: period.from, lte: period.to },
      },
      select: { customerId: true, sendDate: true },
    });
    const greetings = greetingsRaw.filter(
      (row) => !outletCustomers || outletCustomers.has(row.customerId),
    );
    const greetingCustomers = new Set(
      greetings.map((row) => row.customerId).filter(Boolean),
    );

    const receiptFilter: Prisma.ReceiptWhereInput = {
      merchantId,
      createdAt: { gte: period.from, lte: period.to },
      redeemApplied: { gt: 0 },
      canceledAt: null,
      ...(outletId && outletId !== 'all' ? { outletId } : {}),
    };
    const receiptsRaw = await this.prisma.receipt.findMany({
      where: receiptFilter,
      select: {
        id: true,
        customerId: true,
        createdAt: true,
        total: true,
        redeemApplied: true,
        orderId: true,
      },
    });
    const receipts = receiptsRaw.filter((row) => {
      if (!row.customerId) return false;
      if (row.orderId && refundOrderIds.has(row.orderId)) return false;
      return true;
    });

    const birthdayCustomers = Array.from(greetingCustomers);
    if (!birthdayCustomers.length) {
      this.cache.set(cacheKey, empty);
      return empty;
    }

    const purchaseWindowFrom = new Date(period.from);
    purchaseWindowFrom.setDate(
      purchaseWindowFrom.getDate() - purchaseWindowDays,
    );

    const purchasesRaw = await this.prisma.receipt.findMany({
      where: {
        merchantId,
        customerId: { in: birthdayCustomers },
        createdAt: { gte: purchaseWindowFrom, lte: period.to },
        canceledAt: null,
        ...(outletId && outletId !== 'all' ? { outletId } : {}),
      },
      select: {
        id: true,
        customerId: true,
        createdAt: true,
        total: true,
        redeemApplied: true,
        orderId: true,
      },
    });
    const purchases = purchasesRaw.filter((row) => {
      if (!row.customerId) return false;
      if (row.orderId && refundOrderIds.has(row.orderId)) return false;
      return true;
    });

    const purchasesByCustomer = new Map<
      string,
      Array<{
        id: string;
        createdAt: Date;
        total: number;
        redeemApplied: number;
      }>
    >();
    for (const purchase of purchases) {
      const arr = purchasesByCustomer.get(purchase.customerId) ?? [];
      arr.push({
        id: purchase.id,
        createdAt: new Date(purchase.createdAt),
        total: Number(purchase.total ?? 0),
        redeemApplied: Math.max(0, Number(purchase.redeemApplied ?? 0)),
      });
      purchasesByCustomer.set(purchase.customerId, arr);
    }
    for (const arr of purchasesByCustomer.values()) {
      arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    const giftSpentByReceipt = new Map<string, number>();
    const receiptsByCustomer = new Map<
      string,
      Array<{
        id: string;
        createdAt: Date;
        total: number;
        redeemApplied: number;
      }>
    >();

    for (const receipt of receipts) {
      const arr = receiptsByCustomer.get(receipt.customerId) ?? [];
      arr.push({
        id: receipt.id,
        createdAt: new Date(receipt.createdAt),
        total: Number(receipt.total ?? 0),
        redeemApplied: Math.max(0, Number(receipt.redeemApplied ?? 0)),
      });
      receiptsByCustomer.set(receipt.customerId, arr);
    }
    for (const arr of receiptsByCustomer.values()) {
      arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    const lots = await this.prisma.birthdayGreeting.findMany({
      where: {
        merchantId,
        customerId: { in: birthdayCustomers },
        createdAt: { gte: period.from, lte: period.to },
        giftPoints: { gt: 0 },
      },
      select: {
        customerId: true,
        createdAt: true,
        sendDate: true,
        giftPoints: true,
        giftExpiresAt: true,
      },
    });

    const lotsByCustomer = new Map<
      string,
      Array<{
        createdAt: Date;
        sendDate: Date;
        points: number;
        expiresAt: Date | null;
      }>
    >();
    for (const lot of lots) {
      const arr = lotsByCustomer.get(lot.customerId) ?? [];
      arr.push({
        createdAt: new Date(lot.createdAt),
        sendDate: new Date(lot.sendDate),
        points: Math.max(0, Number(lot.giftPoints ?? 0)),
        expiresAt: lot.giftExpiresAt ? new Date(lot.giftExpiresAt) : null,
      });
      lotsByCustomer.set(lot.customerId, arr);
    }
    for (const arr of lotsByCustomer.values()) {
      arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    const receiptsByCustomerInWindow = new Map<
      string,
      Array<(typeof receipts)[0]>
    >();
    for (const receipt of purchases) {
      const arr = receiptsByCustomerInWindow.get(receipt.customerId) ?? [];
      arr.push(receipt);
      receiptsByCustomerInWindow.set(receipt.customerId, arr);
    }
    for (const arr of receiptsByCustomerInWindow.values()) {
      arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    const greetingsPerBucket = new Map<string, Set<string>>();
    const purchasesPerBucket = new Map<string, Set<string>>();
    const revenuePerBucket = new Map<string, number>();

    for (const greet of greetings) {
      const bucket = dateKey(greet.sendDate);
      const list = greetingsPerBucket.get(bucket) ?? new Set<string>();
      list.add(greet.customerId);
      greetingsPerBucket.set(bucket, list);
    }

    let giftPointsSpent = 0;
    let giftPurchasers = 0;
    let receiptsWithGifts = 0;
    let revenueNet = 0;
    let grossRevenue = 0;
    let averageCheck = 0;

    const eligibleCustomers = onlyBuyers
      ? birthdayCustomers.filter((customerId) =>
          purchasesByCustomer.has(customerId),
        )
      : birthdayCustomers;

    if (!eligibleCustomers.length) {
      this.cache.set(cacheKey, empty);
      return empty;
    }

    for (const customerId of eligibleCustomers) {
      const lotsList = (lotsByCustomer.get(customerId) ?? []).slice();
      const receiptsList = (receiptsByCustomer.get(customerId) ?? []).slice();

      if (lotsList.length === 0 || receiptsList.length === 0) continue;

      const lotByReceipt = new Map<string, number>();
      const lotsQueue = lotsList.slice();
      for (const receipt of receiptsList) {
        if (!lotsQueue.length) break;
        const lot = lotsQueue[0];
        if (!lot) break;
        if (receipt.createdAt.getTime() < lot.sendDate.getTime()) continue;
        const expiresAt = lot.expiresAt;
        if (expiresAt && expiresAt.getTime() < receipt.createdAt.getTime()) {
          lotsQueue.shift();
          continue;
        }
        const applied = Math.min(lot.points, receipt.redeemApplied);
        if (applied > 0) {
          lotByReceipt.set(receipt.id, applied);
          giftSpentByReceipt.set(
            receipt.id,
            (giftSpentByReceipt.get(receipt.id) ?? 0) + applied,
          );
          lot.points -= applied;
          giftPointsSpent += applied;
          receiptsWithGifts += 1;
          if (lot.points <= 0) lotsQueue.shift();
        }
      }

      const customerReceipts = receiptsByCustomerInWindow.get(customerId) ?? [];
      for (const receipt of customerReceipts) {
        const giftSpent =
          giftSpentByReceipt.get(receipt.id) ??
          lotByReceipt.get(receipt.id) ??
          0;
        if (giftSpent <= 0) {
          continue;
        }
        const net = Math.max(0, receipt.total - giftSpent);
        const bucket = dateKey(receipt.createdAt);
        const set = purchasesPerBucket.get(bucket) ?? new Set<string>();
        set.add(customerId);
        purchasesPerBucket.set(bucket, set);
        revenuePerBucket.set(bucket, (revenuePerBucket.get(bucket) ?? 0) + net);
        revenueNet += net;
        grossRevenue += receipt.total;
      }

      if (lotByReceipt.size > 0) giftPurchasers += 1;
    }

    if (receiptsWithGifts > 0) {
      averageCheck = Math.round(grossRevenue / receiptsWithGifts);
    }

    const timelineKeys = Array.from(
      new Set([...greetingsPerBucket.keys(), ...purchasesPerBucket.keys()]),
    ).sort();
    const timeline: Array<{
      date: string;
      greetings: number;
      purchases: number;
    }> = timelineKeys.map((key) => ({
      date: key,
      greetings: greetingsPerBucket.get(key)?.size ?? 0,
      purchases: purchasesPerBucket.get(key)?.size ?? 0,
    }));

    const revenue = Array.from(revenuePerBucket.entries())
      .filter(([, value]) => value > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, revenue: value }));

    const result = {
      ...basePeriod,
      summary: {
        greetings: greetings.length,
        giftPurchasers,
        revenueNet: Math.round(revenueNet),
        averageCheck,
        giftPointsSpent: Math.round(giftPointsSpent),
        receiptsWithGifts,
      },
      timeline,
      revenue,
    };
    this.cache.set(cacheKey, result);
    return result;
  }
}
