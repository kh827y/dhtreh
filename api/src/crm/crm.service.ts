import { Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { isSystemAllAudience } from '../customer-audiences/audience.utils';

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  async getCustomerCard(merchantId: string, customerId: string) {
    const [customer, wallet, stats, recentTx, recentRc, segments] =
      await Promise.all([
        this.prisma.customer.findUnique({ where: { id: customerId } }),
        this.prisma.wallet.findUnique({
          where: {
            customerId_merchantId_type: {
              customerId,
              merchantId,
              type: 'POINTS' as any,
            },
          },
        }),
        this.prisma.customerStats.findUnique({
          where: { merchantId_customerId: { merchantId, customerId } as any },
        }),
        this.prisma.transaction.findMany({
          where: { merchantId, customerId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.receipt.findMany({
          where: { merchantId, customerId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.segmentCustomer.findMany({
          where: { customerId },
          include: { segment: true },
        }),
      ]);

    return {
      customer: customer
        ? {
            id: customer.id,
            phone: customer.phone,
            email: customer.email,
            name: customer.name,
            birthday: customer.birthday,
            gender: customer.gender,
            city: customer.city,
            tags: customer.tags,
            createdAt: customer.createdAt,
          }
        : null,
      balance: wallet?.balance ?? 0,
      stats: stats
        ? {
            firstSeenAt: stats.firstSeenAt,
            lastSeenAt: stats.lastSeenAt,
            lastOrderAt: stats.lastOrderAt,
            visits: stats.visits,
            totalSpent: stats.totalSpent,
            avgCheck: stats.avgCheck,
            rfm: {
              r: stats.rfmR,
              f: stats.rfmF,
              m: stats.rfmM,
              score: stats.rfmScore,
              class: stats.rfmClass,
            },
          }
        : null,
      recentTransactions: recentTx,
      recentReceipts: recentRc,
      segments: segments.map((s) => ({
        id: s.segmentId,
        name: s.segment?.name,
      })),
    };
  }

  async searchCustomer(
    merchantId: string,
    phone?: string,
    email?: string,
    id?: string,
  ) {
    let customer = null as any;
    if (id) {
      customer = await this.prisma.customer.findUnique({ where: { id } });
    } else if (phone) {
      customer = await this.prisma.customer.findFirst({ where: { phone } });
    } else if (email) {
      customer = await this.prisma.customer.findFirst({ where: { email } });
    }
    if (!customer) return null;

    const [wallet, stats] = await Promise.all([
      this.prisma.wallet.findUnique({
        where: {
          customerId_merchantId_type: {
            customerId: customer.id,
            merchantId,
            type: 'POINTS' as any,
          },
        },
      }),
      this.prisma.customerStats.findUnique({
        where: {
          merchantId_customerId: { merchantId, customerId: customer.id } as any,
        },
      }),
    ]);

    return {
      customerId: customer.id,
      phone: customer.phone,
      email: customer.email,
      name: customer.name,
      balance: wallet?.balance ?? 0,
      rfmClass: stats?.rfmClass ?? null,
    };
  }

  async getRfmDistribution(merchantId: string) {
    const rows = await this.prisma.customerStats.groupBy({
      by: ['rfmClass'],
      where: { merchantId },
      _count: { _all: true },
    });
    const distribution = Object.fromEntries(
      rows.map((r) => [r.rfmClass ?? 'unknown', r._count._all]),
    );
    return { merchantId, distribution };
  }

  async listSegmentCustomers(
    merchantId: string,
    segmentId: string,
    limit = 50,
    cursor?: string,
  ) {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { merchantId, id: segmentId },
      select: { id: true, isSystem: true, systemKey: true },
    });
    if (!segment) throw new NotFoundException('Аудитория не найдена');

    const take = Math.min(Math.max(limit, 1), 200);
    if (isSystemAllAudience(segment)) {
      const customers = await this.prisma.customer.findMany({
        where: { customerStats: { some: { merchantId } } },
        orderBy: { createdAt: 'desc' },
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      return {
        items: customers.map((customer) => ({
          id: customer.id,
          phone: customer.phone,
          name: customer.name,
        })),
        nextCursor: customers.length ? customers[customers.length - 1].id : null,
      };
    }

    const items = await this.prisma.segmentCustomer.findMany({
      where: { segmentId, segment: { merchantId } },
      include: { customer: true },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: items.map((i) => ({
        id: i.customerId,
        phone: i.customer?.phone,
        name: i.customer?.name,
      })),
      nextCursor: items.length ? items[items.length - 1].id : null,
    };
  }

  async exportSegmentCustomersCsv(
    merchantId: string,
    segmentId: string,
    res: Response,
    batch = 1000,
  ) {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { merchantId, id: segmentId },
      select: { id: true, isSystem: true, systemKey: true },
    });
    if (!segment) throw new NotFoundException('Аудитория не найдена');
    const isAll = isSystemAllAudience(segment);

    // Заголовки CSV
    res.write(
      [
        'id',
        'phone',
        'email',
        'name',
        'balance',
        'rfmClass',
        'visits',
        'totalSpent',
        'lastOrderAt',
        'tags',
      ].join(';') + '\n',
    );
    let lastId: string | undefined = undefined;
    while (true) {
      let records:
        | Array<{ customerId: string; cursorId: string; customer: any }>
        | undefined;
      if (isAll) {
        const customers = await this.prisma.customer.findMany({
          where: { customerStats: { some: { merchantId } } },
          orderBy: { id: 'asc' },
          take: batch,
          ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
        });
        if (!customers.length) break;
        records = customers.map((customer) => ({
          customerId: customer.id,
          cursorId: customer.id,
          customer,
        }));
        lastId = customers[customers.length - 1].id;
      } else {
        const chunk = await this.prisma.segmentCustomer.findMany({
          where: { segmentId, segment: { merchantId } },
          include: { customer: true },
          orderBy: { id: 'asc' },
          take: batch,
          ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
        });
        if (!chunk.length) break;
        records = chunk.map((row) => ({
          customerId: row.customerId,
          cursorId: row.id,
          customer: row.customer,
        }));
        lastId = chunk[chunk.length - 1].id;
      }
      const ids = records!.map((c) => c.customerId);
      const [wallets, stats] = await Promise.all([
        this.prisma.wallet.findMany({
          where: { merchantId, customerId: { in: ids }, type: 'POINTS' as any },
          select: { id: true, customerId: true, balance: true },
        }),
        this.prisma.customerStats.findMany({
          where: { merchantId, customerId: { in: ids } },
          select: {
            customerId: true,
            rfmClass: true,
            visits: true,
            totalSpent: true,
            lastOrderAt: true,
          },
        }),
      ]);
      const walletMap = new Map(wallets.map((w) => [w.customerId, w.balance]));
      const statsMap = new Map(stats.map((s) => [s.customerId, s]));
      for (const record of records!) {
        const c = record.customer;
        const st = statsMap.get(record.customerId);
        const line = [
          c?.id || record.customerId || '',
          c?.phone || '',
          c?.email || '',
          c?.name || '',
          String(walletMap.get(record.customerId) || 0),
          st?.rfmClass || '',
          String(st?.visits || 0),
          String(st?.totalSpent || 0),
          st?.lastOrderAt ? new Date(st.lastOrderAt).toISOString() : '',
          Array.isArray(c?.tags) ? c.tags.join(', ') : '',
        ]
          .map((s) => '"' + String(s).replace(/"/g, '""') + '"')
          .join(';');
        res.write(line + '\n');
      }
      if (records!.length < batch) break;
    }
  }

  async getCustomerTimeline(
    merchantId: string,
    customerId: string,
    limit = 50,
  ) {
    const [txs, rcs, promotions] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { merchantId, customerId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.receipt.findMany({
        where: { merchantId, customerId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 50),
      }),
      this.prisma.promotionParticipant.findMany({
        where: { merchantId, customerId },
        orderBy: { joinedAt: 'desc' },
        take: Math.min(limit, 50),
        include: { promotion: true },
      }),
    ]);
    const events: Array<{ type: string; at: string; data: any }> = [];
    for (const t of txs)
      events.push({
        type: 'transaction',
        at: t.createdAt.toISOString(),
        data: {
          id: t.id,
          amount: t.amount,
          txnType: t.type,
          orderId: t.orderId,
          outletId: t.outletId,
          staffId: t.staffId,
        },
      });
    for (const r of rcs)
      events.push({
        type: 'receipt',
        at: r.createdAt.toISOString(),
        data: {
          id: r.id,
          orderId: r.orderId,
          total: r.total,
          redeemApplied: r.redeemApplied,
          earnApplied: r.earnApplied,
          outletId: r.outletId,
          staffId: r.staffId,
        },
      });
    for (const p of promotions) {
      events.push({
        type: 'campaign',
        at: p.joinedAt.toISOString(),
        data: {
          id: p.id,
          campaignId: p.promotionId,
          campaignName: p.promotion?.name,
          pointsIssued: p.pointsIssued,
          status: p.status,
        },
      });
    }
    events.sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0));
    return { items: events.slice(0, limit) };
  }
}
