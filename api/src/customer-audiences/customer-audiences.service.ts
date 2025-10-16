import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

@Injectable()
export class CustomerAudiencesService {
  private readonly logger = new Logger(CustomerAudiencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

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
    if (!filters || typeof filters !== 'object') return {};
    const where: Prisma.CustomerWhereInput = {};
    if (filters.tags?.length) {
      where.tags = { hasSome: filters.tags };
    }
    if (filters.gender?.length) {
      where.gender = { in: filters.gender };
    }
    if (filters.rfmClasses?.length) {
      where.customerStats = {
        some: { merchantId, rfmClass: { in: filters.rfmClasses } },
      };
    }
    if (filters.minVisits != null || filters.maxVisits != null) {
      const visits: Prisma.IntFilter = {};
      if (filters.minVisits != null) visits.gte = filters.minVisits;
      if (filters.maxVisits != null) visits.lte = filters.maxVisits;
      where.customerStats = {
        some: {
          ...(where.customerStats?.some ?? {}),
          merchantId,
          visits,
        },
      };
    }
    if (filters.lastVisitFrom || filters.lastVisitTo) {
      const lastOrderAt: Prisma.DateTimeFilter = {};
      if (filters.lastVisitFrom)
        lastOrderAt.gte = new Date(filters.lastVisitFrom);
      if (filters.lastVisitTo) lastOrderAt.lte = new Date(filters.lastVisitTo);
      where.customerStats = {
        some: {
          ...(where.customerStats?.some ?? {}),
          merchantId,
          lastOrderAt,
        },
      };
    }
    return where;
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
    return segment;
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
    return updated;
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
