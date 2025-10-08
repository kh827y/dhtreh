import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

type PortalReviewFilters = {
  withCommentOnly?: boolean;
  outletId?: string;
  staffId?: string;
  limit?: number;
  offset?: number;
};

type PortalReviewCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

type PortalReviewStaff = {
  id: string;
  name: string;
};

type PortalReviewOutlet = {
  id: string;
  name: string;
};

type PortalReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  customer: PortalReviewCustomer;
  staff: PortalReviewStaff | null;
  outlet: PortalReviewOutlet | null;
};

type PortalReviewListResult = {
  items: PortalReviewItem[];
  total: number;
  limit: number;
  offset: number;
  outlets: PortalReviewOutlet[];
  staff: PortalReviewStaff[];
};

@Injectable()
export class PortalReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeLimit(limit?: number) {
    if (!Number.isFinite(limit)) return 50;
    return Math.min(Math.max(Math.trunc(limit ?? 50), 1), 200);
  }

  private normalizeOffset(offset?: number) {
    if (!Number.isFinite(offset)) return 0;
    return Math.max(Math.trunc(offset ?? 0), 0);
  }

  private buildCustomer(review: {
    customer: {
      id: string;
      name: string | null;
      phone: string | null;
      email: string | null;
    };
  }): PortalReviewCustomer {
    return {
      id: review.customer.id,
      name: review.customer.name ?? null,
      phone: review.customer.phone ?? null,
      email: review.customer.email ?? null,
    };
  }

  private buildStaff(receipt?: {
    staffId: string | null;
    staff: {
      id: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }): PortalReviewStaff | null {
    if (!receipt?.staffId || !receipt.staff) return null;
    const parts = [receipt.staff.firstName, receipt.staff.lastName]
      .filter(Boolean)
      .map((part) => (part ?? '').trim())
      .filter(Boolean);
    const name = parts.length > 0 ? parts.join(' ') : receipt.staff.id;
    return { id: receipt.staff.id, name };
  }

  private buildOutlet(receipt?: {
    outletId: string | null;
    outlet: { id: string; name: string | null } | null;
  }): PortalReviewOutlet | null {
    if (!receipt?.outletId || !receipt.outlet) return null;
    const name = (receipt.outlet.name ?? '').trim() || 'Без названия';
    return { id: receipt.outlet.id, name };
  }

  private async collectFilterOptions(merchantId: string) {
    const orderRefs = await this.prisma.review.findMany({
      where: {
        merchantId,
        status: { notIn: ['REJECTED'] },
        deletedAt: null,
        orderId: { not: null },
      },
      select: { orderId: true },
      distinct: ['orderId'],
    });
    const orderIds = orderRefs
      .map((ref) => ref.orderId)
      .filter(
        (orderId): orderId is string =>
          typeof orderId === 'string' && orderId.length > 0,
      );
    if (!orderIds.length) {
      return {
        outlets: [] as PortalReviewOutlet[],
        staff: [] as PortalReviewStaff[],
      };
    }

    const receipts = await this.prisma.receipt.findMany({
      where: {
        merchantId,
        orderId: { in: orderIds },
      },
      select: {
        outletId: true,
        outlet: { select: { id: true, name: true } },
        staffId: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const outletMap = new Map<string, string>();
    const staffMap = new Map<string, string>();

    for (const receipt of receipts) {
      if (receipt.outletId && receipt.outlet) {
        const outletName = (receipt.outlet.name ?? '').trim() || 'Без названия';
        if (!outletMap.has(receipt.outletId)) {
          outletMap.set(receipt.outletId, outletName);
        }
      }
      if (receipt.staffId && receipt.staff) {
        const parts = [receipt.staff.firstName, receipt.staff.lastName]
          .filter(Boolean)
          .map((part) => (part ?? '').trim())
          .filter(Boolean);
        const staffName = parts.length > 0 ? parts.join(' ') : receipt.staff.id;
        if (!staffMap.has(receipt.staffId)) {
          staffMap.set(receipt.staffId, staffName);
        }
      }
    }

    const outlets = Array.from(outletMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    const staff = Array.from(staffMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    return { outlets, staff };
  }

  private async findOrderIdsByFilters(
    merchantId: string,
    filters: { outletId?: string; staffId?: string },
  ) {
    const receiptWhere: Prisma.ReceiptWhereInput = { merchantId };
    if (filters.outletId) receiptWhere.outletId = filters.outletId;
    if (filters.staffId) receiptWhere.staffId = filters.staffId;

    const receipts = await this.prisma.receipt.findMany({
      where: receiptWhere,
      select: { orderId: true },
    });

    const set = new Set<string>();
    for (const receipt of receipts) {
      if (receipt.orderId) {
        set.add(receipt.orderId);
      }
    }
    return Array.from(set.values());
  }

  private async fetchReceiptsMap(merchantId: string, orderIds: string[]) {
    if (!orderIds.length)
      return new Map<
        string,
        {
          outletId: string | null;
          outlet: { id: string; name: string | null } | null;
          staffId: string | null;
          staff: {
            id: string;
            firstName: string | null;
            lastName: string | null;
          } | null;
        }
      >();

    const receipts = await this.prisma.receipt.findMany({
      where: {
        merchantId,
        orderId: { in: orderIds },
      },
      include: {
        outlet: { select: { id: true, name: true } },
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return new Map(receipts.map((receipt) => [receipt.orderId, receipt]));
  }

  async list(
    merchantId: string,
    filters: PortalReviewFilters,
  ): Promise<PortalReviewListResult> {
    const limit = this.normalizeLimit(filters.limit);
    const offset = this.normalizeOffset(filters.offset);

    const where: Prisma.ReviewWhereInput = {
      merchantId,
      status: { notIn: ['REJECTED'] },
      deletedAt: null,
    };

    if (filters.withCommentOnly) {
      where.comment = { not: '' };
    }

    const filterOptionsPromise = this.collectFilterOptions(merchantId);

    if (filters.outletId || filters.staffId) {
      const allowedOrderIds = await this.findOrderIdsByFilters(merchantId, {
        outletId: filters.outletId,
        staffId: filters.staffId,
      });
      if (!allowedOrderIds.length) {
        const { outlets, staff } = await filterOptionsPromise;
        return { items: [], total: 0, limit, offset, outlets, staff };
      }
      where.orderId = { in: allowedOrderIds };
    }

    const [reviews, total, filterOptions] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          customer: {
            select: { id: true, name: true, phone: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.review.count({ where }),
      filterOptionsPromise,
    ]);

    const orderIds = Array.from(
      new Set(
        reviews
          .map((review) => review.orderId)
          .filter(
            (orderId): orderId is string =>
              typeof orderId === 'string' && orderId.length > 0,
          ),
      ),
    );

    const receiptsMap = await this.fetchReceiptsMap(merchantId, orderIds);

    const items: PortalReviewItem[] = reviews.map((review) => {
      const receipt = review.orderId
        ? receiptsMap.get(review.orderId)
        : undefined;
      const comment =
        typeof review.comment === 'string' ? review.comment.trim() : '';
      return {
        id: review.id,
        rating: review.rating,
        comment: comment.length > 0 ? comment : null,
        createdAt: review.createdAt.toISOString(),
        customer: this.buildCustomer(review),
        staff: this.buildStaff(receipt),
        outlet: this.buildOutlet(receipt),
      };
    });

    return {
      items,
      total,
      limit,
      offset,
      outlets: filterOptions.outlets,
      staff: filterOptions.staff,
    };
  }
}
