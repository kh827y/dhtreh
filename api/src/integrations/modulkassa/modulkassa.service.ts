import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MetricsService } from '../../metrics.service';
import type { PosAdapter, LoyaltyQuoteRequest, LoyaltyCommitRequest } from '../types';
import { validateIntegrationConfig, type ModulKassaConfig } from '../config.schema';

@Injectable()
export class ModulKassaService implements PosAdapter {
  name = 'ModulKassa';
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  async registerIntegration(merchantId: string, cfg: ModulKassaConfig) {
    const valid = validateIntegrationConfig('MODULKASSA', cfg);
    if (!valid.ok) throw new Error('ModulKassa config invalid: ' + valid.errors.join('; '));
    const prismaAny = this.prisma as any;
    const found = await prismaAny.integration.findFirst({ where: { merchantId, provider: 'MODULKASSA' } });
    if (found) {
      await prismaAny.integration.update({
        where: { id: found.id },
        data: {
          config: { baseUrl: cfg.baseUrl },
          credentials: { apiKey: cfg.apiKey },
          isActive: true,
        },
      });
      return { success: true, integrationId: found.id };
    }
    const created = await prismaAny.integration.create({
      data: {
        merchantId,
        type: 'POS',
        provider: 'MODULKASSA',
        config: { baseUrl: cfg.baseUrl },
        credentials: { apiKey: cfg.apiKey },
        isActive: true,
      },
    });
    return { success: true, integrationId: created.id };
  }

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
    this.metrics.inc('pos_webhooks_total', { provider: 'MODULKASSA' });
    try {
      await (this.prisma as any).syncLog.create({
        data: {
          provider: 'MODULKASSA',
          direction: 'IN',
          endpoint: 'webhook',
          status: 'ok',
          request: payload as any,
        },
      });
    } catch {}
    return { ok: true };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
