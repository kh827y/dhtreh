import { Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerRequest,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'crypto';
import { safeExec, safeExecAsync } from '../../shared/safe-exec';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(CustomThrottlerGuard.name);
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: AppConfigService,
  ) {
    super(options, storage, reflector);
  }

  private extractApiKey(req: RequestLike): string {
    const viaGetter = typeof req.get === 'function' ? req.get('x-api-key') : '';
    const rawHeader = firstHeaderValue(req, [
      'x-api-key',
      'X-Api-Key',
      'x_api_key',
      'x-api_key',
    ]);
    const headerKey =
      typeof viaGetter === 'string' && viaGetter.trim() ? viaGetter : rawHeader;
    const auth = firstHeaderValue(req, ['authorization']) || '';
    const bearer = auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length)
      : '';
    return String(headerKey || bearer || '').trim();
  }

  protected async getTracker(req: RequestLike): Promise<string> {
    return safeExecAsync(
      async () => {
        const ip =
          req.ip || req.ips?.[0] || req.socket?.remoteAddress || 'unknown';
        const routePath =
          typeof req.route?.path === 'string'
            ? `${req.baseUrl || ''}${req.route.path}`
            : '';
        const path = (
          routePath ||
          req.originalUrl ||
          (req.baseUrl ? `${req.baseUrl}${req.path || ''}` : '') ||
          req.path ||
          ''
        ).split('?')[0];
        const integrationId = req.integrationId || req.integration?.id;
        if (integrationId) {
          return [integrationId, path].filter(Boolean).join('|');
        }
        if (path.includes('/integrations/')) {
          const apiKey = this.extractApiKey(req);
          if (apiKey) {
            const hash = createHash('sha256').update(apiKey).digest('hex');
            return [hash, path].filter(Boolean).join('|');
          }
        }
        const body = toRecord(req.body);
        const q = toRecord(req.query);
        const merchantId = asString(body?.merchantId) || asString(q?.merchantId);
        const outletId = asString(body?.outletId) || asString(q?.outletId);
        const staffId = asString(body?.staffId) || asString(q?.staffId);
        return [ip, path, merchantId, outletId, staffId]
          .filter(Boolean)
          .join('|');
      },
      () => super.getTracker(req as Record<string, unknown>),
      this.logger,
      'throttler.getTracker failed',
    );
  }

  // Per-endpoint overrides via ENV and per-merchant multipliers
  // RL_LIMIT_QUOTE, RL_TTL_QUOTE, RL_LIMIT_COMMIT, RL_TTL_COMMIT, RL_LIMIT_REFUND, RL_TTL_REFUND
  // RL_MERCHANT_MULTIPLIERS (JSON): { "M-1": 2, "M-2": 0.5 }
  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    return safeExecAsync(
      async () => {
        const { context, limit, ttl } = requestProps;
        const req = context.switchToHttp().getRequest<RequestLike>();
        const path: string = (
          req?.originalUrl ||
          (req?.baseUrl ? `${req.baseUrl}${req.path || ''}` : '') ||
          req?.path ||
          req?.route?.path ||
          ''
        )
          .toLowerCase()
          .split('?')[0];
        const body = toRecord(req?.body);
        const q = toRecord(req?.query);
        const merchantId =
          asString(body?.merchantId) || asString(q?.merchantId);

        const envNum = (name: string, def: number) => {
          const n = this.config.getNumber(name);
          if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
          return def;
        };

        const pick = (p: string) => ({
          limit: envNum(
            p === 'quote'
              ? 'RL_LIMIT_QUOTE'
              : p === 'commit'
                ? 'RL_LIMIT_COMMIT'
                : 'RL_LIMIT_REFUND',
            limit,
          ),
          ttl: envNum(
            p === 'quote'
              ? 'RL_TTL_QUOTE'
              : p === 'commit'
                ? 'RL_TTL_COMMIT'
                : 'RL_TTL_REFUND',
            ttl,
          ),
        });

        let base = { limit, ttl };
        const integrationLimits = toRecord(req?.integrationRateLimits);
        if (integrationLimits && req?.integrationId) {
          const pickIntegration = (key: string) => {
            const src = toRecord(integrationLimits?.[key]);
            const l = Number(src?.limit);
            const t = Number(src?.ttl);
            return {
              limit: Number.isFinite(l) && l > 0 ? l : base.limit,
              ttl: Number.isFinite(t) && t > 0 ? t : base.ttl,
            };
          };
          if (path.includes('/integrations/calculate/')) {
            base = pickIntegration('calculate');
          } else if (path.includes('/integrations/bonus')) {
            base = pickIntegration('bonus');
          } else if (path.includes('/integrations/refund')) {
            base = pickIntegration('refund');
          } else if (path.includes('/integrations/code')) {
            base = pickIntegration('code');
          }
        }
        if (path.includes('/loyalty/quote')) base = pick('quote');
        else if (path.includes('/loyalty/commit')) base = pick('commit');
        else if (path.includes('/loyalty/refund')) base = pick('refund');

        // Per-merchant multiplier
        const mult = safeExec(
          () => {
            const raw =
              (this.config.getString('RL_MERCHANT_MULTIPLIERS') || '').trim();
            if (raw && merchantId) {
              const parsed = JSON.parse(raw) as unknown;
              const map = toRecord(parsed);
              const m = Number(map?.[merchantId]);
              if (Number.isFinite(m) && m > 0) return m;
            }
            return 1;
          },
          () => 1,
          this.logger,
          'throttler.merchantMultiplier failed',
        );

        const effLimit = Math.max(1, Math.floor(base.limit * mult));
        const effTtl = Math.max(100, Math.floor(base.ttl));

        // Call parent handleRequest with effective values (merge back into request props)
        const nextProps: ThrottlerRequest = {
          ...requestProps,
          limit: effLimit,
          ttl: effTtl,
        };
        return await super.handleRequest(nextProps);
      },
      () => super.handleRequest(requestProps),
      this.logger,
      'throttler.handleRequest failed',
    );
  }
}

type RequestLike = {
  get?: (name: string) => unknown;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  ips?: string[];
  socket?: { remoteAddress?: string };
  route?: { path?: string };
  baseUrl?: string;
  originalUrl?: string;
  path?: string;
  integrationId?: string;
  integration?: { id?: string };
  integrationRateLimits?: Record<string, unknown>;
  body?: unknown;
  query?: unknown;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  return '';
}

function firstHeaderValue(req: RequestLike, names: string[]): string {
  for (const name of names) {
    const value = req.headers?.[name];
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.length) return value[0] || '';
  }
  return '';
}
