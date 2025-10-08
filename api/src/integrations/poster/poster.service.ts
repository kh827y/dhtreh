import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MetricsService } from '../../metrics.service';
import type {
  PosAdapter,
  LoyaltyQuoteRequest,
  LoyaltyCommitRequest,
} from '../types';
import { validateIntegrationConfig, type PosterConfig } from '../config.schema';
import { upsertIntegration } from '../integration.util';

@Injectable()
export class PosterService implements PosAdapter {
  name = 'PosterPOS';
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  async registerIntegration(merchantId: string, cfg: PosterConfig) {
    const valid = validateIntegrationConfig('POSTER', cfg);
    if (!valid.ok)
      throw new BadRequestException(
        'Poster config invalid: ' + valid.errors.join('; '),
      );
    const id = await upsertIntegration(
      this.prisma,
      merchantId,
      'POSTER',
      { appId: cfg.appId },
      { appSecret: cfg.appSecret },
    );
    return { success: true, integrationId: id };
  }

  async quoteLoyalty(req: LoyaltyQuoteRequest) {
    const res = await fetch(`${process.env.API_BASE_URL}/loyalty/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, mode: 'REDEEM' }),
    });
    return await res.json();
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
    this.metrics.inc('pos_webhooks_total', { provider: 'POSTER' });
    try {
      await (this.prisma as any).syncLog.create({
        data: {
          provider: 'POSTER',
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
