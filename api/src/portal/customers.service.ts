import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HoldMode,
  HoldStatus,
  Prisma,
  TxnType,
  WalletType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { planConsume } from '../loyalty/lots.util';

export type PortalCustomerReferrerDto = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type PortalCustomerInviteDto = {
  code: string | null;
  link: string | null;
};

export type PortalCustomerExpiryDto = {
  id: string;
  accrualDate: string;
  expiresAt: string | null;
  amount: number;
  status: 'ACTIVE' | 'PENDING';
};

export type PortalCustomerTransactionDto = {
  id: string;
  type: string;
  change: number;
  purchaseAmount: number;
  datetime: string;
  details: string;
  outlet: string | null;
  rating: number | null;
  receiptNumber: string | null;
  manager: string | null;
  carrier: string | null;
  carrierCode: string | null;
  toPay: number | null;
  paidByPoints: number | null;
  total: number | null;
  blockedAccrual: boolean;
  receiptId?: string | null;
  canceledAt?: string | null;
  canceledBy?: { id: string; name: string | null } | null;
  note?: string | null;
  kind?: string | null;
};

export type PortalCustomerReviewDto = {
  id: string;
  outlet: string | null;
  rating: number | null;
  comment: string | null;
  createdAt: string;
};

export type PortalInvitedCustomerDto = {
  id: string;
  name: string | null;
  phone: string | null;
  joinedAt: string | null;
  purchases: number | null;
};

export type PortalCustomerDto = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  birthday: string | null;
  gender: string | null;
  tags: string[];
  balance: number;
  pendingBalance: number;
  visits: number;
  averageCheck: number;
  daysSinceLastVisit: number | null;
  visitFrequencyDays: number | null;
  age: number | null;
  spendPreviousMonth: number;
  spendCurrentMonth: number;
  spendTotal: number;
  registeredAt: string | null;
  createdAt: string | null;
  comment: string | null;
  accrualsBlocked: boolean;
  levelId?: string | null;
  levelName?: string | null;
  referrer?: PortalCustomerReferrerDto | null;
  invite?: PortalCustomerInviteDto | null;
  expiry?: PortalCustomerExpiryDto[];
  transactions?: PortalCustomerTransactionDto[];
  reviews?: PortalCustomerReviewDto[];
  invited?: PortalInvitedCustomerDto[];
  earnRateBps?: number | null;
};

export type ListCustomersQuery = {
  search?: string;
  limit?: number;
  offset?: number;
};

const msPerDay = 24 * 60 * 60 * 1000;

const customerBaseSelect = (merchantId: string) =>
  ({
    id: true,
    phone: true,
    email: true,
    name: true,
    birthday: true,
    gender: true,
    tags: true,
    createdAt: true,
    merchantProfiles: {
      where: { merchantId },
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        comment: true,
        accrualsBlocked: true,
        createdAt: true,
        updatedAt: true,
      },
    },
    tierAssignments: {
      where: {
        merchantId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { assignedAt: 'desc' },
      take: 1,
      select: {
        tier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
    wallets: {
      where: { merchantId, type: WalletType.POINTS },
      select: { balance: true },
    },
    customerStats: {
      where: { merchantId },
      select: {
        visits: true,
        totalSpent: true,
        avgCheck: true,
        firstSeenAt: true,
        lastSeenAt: true,
        lastOrderAt: true,
      },
    },
  }) satisfies Prisma.CustomerSelect;

type CustomerBase = Prisma.CustomerGetPayload<{
  select: ReturnType<typeof customerBaseSelect>;
}>;

type Aggregates = {
  pendingBalance: Map<string, number>;
  spendCurrentMonth: Map<string, number>;
  spendPreviousMonth: Map<string, number>;
  totalSpent: Map<string, number>;
  visitCount: Map<string, number>;
  firstPurchaseAt: Map<string, Date>;
  lastPurchaseAt: Map<string, Date>;
};

@Injectable()
export class PortalCustomersService {
  private static readonly allowedGenders = new Set([
    'male',
    'female',
    'unknown',
  ]);

  constructor(private readonly prisma: PrismaService) {}

  private sanitizeTags(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  private splitName(fullName: string | null | undefined): {
    firstName: string | null;
    lastName: string | null;
  } {
    if (!fullName) return { firstName: null, lastName: null };
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: null, lastName: null };
    const [first, ...rest] = parts;
    return {
      firstName: first || null,
      lastName: rest.length ? rest.join(' ') : null,
    };
  }

  private calculateAge(birthdayIso: string | null): number | null {
    if (!birthdayIso) return null;
    const date = new Date(birthdayIso);
    if (Number.isNaN(date.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    const monthDiff = now.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  private differenceInDays(date: Date | null | undefined): number | null {
    if (!date) return null;
    const diff = Date.now() - date.getTime();
    if (!Number.isFinite(diff) || diff < 0) return 0;
    return Math.floor(diff / msPerDay);
  }

  private computeVisitFrequency(
    stats: {
      visits: number | null;
      firstSeenAt: Date | null;
      lastOrderAt: Date | null;
    } | null,
  ): number | null {
    if (!stats) return null;
    const visits = Number(stats.visits ?? 0);
    if (visits <= 1) return null;
    const from = stats.firstSeenAt ?? stats.lastOrderAt;
    const to = stats.lastOrderAt ?? stats.firstSeenAt;
    if (!from || !to) return null;
    const diffDays = Math.max(
      0,
      Math.round((to.getTime() - from.getTime()) / msPerDay),
    );
    if (diffDays <= 0) return null;
    return Math.round(diffDays / (visits - 1));
  }

  private async ensureWallet(
    merchantId: string,
    customerId: string,
  ): Promise<number> {
    const existing = await this.prisma.wallet.findUnique({
      where: {
        customerId_merchantId_type: {
          customerId,
          merchantId,
          type: WalletType.POINTS,
        },
      },
    });
    if (existing) return existing.balance;

    const created = await this.prisma.wallet.create({
      data: {
        customerId,
        merchantId,
        type: WalletType.POINTS,
        balance: 0,
      },
    });
    return created.balance;
  }

  private async computeAggregates(
    merchantId: string,
    customerIds: string[],
  ): Promise<Aggregates> {
    const pendingBalance = new Map<string, number>();
    const spendCurrentMonth = new Map<string, number>();
    const spendPreviousMonth = new Map<string, number>();
    const totalSpent = new Map<string, number>();
    const visitCount = new Map<string, number>();
    const firstPurchaseAt = new Map<string, Date>();
    const lastPurchaseAt = new Map<string, Date>();

    if (!customerIds.length) {
      return {
        pendingBalance,
        spendCurrentMonth,
        spendPreviousMonth,
        totalSpent,
        visitCount,
        firstPurchaseAt,
        lastPurchaseAt,
      };
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );

    const [pendingHolds, pendingLots, currentMonth, previousMonth, overall] =
      await Promise.all([
        this.prisma.hold.groupBy({
          by: ['customerId'],
          where: {
            merchantId,
            customerId: { in: customerIds },
            status: HoldStatus.PENDING,
            mode: HoldMode.EARN,
          },
          _sum: { earnPoints: true },
        }),
        this.prisma.earnLot.groupBy({
          by: ['customerId'],
          where: {
            merchantId,
            customerId: { in: customerIds },
            status: 'PENDING',
          },
          _sum: { points: true, consumedPoints: true },
        }),
        this.prisma.receipt.groupBy({
          by: ['customerId'],
          where: {
            merchantId,
            customerId: { in: customerIds },
            createdAt: { gte: currentMonthStart, lt: nextMonthStart },
          },
          _sum: { total: true },
        }),
        this.prisma.receipt.groupBy({
          by: ['customerId'],
          where: {
            merchantId,
            customerId: { in: customerIds },
            createdAt: { gte: previousMonthStart, lt: currentMonthStart },
          },
          _sum: { total: true },
        }),
        this.prisma.receipt.groupBy({
          by: ['customerId'],
          where: {
            merchantId,
            customerId: { in: customerIds },
            total: { gt: 0 },
          },
          _sum: { total: true },
          _count: { _all: true },
          _max: { createdAt: true },
          _min: { createdAt: true },
        }),
      ]);

    for (const row of pendingHolds) {
      const value = Math.max(0, Number(row._sum?.earnPoints ?? 0));
      if (!value) continue;
      pendingBalance.set(row.customerId, value);
    }

    for (const row of pendingLots) {
      const sumPoints = Number(row._sum?.points ?? 0);
      const sumConsumed = Number(row._sum?.consumedPoints ?? 0);
      const value = Math.max(0, sumPoints - sumConsumed);
      if (!value) continue;
      pendingBalance.set(
        row.customerId,
        value + (pendingBalance.get(row.customerId) ?? 0),
      );
    }

    for (const row of currentMonth) {
      spendCurrentMonth.set(
        row.customerId,
        Math.max(0, Number(row._sum?.total ?? 0)),
      );
    }

    for (const row of previousMonth) {
      spendPreviousMonth.set(
        row.customerId,
        Math.max(0, Number(row._sum?.total ?? 0)),
      );
    }

    for (const row of overall) {
      const total = Math.max(0, Number(row._sum?.total ?? 0));
      totalSpent.set(row.customerId, total);
      const count = Number(row._count?._all ?? 0);
      visitCount.set(row.customerId, count);
      const last = row._max?.createdAt ?? null;
      if (last) lastPurchaseAt.set(row.customerId, last);
      const first = row._min?.createdAt ?? null;
      if (first) firstPurchaseAt.set(row.customerId, first);
    }

    return {
      pendingBalance,
      spendCurrentMonth,
      spendPreviousMonth,
      totalSpent,
      visitCount,
      firstPurchaseAt,
      lastPurchaseAt,
    };
  }

  private buildBaseDto(
    entity: CustomerBase,
    aggregates: Aggregates,
  ): PortalCustomerDto {
    const profile = Array.isArray(entity.merchantProfiles)
      ? (entity.merchantProfiles[0] ?? null)
      : null;
    const stats = Array.isArray(entity.customerStats)
      ? (entity.customerStats[0] ?? null)
      : null;
    const wallet = Array.isArray(entity.wallets)
      ? (entity.wallets[0] ?? null)
      : null;
    const tierAssignment = Array.isArray(entity.tierAssignments)
      ? (entity.tierAssignments[0] ?? null)
      : null;

    const id = entity.id;
    const pendingBalance = aggregates.pendingBalance.get(id) ?? 0;
    const spendCurrentMonth = aggregates.spendCurrentMonth.get(id) ?? 0;
    const spendPreviousMonth = aggregates.spendPreviousMonth.get(id) ?? 0;
    const aggregatedTotalSpent = aggregates.totalSpent.get(id);
    const aggregatedVisits = aggregates.visitCount.get(id);
    const aggregatedLastPurchase = aggregates.lastPurchaseAt.get(id) ?? null;
    const aggregatedFirstPurchase = aggregates.firstPurchaseAt.get(id) ?? null;

    const primaryPhone =
      (profile?.phone ?? entity.phone ?? null)?.toString() ?? null;
    const primaryEmail =
      (profile?.email ?? entity.email ?? null)?.toString() ?? null;
    const displayName =
      profile?.name ??
      (typeof entity.name === 'string' ? entity.name : null) ??
      null;
    const { firstName, lastName } = this.splitName(displayName);

    const birthdayIso = entity.birthday
      ? new Date(entity.birthday).toISOString()
      : null;
    const age = this.calculateAge(birthdayIso);
    const statsVisits = Number(stats?.visits ?? 0);
    const visits = aggregatedVisits ?? statsVisits;
    const statsTotalSpent = Math.max(0, Number(stats?.totalSpent ?? 0));
    const spendTotal = aggregatedTotalSpent ?? statsTotalSpent;
    const averageCheck =
      visits > 0
        ? Math.round(spendTotal / visits)
        : Math.round(Number(stats?.avgCheck ?? 0));
    const lastPurchaseDate =
      aggregatedLastPurchase ?? stats?.lastOrderAt ?? null;
    const daysSinceLastVisit = this.differenceInDays(lastPurchaseDate);
    const visitFrequencyDays = this.computeVisitFrequency({
      visits,
      firstSeenAt: aggregatedFirstPurchase ?? stats?.firstSeenAt ?? null,
      lastOrderAt: lastPurchaseDate,
    });
    const registeredSource = profile?.createdAt ?? entity.createdAt ?? null;
    const registeredAt = registeredSource
      ? new Date(registeredSource).toISOString()
      : null;
    const levelName = tierAssignment?.tier?.name ?? null;
    const levelId = tierAssignment?.tier?.id ?? null;

    const genderRaw =
      typeof entity.gender === 'string' ? entity.gender.toLowerCase() : null;
    const gender =
      genderRaw && PortalCustomersService.allowedGenders.has(genderRaw)
        ? genderRaw
        : 'unknown';

    const tags = this.sanitizeTags(entity.tags);

    return {
      id: entity.id,
      phone: primaryPhone,
      email: primaryEmail,
      name: displayName,
      firstName,
      lastName,
      birthday: birthdayIso,
      gender,
      tags,
      balance: wallet ? Number(wallet.balance ?? 0) : 0,
      pendingBalance,
      visits,
      averageCheck,
      daysSinceLastVisit,
      visitFrequencyDays,
      age,
      spendPreviousMonth,
      spendCurrentMonth,
      spendTotal,
      registeredAt,
      createdAt: registeredAt,
      comment: profile?.comment ?? null,
      accrualsBlocked: Boolean(profile?.accrualsBlocked),
      levelId,
      levelName,
    };
  }

  private async buildReferralLink(
    merchantId: string,
    code: string,
  ): Promise<string> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { telegramBotUsername: true },
    });
    const username = settings?.telegramBotUsername
      ? settings.telegramBotUsername.replace(/^@/, '')
      : null;
    if (username) {
      const startParam = `ref_${code}`;
      return `https://t.me/${username}/?startapp=${encodeURIComponent(
        startParam,
      )}`;
    }
    const base =
      process.env.WEBSITE_URL ||
      process.env.PORTAL_PUBLIC_URL ||
      'https://loyalty.com';
    return `${base.replace(/\/$/, '')}/referral/${merchantId}/${code}`;
  }

  private async resolveReferrer(
    merchantId: string,
    customerId: string,
  ): Promise<PortalCustomerReferrerDto | null> {
    const referral = await this.prisma.referral.findFirst({
      where: {
        refereeId: customerId,
        program: { merchantId },
      },
      orderBy: { createdAt: 'desc' },
      include: { referrer: true },
    });
    if (!referral?.referrer) return null;

    const profile = await (this.prisma as any)?.merchantCustomer?.findUnique?.({
      where: {
        merchantId_customerId: {
          merchantId,
          customerId: referral.referrer.id,
        },
      },
      select: { name: true, phone: true },
    });

    const name =
      profile?.name ??
      referral.referrer.name ??
      referral.referrer.phone ??
      referral.referrer.id ??
      null;

    return {
      id: referral.referrer.id,
      name,
      phone: profile?.phone ?? referral.referrer.phone ?? null,
    };
  }

  private async resolveInvitedCustomers(
    merchantId: string,
    referrerId: string,
  ): Promise<PortalInvitedCustomerDto[]> {
    const referrals = await this.prisma.referral.findMany({
      where: {
        referrerId,
        program: { merchantId },
        refereeId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      include: { referee: true },
    });

    const refereeIds = referrals
      .map((row) => row.refereeId)
      .filter((id): id is string => Boolean(id));
    if (!refereeIds.length) return [];

    const [profiles, stats, purchases] = await Promise.all([
      (this.prisma as any)?.merchantCustomer?.findMany?.({
        where: { merchantId, customerId: { in: refereeIds } },
        select: { customerId: true, name: true, phone: true, createdAt: true },
      }),
      this.prisma.customerStats.findMany({
        where: { merchantId, customerId: { in: refereeIds } },
        select: { customerId: true, visits: true },
      }),
      this.prisma.receipt.groupBy({
        by: ['customerId'],
        where: {
          merchantId,
          customerId: { in: refereeIds },
          total: { gt: 0 },
        },
        _count: { _all: true },
      }),
    ]);

    const profileMap = new Map<string, any>();
    for (const profile of profiles ?? []) {
      profileMap.set(profile.customerId, profile);
    }

    const statsMap = new Map<string, number>();
    for (const stat of stats) {
      statsMap.set(stat.customerId, Number(stat.visits ?? 0));
    }

    const purchasesMap = new Map<string, number>();
    for (const row of purchases ?? []) {
      purchasesMap.set(row.customerId, Number(row._count?._all ?? 0));
    }

    return referrals.map((ref) => {
      const profile = profileMap.get(ref.refereeId ?? '') ?? null;
      const joinedAt =
        profile?.createdAt ??
        ref.activatedAt ??
        ref.completedAt ??
        ref.createdAt;
      return {
        id: ref.refereeId ?? '',
        name:
          profile?.name ??
          ref.referee?.name ??
          ref.referee?.phone ??
          ref.refereeId ??
          null,
        phone: profile?.phone ?? ref.referee?.phone ?? null,
        joinedAt: joinedAt ? joinedAt.toISOString() : null,
        purchases:
          purchasesMap.get(ref.refereeId ?? '') ??
          statsMap.get(ref.refereeId ?? '') ??
          0,
      };
    });
  }

  private asRecord(input: any): Record<string, any> | null {
    if (!input) return null;
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }
    if (typeof input === 'object') return input as Record<string, any>;
    return null;
  }

  private parseAmount(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.round(num));
  }

  private formatStaffName(
    staff:
      | {
          id?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          login?: string | null;
          email?: string | null;
        }
      | null
      | undefined,
  ): string | null {
    if (!staff) return null;
    const parts = [staff.firstName, staff.lastName]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());
    if (parts.length) return parts.join(' ');
    if (staff.login && staff.login.trim()) return staff.login.trim();
    if (staff.email && staff.email.trim()) return staff.email.trim();
    return staff.id ?? null;
  }

  private describeTransaction(params: {
    tx: Prisma.TransactionGetPayload<{
      include: {
        outlet: { select: { name: true; code: true } };
        staff: {
          select: {
            id?: true;
            firstName?: true;
            lastName?: true;
            login?: true;
            email?: true;
          };
        };
      };
    }>;
    receipt: Prisma.ReceiptGetPayload<{
      select: {
        id: true;
        orderId: true;
        total: true;
        redeemApplied: true;
        earnApplied: true;
        receiptNumber: true;
        createdAt: true;
        outlet: { select: { name: true; code: true } };
        staff: {
          select: {
            id: true;
            firstName: true;
            lastName: true;
            login: true;
            email: true;
          };
        };
        canceledAt: true;
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
    }> | null;
    metadata: Record<string, any> | null;
    promoUsage?: { code: string | null; name: string | null } | null;
    accrualsBlocked: boolean;
  }): {
    details: string;
    kind: string;
    note?: string | null;
    purchaseAmount: number;
  } {
    const base = this.describeTransactionBase(params);

    const isCanceled = Boolean(params.receipt?.canceledAt || params.tx.canceledAt);
    if (!isCanceled) {
      return base;
    }

    if (params.tx.type === 'REFUND') {
      const receipt = params.receipt ?? null;
      const receiptNumber =
        receipt && typeof receipt.receiptNumber === 'string' && receipt.receiptNumber.trim().length > 0
          ? receipt.receiptNumber.trim()
          : null;
      const orderIdFromReceipt =
        receipt && typeof receipt.orderId === 'string' && receipt.orderId.trim().length > 0
          ? receipt.orderId.trim()
          : null;
      const orderIdFromTx =
        typeof params.tx.orderId === 'string' && params.tx.orderId.trim().length > 0
          ? params.tx.orderId.trim()
          : null;
      const fallbackId =
        receipt && typeof receipt.id === 'string' && receipt.id.length > 0
          ? receipt.id.slice(-6)
          : typeof params.tx.id === 'string' && params.tx.id.length > 0
            ? params.tx.id.slice(-6)
            : null;
      const identifier = receiptNumber ?? orderIdFromReceipt ?? orderIdFromTx ?? fallbackId ?? '—';
      const canceledAtSource = receipt?.createdAt ?? params.tx.createdAt ?? null;
      const canceledAtLabel = this.formatReceiptDateTime(canceledAtSource);
      return {
        details: `Возврат покупки #${identifier} (${canceledAtLabel}) - совершён администратором`,
        kind: 'CANCELED',
        note: null,
        purchaseAmount: base.purchaseAmount,
      };
    }

    const alreadyPrefixed = base.details.startsWith('Операция отменена:');
    const details = alreadyPrefixed
      ? base.details
      : `Операция отменена: ${base.details}`;

    return {
      details,
      kind: base.kind,
      note: base.note ?? null,
      purchaseAmount: base.purchaseAmount,
    };
  }

  private describeTransactionBase(params: {
    tx: Prisma.TransactionGetPayload<{
      include: {
        outlet: { select: { name: true; code: true } };
        staff: {
          select: {
            id?: true;
            firstName?: true;
            lastName?: true;
            login?: true;
            email?: true;
          };
        };
      };
    }>;
    receipt: Prisma.ReceiptGetPayload<{
      select: {
        id: true;
        orderId: true;
        total: true;
        redeemApplied: true;
        earnApplied: true;
        receiptNumber: true;
        createdAt: true;
        outlet: { select: { name: true; code: true } };
        staff: {
          select: {
            id: true;
            firstName: true;
            lastName: true;
            login: true;
            email: true;
          };
        };
        canceledAt: true;
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
    }> | null;
    metadata: Record<string, any> | null;
    promoUsage?: { code: string | null; name: string | null } | null;
    accrualsBlocked: boolean;
  }): {
    details: string;
    kind: string;
    note?: string | null;
    purchaseAmount: number;
  } {
    const change = Number(params.tx.amount ?? 0);
    const metaPurchase = this.parseAmount(params.metadata?.purchaseAmount);
    const purchaseAmount =
      params.receipt != null
        ? Math.max(0, Number(params.receipt.total ?? 0))
        : metaPurchase ?? 0;
    const rawSource = params.metadata?.source;
    const source =
      typeof rawSource === 'string' ? rawSource.trim().toUpperCase() : null;

    let details = 'Операция с баллами';
    let kind = 'OTHER';
    let note: string | null = null;

    if (params.tx.type === 'EARN' && params.accrualsBlocked) {
      details = 'Начисление заблокировано администратором';
      kind = 'EARN_BLOCKED';
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.orderId === 'registration_bonus') {
      details = 'Баллы за регистрацию';
      kind = 'REGISTRATION';
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'REFERRAL') {
      details = 'Реферальное начисление';
      kind = 'REFERRAL';
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'REFUND') {
      details = 'Возврат покупки';
      kind = 'REFUND';
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'ADJUST') {
      if (change < 0) {
        details = 'Сгорание баллов';
        kind = 'BURN';
      } else {
        details = 'Корректировка баланса';
        kind = 'ADJUST';
      }
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'REDEEM') {
      if (source === 'MANUAL_REDEEM') {
        details = 'Списание администратором';
        kind = 'MANUAL_REDEEM';
        if (typeof params.metadata?.comment === 'string') {
          const trimmed = params.metadata.comment.trim();
          if (trimmed) note = trimmed;
        }
      } else {
        details = 'Списание за покупку';
        kind = 'PURCHASE_REDEEM';
      }
      return { details, kind, note, purchaseAmount };
    }

    if (
      params.tx.type === 'EARN' &&
      params.promoUsage &&
      (params.promoUsage.code || params.promoUsage.name)
    ) {
      const label = params.promoUsage.code ?? params.promoUsage.name;
      details = 'Баллы по промокоду';
      kind = 'PROMOCODE';
      note = label ? `Промокод ${label}` : null;
      return { details, kind, note, purchaseAmount };
    }

    if (source === 'COMPLIMENTARY') {
      details = 'Комплиментарные баллы';
      kind = 'COMPLIMENTARY';
      if (typeof params.metadata?.comment === 'string') {
        const trimmed = params.metadata.comment.trim();
        if (trimmed) note = trimmed;
      }
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'CAMPAIGN') {
      if (params.tx.orderId?.startsWith('birthday:')) {
        details = 'Баллы за день рождения';
        kind = 'BIRTHDAY';
      } else if (params.tx.orderId?.startsWith('auto_return:')) {
        details = 'Баллы за автовозврат';
        kind = 'AUTO_RETURN';
      } else if (source === 'MANUAL_ACCRUAL') {
        details = 'Начислено администратором';
        kind = 'MANUAL_ACCRUAL';
        if (typeof params.metadata?.comment === 'string') {
          const trimmed = params.metadata.comment.trim();
          if (trimmed) note = trimmed;
        }
      } else {
        details = 'Баллы по акции';
        kind = 'CAMPAIGN';
      }
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'EARN') {
      details = 'Начисление за покупку';
      kind = 'PURCHASE_EARN';
      return { details, kind, note, purchaseAmount };
    }

    return { details, kind, note, purchaseAmount };
  }

  private formatReceiptDateTime(
    value: Date | string | null | undefined,
  ): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private async resolveEarnRateBps(
    merchantId: string,
    customerId: string,
  ): Promise<number> {
    const assignment = await this.prisma.loyaltyTierAssignment.findFirst({
      where: {
        merchantId,
        customerId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { assignedAt: 'desc' },
      include: {
        tier: {
          select: {
            earnRateBps: true,
          },
        },
      },
    });
    if (assignment?.tier?.earnRateBps != null) {
      return Math.max(0, Math.floor(Number(assignment.tier.earnRateBps)));
    }

    const initialTier = await this.prisma.loyaltyTier.findFirst({
      where: { merchantId, isInitial: true },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
      select: { earnRateBps: true },
    });
    if (initialTier?.earnRateBps != null) {
      return Math.max(0, Math.floor(Number(initialTier.earnRateBps)));
    }

    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { earnBps: true },
    });
    return Math.max(0, Math.floor(Number(settings?.earnBps ?? 0)));
  }

  private async resolvePointsTtlDays(
    merchantId: string,
  ): Promise<number | null> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { pointsTtlDays: true },
    });
    const ttl = settings?.pointsTtlDays;
    if (ttl === null || ttl === undefined) return null;
    const num = Number(ttl);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.round(num);
  }

  private async consumeLotsForRedeem(
    tx: Prisma.TransactionClient,
    merchantId: string,
    customerId: string,
    amount: number,
    orderId: string | null,
  ) {
    if (process.env.EARN_LOTS_FEATURE !== '1') return;
    if (amount <= 0) return;

    const lots = await tx.earnLot.findMany({
      where: { merchantId, customerId },
      orderBy: { earnedAt: 'asc' },
    });
    if (!lots.length) return;

    const updates = planConsume(
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
          eventType: 'loyalty.earnlot.consumed',
          payload: {
            merchantId,
            customerId,
            lotId: update.id,
            consumed: update.deltaConsumed,
            orderId,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  async list(merchantId: string, query: ListCustomersQuery) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const search = query.search?.trim();

    const whereSearch = search
      ? ({
          OR: [
            {
              phone: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              email: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              name: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          ],
        } satisfies Prisma.CustomerWhereInput)
      : {};

    const items = await this.prisma.customer.findMany({
      where: {
        ...whereSearch,
        OR: [
          { wallets: { some: { merchantId, type: WalletType.POINTS } } },
          { transactions: { some: { merchantId } } },
          { Receipt: { some: { merchantId } } },
          {
            merchantProfiles: {
              some: {
                merchantId,
              },
            },
          },
        ],
      },
      select: customerBaseSelect(merchantId),
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const ids = items.map((item) => item.id);
    const aggregates = await this.computeAggregates(merchantId, ids);

    return items.map((item) => this.buildBaseDto(item, aggregates));
  }

  async get(merchantId: string, customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: customerBaseSelect(merchantId),
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const walletBalance = await this.ensureWallet(merchantId, customerId);

    const aggregates = await this.computeAggregates(merchantId, [customerId]);

    const baseDto = this.buildBaseDto(customer, aggregates);
    baseDto.balance = walletBalance;

    const transactionInclude = {
      outlet: { select: { name: true, code: true } },
      staff: {
        select: {
          id: true,
          login: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      canceledBy: {
        select: {
          id: true,
          login: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    } satisfies Prisma.TransactionInclude;

    const receiptSelect = {
      id: true,
      orderId: true,
      total: true,
      redeemApplied: true,
      earnApplied: true,
      receiptNumber: true,
      createdAt: true,
      canceledAt: true,
      outlet: { select: { name: true, code: true } },
      staff: {
        select: {
          id: true,
          login: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      canceledBy: {
        select: {
          id: true,
          login: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    } satisfies Prisma.ReceiptSelect;

    const [
      lots,
      transactionsRaw,
      receiptsRaw,
      reviews,
      referrer,
      personalCode,
      invited,
    ] = await Promise.all([
      this.prisma.earnLot.findMany({
        where: {
          merchantId,
          customerId,
          status: { in: ['ACTIVE', 'PENDING'] },
        },
        orderBy: [{ status: 'asc' }, { earnedAt: 'desc' }],
        select: {
          id: true,
          points: true,
          consumedPoints: true,
          earnedAt: true,
          expiresAt: true,
          status: true,
        },
      }),
      this.prisma.transaction.findMany({
        where: { merchantId, customerId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: transactionInclude,
      }),
      this.prisma.receipt.findMany({
        where: { merchantId, customerId },
        orderBy: { createdAt: 'desc' },
        select: receiptSelect,
      }),
      this.prisma.review.findMany({
        where: { merchantId, customerId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          orderId: true,
          transaction: {
            select: {
              outlet: { select: { name: true } },
            },
          },
        },
      }),
      this.resolveReferrer(merchantId, customerId),
      this.prisma.personalReferralCode.findFirst({
        where: { merchantId, customerId },
      }),
      this.resolveInvitedCustomers(merchantId, customerId),
    ]);

    const transactions = transactionsRaw as Prisma.TransactionGetPayload<{
      include: typeof transactionInclude;
    }>[];
    const receipts = receiptsRaw as Prisma.ReceiptGetPayload<{
      select: typeof receiptSelect;
    }>[];
    const receiptMap = new Map<string, (typeof receipts)[number]>();

    for (const receipt of receipts) {
      if (receipt.orderId) receiptMap.set(receipt.orderId, receipt);
    }

    const reviewByOrderId = new Map<string, (typeof reviews)[number]>();
    for (const review of reviews) {
      if (review.orderId) reviewByOrderId.set(review.orderId, review);
    }

    const orderIds = receipts
      .map((receipt) => receipt.orderId)
      .filter((id): id is string => Boolean(id));
    const promoUsageByOrder = new Map<
      string,
      { code: string | null; name: string | null }
    >();
    if (orderIds.length) {
      const promoUsages = await this.prisma.promoCodeUsage.findMany({
        where: {
          merchantId,
          customerId,
          orderId: { in: orderIds },
        },
        include: {
          promoCode: { select: { code: true, name: true } },
        },
      });
      for (const usage of promoUsages) {
        if (!usage.orderId) continue;
        promoUsageByOrder.set(usage.orderId, {
          code: usage.promoCode?.code ?? null,
          name: usage.promoCode?.name ?? null,
        });
      }
    }

    baseDto.referrer = referrer;
    if (personalCode) {
      baseDto.invite = {
        code: personalCode.code,
        link: await this.buildReferralLink(merchantId, personalCode.code),
      };
    } else {
      baseDto.invite = { code: null, link: null };
    }

    baseDto.expiry = lots
      .map((lot) => {
        const remaining = Math.max(
          0,
          Number(lot.points ?? 0) - Number(lot.consumedPoints ?? 0),
        );
        if (!remaining) return null;
        return {
          id: lot.id,
          accrualDate: lot.earnedAt.toISOString(),
          expiresAt: lot.expiresAt ? lot.expiresAt.toISOString() : null,
          amount: remaining,
          status: lot.status === 'PENDING' ? 'PENDING' : 'ACTIVE',
        };
      })
      .filter((item): item is PortalCustomerExpiryDto => item !== null)
      .filter((item) => item.expiresAt !== null);

    baseDto.transactions = transactions.map((tx) => {
      const orderId = tx.orderId ?? null;
      const receipt = orderId ? receiptMap.get(orderId) ?? null : null;
      const review = orderId ? reviewByOrderId.get(orderId) ?? null : null;
      const metadata = this.asRecord((tx as any)?.metadata);
      const promoUsage = orderId
        ? promoUsageByOrder.get(orderId) ?? null
        : null;
      const change = Number(tx.amount ?? 0);

      const descriptor = this.describeTransaction({
        tx,
        receipt,
        metadata,
        promoUsage,
        accrualsBlocked: Boolean(baseDto.accrualsBlocked),
      });

      const purchaseAmount = descriptor.purchaseAmount;
      const metaToPay = this.parseAmount(metadata?.toPay);
      const metaTotal = this.parseAmount(metadata?.total);
      const metaPaidBy = this.parseAmount(metadata?.paidByPoints);

      const toPay =
        receipt != null
          ? Math.max(
              0,
              Number(receipt.total ?? 0) - Number(receipt.redeemApplied ?? 0),
            )
          : metaToPay;
      const paidByPoints =
        receipt != null
          ? Number(receipt.redeemApplied ?? 0)
          : tx.type === 'REDEEM'
            ? Math.abs(change)
            : metaPaidBy;
      const total =
        receipt != null
          ? Number(receipt.total ?? 0)
          : metaTotal ?? purchaseAmount ?? null;
      const manager = receipt?.staff
        ? this.formatStaffName(receipt.staff)
        : tx.staff
          ? this.formatStaffName(tx.staff)
          : null;
      const outletName =
        receipt?.outlet?.name ??
        tx.outlet?.name ??
        receipt?.outlet?.code ??
        review?.transaction?.outlet?.name ??
        null;
      const carrierCode = receipt?.outlet?.code ?? tx.outlet?.code ?? null;
      const txCanceledAt = tx.canceledAt
        ? tx.canceledAt.toISOString()
        : null;
      const txCanceledByName = tx.canceledBy
        ? this.formatStaffName(tx.canceledBy)
        : null;

      return {
        id: tx.id,
        type: tx.type,
        change,
        purchaseAmount,
        datetime: tx.createdAt.toISOString(),
        details: descriptor.details,
        outlet: outletName,
        rating: review?.rating ?? null,
        receiptNumber: receipt?.receiptNumber ?? null,
        manager,
        carrier: outletName,
        carrierCode,
        toPay,
        paidByPoints,
        total,
        blockedAccrual:
          tx.type === 'EARN' ? Boolean(baseDto.accrualsBlocked) : false,
        receiptId: receipt?.id ?? null,
        canceledAt: txCanceledAt
          ? txCanceledAt
          : receipt?.canceledAt
            ? receipt.canceledAt.toISOString()
            : null,
        canceledBy: txCanceledAt
          ? tx.canceledBy
            ? {
                id: tx.canceledBy.id,
                name: txCanceledByName,
              }
            : null
          : receipt?.canceledBy
            ? {
                id: receipt.canceledBy.id,
                name: this.formatStaffName(receipt.canceledBy),
              }
            : null,
        note: descriptor.note ?? null,
        kind: descriptor.kind,
      };
    });

    baseDto.reviews = reviews.map((review) => ({
      id: review.id,
      outlet: review.transaction?.outlet?.name ?? null,
      rating: Number(review.rating ?? 0),
      comment: review.comment ?? null,
      createdAt: review.createdAt.toISOString(),
    }));

    baseDto.invited = invited;

    try {
      baseDto.earnRateBps = await this.resolveEarnRateBps(
        merchantId,
        customerId,
      );
    } catch {
      baseDto.earnRateBps = null;
    }

    return baseDto;
  }

  async accrueManual(
    merchantId: string,
    customerId: string,
    staffId: string | null,
    payload: {
      purchaseAmount: number;
      points?: number | null;
      receiptNumber?: string | null;
      outletId?: string | null;
      comment?: string | null;
    },
  ) {
    const purchaseAmount = this.parseAmount(payload.purchaseAmount);
    if (!purchaseAmount || purchaseAmount <= 0) {
      throw new BadRequestException('Сумма покупки должна быть больше 0');
    }

    let points =
      payload.points != null ? this.parseAmount(payload.points) : null;
    if (points == null) {
      const earnRate = await this.resolveEarnRateBps(merchantId, customerId);
      points = Math.floor((purchaseAmount * earnRate) / 10_000);
    }
    if (!points || points <= 0) {
      throw new BadRequestException(
        'Количество начисляемых баллов должно быть больше 0',
      );
    }
    const appliedPoints = points;

    const orderId = `manual_accrual:${randomUUID()}`;
    const rawComment = payload.comment?.trim() || null;
    if (rawComment && rawComment.length > 60) {
      throw new BadRequestException('Комментарий не должен превышать 60 символов');
    }
    const comment = rawComment;
    const receiptNumber = payload.receiptNumber?.trim() || null;
    const outletId = payload.outletId ?? null;
    const ttlDays = await this.resolvePointsTtlDays(merchantId);
    const expiresAt =
      ttlDays && ttlDays > 0
        ? new Date(Date.now() + ttlDays * msPerDay)
        : null;
    const metadata = {
      source: 'MANUAL_ACCRUAL',
      purchaseAmount,
      total: purchaseAmount,
      receiptNumber,
      comment,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: {
          customerId_merchantId_type: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
          },
        },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
            balance: 0,
          },
        });
      }
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: wallet.balance + appliedPoints },
      });

      if (process.env.EARN_LOTS_FEATURE === '1' && appliedPoints > 0) {
        await tx.earnLot.create({
          data: {
            merchantId,
            customerId,
            points: appliedPoints,
            consumedPoints: 0,
            earnedAt: new Date(),
            maturesAt: null,
            expiresAt,
            orderId,
            receiptId: null,
            outletId: outletId ?? null,
            staffId: staffId ?? null,
            status: 'ACTIVE',
          },
        });
      }

      const transaction = await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.CAMPAIGN,
          amount: appliedPoints,
          orderId,
          outletId: outletId ?? null,
          staffId: staffId ?? null,
          metadata,
        },
      });

      return {
        transactionId: transaction.id,
        balance: updatedWallet.balance,
      };
    });

    return {
      ok: true,
      pointsIssued: appliedPoints,
      orderId,
      transactionId: result.transactionId,
      comment,
    };
  }

  async redeemManual(
    merchantId: string,
    customerId: string,
    staffId: string | null,
    payload: { points: number; outletId?: string | null; comment?: string | null },
  ) {
    const points = this.parseAmount(payload.points);
    if (!points || points <= 0) {
      throw new BadRequestException('Количество списываемых баллов должно быть больше 0');
    }
    const redeemPoints = points;

    const orderId = `manual_redeem:${randomUUID()}`;
    const metadata = {
      source: 'MANUAL_REDEEM',
      comment: payload.comment?.trim() || null,
    };
    const outletId = payload.outletId ?? null;

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: {
          customerId_merchantId_type: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
          },
        },
      });
      if (!wallet) {
        throw new BadRequestException('У клиента отсутствует кошелёк с баллами');
      }
      if (wallet.balance < redeemPoints) {
        throw new BadRequestException('Недостаточно баллов на балансе клиента');
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: wallet.balance - redeemPoints },
      });

      await this.consumeLotsForRedeem(tx, merchantId, customerId, redeemPoints, orderId);

      const transaction = await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.REDEEM,
          amount: -redeemPoints,
          orderId,
          outletId: outletId ?? null,
          staffId: staffId ?? null,
          metadata,
        },
      });

      return {
        transactionId: transaction.id,
        balance: updatedWallet.balance,
      };
    });

    return {
      ok: true,
      pointsRedeemed: redeemPoints,
      orderId,
      transactionId: result.transactionId,
    };
  }

  async issueComplimentary(
    merchantId: string,
    customerId: string,
    staffId: string | null,
    payload: { points: number; expiresInDays?: number | null; outletId?: string | null; comment?: string | null },
  ) {
    const points = this.parseAmount(payload.points);
    if (!points || points <= 0) {
      throw new BadRequestException('Количество баллов должно быть больше 0');
    }
    const bonusPoints = points;

    const expiresInDays =
      payload.expiresInDays !== undefined && payload.expiresInDays !== null
        ? Math.max(0, Math.round(Number(payload.expiresInDays)))
        : null;
    const expiresAt =
      expiresInDays && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * msPerDay)
        : null;
    const orderId = `complimentary:${randomUUID()}`;
    const rawComment = payload.comment?.trim() || null;
    if (rawComment && rawComment.length > 60) {
      throw new BadRequestException('Комментарий не должен превышать 60 символов');
    }
    const comment = rawComment;
    const outletId = payload.outletId ?? null;
    const metadata = {
      source: 'COMPLIMENTARY',
      comment,
      expiresInDays,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: {
          customerId_merchantId_type: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
          },
        },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
            balance: 0,
          },
        });
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: wallet.balance + bonusPoints },
      });

      if (process.env.EARN_LOTS_FEATURE === '1' && bonusPoints > 0) {
        await tx.earnLot.create({
          data: {
            merchantId,
            customerId,
            points: bonusPoints,
            consumedPoints: 0,
            earnedAt: new Date(),
            maturesAt: null,
            expiresAt,
            orderId,
            receiptId: null,
            outletId: outletId ?? null,
            staffId: staffId ?? null,
            status: 'ACTIVE',
          },
        });
      }

      const transaction = await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.CAMPAIGN,
          amount: bonusPoints,
          orderId,
          outletId: outletId ?? null,
          staffId: staffId ?? null,
          metadata,
        },
      });

      return {
        transactionId: transaction.id,
        balance: updatedWallet.balance,
      };
    });

    return {
      ok: true,
      pointsIssued: bonusPoints,
      orderId,
      transactionId: result.transactionId,
      comment,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
  }

  async create(
    merchantId: string,
    dto: Partial<PortalCustomerDto> & {
      firstName?: string;
      lastName?: string;
    },
  ) {
    const phone = dto.phone?.trim() || undefined;
    const email = dto.email?.trim()?.toLowerCase() || undefined;
    const fullName =
      dto.name?.trim() ||
      [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() ||
      undefined;

    const prismaAny = this.prisma as any;
    if (phone) {
      const existingPhone = await prismaAny?.merchantCustomer?.findUnique?.({
        where: { merchantId_phone: { merchantId, phone } },
      });
      if (existingPhone) {
        throw new BadRequestException('Phone already used');
      }
    }
    if (email) {
      const existingEmail = await prismaAny?.merchantCustomer?.findUnique?.({
        where: { merchantId_email: { merchantId, email } },
      });
      if (existingEmail) {
        throw new BadRequestException('Email already used');
      }
    }

    const customer = await this.prisma.customer.create({
      data: {
        phone: phone ?? null,
        email: email ?? null,
        name: fullName ?? null,
        birthday: dto.birthday ? new Date(dto.birthday) : null,
        gender: dto.gender ?? null,
        tags: this.sanitizeTags(dto.tags),
      },
    });

    await this.prisma.wallet.create({
      data: {
        customerId: customer.id,
        merchantId,
        type: WalletType.POINTS,
        balance: 0,
      },
    });

    await prismaAny?.merchantCustomer?.create?.({
      data: {
        merchantId,
        customerId: customer.id,
        tgId: null,
        phone: phone ?? null,
        email: email ?? null,
        name: fullName ?? null,
        comment: dto.comment?.trim?.() || null,
        accrualsBlocked: Boolean(dto.accrualsBlocked),
      },
    });

    return this.get(merchantId, customer.id);
  }

  async update(
    merchantId: string,
    customerId: string,
    dto: Partial<PortalCustomerDto> & {
      firstName?: string;
      lastName?: string;
    },
  ) {
    const prismaAny = this.prisma as any;
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const updateCustomer: Prisma.CustomerUpdateInput = {};

    if (dto.phone !== undefined) {
      const phone = dto.phone?.trim() || null;
      if (phone) {
        const clash = await prismaAny?.merchantCustomer?.findUnique?.({
          where: { merchantId_phone: { merchantId, phone } },
        });
        if (clash && clash.customerId !== customerId) {
          throw new BadRequestException('Phone already used');
        }
      }
      updateCustomer.phone = phone;
    }

    if (dto.email !== undefined) {
      const email = dto.email?.trim()?.toLowerCase() || null;
      if (email) {
        const clash = await prismaAny?.merchantCustomer?.findUnique?.({
          where: { merchantId_email: { merchantId, email } },
        });
        if (clash && clash.customerId !== customerId) {
          throw new BadRequestException('Email already used');
        }
      }
      updateCustomer.email = email;
    }

    if (
      dto.name !== undefined ||
      dto.firstName !== undefined ||
      dto.lastName !== undefined
    ) {
      const name =
        dto.name?.trim() ||
        [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() ||
        null;
      updateCustomer.name = name;
    }

    if (dto.birthday !== undefined) {
      updateCustomer.birthday = dto.birthday ? new Date(dto.birthday) : null;
    }

    if (dto.gender !== undefined) {
      updateCustomer.gender = dto.gender ?? null;
    }

    if (dto.tags !== undefined) {
      updateCustomer.tags = this.sanitizeTags(dto.tags);
    }

    if (Object.keys(updateCustomer).length > 0) {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: updateCustomer,
      });
    }

    const merchantUpdate: Record<string, any> = {};
    const merchantCreate: Record<string, any> = {
      merchantId,
      customerId,
    };

    if (dto.phone !== undefined) {
      merchantUpdate.phone = dto.phone?.trim() || null;
      merchantCreate.phone = dto.phone?.trim() || null;
    }
    if (dto.email !== undefined) {
      merchantUpdate.email = dto.email?.trim()?.toLowerCase() || null;
      merchantCreate.email = dto.email?.trim()?.toLowerCase() || null;
    }
    if (
      dto.name !== undefined ||
      dto.firstName !== undefined ||
      dto.lastName !== undefined
    ) {
      const name =
        dto.name?.trim() ||
        [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() ||
        null;
      merchantUpdate.name = name;
      merchantCreate.name = name;
    }
    if (dto.comment !== undefined) {
      const comment =
        dto.comment != null && dto.comment !== ''
          ? String(dto.comment).trim()
          : null;
      merchantUpdate.comment = comment;
      merchantCreate.comment = comment;
    }
    if (dto.accrualsBlocked !== undefined) {
      const blocked = Boolean(dto.accrualsBlocked);
      merchantUpdate.accrualsBlocked = blocked;
      merchantCreate.accrualsBlocked = blocked;
    }

    if (Object.keys(merchantUpdate).length > 0) {
      await prismaAny?.merchantCustomer?.upsert?.({
        where: {
          merchantId_customerId: { merchantId, customerId },
        },
        update: merchantUpdate,
        create: merchantCreate,
      });
    }

    await this.ensureWallet(merchantId, customerId);

    return this.get(merchantId, customerId);
  }

  async remove(merchantId: string, customerId: string) {
    const [txns, receipts] = await Promise.all([
      this.prisma.transaction.count({ where: { merchantId, customerId } }),
      this.prisma.receipt.count({ where: { merchantId, customerId } }),
    ]);
    if (txns > 0 || receipts > 0) {
      throw new BadRequestException(
        'Cannot delete customer with operations history',
      );
    }

    await Promise.allSettled([
      this.prisma.wallet.delete({
        where: {
          customerId_merchantId_type: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
          },
        },
      }),
      (this.prisma as any)?.merchantCustomer?.deleteMany?.({
        where: { merchantId, customerId },
      }),
    ]);

    return { ok: true } as const;
  }
}
