import { Injectable } from '@nestjs/common';
import {
  Prisma,
  StaffMotivationAction,
  type MerchantSettings,
} from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';
import {
  STAFF_MOTIVATION_DEFAULT_NEW_POINTS,
  STAFF_MOTIVATION_DEFAULT_EXISTING_POINTS,
  type StaffMotivationPeriod,
  normalizePeriod,
  calculatePeriodWindow,
  periodLabel,
} from './staff-motivation.constants';

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

export interface StaffMotivationSettingsNormalized {
  enabled: boolean;
  pointsForNewCustomer: number;
  pointsForExistingCustomer: number;
  leaderboardPeriod: StaffMotivationPeriod;
  customDays: number | null;
  updatedAt: Date | null;
}

export interface StaffMotivationPeriodInfo {
  period: StaffMotivationPeriod;
  customDays: number | null;
  from: Date;
  to: Date;
  days: number;
  label: string;
}

export interface StaffLeaderboardEntry {
  staffId: string;
  staffName: string | null;
  staffDisplayName: string | null;
  staffLogin: string | null;
  outletId: string | null;
  outletName: string | null;
  points: number;
}

@Injectable()
export class StaffMotivationEngine {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(
    client: PrismaClientLike,
    merchantId: string,
  ): Promise<StaffMotivationSettingsNormalized> {
    const settings = await client.merchantSettings.findUnique({
      where: { merchantId },
    });
    return this.normalizeSettings(settings);
  }

  normalizeSettings(
    settings: MerchantSettings | null,
  ): StaffMotivationSettingsNormalized {
    const enabled = Boolean(settings?.staffMotivationEnabled);
    const pointsForNewCustomer =
      settings?.staffMotivationNewCustomerPoints != null
        ? Number(settings.staffMotivationNewCustomerPoints)
        : STAFF_MOTIVATION_DEFAULT_NEW_POINTS;
    const pointsForExistingCustomer =
      settings?.staffMotivationExistingCustomerPoints != null
        ? Number(settings.staffMotivationExistingCustomerPoints)
        : STAFF_MOTIVATION_DEFAULT_EXISTING_POINTS;
    const { period, customDays } = normalizePeriod(
      settings?.staffMotivationLeaderboardPeriod ?? null,
      settings?.staffMotivationCustomDays ?? null,
    );
    return {
      enabled,
      pointsForNewCustomer,
      pointsForExistingCustomer,
      leaderboardPeriod: period,
      customDays,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  async recordPurchase(
    tx: Prisma.TransactionClient,
    params: {
      merchantId: string;
      staffId?: string | null;
      outletId?: string | null;
      customerId: string;
      orderId: string;
      receiptId?: string | null;
      eventAt: Date;
      isFirstPurchase: boolean;
      settings?: StaffMotivationSettingsNormalized;
    },
  ): Promise<{ pointsIssued: number }> {
    const staffId = params.staffId ? String(params.staffId) : '';
    if (!staffId) return { pointsIssued: 0 };

    const settings =
      params.settings ??
      (await this.getSettings(tx, params.merchantId).catch((err) => {
        logIgnoredError(
          err,
          'StaffMotivationEngine get settings via tx',
          undefined,
          'debug',
          { merchantId: params.merchantId },
        );
        return this.getSettings(this.prisma, params.merchantId);
      }));
    if (!settings.enabled) return { pointsIssued: 0 };

    const points = params.isFirstPurchase
      ? Number(settings.pointsForNewCustomer || 0)
      : Number(settings.pointsForExistingCustomer || 0);
    if (!points || points <= 0) return { pointsIssued: 0 };

    const existing = await tx.staffMotivationEntry.findFirst({
      where: {
        merchantId: params.merchantId,
        orderId: params.orderId,
        staffId,
        action: StaffMotivationAction.PURCHASE,
      },
      select: { id: true },
    });
    if (existing) return { pointsIssued: 0 };

    await tx.staffMotivationEntry.create({
      data: {
        merchantId: params.merchantId,
        staffId,
        outletId: params.outletId ?? null,
        customerId: params.customerId,
        orderId: params.orderId,
        receiptId: params.receiptId ?? null,
        action: StaffMotivationAction.PURCHASE,
        points: Math.round(points),
        isNew: params.isFirstPurchase,
        share: null,
        eventAt: params.eventAt,
        meta: {
          basis: params.isFirstPurchase ? 'new_customer' : 'existing_customer',
        } as Prisma.InputJsonValue,
      },
    });

    return { pointsIssued: Math.round(points) };
  }

  async recordRefund(
    tx: Prisma.TransactionClient,
    params: {
      merchantId: string;
      orderId: string;
      eventAt: Date;
      share: number;
    },
  ): Promise<{ pointsDeducted: number }> {
    const share = clampShare(params.share);
    if (share <= 0) return { pointsDeducted: 0 };

    const purchases = await tx.staffMotivationEntry.findMany({
      where: {
        merchantId: params.merchantId,
        orderId: params.orderId,
        action: StaffMotivationAction.PURCHASE,
      },
    });
    if (!purchases.length) return { pointsDeducted: 0 };

    const existingRefunds = await tx.staffMotivationEntry.findMany({
      where: {
        merchantId: params.merchantId,
        orderId: params.orderId,
        action: StaffMotivationAction.REFUND,
      },
    });

    const refundedByKey = new Map<string, number>();
    for (const entry of existingRefunds) {
      const key = staffOutletKey(entry.staffId, entry.outletId);
      refundedByKey.set(
        key,
        (refundedByKey.get(key) ?? 0) + Math.abs(entry.points),
      );
    }

    let pointsDeducted = 0;
    for (const entry of purchases) {
      if (!entry.staffId) continue;
      const key = staffOutletKey(entry.staffId, entry.outletId);
      const target = Math.round(entry.points * share);
      if (target <= 0) continue;
      const already = refundedByKey.get(key) ?? 0;
      const remaining = Math.max(0, target - already);
      if (remaining <= 0) continue;
      await tx.staffMotivationEntry.create({
        data: {
          merchantId: params.merchantId,
          staffId: entry.staffId,
          outletId: entry.outletId ?? null,
          customerId: entry.customerId,
          orderId: params.orderId,
          receiptId: entry.receiptId ?? null,
          action: StaffMotivationAction.REFUND,
          points: -remaining,
          isNew: entry.isNew,
          share,
          eventAt: params.eventAt,
          meta: {
            baseEntryId: entry.id,
          } as Prisma.InputJsonValue,
        },
      });
      refundedByKey.set(key, already + remaining);
      pointsDeducted += remaining;
    }

    return { pointsDeducted };
  }

  async getLeaderboard(
    merchantId: string,
    options?: {
      outletId?: string | null;
      limit?: number;
      now?: Date;
    },
  ): Promise<{
    settings: StaffMotivationSettingsNormalized;
    period: StaffMotivationPeriodInfo;
    items: StaffLeaderboardEntry[];
  }> {
    const settings = await this.getSettings(this.prisma, merchantId);
    const now = options?.now ?? new Date();
    const period = settings.leaderboardPeriod;
    const customDays = settings.customDays;
    const window = calculatePeriodWindow(period, customDays, now);
    const periodInfo: StaffMotivationPeriodInfo = {
      period,
      customDays,
      from: window.from,
      to: window.to,
      days: window.days,
      label: periodLabel(period, customDays),
    };

    if (!settings.enabled) {
      return { settings, period: periodInfo, items: [] };
    }

    const where: Prisma.StaffMotivationEntryWhereInput = {
      merchantId,
      eventAt: { gte: window.from, lte: window.to },
    };
    if (options?.outletId) {
      where.outletId = options.outletId;
    }

    const totals = await this.prisma.staffMotivationEntry.groupBy({
      by: ['staffId'],
      where,
      _sum: { points: true },
    });

    const ranked = totals
      .map((row) => ({
        staffId: row.staffId,
        points: Number(row._sum?.points ?? 0),
      }))
      .filter((row) => row.staffId && row.points !== 0);

    if (!ranked.length) {
      return { settings, period: periodInfo, items: [] };
    }

    ranked.sort((a, b) => {
      if (b.points === a.points) return a.staffId.localeCompare(b.staffId);
      return b.points - a.points;
    });

    const limit =
      typeof options?.limit === 'number' && options.limit > 0
        ? Math.floor(options.limit)
        : undefined;
    const sliced = limit ? ranked.slice(0, limit) : ranked;
    const staffIds = Array.from(new Set(sliced.map((item) => item.staffId)));

    const staffRecords = await this.prisma.staff.findMany({
      where: { id: { in: staffIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        login: true,
      },
    });
    const staffMap = new Map(staffRecords.map((s) => [s.id, s]));

    const perOutlet = await this.prisma.staffMotivationEntry.groupBy({
      by: ['staffId', 'outletId'],
      where: {
        ...where,
        staffId: { in: staffIds },
      },
      _sum: { points: true },
    });

    const topOutletByStaff = new Map<
      string,
      { outletId: string | null; points: number }
    >();
    for (const entry of perOutlet) {
      const key = entry.staffId;
      const points = Number(entry._sum?.points ?? 0);
      if (!topOutletByStaff.has(key)) {
        topOutletByStaff.set(key, { outletId: entry.outletId, points });
        continue;
      }
      const current = topOutletByStaff.get(key)!;
      if (points > current.points) {
        current.outletId = entry.outletId;
        current.points = points;
      }
    }

    const outletIds = Array.from(
      new Set(
        Array.from(topOutletByStaff.values())
          .map((item) => item.outletId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const outlets = outletIds.length
      ? await this.prisma.outlet.findMany({
          where: { id: { in: outletIds } },
          select: { id: true, name: true },
        })
      : [];
    const outletMap = new Map(outlets.map((o) => [o.id, o.name ?? o.id]));

    const items: StaffLeaderboardEntry[] = sliced.map((row) => {
      const info = staffMap.get(row.staffId);
      const outletInfo = topOutletByStaff.get(row.staffId);
      const fullName = info
        ? buildStaffName(info.firstName, info.lastName)
        : null;
      const staffLabel = fullName || (info?.login ? String(info.login) : null);
      return {
        staffId: row.staffId,
        staffName: staffLabel,
        staffDisplayName: fullName,
        staffLogin: info?.login ?? null,
        outletId: outletInfo?.outletId ?? null,
        outletName:
          outletInfo?.outletId != null
            ? (outletMap.get(outletInfo.outletId) ?? outletInfo.outletId)
            : null,
        points: row.points,
      };
    });

    return { settings, period: periodInfo, items };
  }
}

function staffOutletKey(staffId: string, outletId?: string | null) {
  return `${staffId}|${outletId ?? ''}`;
}

function buildStaffName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const parts = [firstName, lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => Boolean(part));
  if (parts.length) return parts.join(' ');
  return null;
}

function clampShare(input: number): number {
  if (!Number.isFinite(input)) return 0;
  if (input < 0) return 0;
  if (input > 1) return 1;
  return Number(input);
}
