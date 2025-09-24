import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

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

@Injectable()
export class CustomerAudiencesService {
  constructor(private readonly prisma: PrismaService) {}

  private buildCustomerWhere(merchantId: string, filters: CustomerFilters): Prisma.CustomerWhereInput {
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
    if (filters.minVisits != null) {
      statsFilters.visits = { gte: filters.minVisits };
    }
    if (filters.maxVisits != null) {
      statsFilters.visits = { ...(statsFilters.visits ?? {}), lte: filters.maxVisits };
    }
    if (filters.rfmClasses?.length) {
      statsFilters.rfmClass = { in: filters.rfmClasses };
    }
    base.customerStats = { some: statsFilters };
    return base;
  }

  async listCustomers(merchantId: string, filters: CustomerFilters = {}) {
    const where = this.buildCustomerWhere(merchantId, filters);
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
    return {
      total,
      items: items.map((customer) => ({
        ...customer,
        stats: customer.customerStats[0] ?? null,
        segments: customer.segments.map((s) => ({ id: s.segmentId, name: s.segment.name })),
      })),
    };
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
    return {
      ...customer,
      stats: customer.customerStats[0] ?? null,
      segments: customer.segments.map((s) => ({ id: s.segmentId, name: s.segment.name })),
    };
  }

  private buildSegmentWhere(merchantId: string, filters: any): Prisma.CustomerWhereInput {
    if (!filters || typeof filters !== 'object') return {};
    const where: Prisma.CustomerWhereInput = {};
    if (filters.tags?.length) {
      where.tags = { hasSome: filters.tags };
    }
    if (filters.gender?.length) {
      where.gender = { in: filters.gender };
    }
    if (filters.rfmClasses?.length) {
      where.customerStats = { some: { merchantId, rfmClass: { in: filters.rfmClasses } } };
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
      if (filters.lastVisitFrom) lastOrderAt.gte = new Date(filters.lastVisitFrom);
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

  async listSegments(merchantId: string) {
    return this.prisma.customerSegment.findMany({
      where: { merchantId },
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createSegment(merchantId: string, payload: SegmentPayload) {
    if (!payload.name?.trim()) throw new BadRequestException('Название сегмента обязательно');
    return this.prisma.customerSegment.create({
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
  }

  async updateSegment(merchantId: string, segmentId: string, payload: SegmentPayload) {
    const segment = await this.prisma.customerSegment.findFirst({ where: { merchantId, id: segmentId } });
    if (!segment) throw new NotFoundException('Сегмент не найден');
    return this.prisma.customerSegment.update({
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
  }

  async setSegmentActive(merchantId: string, segmentId: string, isActive: boolean) {
    const segment = await this.prisma.customerSegment.findFirst({ where: { merchantId, id: segmentId } });
    if (!segment) throw new NotFoundException('Сегмент не найден');
    return this.prisma.customerSegment.update({
      where: { id: segmentId },
      data: { isActive },
    });
  }

  async archiveSegment(merchantId: string, segmentId: string) {
    const segment = await this.prisma.customerSegment.findFirst({ where: { merchantId, id: segmentId } });
    if (!segment) throw new NotFoundException('Сегмент не найден');
    return this.prisma.customerSegment.update({
      where: { id: segmentId },
      data: { archivedAt: new Date(), isActive: false },
    });
  }

  async refreshSegmentMetrics(merchantId: string, segmentId: string) {
    const segment = await this.prisma.customerSegment.findFirst({ where: { merchantId, id: segmentId } });
    if (!segment) throw new NotFoundException('Сегмент не найден');
    const where = this.buildSegmentWhere(merchantId, segment.filters ?? {});
    const count = await this.prisma.customer.count({
      where: { ...where, segments: { some: { segmentId } } },
    });
    return this.prisma.customerSegment.update({
      where: { id: segmentId },
      data: { customerCount: count, lastEvaluatedAt: new Date() },
    });
  }
}
