import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HoldMode, HoldStatus, Prisma, WalletType } from '@prisma/client';
import { AppConfigService } from '../../../core/config/app-config.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ensureBaseTier } from '../../loyalty/utils/tier-defaults.util';
import { fetchReceiptAggregates } from '../../../shared/common/receipt-aggregates.util';
import { buildCustomerKpiSnapshot } from '../../../shared/common/customer-kpi.util';
import { asRecord as asRecordShared } from '../../../shared/common/input.util';
import { normalizePhoneDigits } from '../../../shared/common/phone.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { isSystemAllAudience } from '../../customer-audiences/audience.utils';
import {
  Aggregates,
  CustomerBase,
  ListCustomersQuery,
  PortalCustomerDto,
  PortalCustomerExpiryDto,
  PortalCustomerReferrerDto,
  PortalCustomerTransactionDto,
  PortalInvitedCustomerDto,
  customerBaseSelect,
} from './portal-customers.types';
import { sanitizeTags, splitName } from './portal-customers.utils';
import { ensureWallet } from './portal-customers.wallet.util';

const normalizePhoneValue = (value?: string | null) =>
  normalizePhoneDigits(value);

@Injectable()
export class PortalCustomersQueryService {
  private static readonly allowedGenders = new Set([
    'male',
    'female',
    'unknown',
  ]);

  private readonly logger = new Logger(PortalCustomersQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

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

  async computeAggregates(
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
        fetchReceiptAggregates(this.prisma, {
          merchantId,
          customerIds,
          period: {
            from: currentMonthStart,
            to: nextMonthStart,
            inclusiveEnd: false,
          },
        }),
        fetchReceiptAggregates(this.prisma, {
          merchantId,
          customerIds,
          period: {
            from: previousMonthStart,
            to: currentMonthStart,
            inclusiveEnd: false,
          },
        }),
        fetchReceiptAggregates(this.prisma, {
          merchantId,
          customerIds,
          includeImportedBase: true,
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
      spendCurrentMonth.set(row.customerId, Math.max(0, row.totalSpent));
    }

    for (const row of previousMonth) {
      spendPreviousMonth.set(row.customerId, Math.max(0, row.totalSpent));
    }

    for (const row of overall) {
      const total = Math.max(0, row.totalSpent);
      totalSpent.set(row.customerId, total);
      visitCount.set(row.customerId, Math.max(0, row.visits));
      const last = row.lastPurchaseAt ?? null;
      if (last) lastPurchaseAt.set(row.customerId, last);
      const first = row.firstPurchaseAt ?? null;
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

  // После рефактора Customer = per-merchant, entity сам является профилем
  buildBaseDto(
    entity: CustomerBase,
    aggregates: Aggregates,
  ): PortalCustomerDto {
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

    const primaryPhone = entity.phone?.toString() ?? null;
    const primaryEmail = entity.email?.toString() ?? null;
    const displayName =
      typeof entity.name === 'string' && entity.name.trim()
        ? entity.name.trim()
        : typeof entity.profileName === 'string' && entity.profileName.trim()
          ? entity.profileName.trim()
          : null;
    const { firstName, lastName } = splitName(displayName);

    const birthdayIso = entity.birthday
      ? new Date(entity.birthday).toISOString()
      : null;
    const age = this.calculateAge(birthdayIso);
    const statsVisits = Number(stats?.visits ?? 0);
    const visits = aggregatedVisits ?? statsVisits;
    const statsTotalSpent = Math.max(0, Number(stats?.totalSpent ?? 0));
    const spendTotal = aggregatedTotalSpent ?? statsTotalSpent;
    const lastPurchaseDate =
      aggregatedLastPurchase ?? stats?.lastOrderAt ?? null;
    const kpi = buildCustomerKpiSnapshot({
      visits,
      totalSpent: spendTotal,
      firstPurchaseAt: aggregatedFirstPurchase ?? stats?.firstSeenAt ?? null,
      lastPurchaseAt: lastPurchaseDate,
      fallbackAverageCheck: Number(stats?.avgCheck ?? 0),
      averageCheckPrecision: 0,
      visitFrequencyPrecision: 0,
    });
    const registeredSource = entity.createdAt ?? null;
    const registeredAt = registeredSource
      ? new Date(registeredSource).toISOString()
      : null;
    const erasedAt = entity.erasedAt
      ? new Date(entity.erasedAt).toISOString()
      : null;
    const levelName = tierAssignment?.tier?.name ?? null;
    const levelId = tierAssignment?.tier?.id ?? null;

    const genderRaw =
      typeof entity.gender === 'string' ? entity.gender.toLowerCase() : null;
    const gender =
      genderRaw && PortalCustomersQueryService.allowedGenders.has(genderRaw)
        ? genderRaw
        : 'unknown';

    const tags = sanitizeTags(entity.tags);

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
      visits: kpi.visits,
      averageCheck: kpi.averageCheck,
      daysSinceLastVisit: kpi.daysSinceLastVisit,
      visitFrequencyDays: kpi.visitFrequencyDays,
      age,
      spendPreviousMonth,
      spendCurrentMonth,
      spendTotal,
      registeredAt,
      createdAt: registeredAt,
      erasedAt,
      comment: entity.comment ?? null,
      accrualsBlocked: Boolean(entity.accrualsBlocked),
      redemptionsBlocked: Boolean(entity.redemptionsBlocked),
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
    const base = this.config.getWebsiteUrl() || 'https://loyalty.com';
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

    const profile = await this.prisma.customer.findFirst({
      where: { merchantId, id: referral.referrer.id },
      select: { name: true, profileName: true, phone: true },
    });

    const profileName =
      typeof profile?.name === 'string' && profile.name.trim()
        ? profile.name.trim()
        : typeof profile?.profileName === 'string' && profile.profileName.trim()
          ? profile.profileName.trim()
          : null;
    const name =
      profileName ??
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

  // Возвращает список приглашённых клиентов для данного реферера
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
    });

    const refereeIds = referrals
      .map((row) => row.refereeId)
      .filter((id): id is string => Boolean(id));
    if (!refereeIds.length) return [];

    // Customer теперь per-merchant модель
    const [customers, stats, purchases] = await Promise.all([
      this.prisma.customer.findMany({
        where: { merchantId, id: { in: refereeIds } },
        select: {
          id: true,
          name: true,
          profileName: true,
          phone: true,
          createdAt: true,
        },
      }),
      this.prisma.customerStats.findMany({
        where: { merchantId, customerId: { in: refereeIds } },
        select: { customerId: true, visits: true },
      }),
      fetchReceiptAggregates(this.prisma, {
        merchantId,
        customerIds: refereeIds,
        includeImportedBase: true,
      }),
    ]);

    const customerMap = new Map<string, (typeof customers)[number]>();
    for (const c of customers) {
      customerMap.set(c.id, c);
    }

    const statsMap = new Map<string, number>();
    for (const stat of stats) {
      statsMap.set(stat.customerId, Number(stat.visits ?? 0));
    }

    const purchasesMap = new Map<string, number>();
    for (const row of purchases ?? []) {
      purchasesMap.set(row.customerId, Math.max(0, row.visits));
    }

    return referrals.map((ref) => {
      const customer = customerMap.get(ref.refereeId ?? '') ?? null;
      const displayName =
        typeof customer?.name === 'string' && customer.name.trim()
          ? customer.name.trim()
          : typeof customer?.profileName === 'string' &&
              customer.profileName.trim()
            ? customer.profileName.trim()
            : null;
      const joinedAt =
        customer?.createdAt ??
        ref.activatedAt ??
        ref.completedAt ??
        ref.createdAt;
      return {
        id: ref.refereeId ?? '',
        name: displayName ?? ref.refereeId ?? null,
        phone: customer?.phone ?? null,
        joinedAt: joinedAt ? joinedAt.toISOString() : null,
        purchases:
          purchasesMap.get(ref.refereeId ?? '') ??
          statsMap.get(ref.refereeId ?? '') ??
          0,
      };
    });
  }

  private asRecord(input: unknown): Record<string, unknown> | null {
    if (!input) return null;
    const normalize = (value: unknown): Record<string, unknown> | null =>
      asRecordShared(value);
    if (typeof input === 'string') {
      try {
        return normalize(JSON.parse(input) as unknown);
      } catch (err) {
        logIgnoredError(
          err,
          'PortalCustomersQueryService parse JSON payload',
          this.logger,
          'debug',
        );
        return null;
      }
    }
    return normalize(input);
  }

  private parseAmount(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.round(num));
  }

  private asStringValue(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
    return null;
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
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      )
      .map((value) => value.trim());
    if (parts.length) return parts.join(' ');
    if (staff.login && staff.login.trim()) return staff.login.trim();
    if (staff.email && staff.email.trim()) return staff.email.trim();
    return staff.id ?? null;
  }

  private describeTransaction(params: {
    tx: Prisma.TransactionGetPayload<{
      include: {
        outlet: { select: { id: true; name: true } };
        staff: {
          select: {
            id: true;
            login: true;
            email: true;
            firstName: true;
            lastName: true;
          };
        };
        canceledBy: {
          select: {
            id: true;
            login: true;
            email: true;
            firstName: true;
            lastName: true;
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
        canceledAt: true;
        outlet: { select: { id: true; name: true } };
        staff: {
          select: {
            id: true;
            login: true;
            email: true;
            firstName: true;
            lastName: true;
          };
        };
        canceledBy: {
          select: {
            id: true;
            login: true;
            email: true;
            firstName: true;
            lastName: true;
          };
        };
      };
    }> | null;
    metadata: Record<string, unknown> | null;
    promoUsage: { code: string | null; name: string | null } | null;
  }): {
    details: string;
    kind: string;
    note: string | null;
    purchaseAmount: number;
  } {
    const base = this.describeTransactionBase({
      tx: params.tx,
      receipt: params.receipt,
      metadata: params.metadata,
      promoUsage: params.promoUsage,
    });
    return {
      details: base.details,
      kind: base.kind,
      note: base.note,
      purchaseAmount: base.purchaseAmount,
    };
  }

  private describeTransactionBase(params: {
    tx: Prisma.TransactionGetPayload<{
      include: {
        outlet: { select: { id: true; name: true } };
        staff: {
          select: {
            id: true;
            login: true;
            email: true;
            firstName: true;
            lastName: true;
          };
        };
        canceledBy: {
          select: {
            id: true;
            login: true;
            email: true;
            firstName: true;
            lastName: true;
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
        canceledAt: true;
        outlet: { select: { id: true; name: true } };
        staff: {
          select: {
            id: true;
            login: true;
            email: true;
            firstName: true;
            lastName: true;
          };
        };
        canceledBy: {
          select: {
            id: true;
            login: true;
            email: true;
            firstName: true;
            lastName: true;
          };
        };
      };
    }> | null;
    metadata: Record<string, unknown> | null;
    promoUsage: { code: string | null; name: string | null } | null;
  }): {
    details: string;
    kind: string;
    note: string | null;
    purchaseAmount: number;
  } {
    let details = 'Операция';
    let kind: string = params.tx.type;
    let note: string | null = null;
    let purchaseAmount = Math.abs(Number(params.tx.amount ?? 0));

    const metadata = params.metadata ?? null;
    const receiptTotal = this.parseAmount(params.receipt?.total);
    const purchaseByMeta = this.parseAmount(metadata?.purchaseAmount);
    const purchaseByAmount = Math.max(
      0,
      this.parseAmount(params.tx.amount) ?? 0,
    );
    if (receiptTotal) purchaseAmount = receiptTotal;
    else if (purchaseByMeta != null) purchaseAmount = purchaseByMeta;
    else if (purchaseByAmount > 0) purchaseAmount = purchaseByAmount;

    if (params.tx.type === 'REDEEM') {
      details = 'Списание за покупку';
      kind = 'PURCHASE_REDEEM';
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'REFUND') {
      details = 'Возврат';
      kind = 'REFUND';
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'ADJUST') {
      const delta = Number(params.tx.amount ?? 0);
      if (delta < 0) {
        details = 'Списание по сроку';
        kind = 'EXPIRE';
      } else {
        details = 'Корректировка баллов';
        kind = 'CORRECTION';
      }
      if (typeof params.metadata?.comment === 'string') {
        const trimmed = params.metadata.comment.trim();
        if (trimmed) note = trimmed;
      }
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'CAMPAIGN') {
      if (params.metadata?.source === 'COMPLIMENTARY') {
        details = 'Комплимент от компании';
        kind = 'COMPLIMENTARY';
        if (typeof params.metadata?.comment === 'string') {
          const trimmed = params.metadata.comment.trim();
          if (trimmed) note = trimmed;
        }
      } else if (params.metadata?.source === 'MANUAL_ACCRUAL') {
        details = 'Начислено администратором';
        kind = 'MANUAL_ACCRUAL';
        if (typeof params.metadata?.comment === 'string') {
          const trimmed = params.metadata.comment.trim();
          if (trimmed) note = trimmed;
        }
      } else {
        details = 'Баллы по акции';
        kind = 'CAMPAIGN';
        if (typeof params.metadata?.comment === 'string') {
          const trimmed = params.metadata.comment.trim();
          if (trimmed) note = trimmed;
        }
      }
      return { details, kind, note, purchaseAmount };
    }

    if (params.tx.type === 'REFERRAL') {
      details = 'Реферальное начисление';
      kind = 'REFERRAL';
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

  async list(merchantId: string, query: ListCustomersQuery) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const search = query.search?.trim();
    const normalizedPhone = normalizePhoneValue(search);
    const registeredOnly = query.registeredOnly ?? true;
    const excludeMiniapp = query.excludeMiniapp ?? false;

    const whereSearch = search
      ? ({
          OR: [
            {
              phone: {
                contains: normalizedPhone ?? search,
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

    let segmentCondition: Prisma.CustomerWhereInput | null = null;
    if (query.segmentId) {
      const segment = await this.prisma.customerSegment.findFirst({
        where: { merchantId, id: query.segmentId },
        select: { id: true, isSystem: true, systemKey: true },
      });
      if (!segment) throw new NotFoundException('Аудитория не найдена');
      if (!isSystemAllAudience(segment)) {
        segmentCondition = { segments: { some: { segmentId: segment.id } } };
      }
    }

    const association: Prisma.CustomerWhereInput = {
      OR: [
        { wallets: { some: { merchantId, type: WalletType.POINTS } } },
        { transactions: { some: { merchantId } } },
        { Receipt: { some: { merchantId } } },
        { merchantId },
      ],
    };

    const andConditions: Prisma.CustomerWhereInput[] = [association];
    if (Object.keys(whereSearch).length) andConditions.push(whereSearch);
    if (segmentCondition) andConditions.push(segmentCondition);
    if (excludeMiniapp) {
      andConditions.push({
        NOT: {
          AND: [
            { tgId: { not: null } },
            { phone: null },
            { email: null },
            { name: null },
            { profileName: null },
            { externalId: null },
          ],
        },
      });
    }
    if (registeredOnly) {
      andConditions.push({
        AND: [
          { birthday: { not: null } },
          { gender: { in: ['male', 'female'] } },
          { phone: { not: null } },
          { name: { not: null } },
        ],
      });
    }

    const where: Prisma.CustomerWhereInput =
      andConditions.length > 1 ? { AND: andConditions } : association;

    const items = await this.prisma.customer.findMany({
      where,
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
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, merchantId },
      select: customerBaseSelect(merchantId),
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const walletBalance = await ensureWallet(
      this.prisma,
      merchantId,
      customerId,
    );

    const aggregates = await this.computeAggregates(merchantId, [customerId]);

    const baseDto = this.buildBaseDto(customer, aggregates);
    baseDto.balance = walletBalance;

    const transactionInclude = {
      outlet: { select: { id: true, name: true } },
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
      outlet: { select: { id: true, name: true } },
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

    const lotsLimit = 200;
    const receiptsLimit = 200;
    const reviewsLimit = 100;
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
        take: lotsLimit,
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
        take: receiptsLimit,
        select: receiptSelect,
      }),
      this.prisma.review.findMany({
        where: { merchantId, customerId },
        orderBy: { createdAt: 'desc' },
        take: reviewsLimit,
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

    const mappedTransactions: PortalCustomerTransactionDto[] = [];
    const refundGroups = new Map<
      string,
      { items: PortalCustomerTransactionDto[] }
    >();

    for (const tx of transactions) {
      const orderId = tx.orderId ?? null;
      const receipt = orderId ? (receiptMap.get(orderId) ?? null) : null;
      const review = orderId ? (reviewByOrderId.get(orderId) ?? null) : null;
      const metadata = this.asRecord(tx.metadata);
      const promoUsage = orderId
        ? (promoUsageByOrder.get(orderId) ?? null)
        : null;
      const change = Number(tx.amount ?? 0);

      const descriptor = this.describeTransaction({
        tx,
        receipt,
        metadata,
        promoUsage,
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
      const total = receipt != null ? Number(receipt.total ?? 0) : metaTotal;
      const outletName = receipt?.outlet?.name ?? tx.outlet?.name ?? null;
      const receiptNumber = this.asStringValue(
        receipt?.receiptNumber ?? metadata?.receiptNumber,
      );
      const manager = this.formatStaffName(tx.staff ?? receipt?.staff);
      const canceledBy = tx.canceledBy ?? receipt?.canceledBy ?? null;
      const carrier = this.asStringValue(metadata?.carrier);
      const carrierCode = this.asStringValue(metadata?.carrierCode);
      const note = descriptor.note;

      const entry: PortalCustomerTransactionDto = {
        id: tx.id,
        type: tx.type,
        orderId,
        change,
        purchaseAmount,
        datetime: this.formatReceiptDateTime(
          receipt?.createdAt ?? tx.createdAt,
        ),
        details: descriptor.details,
        outlet: outletName,
        rating: review?.rating ?? null,
        receiptNumber,
        manager,
        carrier,
        carrierCode,
        toPay: toPay != null ? Math.max(0, toPay) : null,
        paidByPoints: paidByPoints != null ? Math.max(0, paidByPoints) : null,
        total: total != null ? Math.max(0, total) : null,
        blockedAccrual: Boolean(metadata?.blockedAccrual),
        receiptId: receipt?.id ?? null,
        canceledAt:
          tx.canceledAt?.toISOString() ?? receipt?.canceledAt?.toISOString(),
        canceledBy: canceledBy
          ? { id: canceledBy.id, name: this.formatStaffName(canceledBy) }
          : null,
        note,
        kind: descriptor.kind,
        earnAmount: metadata?.earnAmount
          ? Math.max(0, Number(metadata.earnAmount))
          : null,
        redeemAmount: metadata?.redeemAmount
          ? Math.max(0, Number(metadata.redeemAmount))
          : null,
        referralCustomerId: this.asStringValue(metadata?.referralCustomerId),
        referralCustomerName: this.asStringValue(
          metadata?.referralCustomerName,
        ),
        referralCustomerPhone: this.asStringValue(
          metadata?.referralCustomerPhone,
        ),
      };

      if (tx.type === 'REFUND' && orderId) {
        const existing = refundGroups.get(orderId);
        if (existing) {
          existing.items.push(entry);
        } else {
          refundGroups.set(orderId, { items: [entry] });
        }
      } else {
        mappedTransactions.push(entry);
      }
    }

    for (const [orderId, group] of refundGroups) {
      const refundTotal = group.items.reduce(
        (sum, item) => sum + Math.abs(item.change),
        0,
      );
      const descriptor = group.items[0];
      if (!descriptor) continue;

      const receipt = orderId ? (receiptMap.get(orderId) ?? null) : null;
      const purchaseAmount = descriptor.purchaseAmount;
      const redeem = this.parseAmount(descriptor.redeemAmount);
      const earn = this.parseAmount(descriptor.earnAmount);
      const total =
        receipt != null
          ? Number(receipt.total ?? 0)
          : (descriptor.total ?? null);
      const toPay =
        receipt != null
          ? Math.max(
              0,
              Number(receipt.total ?? 0) - Number(receipt.redeemApplied ?? 0),
            )
          : (descriptor.toPay ?? null);
      const paidByPoints =
        receipt != null
          ? Number(receipt.redeemApplied ?? 0)
          : (descriptor.paidByPoints ?? null);
      const receiptNumber = receipt?.receiptNumber ?? descriptor.receiptNumber;
      const outlet = receipt?.outlet?.name ?? descriptor.outlet;
      const manager = receipt?.staff
        ? this.formatStaffName(receipt.staff)
        : descriptor.manager;
      const canceledAt = descriptor.canceledAt ?? null;
      const canceledBy = descriptor.canceledBy ?? null;
      const receiptId = receipt?.id ?? descriptor.receiptId ?? null;

      const purchaseEntries: PortalCustomerTransactionDto[] = group.items.map(
        (item) => {
          const note = item.note ?? descriptor.note;
          return {
            ...item,
            details: 'Возврат (позиция)',
            kind: 'REFUND_ITEM',
            note,
          };
        },
      );

      const refundEntries: PortalCustomerTransactionDto[] = [
        {
          id: descriptor.id,
          type: descriptor.type,
          orderId,
          change: -refundTotal,
          purchaseAmount,
          datetime: descriptor.datetime,
          details: 'Возврат',
          outlet,
          rating: descriptor.rating,
          receiptNumber,
          manager,
          carrier: descriptor.carrier,
          carrierCode: descriptor.carrierCode,
          toPay,
          paidByPoints,
          total,
          blockedAccrual: false,
          receiptId,
          canceledAt,
          canceledBy,
          note: null,
          kind: 'REFUND',
          earnAmount: redeem,
          redeemAmount: earn,
        },
      ];

      mappedTransactions.push(...purchaseEntries, ...refundEntries);
    }

    mappedTransactions.sort(
      (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
    );

    baseDto.transactions = mappedTransactions;

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
    } catch (err) {
      logIgnoredError(
        err,
        'PortalCustomersQueryService resolve earnRateBps',
        this.logger,
        'debug',
      );
      baseDto.earnRateBps = null;
    }

    return baseDto;
  }

  private async resolveEarnRateBps(
    merchantId: string,
    customerId: string,
  ): Promise<number> {
    await ensureBaseTier(this.prisma, merchantId).catch((err) => {
      logIgnoredError(
        err,
        'PortalCustomersQueryService ensureBaseTier',
        this.logger,
        'debug',
        { merchantId },
      );
      return null;
    });
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
    return 0;
  }
}
