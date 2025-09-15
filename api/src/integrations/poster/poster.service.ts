import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MetricsService } from '../../metrics.service';
import type { PosAdapter, LoyaltyQuoteRequest, LoyaltyCommitRequest } from '../types';
import { validateIntegrationConfig, type PosterConfig } from '../config.schema';

@Injectable()
export class PosterService implements PosAdapter {
  name = 'PosterPOS';
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  async registerIntegration(merchantId: string, cfg: PosterConfig) {
    const valid = validateIntegrationConfig('POSTER', cfg);
    if (!valid.ok) throw new Error('Poster config invalid: ' + valid.errors.join('; '));
    const prismaAny = this.prisma as any;
    const found = await prismaAny.integration.findFirst({ where: { merchantId, provider: 'POSTER' } });
    if (found) {
      await prismaAny.integration.update({
        where: { id: found.id },
        data: {
          config: { appId: cfg.appId },
          credentials: { appSecret: cfg.appSecret },
          isActive: true,
        },
      });
      return { success: true, integrationId: found.id };
    }
    const created = await prismaAny.integration.create({
      data: {
        merchantId,
        type: 'POS',
        provider: 'POSTER',
        config: { appId: cfg.appId },
        credentials: { appSecret: cfg.appSecret },
        isActive: true,
      },
    });
    return { success: true, integrationId: created.id };
  }

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
    this.metrics.inc('pos_webhooks_total', { provider: 'POSTER' });
    try {
      await (this.prisma as any).syncLog.create({
        data: {
          provider: 'POSTER',
          direction: 'IN',
          endpoint: 'webhook',
          status: 'ok',
          request: payload as any,
        },
      });
    } catch {}
    return { ok: true };
  }

  async healthCheck(): Promise<boolean> { return true; }
}
