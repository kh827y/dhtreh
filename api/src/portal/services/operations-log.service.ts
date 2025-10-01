import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export interface OperationsLogFilters {
  from?: string | Date;
  to?: string | Date;
  staffId?: string;
  outletId?: string;
  operationType?: string;
  direction?: 'ALL' | 'EARN' | 'REDEEM';
  carrier?: string;
  receiptNumber?: string;
  limit?: number;
  offset?: number;
}

export interface OperationsLogItemDto {
  id: string;
  occurredAt: string;
  outlet?: { id: string; name: string | null } | null;
  customer: { id: string; name: string | null; phone: string | null };
  staff?: { id: string; name: string | null; status: string } | null;
  rating?: number | null;
  redeem: { amount: number; source?: string | null };
  earn: { amount: number; source?: string | null };
  totalAmount: number;
  receiptNumber?: string | null;
  orderId: string;
  carrier?: { type: string; code?: string | null; label?: string | null } | null;
}

export interface OperationsLogListDto {
  total: number;
  items: OperationsLogItemDto[];
}

export interface OperationDetailsDto {
  receipt: OperationsLogItemDto;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    createdAt: string;
  }>;
  canCancel: boolean;
}

@Injectable()
export class OperationsLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(merchantId: string, filters: OperationsLogFilters): Promise<OperationsLogListDto> {
    const where: Prisma.ReceiptWhereInput = { merchantId };

    if (filters.from || filters.to) {
      where.createdAt = Object.assign(
        {},
        filters.from ? { gte: this.toDate(filters.from) } : {},
        filters.to ? { lte: this.toDate(filters.to) } : {},
      );
    }

    if (filters.staffId) {
      where.staffId = filters.staffId;
    }

    if (filters.outletId) {
      where.outletId = filters.outletId;
    }

    if (filters.receiptNumber) {
      where.receiptNumber = { contains: filters.receiptNumber, mode: 'insensitive' };
    }

    if (filters.direction === 'EARN') {
      where.earnApplied = { gt: 0 };
    }
    if (filters.direction === 'REDEEM') {
      where.redeemApplied = { gt: 0 };
    }

    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [total, receipts] = await this.prisma.$transaction([
      this.prisma.receipt.count({ where }),
      this.prisma.receipt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          customer: true,
          staff: true,
          outlet: true,
        },
      }),
    ]);

    const ratings = await this.fetchRatings(merchantId, receipts.map(r => r.orderId).filter(Boolean) as string[]);

    return {
      total,
      items: receipts.map(receipt => this.mapReceipt(receipt, ratings.get(receipt.orderId ?? '') ?? null)),
    };
  }

  async getDetails(merchantId: string, receiptId: string): Promise<OperationDetailsDto> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        customer: true,
        staff: true,
        outlet: true,
      },
    });

    if (!receipt || receipt.merchantId !== merchantId) {
      throw new NotFoundException('Операция не найдена');
    }

    const ratings = await this.fetchRatings(merchantId, receipt.orderId ? [receipt.orderId] : []);

    const transactions = await this.prisma.transaction.findMany({
      where: { merchantId, orderId: receipt.orderId ?? undefined },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, amount: true, createdAt: true },
    });

    const receiptDto = this.mapReceipt(receipt, ratings.get(receipt.orderId ?? '') ?? null);

    return {
      receipt: receiptDto,
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        createdAt: tx.createdAt.toISOString(),
      })),
      canCancel: true,
    };
  }

  private toDate(value: string | Date): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Некорректный формат даты');
    }
    return date;
  }

  private async fetchRatings(merchantId: string, orderIds: string[]): Promise<Map<string, number>> {
    if (!orderIds.length) {
      return new Map();
    }

    const reviews = await this.prisma.review.findMany({
      where: { merchantId, orderId: { in: orderIds } },
      orderBy: { createdAt: 'desc' },
      select: { orderId: true, rating: true },
    });

    const map = new Map<string, number>();
    for (const review of reviews) {
      if (!map.has(review.orderId ?? '')) {
        map.set(review.orderId ?? '', review.rating);
      }
    }
    return map;
  }

  private mapReceipt(receipt: Prisma.ReceiptGetPayload<{ include: { customer: true; staff: true; outlet: true } }>, rating: number | null): OperationsLogItemDto {
    const staffName = receipt.staff
      ? [receipt.staff.firstName, receipt.staff.lastName].filter(Boolean).join(' ').trim() || receipt.staff.id
      : null;

    return {
      id: receipt.id,
      occurredAt: receipt.createdAt.toISOString(),
      outlet: receipt.outlet ? { id: receipt.outlet.id, name: receipt.outlet.name } : null,
      customer: {
        id: receipt.customer.id,
        name: receipt.customer.name ?? null,
        phone: receipt.customer.phone ?? null,
      },
      staff: receipt.staff
        ? { id: receipt.staff.id, name: staffName, status: receipt.staff.status }
        : null,
      rating,
      redeem: {
        amount: receipt.redeemApplied,
        source: receipt.redeemApplied > 0 ? 'Покупка' : null,
      },
      earn: {
        amount: receipt.earnApplied,
        source: receipt.earnApplied > 0 ? 'Покупка' : null,
      },
      totalAmount: receipt.total,
      receiptNumber: receipt.receiptNumber ?? null,
      orderId: receipt.orderId,
      carrier: this.buildCarrier(receipt),
    };
  }

  private buildCarrier(receipt: Prisma.ReceiptGetPayload<{ include: { customer: true; outlet: true } }>): OperationsLogItemDto['carrier'] {
    if (receipt.outlet) {
      const posType = (receipt.outlet.posType as string | null) ?? null;
      return {
        type: posType ?? 'OUTLET',
        code: receipt.outlet.code ?? receipt.outlet.externalId ?? receipt.outlet.id,
        label: receipt.outlet.name ?? null,
      };
    }
    if (receipt.customer.phone) {
      return {
        type: 'PHONE',
        code: receipt.customer.phone,
      };
    }
    return null;
  }
}
