import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MetricsService } from '../../metrics.service';
import type { PosAdapter, LoyaltyQuoteRequest, LoyaltyCommitRequest } from '../types';

@Injectable()
export class ModulKassaService implements PosAdapter {
  name = 'ModulKassa';
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  async quoteLoyalty(req: LoyaltyQuoteRequest) {
    // Проксируем в loyalty/quote
    const res = await fetch(`${process.env.API_BASE_URL}/loyalty/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, mode: 'REDEEM' })
    });
    const data = await res.json();
    return data;
  }

  async commitLoyalty(req: LoyaltyCommitRequest) {
    const res = await fetch(`${process.env.API_BASE_URL}/loyalty/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    return await res.json();
  }

  async handleWebhook(payload: any) {
    // Пример: стандартный webhook от кассы об оплате
    this.metrics.inc('pos_webhooks_total', { provider: this.name });
    return { ok: true };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
