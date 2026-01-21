import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

@Injectable()
export class MerchantsOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LookupCacheService,
  ) {}

  async listOutbox(
    merchantId: string,
    status?: string,
    limit = 50,
    type?: string,
    since?: string,
    cursor?: { createdAt: Date; id: string } | null,
  ) {
    const where: Prisma.EventOutboxWhereInput = { merchantId };
    const normalizedStatus = status ? String(status).toUpperCase() : undefined;
    if (normalizedStatus) where.status = normalizedStatus;
    if (type) where.eventType = type;
    const and: Prisma.EventOutboxWhereInput[] = [];
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) and.push({ createdAt: { gte: d } });
    }
    if (cursor?.createdAt && cursor?.id) {
      and.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    if (and.length) where.AND = and;
    return this.prisma.eventOutbox.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  async retryOutbox(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({
      where: { id: eventId },
    });
    if (!ev || ev.merchantId !== merchantId)
      throw new NotFoundException('Event not found');
    if (ev.status === 'SENT') {
      throw new BadRequestException('Event already delivered');
    }
    if (ev.status === 'SENDING') {
      throw new BadRequestException('Event is being delivered');
    }
    await this.prisma.eventOutbox.update({
      where: { id: eventId },
      data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null },
    });
    return { ok: true };
  }

  async getOutboxEvent(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({
      where: { id: eventId },
    });
    if (!ev || ev.merchantId !== merchantId)
      throw new NotFoundException('Event not found');
    return ev;
  }

  async deleteOutbox(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({
      where: { id: eventId },
    });
    if (!ev || ev.merchantId !== merchantId)
      throw new NotFoundException('Event not found');
    await this.prisma.eventOutbox.delete({ where: { id: eventId } });
    return { ok: true };
  }

  async retryAll(merchantId: string, status?: string) {
    const where: Prisma.EventOutboxWhereInput = { merchantId };
    const normalizedStatus = status ? String(status).toUpperCase() : undefined;
    if (normalizedStatus) {
      if (normalizedStatus === 'SENT' || normalizedStatus === 'SENDING') {
        return { ok: true, updated: 0 };
      }
      where.status = normalizedStatus;
    } else {
      where.status = { in: ['FAILED', 'DEAD'] };
    }
    const updated = await this.prisma.eventOutbox.updateMany({
      where,
      data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null },
    });
    return { ok: true, updated: updated.count };
  }

  async retrySince(
    merchantId: string,
    params: { status?: string; since?: string },
  ) {
    const where: Prisma.EventOutboxWhereInput = { merchantId };
    const normalizedStatus = params.status
      ? String(params.status).toUpperCase()
      : undefined;
    if (normalizedStatus) {
      if (normalizedStatus === 'SENT' || normalizedStatus === 'SENDING') {
        return { ok: true, updated: 0 };
      }
      where.status = normalizedStatus;
    } else {
      where.status = { in: ['FAILED', 'DEAD'] };
    }
    if (params.since) {
      const d = new Date(params.since);
      if (!isNaN(d.getTime())) where.createdAt = { gte: d };
    }
    const updated = await this.prisma.eventOutbox.updateMany({
      where,
      data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null },
    });
    return { ok: true, updated: updated.count };
  }

  async exportOutboxCsv(
    merchantId: string,
    params: { status?: string; since?: string; type?: string; limit?: number },
  ) {
    const limit = params.limit
      ? Math.min(Math.max(params.limit, 1), 5000)
      : 1000;
    const items = await this.listOutbox(
      merchantId,
      params.status,
      limit,
      params.type,
      params.since,
    );
    const lines = [
      'id,eventType,status,retries,nextRetryAt,lastError,createdAt',
    ];
    for (const ev of items) {
      const row = [
        ev.id,
        ev.eventType,
        ev.status,
        ev.retries,
        ev.nextRetryAt ? ev.nextRetryAt.toISOString() : '',
        ev.lastError || '',
        ev.createdAt.toISOString(),
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(',');
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  async pauseOutbox(merchantId: string, minutes?: number, untilISO?: string) {
    const until = untilISO
      ? new Date(untilISO)
      : new Date(Date.now() + Math.max(1, minutes || 60) * 60 * 1000);
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { outboxPausedUntil: until, updatedAt: new Date() },
      create: { merchantId, outboxPausedUntil: until, updatedAt: new Date() },
    });
    this.cache.invalidateSettings(merchantId);
    await this.prisma.eventOutbox.updateMany({
      where: { merchantId, status: 'PENDING' },
      data: {
        nextRetryAt: until,
        lastError: 'Paused by merchant until ' + until.toISOString(),
      },
    });
    return { ok: true, until: until.toISOString() };
  }

  async resumeOutbox(merchantId: string) {
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { outboxPausedUntil: null, updatedAt: new Date() },
      create: { merchantId, outboxPausedUntil: null, updatedAt: new Date() },
    });
    this.cache.invalidateSettings(merchantId);
    await this.prisma.eventOutbox.updateMany({
      where: { merchantId, status: 'PENDING' },
      data: { nextRetryAt: new Date(), lastError: null },
    });
    return { ok: true };
  }

  async outboxStats(merchantId: string, since?: Date) {
    const where: Prisma.EventOutboxWhereInput = since
      ? { merchantId, createdAt: { gte: since } }
      : { merchantId };
    const statuses = ['PENDING', 'SENDING', 'FAILED', 'DEAD', 'SENT'];
    const counts: Record<string, number> = {};
    for (const st of statuses) {
      counts[st] = await this.prisma.eventOutbox.count({
        where: { ...where, status: st },
      });
    }
    const typeCounts: Record<string, number> = {};
    try {
      const grouped = await this.prisma.eventOutbox.groupBy({
        by: ['eventType'],
        where,
        _count: { eventType: true },
      });
      for (const g of grouped)
        typeCounts[g.eventType] = g._count?.eventType ?? 0;
    } catch (err) {
      logIgnoredError(err, 'MerchantsOutboxService stats', undefined, 'debug');
    }
    const lastDead = await this.prisma.eventOutbox.findFirst({
      where: { merchantId, status: 'DEAD' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      merchantId,
      since: since?.toISOString() || null,
      counts,
      typeCounts,
      lastDeadAt: lastDead?.createdAt?.toISOString?.() || null,
    };
  }

  async listOutboxByOrder(merchantId: string, orderId: string, limit = 100) {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) return [];
    const payloadFilter: Prisma.JsonFilter<'EventOutbox'> = {
      path: ['orderId'],
      equals: normalizedOrderId,
    };
    return this.prisma.eventOutbox.findMany({
      where: {
        merchantId,
        payload: payloadFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
