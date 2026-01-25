import { BadRequestException, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { MerchantsService } from '../merchants.service';
import { csvCell } from '../utils/merchants-csv.util';

@Injectable()
export class MerchantsOutboxUseCase {
  constructor(private readonly merchants: MerchantsService) {}

  listOutbox(
    merchantId: string,
    status?: string,
    limitStr?: string,
    type?: string,
    since?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : undefined;
    return this.merchants.listOutbox(merchantId, status, limit, type, since);
  }

  retryOutbox(merchantId: string, eventId: string) {
    return this.merchants.retryOutbox(merchantId, eventId);
  }

  deleteOutbox(merchantId: string, eventId: string) {
    return this.merchants.deleteOutbox(merchantId, eventId);
  }

  retryAll(merchantId: string, status?: string) {
    return this.merchants.retryAll(merchantId, status);
  }

  getOutboxEvent(merchantId: string, eventId: string) {
    return this.merchants.getOutboxEvent(merchantId, eventId);
  }

  retrySince(
    merchantId: string,
    body: { status?: string; since?: string },
  ) {
    return this.merchants.retrySince(merchantId, {
      status: body?.status,
      since: body?.since,
    });
  }

  pauseOutbox(merchantId: string, body: { minutes?: number; until?: string }) {
    return this.merchants.pauseOutbox(merchantId, body?.minutes, body?.until);
  }

  resumeOutbox(merchantId: string) {
    return this.merchants.resumeOutbox(merchantId);
  }

  outboxStats(merchantId: string, sinceStr?: string) {
    const since = sinceStr ? new Date(sinceStr) : undefined;
    if (sinceStr && Number.isNaN(since?.getTime() ?? NaN)) {
      throw new BadRequestException('since is invalid');
    }
    return this.merchants.outboxStats(merchantId, since);
  }

  outboxByOrder(
    merchantId: string,
    orderId: string,
    limitStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 500)
      : 100;
    return this.merchants.listOutboxByOrder(merchantId, orderId, limit);
  }

  async outboxCsv(
    merchantId: string,
    res: Response,
    params: {
      status?: string;
      since?: string;
      type?: string;
      limitStr?: string;
      batchStr?: string;
    },
  ) {
    const batchRaw = parseInt(params.batchStr || '1000', 10);
    const batch = Math.min(
      Math.max(Number.isFinite(batchRaw) ? batchRaw : 1000, 100),
      5000,
    );
    const limitRaw = params.limitStr ? parseInt(params.limitStr, 10) : NaN;
    const totalLimit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 5000)
        : undefined;
    const pageSize = totalLimit ? Math.min(totalLimit, batch) : batch;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="outbox_${merchantId}_${Date.now()}.csv"`,
    );
    res.write('id,eventType,status,retries,nextRetryAt,lastError,createdAt\n');
    let cursor: { createdAt: Date; id: string } | null = null;
    let written = 0;
    while (true) {
      const page = await this.merchants.listOutbox(
        merchantId,
        params.status,
        pageSize,
        params.type,
        params.since,
        cursor,
      );
      if (!page.length) break;
      for (const ev of page) {
        const row = [
          ev.id,
          ev.eventType,
          ev.status,
          ev.retries,
          ev.nextRetryAt ? ev.nextRetryAt.toISOString() : '',
          ev.lastError || '',
          ev.createdAt.toISOString(),
        ]
          .map((x) => csvCell(x))
          .join(',');
        res.write(row + '\n');
        written += 1;
        if (totalLimit && written >= totalLimit) break;
      }
      if (totalLimit && written >= totalLimit) break;
      const last = page[page.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      if (page.length < pageSize) break;
    }
    res.end();
  }
}
