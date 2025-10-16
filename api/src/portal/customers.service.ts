import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HoldMode,
  HoldStatus,
  Prisma,
  WalletType,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';

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
  referrer?: PortalCustomerReferrerDto | null;
  invite?: PortalCustomerInviteDto | null;
  expiry?: PortalCustomerExpiryDto[];
  transactions?: PortalCustomerTransactionDto[];
  reviews?: PortalCustomerReviewDto[];
  invited?: PortalInvitedCustomerDto[];
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

  private computeVisitFrequency(stats: {
    visits: number | null;
    firstSeenAt: Date | null;
    lastOrderAt: Date | null;
  } | null): number | null {
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

    if (!customerIds.length) {
      return { pendingBalance, spendCurrentMonth, spendPreviousMonth };
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );

    const [pendingHolds, pendingLots, currentMonth, previousMonth] =
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

    return { pendingBalance, spendCurrentMonth, spendPreviousMonth };
  }

  private buildBaseDto(
    entity: CustomerBase,
    aggregates: {
      pendingBalance: number;
      spendCurrentMonth: number;
      spendPreviousMonth: number;
    },
  ): PortalCustomerDto {
    const profile = Array.isArray(entity.merchantProfiles)
      ? entity.merchantProfiles[0] ?? null
      : null;
    const stats = Array.isArray(entity.customerStats)
      ? entity.customerStats[0] ?? null
      : null;
    const wallet = Array.isArray(entity.wallets)
      ? entity.wallets[0] ?? null
      : null;

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
    const visits = Number(stats?.visits ?? 0);
    const averageCheck = Math.round(Number(stats?.avgCheck ?? 0));
    const daysSinceLastVisit = this.differenceInDays(stats?.lastOrderAt ?? null);
    const visitFrequencyDays = this.computeVisitFrequency({
      visits,
      firstSeenAt: stats?.firstSeenAt ?? null,
      lastOrderAt: stats?.lastOrderAt ?? null,
    });
    const spendTotal = Math.max(0, Number(stats?.totalSpent ?? 0));
    const registeredSource = profile?.createdAt ?? entity.createdAt ?? null;
    const registeredAt = registeredSource
      ? new Date(registeredSource).toISOString()
      : null;

    const genderRaw =
      typeof entity.gender === 'string' ? entity.gender.toLowerCase() : null;
    const gender = genderRaw && PortalCustomersService.allowedGenders.has(genderRaw)
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
      pendingBalance: aggregates.pendingBalance,
      visits,
      averageCheck,
      daysSinceLastVisit,
      visitFrequencyDays,
      age,
      spendPreviousMonth: aggregates.spendPreviousMonth,
      spendCurrentMonth: aggregates.spendCurrentMonth,
      spendTotal,
      registeredAt,
      createdAt: registeredAt,
      comment: profile?.comment ?? null,
      accrualsBlocked: Boolean(profile?.accrualsBlocked),
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

    const [profiles, stats] = await Promise.all([
      (this.prisma as any)?.merchantCustomer?.findMany?.({
        where: { merchantId, customerId: { in: refereeIds } },
        select: { customerId: true, name: true, phone: true, createdAt: true },
      }),
      this.prisma.customerStats.findMany({
        where: { merchantId, customerId: { in: refereeIds } },
        select: { customerId: true, visits: true },
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
        purchases: statsMap.get(ref.refereeId ?? '') ?? null,
      };
    });
  }

  private buildTransactionDetails(
    type: string,
    accrualsBlocked: boolean,
  ): string {
    switch (type) {
      case 'EARN':
        return accrualsBlocked
          ? 'Начисление заблокировано администратором'
          : 'Начисление баллов за покупку';
      case 'REDEEM':
        return 'Списание баллов';
      case 'REFUND':
        return 'Возврат баллов';
      case 'ADJUST':
        return 'Корректировка баланса';
      case 'CAMPAIGN':
        return 'Баллы по акции';
      case 'REFERRAL':
        return 'Реферальное начисление';
      default:
        return 'Операция с баллами';
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

    return items.map((item) =>
      this.buildBaseDto(item, {
        pendingBalance: aggregates.pendingBalance.get(item.id) ?? 0,
        spendCurrentMonth: aggregates.spendCurrentMonth.get(item.id) ?? 0,
        spendPreviousMonth: aggregates.spendPreviousMonth.get(item.id) ?? 0,
      }),
    );
  }

  async get(merchantId: string, customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: customerBaseSelect(merchantId),
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const walletBalance = await this.ensureWallet(merchantId, customerId);

    const aggregates = await this.computeAggregates(merchantId, [customerId]);

    const baseDto = this.buildBaseDto(customer, {
      pendingBalance: aggregates.pendingBalance.get(customerId) ?? 0,
      spendCurrentMonth: aggregates.spendCurrentMonth.get(customerId) ?? 0,
      spendPreviousMonth: aggregates.spendPreviousMonth.get(customerId) ?? 0,
    });
    baseDto.balance = walletBalance;

    const [
      lots,
      transactions,
      receipts,
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
        include: {
          outlet: { select: { name: true, code: true } },
          staff: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.receipt.findMany({
        where: { merchantId, customerId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderId: true,
          total: true,
          redeemApplied: true,
          earnApplied: true,
          receiptNumber: true,
          createdAt: true,
          outlet: { select: { name: true, code: true } },
          staff: { select: { firstName: true, lastName: true } },
        },
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

    const receiptMap = new Map<string, typeof receipts[number]>();
    for (const receipt of receipts) {
      if (receipt.orderId) receiptMap.set(receipt.orderId, receipt);
    }

    const reviewByOrderId = new Map<string, typeof reviews[number]>();
    for (const review of reviews) {
      if (review.orderId) reviewByOrderId.set(review.orderId, review);
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
      .filter((item): item is PortalCustomerExpiryDto => Boolean(item));

    baseDto.transactions = transactions.map((tx) => {
      const receipt = tx.orderId ? receiptMap.get(tx.orderId) ?? null : null;
      const review = tx.orderId ? reviewByOrderId.get(tx.orderId) ?? null : null;
      const change = Number(tx.amount ?? 0);
      const purchaseAmount = receipt ? Number(receipt.total ?? 0) : 0;
      const toPay =
        receipt != null
          ? Math.max(
              0,
              Number(receipt.total ?? 0) - Number(receipt.redeemApplied ?? 0),
            )
          : null;
      const paidByPoints = receipt ? Number(receipt.redeemApplied ?? 0) : null;
      const manager = receipt?.staff
        ? [receipt.staff.firstName, receipt.staff.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || null
        : tx.staff
        ? [tx.staff.firstName, tx.staff.lastName].filter(Boolean).join(' ').trim() ||
          null
        : null;
      const outletName =
        receipt?.outlet?.name ??
        tx.outlet?.name ??
        receipt?.outlet?.code ??
        review?.transaction?.outlet?.name ??
        null;
      const carrierCode = receipt?.outlet?.code ?? tx.outlet?.code ?? null;

      return {
        id: tx.id,
        type: tx.type,
        change,
        purchaseAmount,
        datetime: tx.createdAt.toISOString(),
        details: this.buildTransactionDetails(
          tx.type,
          Boolean(baseDto.accrualsBlocked),
        ),
        outlet: outletName,
        rating: review?.rating ?? null,
        receiptNumber: receipt?.receiptNumber ?? null,
        manager,
        carrier: outletName,
        carrierCode,
        toPay,
        paidByPoints,
        total: receipt ? Number(receipt.total ?? 0) : null,
        blockedAccrual:
          tx.type === 'EARN' ? Boolean(baseDto.accrualsBlocked) : false,
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

    return baseDto;
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
