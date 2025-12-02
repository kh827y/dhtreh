import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Integration } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';

export type RestApiRateLimit = { limit: number; ttl: number };

export type RestApiRateLimits = {
  code: RestApiRateLimit;
  calculate: RestApiRateLimit;
  bonus: RestApiRateLimit;
  refund: RestApiRateLimit;
  outlets: RestApiRateLimit;
  devices: RestApiRateLimit;
  operations: RestApiRateLimit;
};

export interface RestApiIntegrationConfig {
  kind: string;
  requireBridgeSignature: boolean;
  rateLimits: RestApiRateLimits;
  [key: string]: any;
}

const DEFAULT_RATE_LIMITS: RestApiRateLimits = {
  code: { limit: 60, ttl: 60_000 },
  calculate: { limit: 120, ttl: 60_000 },
  bonus: { limit: 60, ttl: 60_000 },
  refund: { limit: 30, ttl: 60_000 },
  outlets: { limit: 60, ttl: 60_000 },
  devices: { limit: 60, ttl: 60_000 },
  operations: { limit: 30, ttl: 60_000 },
};

@Injectable()
export class RestApiIntegrationsService {
  readonly provider = 'REST_API';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  baseApiUrl(): string {
    const raw = this.config.get<string>('API_BASE_URL') || '';
    if (!raw) return '';
    return raw.replace(/\/$/, '');
  }

  generateApiKey(): string {
    const head = crypto.randomBytes(18).toString('base64url');
    const tail = crypto.randomBytes(8).toString('hex');
    return `rk_${head}${tail}`;
  }

  hashKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  maskKey(apiKey: string): string {
    const clean = String(apiKey || '').trim();
    if (!clean) return '';
    if (clean.length <= 8) {
      return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
    }
    return `${clean.slice(0, 4)}****${clean.slice(-4)}`;
  }

  normalizeConfig(
    raw: Prisma.JsonValue | null | undefined,
  ): RestApiIntegrationConfig {
    const base: Record<string, any> =
      raw && typeof raw === 'object' ? { ...(raw as Record<string, any>) } : {};

    const pickLimit = (
      value: any,
      key: keyof RestApiRateLimits,
    ): RestApiRateLimit => {
      const current =
        value && typeof value === 'object' ? (value[key] as any) : null;
      const limit = Number(current?.limit);
      const ttl = Number(current?.ttl);
      const fallback = DEFAULT_RATE_LIMITS[key];
      return {
        limit: Number.isFinite(limit) && limit > 0 ? limit : fallback.limit,
        ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : fallback.ttl,
      };
    };

    const rateLimits = base.rateLimits || {};

    return {
      ...base,
      kind: 'rest-api',
      requireBridgeSignature: Boolean(base.requireBridgeSignature),
      rateLimits: {
        code: pickLimit(rateLimits, 'code'),
        calculate: pickLimit(rateLimits, 'calculate'),
        bonus: pickLimit(rateLimits, 'bonus'),
        refund: pickLimit(rateLimits, 'refund'),
        outlets: pickLimit(rateLimits, 'outlets'),
        devices: pickLimit(rateLimits, 'devices'),
        operations: pickLimit(rateLimits, 'operations'),
      },
    };
  }

  async findByApiKey(apiKey: string): Promise<Integration | null> {
    const hash = this.hashKey(apiKey);
    return this.prisma.integration.findFirst({
      where: {
        provider: this.provider,
        apiKeyHash: hash,
        isActive: true,
        archivedAt: null,
      },
    });
  }

  async findByMerchant(merchantId: string): Promise<Integration | null> {
    return this.prisma.integration.findFirst({
      where: { merchantId, provider: this.provider },
    });
  }
}
