import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CustomerSegment } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { ALL_CUSTOMERS_SEGMENT_KEY } from './audience.constants';
import { isSystemAllAudience } from './audience.utils';

export interface CustomerFilters {
  search?: string;
  segmentId?: string;
  tags?: string[];
  gender?: string[];
  minVisits?: number;
  maxVisits?: number;
  rfmClasses?: string[];
  limit?: number;
  offset?: number;
}

type NumberRange = {
  min?: number | null;
  max?: number | null;
};

type BirthdayRange = {
  from?: string | null;
  to?: string | null;
};

type NormalizedSegmentFilters = {
  tags?: string[];
  gender?: string[];
  outletIds?: string[];
  productIds?: string[];
  tierIds?: string[];
  devicePlatforms?: string[];
  rfmClasses?: string[];
  registrationDays?: NumberRange;
  lastPurchaseDays?: NumberRange;
  visits?: NumberRange;
  averageCheck?: NumberRange;
  totalSpent?: NumberRange;
  age?: NumberRange;
  birthday?: BirthdayRange;
};

const MS_IN_DAY = 86_400_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeRange(value: any): NumberRange | null {
  if (value == null) return null;
  let min: number | null = null;
  let max: number | null = null;
  if (Array.isArray(value)) {
    if (value.length > 0) min = toFiniteNumber(value[0]);
    if (value.length > 1) max = toFiniteNumber(value[1]);
  } else if (typeof value === 'object') {
    min =
      toFiniteNumber((value as any).min ?? (value as any).from ?? (value as any).gte) ??
      null;
    max =
      toFiniteNumber((value as any).max ?? (value as any).to ?? (value as any).lte) ??
      null;
  } else {
    const num = toFiniteNumber(value);
    min = num;
    max = num;
  }
  if (min != null && max != null && min > max) {
    [min, max] = [max, min];
  }
  if (min == null && max == null) return null;
  const result: NumberRange = {};
  if (min != null) result.min = min;
  if (max != null) result.max = max;
  return result;
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function subDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - days);
  return copy;
}

function subYears(date: Date, years: number): Date {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() - years);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export interface SegmentPayload {
  name: string;
  description?: string | null;
  rules: any;
  filters?: any;
  tags?: string[];
  color?: string | null;
  isActive?: boolean;
  actorId?: string;
}

interface ListSegmentsOptions {
  includeSystem?: boolean;
}

@Injectable()
export class CustomerAudiencesService {
  private readonly logger = new Logger(CustomerAudiencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  private normalizeSegmentFilters(filters: any): NormalizedSegmentFilters {
    const result: NormalizedSegmentFilters = {};
    if (!filters || typeof filters !== 'object') return result;
    const source = filters as Record<string, any>;

    const tags = Array.isArray(source.tags)
      ? source.tags.filter(isNonEmptyString).map((tag) => tag.trim())
      : [];
    if (tags.length) result.tags = Array.from(new Set(tags));

    const genderRaw: string[] = [];
    if (Array.isArray(source.gender)) genderRaw.push(...source.gender);
    if (isNonEmptyString(source.gender)) genderRaw.push(source.gender);
    const gender = genderRaw
      .map((value) => value.trim().toLowerCase())
      .filter((value) => ['male', 'female', 'other'].includes(value));
    if (gender.length) result.gender = Array.from(new Set(gender));

    const outletRaw: string[] = [];
    if (Array.isArray(source.outletIds)) outletRaw.push(...source.outletIds);
    if (Array.isArray(source.outlets)) outletRaw.push(...source.outlets);
    if (Array.isArray(source.visitedOutlets)) outletRaw.push(...source.visitedOutlets);
    const outletIds = outletRaw
      .filter(isNonEmptyString)
      .map((value) => value.trim());
    if (outletIds.length) result.outletIds = Array.from(new Set(outletIds));

    const productRaw: string[] = [];
    if (Array.isArray(source.productIds)) productRaw.push(...source.productIds);
    if (Array.isArray(source.products)) productRaw.push(...source.products);
    const productIds = productRaw
      .filter(isNonEmptyString)
      .map((value) => value.trim());
    if (productIds.length) result.productIds = Array.from(new Set(productIds));

    const tierRaw: string[] = [];
    if (Array.isArray(source.tierIds)) tierRaw.push(...source.tierIds);
    if (Array.isArray(source.levelIds)) tierRaw.push(...source.levelIds);
    if (Array.isArray(source.level)) tierRaw.push(...source.level);
    if (isNonEmptyString(source.level)) tierRaw.push(source.level);
    const tierIds = tierRaw.filter(isNonEmptyString).map((value) => value.trim());
    if (tierIds.length) result.tierIds = Array.from(new Set(tierIds));

    const deviceRaw: string[] = [];
    if (Array.isArray(source.devicePlatforms)) deviceRaw.push(...source.devicePlatforms);
    if (Array.isArray(source.devices)) deviceRaw.push(...source.devices);
    if (Array.isArray(source.device)) deviceRaw.push(...source.device);
    if (isNonEmptyString(source.device)) deviceRaw.push(source.device);
    const devicePlatforms = deviceRaw
      .filter(isNonEmptyString)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value === 'ios' || value === 'android');
    if (devicePlatforms.length)
      result.devicePlatforms = Array.from(new Set(devicePlatforms));

    const rfmClasses = Array.isArray(source.rfmClasses)
      ? source.rfmClasses
          .filter(isNonEmptyString)
          .map((value) => value.trim().toUpperCase())
      : [];
    if (rfmClasses.length)
      result.rfmClasses = Array.from(new Set(rfmClasses));

    const visits =
      normalizeRange(source.visits) ??
      normalizeRange([source.minVisits, source.maxVisits]);
    if (visits) {
      if (visits.min != null) visits.min = Math.max(0, Math.floor(visits.min));
      if (visits.max != null) visits.max = Math.max(0, Math.floor(visits.max));
      result.visits = visits;
    }

    const averageCheck =
      normalizeRange(source.averageCheck) ??
      normalizeRange([source.minAverageCheck, source.maxAverageCheck]);
    if (averageCheck) result.averageCheck = averageCheck;

    const totalSpent =
      normalizeRange(source.totalSpent) ??
      normalizeRange([source.minTotalSpent, source.maxTotalSpent]) ??
      normalizeRange([source.purchaseSumMin, source.purchaseSumMax]);
    if (totalSpent) result.totalSpent = totalSpent;

    const ageRange =
      normalizeRange(source.age) ??
      normalizeRange([source.minAge, source.maxAge]) ??
      normalizeRange(source.ageRange);
    if (ageRange) {
      if (ageRange.min != null) ageRange.min = Math.max(0, Math.floor(ageRange.min));
      if (ageRange.max != null) ageRange.max = Math.max(0, Math.floor(ageRange.max));
      result.age = ageRange;
    }

    let registrationDays =
      normalizeRange(source.registrationDays) ??
      normalizeRange(source.registration) ??
      normalizeRange([source.registrationMinDays, source.registrationMaxDays]);
    if (!registrationDays) {
      const from = parseIsoDate(source.registrationFrom ?? source.registeredFrom);
      const to = parseIsoDate(source.registrationTo ?? source.registeredTo);
      if (from || to) {
        const now = new Date();
        const min = to
          ? Math.max(0, Math.floor((now.getTime() - to.getTime()) / MS_IN_DAY))
          : null;
        const max = from
          ? Math.max(0, Math.floor((now.getTime() - from.getTime()) / MS_IN_DAY))
          : null;
        registrationDays = normalizeRange({ min, max });
      }
    }
    if (registrationDays) {
      if (registrationDays.min != null)
        registrationDays.min = Math.max(0, Math.floor(registrationDays.min));
      if (registrationDays.max != null)
        registrationDays.max = Math.max(0, Math.floor(registrationDays.max));
      result.registrationDays = registrationDays;
    }

    let lastPurchaseDays =
      normalizeRange(source.lastPurchaseDays) ??
      normalizeRange(source.lastPurchase) ??
      normalizeRange([source.minLastPurchaseDays, source.maxLastPurchaseDays]);
    if (!lastPurchaseDays) {
      const from = parseIsoDate(source.lastVisitFrom);
      const to = parseIsoDate(source.lastVisitTo);
      if (from || to) {
        const now = new Date();
        const min = to
          ? Math.max(0, Math.floor((now.getTime() - to.getTime()) / MS_IN_DAY))
          : null;
        const max = from
          ? Math.max(0, Math.floor((now.getTime() - from.getTime()) / MS_IN_DAY))
          : null;
        lastPurchaseDays = normalizeRange({ min, max });
      }
    }
    if (lastPurchaseDays) {
      if (lastPurchaseDays.min != null)
        lastPurchaseDays.min = Math.max(0, Math.floor(lastPurchaseDays.min));
      if (lastPurchaseDays.max != null)
        lastPurchaseDays.max = Math.max(0, Math.floor(lastPurchaseDays.max));
      result.lastPurchaseDays = lastPurchaseDays;
    }

    const birthdayCandidates: BirthdayRange[] = [];
    const birthdayRaw = source.birthday ?? source.birthdays ?? source.birthdayRange;
    if (birthdayRaw && typeof birthdayRaw === 'object') {
      const from = parseIsoDate(
        birthdayRaw.from ?? birthdayRaw.start ?? birthdayRaw.min ?? birthdayRaw.gte,
      );
      const to = parseIsoDate(
        birthdayRaw.to ?? birthdayRaw.end ?? birthdayRaw.max ?? birthdayRaw.lte,
      );
      birthdayCandidates.push({
        from: from ? from.toISOString().slice(0, 10) : null,
        to: to ? to.toISOString().slice(0, 10) : null,
      });
    }
    if (source.birthdayFrom || source.birthdayTo) {
      const from = parseIsoDate(source.birthdayFrom);
      const to = parseIsoDate(source.birthdayTo);
      birthdayCandidates.push({
        from: from ? from.toISOString().slice(0, 10) : null,
        to: to ? to.toISOString().slice(0, 10) : null,
      });
    }
    const birthday = birthdayCandidates.find((candidate) => candidate.from || candidate.to);
    if (birthday) {
      const normalizedBirthday: BirthdayRange = {};
      if (birthday.from) normalizedBirthday.from = birthday.from;
      if (birthday.to) normalizedBirthday.to = birthday.to;
      result.birthday = normalizedBirthday;
    }

    return result;
  }

  private cleanRange(range?: NumberRange | null): NumberRange | undefined {
    if (!range) return undefined;
    const cleaned: NumberRange = {};
    if (typeof range.min === 'number' && Number.isFinite(range.min))
      cleaned.min = range.min;
    if (typeof range.max === 'number' && Number.isFinite(range.max))
      cleaned.max = range.max;
    if (cleaned.min == null && cleaned.max == null) return undefined;
    return cleaned;
  }

  private cleanBirthday(range?: BirthdayRange | null): BirthdayRange | undefined {
    if (!range) return undefined;
    const from = isNonEmptyString(range.from) ? range.from.slice(0, 10) : null;
    const to = isNonEmptyString(range.to) ? range.to.slice(0, 10) : null;
    if (!from && !to) return undefined;
    const cleaned: BirthdayRange = {};
    if (from) cleaned.from = from;
    if (to) cleaned.to = to;
    return cleaned;
  }

  private prepareSegmentFiltersForStorage(filters: any): Prisma.InputJsonValue {
    const normalized = this.normalizeSegmentFilters(filters);
    const payload: Record<string, any> = {};
    if (normalized.tags?.length) payload.tags = normalized.tags;
    if (normalized.gender?.length) payload.gender = normalized.gender;
    if (normalized.outletIds?.length) payload.outletIds = normalized.outletIds;
    if (normalized.productIds?.length) payload.productIds = normalized.productIds;
    if (normalized.tierIds?.length) payload.tierIds = normalized.tierIds;
    if (normalized.devicePlatforms?.length)
      payload.devicePlatforms = normalized.devicePlatforms;
    if (normalized.rfmClasses?.length) payload.rfmClasses = normalized.rfmClasses;
    const reg = this.cleanRange(normalized.registrationDays);
    if (reg) payload.registrationDays = reg;
    const last = this.cleanRange(normalized.lastPurchaseDays);
    if (last) payload.lastPurchaseDays = last;
    const visits = this.cleanRange(normalized.visits);
    if (visits) payload.visits = visits;
    const avg = this.cleanRange(normalized.averageCheck);
    if (avg) payload.averageCheck = avg;
    const total = this.cleanRange(normalized.totalSpent);
    if (total) payload.totalSpent = total;
    const age = this.cleanRange(normalized.age);
    if (age) payload.age = age;
    const birthday = this.cleanBirthday(normalized.birthday);
    if (birthday) payload.birthday = birthday;
    return Object.keys(payload).length > 0
      ? (payload as Prisma.JsonObject)
      : Prisma.JsonNull;
  }

  private segmentFiltersForResponse(filters: any): Record<string, any> | null {
    const normalized = this.normalizeSegmentFilters(filters);
    const payload: Record<string, any> = {};
    if (normalized.tags?.length) payload.tags = normalized.tags;
    if (normalized.gender?.length) payload.gender = normalized.gender;
    if (normalized.outletIds?.length) payload.outletIds = normalized.outletIds;
    if (normalized.productIds?.length) payload.productIds = normalized.productIds;
    if (normalized.tierIds?.length) payload.tierIds = normalized.tierIds;
    if (normalized.devicePlatforms?.length)
      payload.devicePlatforms = normalized.devicePlatforms;
    if (normalized.rfmClasses?.length) payload.rfmClasses = normalized.rfmClasses;
    const reg = this.cleanRange(normalized.registrationDays);
    if (reg) payload.registrationDays = reg;
    const last = this.cleanRange(normalized.lastPurchaseDays);
    if (last) payload.lastPurchaseDays = last;
    const visits = this.cleanRange(normalized.visits);
    if (visits) payload.visits = visits;
    const avg = this.cleanRange(normalized.averageCheck);
    if (avg) payload.averageCheck = avg;
    const total = this.cleanRange(normalized.totalSpent);
    if (total) payload.totalSpent = total;
    const age = this.cleanRange(normalized.age);
    if (age) payload.age = age;
    const birthday = this.cleanBirthday(normalized.birthday);
    if (birthday) payload.birthday = birthday;
    return Object.keys(payload).length > 0 ? payload : null;
  }

  private async ensureDefaultAudience(merchantId: string) {
    const existing = await this.prisma.customerSegment.findFirst({
      where: { merchantId, systemKey: ALL_CUSTOMERS_SEGMENT_KEY },
    });
    if (existing) return existing;
    const total = await this.prisma.customerStats.count({
      where: { merchantId },
    });
    const now = new Date();
    return this.prisma.customerSegment.create({
      data: {
        merchantId,
        name: 'Все клиенты',
        description: 'Системная аудитория, включающая всех клиентов мерчанта',
        type: 'SYSTEM',
        rules: { kind: 'all' } as Prisma.JsonObject,
        filters: Prisma.JsonNull,
        metricsSnapshot: {
          calculatedAt: now.toISOString(),
          estimatedCustomers: total,
        } as Prisma.JsonObject,
        customerCount: total,
        isActive: true,
        tags: [],
        color: null,
        source: 'system',
        systemKey: ALL_CUSTOMERS_SEGMENT_KEY,
        isSystem: true,
      },
    });
  }

  private buildCustomerWhere(
    merchantId: string,
    filters: CustomerFilters,
  ): Prisma.CustomerWhereInput {
    const base: Prisma.CustomerWhereInput = {};
    if (filters.segmentId) {
      base.segments = { some: { segmentId: filters.segmentId } };
    }
    if (filters.tags?.length) {
      base.tags = { hasSome: filters.tags };
    }
    if (filters.gender?.length) {
      base.gender = { in: filters.gender };
    }
    if (filters.search?.trim()) {
      const query = filters.search.trim();
      base.OR = [
        { phone: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ];
    }
    const statsFilters: Prisma.CustomerStatsWhereInput = { merchantId };
    const visits: Prisma.IntFilter = {};
    if (filters.minVisits != null) {
      visits.gte = filters.minVisits;
    }
    if (filters.maxVisits != null) {
      visits.lte = filters.maxVisits;
    }
    if (Object.keys(visits).length > 0) {
      statsFilters.visits = visits;
    }
    if (filters.rfmClasses?.length) {
      statsFilters.rfmClass = { in: filters.rfmClasses };
    }
    base.customerStats = { some: statsFilters };
    return base;
  }

  async listCustomers(merchantId: string, filters: CustomerFilters = {}) {
    const normalizedFilters: CustomerFilters = { ...filters };
    if (normalizedFilters.segmentId) {
      const segment = await this.prisma.customerSegment.findFirst({
        where: {
          merchantId,
          id: normalizedFilters.segmentId,
        },
        select: { id: true, isSystem: true, systemKey: true },
      });
      if (!segment) throw new NotFoundException('Аудитория не найдена');
      if (isSystemAllAudience(segment)) {
        normalizedFilters.segmentId = undefined;
      }
    }
    const where = this.buildCustomerWhere(merchantId, normalizedFilters);
    const take = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const skip = Math.max(filters.offset ?? 0, 0);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          customerStats: { where: { merchantId }, take: 1 },
          segments: { include: { segment: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    const result = {
      total,
      items: items.map((customer) => ({
        ...customer,
        stats: customer.customerStats[0] ?? null,
        segments: customer.segments.map((s) => ({
          id: s.segmentId,
          name: s.segment.name,
        })),
      })),
    };

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.customers.list',
          merchantId,
          filters: {
            hasSearch: Boolean(filters.search),
            segmentId: normalizedFilters.segmentId ?? null,
            tags: filters.tags?.length ?? 0,
            gender: filters.gender?.length ?? 0,
            minVisits: filters.minVisits ?? null,
            maxVisits: filters.maxVisits ?? null,
            rfmClasses: filters.rfmClasses?.length ?? 0,
          },
          limit: take,
          offset: skip,
          total,
        }),
      );
      this.metrics.inc('portal_customers_list_total');
    } catch {}
    return result;
  }

  async getCustomer(merchantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId },
      include: {
        customerStats: { where: { merchantId }, take: 1 },
        segments: { include: { segment: true } },
      },
    });
    if (!customer) throw new NotFoundException('Клиент не найден');

    const result = {
      ...customer,
      stats: customer.customerStats[0] ?? null,
      segments: customer.segments.map((s) => ({
        id: s.segmentId,
        name: s.segment.name,
      })),
    };

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.customers.get',
          merchantId,
          customerId,
          hasStats: Boolean(customer.customerStats?.length),
          segments: customer.segments.length,
        }),
      );
      this.metrics.inc('portal_customers_get_total', { result: 'found' });
    } catch {}
    return result;
  }

  private buildSegmentWhere(
    merchantId: string,
    filters: any,
  ): Prisma.CustomerWhereInput {
    const normalized = this.normalizeSegmentFilters(filters);
    const andConditions: Prisma.CustomerWhereInput[] = [
      {
        OR: [
          { merchantProfiles: { some: { merchantId } } },
          { wallets: { some: { merchantId } } },
          { transactions: { some: { merchantId } } },
          { Receipt: { some: { merchantId } } },
        ],
      },
    ];

    if (normalized.tags?.length) {
      andConditions.push({ tags: { hasSome: normalized.tags } });
    }
    if (normalized.gender?.length) {
      andConditions.push({ gender: { in: normalized.gender } });
    }
    if (normalized.outletIds?.length) {
      andConditions.push({
        Receipt: {
          some: {
            merchantId,
            outletId: { in: normalized.outletIds },
            canceledAt: null,
          },
        },
      });
    }
    if (normalized.tierIds?.length) {
      andConditions.push({
        tierAssignments: {
          some: { merchantId, tierId: { in: normalized.tierIds } },
        },
      });
    }
    if (normalized.devicePlatforms?.length) {
      andConditions.push({
        pushDevices: {
          some: {
            platform: { in: normalized.devicePlatforms },
            isActive: true,
            OR: [{ merchantId }, { merchantId: null }],
          },
        },
      });
    }

    const now = new Date();
    const birthdayFilter: Prisma.DateTimeFilter = {};
    let hasBirthdayFilter = false;

    if (normalized.age) {
      if (normalized.age.max != null) {
        const minBirthdate = startOfDay(
          addDays(subYears(now, Math.floor(normalized.age.max + 1)), 1),
        );
        birthdayFilter.gte =
          birthdayFilter.gte && birthdayFilter.gte > minBirthdate
            ? birthdayFilter.gte
            : minBirthdate;
        hasBirthdayFilter = true;
      }
      if (normalized.age.min != null) {
        const maxBirthdate = endOfDay(
          subYears(now, Math.floor(normalized.age.min)),
        );
        birthdayFilter.lte =
          birthdayFilter.lte && birthdayFilter.lte < maxBirthdate
            ? birthdayFilter.lte
            : maxBirthdate;
        hasBirthdayFilter = true;
      }
    }
    if (normalized.birthday) {
      if (normalized.birthday.from) {
        const fromDate = parseIsoDate(normalized.birthday.from);
        if (fromDate) {
          const start = startOfDay(fromDate);
          birthdayFilter.gte =
            birthdayFilter.gte && birthdayFilter.gte > start
              ? birthdayFilter.gte
              : start;
          hasBirthdayFilter = true;
        }
      }
      if (normalized.birthday.to) {
        const toDate = parseIsoDate(normalized.birthday.to);
        if (toDate) {
          const end = endOfDay(toDate);
          birthdayFilter.lte =
            birthdayFilter.lte && birthdayFilter.lte < end
              ? birthdayFilter.lte
              : end;
          hasBirthdayFilter = true;
        }
      }
    }
    if (hasBirthdayFilter) {
      andConditions.push({ birthday: birthdayFilter });
    }

    const statsConditions: Prisma.CustomerStatsWhereInput = { merchantId };
    let statsApplied = false;

    if (normalized.rfmClasses?.length) {
      statsConditions.rfmClass = { in: normalized.rfmClasses };
      statsApplied = true;
    }
    if (normalized.visits) {
      const visits: Prisma.IntFilter = {};
      if (normalized.visits.min != null)
        visits.gte = Math.floor(normalized.visits.min);
      if (normalized.visits.max != null)
        visits.lte = Math.floor(normalized.visits.max);
      if (Object.keys(visits).length) {
        statsConditions.visits = visits;
        statsApplied = true;
      }
    }
    if (normalized.averageCheck) {
      const averageCheck: Prisma.FloatFilter = {};
      if (normalized.averageCheck.min != null)
        averageCheck.gte = normalized.averageCheck.min;
      if (normalized.averageCheck.max != null)
        averageCheck.lte = normalized.averageCheck.max;
      if (Object.keys(averageCheck).length) {
        statsConditions.avgCheck = averageCheck;
        statsApplied = true;
      }
    }
    if (normalized.totalSpent) {
      const totalSpent: Prisma.FloatFilter = {};
      if (normalized.totalSpent.min != null)
        totalSpent.gte = normalized.totalSpent.min;
      if (normalized.totalSpent.max != null)
        totalSpent.lte = normalized.totalSpent.max;
      if (Object.keys(totalSpent).length) {
        statsConditions.totalSpent = totalSpent;
        statsApplied = true;
      }
    }
    if (normalized.lastPurchaseDays) {
      const lastOrderAt: Prisma.DateTimeFilter = {};
      if (normalized.lastPurchaseDays.max != null) {
        lastOrderAt.gte = startOfDay(
          subDays(now, Math.floor(normalized.lastPurchaseDays.max)),
        );
      }
      if (normalized.lastPurchaseDays.min != null) {
        lastOrderAt.lte = endOfDay(
          subDays(now, Math.floor(normalized.lastPurchaseDays.min)),
        );
      }
      if (Object.keys(lastOrderAt).length) {
        statsConditions.lastOrderAt = lastOrderAt;
        statsApplied = true;
      }
    }

    if (statsApplied) {
      andConditions.push({ customerStats: { some: statsConditions } });
    }

    if (
      normalized.registrationDays &&
      (normalized.registrationDays.min != null ||
        normalized.registrationDays.max != null)
    ) {
      const range = normalized.registrationDays;
      const statsRange: Prisma.CustomerStatsWhereInput = { merchantId };
      const profileRange: Prisma.MerchantCustomerWhereInput = { merchantId };
      if (range.max != null) {
        const fromDate = startOfDay(subDays(now, Math.floor(range.max)));
        statsRange.firstSeenAt = {
          ...(statsRange.firstSeenAt ?? {}),
          gte: fromDate,
        };
        profileRange.createdAt = {
          ...(profileRange.createdAt ?? {}),
          gte: fromDate,
        };
      }
      if (range.min != null) {
        const toDate = endOfDay(subDays(now, Math.floor(range.min)));
        statsRange.firstSeenAt = {
          ...(statsRange.firstSeenAt ?? {}),
          lte: toDate,
        };
        profileRange.createdAt = {
          ...(profileRange.createdAt ?? {}),
          lte: toDate,
        };
      }
      andConditions.push({
        OR: [
          { customerStats: { some: statsRange } },
          { merchantProfiles: { some: profileRange } },
        ],
      });
    }

    return { AND: andConditions };
  }

  async listSegments(merchantId: string, options: ListSegmentsOptions = {}) {
    await this.ensureDefaultAudience(merchantId).catch(() => null);
    const where: Prisma.CustomerSegmentWhereInput = { merchantId };
    if (!options.includeSystem) where.isSystem = false;
    const segments = await this.prisma.customerSegment.findMany({
      where,
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
    });
    const normalizedSegments = segments.map((segment) => ({
      ...segment,
      filters: this.segmentFiltersForResponse(segment.filters ?? null),
    }));
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.list',
          merchantId,
          total: segments.length,
        }),
      );
      this.metrics.inc('portal_audiences_list_total');
    } catch {}
    return normalizedSegments;
  }

  async createSegment(merchantId: string, payload: SegmentPayload) {
    if (!payload.name?.trim())
      throw new BadRequestException('Название сегмента обязательно');

    const sanitizedTags = Array.isArray(payload.tags)
      ? Array.from(
          new Set(payload.tags.filter(isNonEmptyString).map((tag) => tag.trim())),
        )
      : [];
    const storedFilters = this.prepareSegmentFiltersForStorage(
      payload.filters ?? null,
    );

    const segment = await this.prisma.customerSegment.create({
      data: {
        merchantId,
        name: payload.name.trim(),
        description: payload.description ?? null,
        rules: payload.rules ?? {},
        filters: storedFilters,
        tags: sanitizedTags,
        color: payload.color ?? null,
        isActive: payload.isActive ?? true,
        createdById: payload.actorId ?? null,
        updatedById: payload.actorId ?? null,
      },
    });

    await this.recalculateSegmentMembership(merchantId, segment);

    const fresh = await this.prisma.customerSegment.findUnique({
      where: { id: segment.id },
    });
    const response = fresh ?? segment;
    const result = {
      ...response,
      filters: this.segmentFiltersForResponse(response.filters ?? null),
    };

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.create',
          merchantId,
          segmentId: result.id,
          active: result.isActive,
        }),
      );
      this.metrics.inc('portal_audiences_changed_total', { action: 'create' });
    } catch {}
    return result;
  }

  async updateSegment(
    merchantId: string,
    segmentId: string,
    payload: SegmentPayload,
  ) {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { merchantId, id: segmentId },
    });
    if (!segment) throw new NotFoundException('Сегмент не найден');
    if (isSystemAllAudience(segment)) {
      throw new BadRequestException('Системную аудиторию нельзя изменять');
    }
    const sanitizedTags =
      payload.tags === undefined
        ? segment.tags
        : Array.isArray(payload.tags)
        ? Array.from(
            new Set(
              payload.tags
                .filter(isNonEmptyString)
                .map((tag) => tag.trim()),
            ),
          )
        : [];
    const storedFilters =
      payload.filters === undefined
        ? segment.filters
        : this.prepareSegmentFiltersForStorage(payload.filters);
    const updated = await this.prisma.customerSegment.update({
      where: { id: segmentId },
      data: {
        name: payload.name?.trim() ?? segment.name,
        description: payload.description ?? segment.description,
        rules: payload.rules ?? segment.rules,
        filters: storedFilters,
        tags: sanitizedTags,
        color: payload.color ?? segment.color,
        isActive: payload.isActive ?? segment.isActive,
        updatedById: payload.actorId ?? segment.updatedById,
      },
    });

    await this.recalculateSegmentMembership(merchantId, segmentId);

    const fresh = await this.prisma.customerSegment.findUnique({
      where: { id: updated.id },
    });
    const response = fresh ?? updated;
    const result = {
      ...response,
      filters: this.segmentFiltersForResponse(response.filters ?? null),
    };

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.update',
          merchantId,
          segmentId,
          active: result.isActive,
        }),
      );
      this.metrics.inc('portal_audiences_changed_total', { action: 'update' });
    } catch {}
    return result;
  }

  async recalculateSegmentMembership(
    merchantId: string,
    segmentInput: CustomerSegment | string,
  ) {
    const segment =
      typeof segmentInput === 'string'
        ? await this.prisma.customerSegment.findFirst({
            where: { merchantId, id: segmentInput },
          })
        : segmentInput;
    if (!segment) throw new NotFoundException('Сегмент не найден');
    if (segment.merchantId !== merchantId)
      throw new NotFoundException('Сегмент не найден');
    if (isSystemAllAudience(segment)) {
      this.logger.debug(
        `Skip recalculation for system audience ${segment.id}`,
      );
      return { segmentId: segment.id, processed: 0, skipped: true };
    }

    const filters =
      segment.filters &&
      typeof segment.filters === 'object' &&
      !Array.isArray(segment.filters)
        ? (segment.filters as Record<string, any>)
        : {};
    const where = this.buildSegmentWhere(merchantId, filters);
    const customers = await this.prisma.customer.findMany({
      where,
      select: { id: true },
    });
    const customerIds = customers.map((c) => c.id);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.segmentCustomer.deleteMany({
        where: { segmentId: segment.id },
      });
      if (customerIds.length) {
        await tx.segmentCustomer.createMany({
          data: customerIds.map((customerId) => ({
            segmentId: segment.id,
            customerId,
          })),
          skipDuplicates: true,
        });
      }
      await tx.customerSegment.update({
        where: { id: segment.id },
        data: {
          customerCount: customerIds.length,
          lastEvaluatedAt: now,
        },
      });
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.recalculate',
          merchantId,
          segmentId: segment.id,
          customers: customerIds.length,
        }),
      );
      this.metrics.inc('portal_audience_recalculate_total');
    } catch {}
    return { segmentId: segment.id, processed: customerIds.length };
  }

  async setSegmentActive(
    merchantId: string,
    segmentId: string,
    isActive: boolean,
  ) {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { merchantId, id: segmentId },
    });
    if (!segment) throw new NotFoundException('Сегмент не найден');
    if (isSystemAllAudience(segment)) {
      throw new BadRequestException('Системную аудиторию нельзя отключать');
    }

    const updated = await this.prisma.customerSegment.update({
      where: { id: segmentId },
      data: { isActive },
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.status',
          merchantId,
          segmentId,
          active: updated.isActive,
        }),
      );
      this.metrics.inc('portal_audiences_changed_total', { action: 'status' });
    } catch {}
    return updated;
  }

  async archiveSegment(merchantId: string, segmentId: string) {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { merchantId, id: segmentId },
    });
    if (!segment) throw new NotFoundException('Сегмент не найден');
    if (isSystemAllAudience(segment)) {
      throw new BadRequestException('Системную аудиторию нельзя архивировать');
    }

    const archived = await this.prisma.customerSegment.update({
      where: { id: segmentId },
      data: { archivedAt: new Date(), isActive: false },
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.archive',
          merchantId,
          segmentId,
        }),
      );
      this.metrics.inc('portal_audiences_changed_total', { action: 'archive' });
    } catch {}
    return archived;
  }

  async refreshSegmentMetrics(merchantId: string, segmentId: string) {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { merchantId, id: segmentId },
    });
    if (!segment) throw new NotFoundException('Сегмент не найден');
    const where = this.buildSegmentWhere(merchantId, segment.filters ?? {});
    const count = await this.prisma.customer.count({
      where: { ...where, segments: { some: { segmentId } } },
    });

    const updated = await this.prisma.customerSegment.update({
      where: { id: segmentId },
      data: { customerCount: count, lastEvaluatedAt: new Date() },
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.refresh',
          merchantId,
          segmentId,
          customerCount: count,
        }),
      );
      this.metrics.inc('portal_audience_refresh_total');
    } catch {}
    return updated;
  }
}
