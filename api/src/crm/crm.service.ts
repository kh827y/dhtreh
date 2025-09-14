import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  async getCustomerCard(merchantId: string, customerId: string) {
    const [customer, wallet, stats, recentTx, recentRc, segments] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.wallet.findUnique({ where: { customerId_merchantId_type: { customerId, merchantId, type: 'POINTS' as any } } }),
      this.prisma.customerStats.findUnique({ where: { merchantId_customerId: { merchantId, customerId } as any } }),
      this.prisma.transaction.findMany({ where: { merchantId, customerId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.receipt.findMany({ where: { merchantId, customerId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.prisma.segmentCustomer.findMany({ where: { customerId }, include: { segment: true } }),
    ]);

    return {
      customer: customer ? {
        id: customer.id,
        phone: customer.phone,
        email: customer.email,
        name: customer.name,
        birthday: customer.birthday,
        gender: customer.gender,
        city: customer.city,
        tags: customer.tags,
        createdAt: customer.createdAt,
      } : null,
      balance: wallet?.balance ?? 0,
      stats: stats ? {
        firstSeenAt: stats.firstSeenAt,
        lastSeenAt: stats.lastSeenAt,
        lastOrderAt: stats.lastOrderAt,
        visits: stats.visits,
        totalSpent: stats.totalSpent,
        avgCheck: stats.avgCheck,
        rfm: { r: stats.rfmR, f: stats.rfmF, m: stats.rfmM, score: stats.rfmScore, class: stats.rfmClass },
      } : null,
      recentTransactions: recentTx,
      recentReceipts: recentRc,
      segments: segments.map(s => ({ id: s.segmentId, name: s.segment?.name })),
    };
  }

  async searchCustomer(merchantId: string, phone?: string, email?: string, id?: string) {
    let customer = null as any;
    if (id) {
      customer = await this.prisma.customer.findUnique({ where: { id } });
    } else if (phone) {
      customer = await this.prisma.customer.findUnique({ where: { phone } });
    } else if (email) {
      customer = await this.prisma.customer.findUnique({ where: { email } });
    }
    if (!customer) return null;

    const [wallet, stats] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { customerId_merchantId_type: { customerId: customer.id, merchantId, type: 'POINTS' as any } } }),
      this.prisma.customerStats.findUnique({ where: { merchantId_customerId: { merchantId, customerId: customer.id } as any } }),
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
    const distribution = Object.fromEntries(rows.map(r => [r.rfmClass ?? 'unknown', r._count._all]));
    return { merchantId, distribution };
  }

  async listSegmentCustomers(merchantId: string, segmentId: string, limit = 50, cursor?: string) {
    const items = await this.prisma.segmentCustomer.findMany({
      where: { segmentId, segment: { merchantId } },
      include: { customer: true },
      take: Math.min(Math.max(limit, 1), 200),
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: items.map(i => ({ id: i.customerId, phone: i.customer?.phone, name: i.customer?.name })),
      nextCursor: items.length ? items[items.length - 1].id : null,
    };
  }

  async exportSegmentCustomersCsv(merchantId: string, segmentId: string, res: Response, batch = 1000) {
    // Заголовки CSV
    res.write(['id','phone','email','name','balance','rfmClass','visits','totalSpent','lastOrderAt','tags'].join(';') + '\n');
    let lastId: string | undefined = undefined;
    while (true) {
      const chunk = await this.prisma.segmentCustomer.findMany({
        where: { segmentId, segment: { merchantId } },
        include: {
          customer: true,
        },
        orderBy: { id: 'asc' },
        take: batch,
        ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
      });
      if (!chunk.length) break;
      const ids = chunk.map(c => c.customerId);
      const [wallets, stats] = await Promise.all([
        this.prisma.wallet.findMany({ where: { merchantId, customerId: { in: ids }, type: 'POINTS' as any }, select: { id: true, customerId: true, balance: true } }),
        this.prisma.customerStats.findMany({ where: { merchantId, customerId: { in: ids } }, select: { customerId: true, rfmClass: true, visits: true, totalSpent: true, lastOrderAt: true } }),
      ]);
      const walletMap = new Map(wallets.map(w => [w.customerId, w.balance]));
      const statsMap = new Map(stats.map(s => [s.customerId, s]));
      for (const row of chunk) {
        const c = row.customer;
        const st = statsMap.get(row.customerId);
        const line = [
          c?.id || '',
          c?.phone || '',
          c?.email || '',
          c?.name || '',
          String(walletMap.get(row.customerId) || 0),
          st?.rfmClass || '',
          String(st?.visits || 0),
          String(st?.totalSpent || 0),
          st?.lastOrderAt ? new Date(st.lastOrderAt).toISOString() : '',
          (c?.tags || []).join(', '),
        ].map(s => '"' + String(s).replace(/"/g, '""') + '"').join(';');
        res.write(line + '\n');
      }
      lastId = chunk[chunk.length - 1].id;
      if (chunk.length < batch) break;
    }
  }

  async getCustomerTimeline(merchantId: string, customerId: string, limit = 50) {
    const [txs, rcs, usages] = await Promise.all([
      this.prisma.transaction.findMany({ where: { merchantId, customerId }, orderBy: { createdAt: 'desc' }, take: limit }),
      this.prisma.receipt.findMany({ where: { merchantId, customerId }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 50) }),
      this.prisma.campaignUsage.findMany({ where: { customerId, campaign: { merchantId } }, orderBy: { usedAt: 'desc' }, take: Math.min(limit, 50), include: { campaign: true } }),
    ]);
    const events: Array<{ type: string; at: string; data: any }> = [];
    for (const t of txs) events.push({ type: 'transaction', at: t.createdAt.toISOString(), data: { id: t.id, amount: t.amount, txnType: t.type, orderId: t.orderId, outletId: t.outletId, deviceId: t.deviceId, staffId: t.staffId } });
    for (const r of rcs) events.push({ type: 'receipt', at: r.createdAt.toISOString(), data: { id: r.id, orderId: r.orderId, total: r.total, redeemApplied: r.redeemApplied, earnApplied: r.earnApplied, outletId: r.outletId, deviceId: r.deviceId, staffId: r.staffId } });
    for (const u of usages) events.push({ type: 'campaign', at: u.usedAt.toISOString(), data: { id: u.id, campaignId: u.campaignId, campaignName: u.campaign?.name, rewardType: u.rewardType, rewardValue: u.rewardValue } });
    events.sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0));
    return { items: events.slice(0, limit) };
  }
}
