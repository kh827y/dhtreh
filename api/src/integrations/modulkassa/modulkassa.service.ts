import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MetricsService } from '../../metrics.service';
import type {
  PosAdapter,
  LoyaltyQuoteRequest,
  LoyaltyCommitRequest,
} from '../types';
import {
  validateIntegrationConfig,
  type ModulKassaConfig,
} from '../config.schema';
import { upsertIntegration } from '../integration.util';

@Injectable()
export class ModulKassaService implements PosAdapter {
  name = 'ModulKassa';
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  async registerIntegration(merchantId: string, cfg: ModulKassaConfig) {
    const valid = validateIntegrationConfig('MODULKASSA', cfg);
    if (!valid.ok)
      throw new BadRequestException(
        'ModulKassa config invalid: ' + valid.errors.join('; '),
      );
    const id = await upsertIntegration(
      this.prisma,
      merchantId,
      'MODULKASSA',
      { baseUrl: cfg.baseUrl },
      { apiKey: cfg.apiKey },
    );
    return { success: true, integrationId: id };
  }

  async quoteLoyalty(req: LoyaltyQuoteRequest) {
    // Проксируем в loyalty/quote
    const res = await fetch(`${process.env.API_BASE_URL}/loyalty/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, mode: 'REDEEM' }),
    });
    const data = await res.json();
    return data;
  }

  async commitLoyalty(req: LoyaltyCommitRequest) {
    const res = await fetch(`${process.env.API_BASE_URL}/loyalty/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return await res.json();
  }

  async handleWebhook(payload: any) {
    // Пример: стандартный webhook от кассы об оплате
    this.metrics.inc('pos_webhooks_total', { provider: 'MODULKASSA' });
    try {
      await (this.prisma as any).syncLog.create({
        data: {
          provider: 'MODULKASSA',
          direction: 'IN',
          endpoint: 'webhook',
          status: 'ok',
          request: payload,
        },
      });
    } catch {}
    return { ok: true };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
