import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MetricsService } from '../../metrics.service';
import type { PosAdapter, LoyaltyQuoteRequest, LoyaltyCommitRequest } from '../types';

@Injectable()
export class PosterService implements PosAdapter {
  name = 'PosterPOS';
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  async quoteLoyalty(req: LoyaltyQuoteRequest) {
    const res = await fetch(`${process.env.API_BASE_URL}/loyalty/quote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...req, mode: 'REDEEM' })
    });
    return await res.json();
  }

  async commitLoyalty(req: LoyaltyCommitRequest) {
    const res = await fetch(`${process.env.API_BASE_URL}/loyalty/commit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req)
    });
    return await res.json();
  }

  async handleWebhook(payload: any) {
    this.metrics.inc('pos_webhooks_total', { provider: this.name });
    return { ok: true };
  }

  async healthCheck(): Promise<boolean> { return true; }
}
