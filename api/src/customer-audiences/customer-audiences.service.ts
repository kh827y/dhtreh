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

type NumberRange = {
  min?: number;
  max?: number;
};

interface ParsedSegmentFilters {
  where: Prisma.CustomerWhereInput;
  post: {
    birthdayOffset?: NumberRange;
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class CustomerAudiencesService {
  private readonly logger = new Logger(CustomerAudiencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  private toNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    const num = Number(value);
    if (!Number.isFinite(num)) return undefined;
    return num;
  }

  private parseNumberRange(value: unknown): NumberRange | undefined {
    if (Array.isArray(value) && value.length >= 2) {
      const min = this.toNumber(value[0]);
      const max = this.toNumber(value[1]);
      if (min === undefined && max === undefined) return undefined;
      const range: NumberRange = {};
      if (min !== undefined) range.min = min;
      if (max !== undefined) range.max = max;
      return range;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const min =
        this.toNumber(obj.min) ??
        this.toNumber(obj.from) ??
        this.toNumber(obj.start) ??
        this.toNumber(obj.gte);
      const max =
        this.toNumber(obj.max) ??
        this.toNumber(obj.to) ??
        this.toNumber(obj.end) ??
        this.toNumber(obj.lte);
      if (min === undefined && max === undefined) return undefined;
      const range: NumberRange = {};
      if (min !== undefined) range.min = min;
      if (max !== undefined) range.max = max;
      return range;
    }
    const single = this.toNumber(value);
    if (single !== undefined) {
      return { min: single, max: single };
    }
    return undefined;
  }

  private sanitizeRange(
    range: NumberRange | undefined,
    options: { min?: number; max?: number; clamp?: { min?: number; max?: number } } = {},
  ): NumberRange | undefined {
    if (!range) return undefined;
    let { min, max } = range;
    const clampMin = options.clamp?.min;
    const clampMax = options.clamp?.max;
    if (min !== undefined) {
      if (!Number.isFinite(min)) min = undefined;
      else {
        if (options.min !== undefined) min = Math.max(min, options.min);
        if (clampMin !== undefined) min = Math.max(min, clampMin);
        if (clampMax !== undefined) min = Math.min(min, clampMax);
      }
    }
    if (max !== undefined) {
      if (!Number.isFinite(max)) max = undefined;
      else {
        if (options.min !== undefined) max = Math.max(max, options.min);
        if (options.max !== undefined) max = Math.min(max, options.max);
        if (clampMin !== undefined) max = Math.max(max, clampMin);
        if (clampMax !== undefined) max = Math.min(max, clampMax);
      }
    }
    if (min !== undefined && max !== undefined && min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }
    const result: NumberRange = {};
    if (min !== undefined) result.min = min;
    if (max !== undefined) result.max = max;
    return Object.keys(result).length ? result : undefined;
  }

  private parseStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item : String(item ?? '')))
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  private parseSegmentFilters(
    merchantId: string,
    filters: unknown,
  ): ParsedSegmentFilters {
    const andConditions: Prisma.CustomerWhereInput[] = [
      {
        OR: [
          { merchantProfiles: { some: { merchantId } } },
          { customerStats: { some: { merchantId } } },
          { Receipt: { some: { merchantId } } },
        ],
      },
    ];
    const post: ParsedSegmentFilters['post'] = {};
    if (!filters || typeof filters !== 'object') {
      return { where: { AND: andConditions }, post };
    }

    const source = filters as Record<string, unknown>;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const tags = this.parseStringArray(source.tags);
    if (tags.length) {
      andConditions.push({ tags: { hasSome: tags } });
    }

    const gender = this.parseStringArray(source.gender).map((value) =>
      value.toLowerCase(),
    );
    if (gender.length) {
      andConditions.push({ gender: { in: gender } });
    }

    const statsFilters: Prisma.CustomerStatsWhereInput = { merchantId };
    let statsHasConditions = false;

    const rfmClasses = this.parseStringArray(source.rfmClasses);
    if (rfmClasses.length) {
      statsHasConditions = true;
      statsFilters.rfmClass = { in: rfmClasses };
    }

    const purchaseCountInput =
      source.purchaseCount ??
      source.visits ??
      (source.minVisits !== undefined || source.maxVisits !== undefined
        ? { min: source.minVisits, max: source.maxVisits }
        : undefined);
    const purchaseCountRange = this.sanitizeRange(
      this.parseNumberRange(purchaseCountInput),
      { min: 0 },
    );
    if (purchaseCountRange) {
      const visitsFilter: Prisma.IntFilter = {};
      if (purchaseCountRange.min !== undefined)
        visitsFilter.gte = Math.floor(purchaseCountRange.min);
      if (purchaseCountRange.max !== undefined)
        visitsFilter.lte = Math.floor(purchaseCountRange.max);
      if (Object.keys(visitsFilter).length) {
        statsHasConditions = true;
        statsFilters.visits = {
          ...(statsFilters.visits ?? {}),
          ...visitsFilter,
        };
      }
    }

    const lastOrderAt: Prisma.DateTimeFilter = {};
    const lastVisitFromRaw = source.lastVisitFrom;
    const lastVisitToRaw = source.lastVisitTo;
    if (typeof lastVisitFromRaw === 'string') {
      const date = new Date(lastVisitFromRaw);
      if (!Number.isNaN(date.getTime())) lastOrderAt.gte = date;
    }
    if (typeof lastVisitToRaw === 'string') {
      const date = new Date(lastVisitToRaw);
      if (!Number.isNaN(date.getTime())) lastOrderAt.lte = date;
    }

    const lastPurchaseInput =
      source.lastPurchaseDays ??
      source.daysSinceLastPurchase ??
      (source.lastPurchase != null ? source.lastPurchase : undefined);
    const lastPurchaseRange = this.sanitizeRange(
      this.parseNumberRange(lastPurchaseInput),
      { min: 0 },
    );
    if (lastPurchaseRange) {
      if (lastPurchaseRange.max !== undefined) {
        const gte = new Date(now.getTime() - lastPurchaseRange.max * MS_PER_DAY);
        lastOrderAt.gte = gte;
      }
      if (lastPurchaseRange.min !== undefined) {
        const lte = new Date(now.getTime() - lastPurchaseRange.min * MS_PER_DAY);
        lastOrderAt.lte = lte;
      }
    }
    if (Object.keys(lastOrderAt).length) {
      statsHasConditions = true;
      statsFilters.lastOrderAt = {
        ...(statsFilters.lastOrderAt ?? {}),
        ...lastOrderAt,
      };
    }

    const avgCheckInput = source.averageCheck ?? source.avgCheck;
    const avgCheckRange = this.sanitizeRange(
      this.parseNumberRange(avgCheckInput),
      { min: 0 },
    );
    if (avgCheckRange) {
      const avgCheckFilter: Prisma.FloatFilter = {};
      if (avgCheckRange.min !== undefined)
        avgCheckFilter.gte = avgCheckRange.min;
      if (avgCheckRange.max !== undefined)
        avgCheckFilter.lte = avgCheckRange.max;
      if (Object.keys(avgCheckFilter).length) {
        statsHasConditions = true;
        statsFilters.avgCheck = {
          ...(statsFilters.avgCheck ?? {}),
          ...avgCheckFilter,
        };
      }
    }

    const totalSpentInput =
      source.totalSpent ??
      source.purchaseSum ??
      (source.total !== undefined ? source.total : undefined);
    const totalSpentRange = this.sanitizeRange(
      this.parseNumberRange(totalSpentInput),
      { min: 0 },
    );
    if (totalSpentRange) {
      const totalFilter: Prisma.IntFilter = {};
      if (totalSpentRange.min !== undefined)
        totalFilter.gte = Math.floor(totalSpentRange.min);
      if (totalSpentRange.max !== undefined)
        totalFilter.lte = Math.floor(totalSpentRange.max);
      if (Object.keys(totalFilter).length) {
        statsHasConditions = true;
        statsFilters.totalSpent = {
          ...(statsFilters.totalSpent ?? {}),
          ...totalFilter,
        };
      }
    }

    if (statsHasConditions) {
      andConditions.push({ customerStats: { some: statsFilters } });
    }

    const registrationInput =
      source.registrationDays ??
      source.registration ??
      (source.registrationFrom !== undefined || source.registrationTo !== undefined
        ? { min: source.registrationFrom, max: source.registrationTo }
        : undefined);
    const registrationRange = this.sanitizeRange(
      this.parseNumberRange(registrationInput),
      { min: 0 },
    );
    if (registrationRange) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (registrationRange.max !== undefined) {
        createdAt.gte = new Date(
          now.getTime() - registrationRange.max * MS_PER_DAY,
        );
      }
      if (registrationRange.min !== undefined) {
        createdAt.lte = new Date(
          now.getTime() - registrationRange.min * MS_PER_DAY,
        );
      }
      if (Object.keys(createdAt).length) {
        andConditions.push({
          merchantProfiles: {
            some: {
              merchantId,
              createdAt,
            },
          },
        });
      }
    }

    const ageInput = source.age ?? source.ageRange;
    const ageRange = this.sanitizeRange(
      this.parseNumberRange(ageInput),
      { min: 0, max: 150 },
    );
    if (ageRange) {
      const birthdayFilter: Prisma.DateTimeFilter = {};
      if (ageRange.min !== undefined) {
        const maxBirthDate = new Date(today);
        maxBirthDate.setFullYear(
          maxBirthDate.getFullYear() - Math.floor(ageRange.min),
        );
        birthdayFilter.lte = maxBirthDate;
      }
      if (ageRange.max !== undefined) {
        const minBirthDate = new Date(today);
        minBirthDate.setFullYear(
          minBirthDate.getFullYear() - Math.floor(ageRange.max) - 1,
        );
        minBirthDate.setDate(minBirthDate.getDate() + 1);
        birthdayFilter.gte = minBirthDate;
      }
      if (Object.keys(birthdayFilter).length) {
        andConditions.push({ birthday: birthdayFilter });
      }
    }

    const birthdayInput =
      source.birthdayOffset ??
      source.birthdayWindow ??
      source.birthday;
    const birthdayRange = this.sanitizeRange(
      this.parseNumberRange(birthdayInput),
      { clamp: { min: -366, max: 366 } },
    );
    if (birthdayRange) {
      post.birthdayOffset = birthdayRange;
    }

    const outlets = this.parseStringArray(
      source.outlets ?? source.visitedOutlets,
    );
    if (outlets.length) {
      andConditions.push({
        Receipt: {
          some: {
            merchantId,
            outletId: { in: outlets },
          },
        },
      });
    }

    const levelIds = this.parseStringArray(
      source.levelIds ??
        source.levels ??
        (typeof source.level === 'string' ? [source.level] : undefined),
    );
    if (levelIds.length) {
      andConditions.push({
        tierAssignments: {
          some: {
            merchantId,
            tierId: { in: levelIds },
          },
        },
      });
    }

    const devicePlatforms = this.parseStringArray(
      source.devicePlatforms ?? source.device,
    )
      .map((value) => value.toLowerCase())
      .filter(Boolean);
    if (devicePlatforms.length) {
      andConditions.push({
        pushDevices: {
          some: {
            platform: { in: devicePlatforms },
            isActive: true,
          },
        },
      });
    }

    return { where: { AND: andConditions }, post };
  }

  private matchesBirthdayOffset(
    birthday: Date | string | null | undefined,
    range?: NumberRange,
  ): boolean {
    if (!range) return true;
    if (!birthday) return false;
    const date =
      birthday instanceof Date ? birthday : new Date(String(birthday || ''));
    if (Number.isNaN(date.getTime())) return false;

    const from = range.min ?? -366;
    const to = range.max ?? 366;
    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    let nextBirthday = new Date(
      todayStart.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    if (nextBirthday < todayStart) {
      nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
    }

    let previousBirthday = new Date(
      todayStart.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    if (previousBirthday > todayStart) {
      previousBirthday.setFullYear(previousBirthday.getFullYear() - 1);
    }

    const daysUntil = Math.round(
      (nextBirthday.getTime() - todayStart.getTime()) / MS_PER_DAY,
    );
    const daysSince = Math.round(
      (todayStart.getTime() - previousBirthday.getTime()) / MS_PER_DAY,
    );
    const negativeDays = -daysSince;

    const positiveMatch =
      to >= 0 &&
      daysUntil >= Math.max(0, from) &&
      daysUntil <= Math.max(0, to);
    const negativeMatch =
      from <= 0 &&
      negativeDays >= Math.min(0, from) &&
      negativeDays <= Math.min(0, to);

    return positiveMatch || negativeMatch;
  }

  private matchesPostFilters(
    customer: { birthday: Date | null },
    post: ParsedSegmentFilters['post'],
  ): boolean {
    if (!this.matchesBirthdayOffset(customer.birthday, post.birthdayOffset)) {
      return false;
    }
    return true;
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
    return this.parseSegmentFilters(merchantId, filters).where;
  }

  async listSegments(merchantId: string, options: ListSegmentsOptions = {}) {
    await this.ensureDefaultAudience(merchantId).catch(() => null);
    const where: Prisma.CustomerSegmentWhereInput = { merchantId };
    if (!options.includeSystem) where.isSystem = false;
    const segments = await this.prisma.customerSegment.findMany({
      where,
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
    });
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
    return segments;
  }

  async createSegment(merchantId: string, payload: SegmentPayload) {
    if (!payload.name?.trim())
      throw new BadRequestException('Название сегмента обязательно');

    const segment = await this.prisma.customerSegment.create({
      data: {
        merchantId,
        name: payload.name.trim(),
        description: payload.description ?? null,
        rules: payload.rules ?? {},
        filters: payload.filters ?? null,
        tags: payload.tags ?? [],
        color: payload.color ?? null,
        isActive: payload.isActive ?? true,
        createdById: payload.actorId ?? null,
        updatedById: payload.actorId ?? null,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.create',
          merchantId,
          segmentId: segment.id,
          active: segment.isActive,
        }),
      );
      this.metrics.inc('portal_audiences_changed_total', { action: 'create' });
    } catch {}
    let updated: CustomerSegment | null = null;
    try {
      await this.recalculateSegmentMembership(merchantId, segment);
      updated = await this.prisma.customerSegment.findFirst({
        where: { id: segment.id },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to recalculate new audience ${segment.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
    return updated ?? segment;
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
    const updated = await this.prisma.customerSegment.update({
      where: { id: segmentId },
      data: {
        name: payload.name?.trim() ?? segment.name,
        description: payload.description ?? segment.description,
        rules: payload.rules ?? segment.rules,
        filters: payload.filters ?? segment.filters,
        tags: payload.tags ?? segment.tags,
        color: payload.color ?? segment.color,
        isActive: payload.isActive ?? segment.isActive,
        updatedById: payload.actorId ?? segment.updatedById,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.update',
          merchantId,
          segmentId,
          active: updated.isActive,
        }),
      );
      this.metrics.inc('portal_audiences_changed_total', { action: 'update' });
    } catch {}
    let refreshed: CustomerSegment | null = null;
    try {
      await this.recalculateSegmentMembership(merchantId, updated);
      refreshed = await this.prisma.customerSegment.findFirst({
        where: { id: updated.id },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to recalculate audience ${updated.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
    return refreshed ?? updated;
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
    const { where, post } = this.parseSegmentFilters(merchantId, filters);
    const customers = await this.prisma.customer.findMany({
      where,
      select: { id: true, birthday: true },
    });
    const matchingCustomers = customers.filter((customer) =>
      this.matchesPostFilters({ birthday: customer.birthday }, post),
    );
    const customerIds = matchingCustomers.map((c) => c.id);
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

  async evaluateCustomerSegments(merchantId: string, customerId: string) {
    const segments = await this.prisma.customerSegment.findMany({
      where: { merchantId, archivedAt: null },
      select: {
        id: true,
        filters: true,
        isSystem: true,
      },
    });
    let added = 0;
    let removed = 0;
    const now = new Date();

    for (const segment of segments) {
      if (isSystemAllAudience(segment)) continue;
      const filters =
        segment.filters &&
        typeof segment.filters === 'object' &&
        !Array.isArray(segment.filters)
          ? (segment.filters as Record<string, any>)
          : {};
      const { where, post } = this.parseSegmentFilters(merchantId, filters);
      const candidateWhere: Prisma.CustomerWhereInput = { id: customerId };
      if (where.AND) {
        candidateWhere.AND = Array.isArray(where.AND)
          ? (where.AND as Prisma.CustomerWhereInput[])
          : [where.AND as Prisma.CustomerWhereInput];
      } else {
        Object.assign(candidateWhere, where);
      }
      const candidate = await this.prisma.customer.findFirst({
        where: candidateWhere,
        select: { id: true, birthday: true },
      });
      const matches =
        !!candidate &&
        this.matchesPostFilters({ birthday: candidate.birthday }, post);

      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.segmentCustomer.findUnique({
          where: {
            segmentId_customerId: {
              segmentId: segment.id,
              customerId,
            },
          },
        });
        let changed = false;
        if (matches && !existing) {
          await tx.segmentCustomer.create({
            data: { segmentId: segment.id, customerId },
          });
          added += 1;
          changed = true;
        } else if (!matches && existing) {
          await tx.segmentCustomer.delete({
            where: {
              segmentId_customerId: {
                segmentId: segment.id,
                customerId,
              },
            },
          });
          removed += 1;
          changed = true;
        }
        if (changed) {
          const count = await tx.segmentCustomer.count({
            where: { segmentId: segment.id },
          });
          await tx.customerSegment.update({
            where: { id: segment.id },
            data: { customerCount: count, lastEvaluatedAt: now },
          });
        }
      });
    }

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.evaluateCustomer',
          merchantId,
          customerId,
          segments: segments.length,
          added,
          removed,
        }),
      );
    } catch {}
    return { processed: segments.length, added, removed };
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
    await this.recalculateSegmentMembership(merchantId, segment);
    const updated = await this.prisma.customerSegment.findFirst({
      where: { id: segmentId },
    });
    if (!updated) throw new NotFoundException('Сегмент не найден');
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.audiences.refresh',
          merchantId,
          segmentId,
          customerCount: updated.customerCount,
        }),
      );
      this.metrics.inc('portal_audience_refresh_total');
    } catch {}
    return updated;
  }
}
