import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { createHash } from 'crypto';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private extractApiKey(req: Record<string, any>): string {
    const viaGetter = typeof req.get === 'function' ? req.get('x-api-key') : '';
    const rawHeader =
      viaGetter ??
      req.headers?.['x-api-key'] ??
      req.headers?.['X-Api-Key'] ??
      req.headers?.['x_api_key'] ??
      req.headers?.['x-api_key'];
    const headerKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const auth = req.headers?.['authorization'] || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    return String(headerKey || bearer || '').trim();
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    try {
      const ip =
        req.ip || req.ips?.[0] || req.socket?.remoteAddress || 'unknown';
      const path = (
        req.originalUrl ||
        (req.baseUrl ? `${req.baseUrl}${req.path || ''}` : '') ||
        req.path ||
        req.route?.path ||
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
      const body = req.body || {};
      const q = req.query || {};
      const merchantId = body.merchantId || q.merchantId || '';
      const outletId = body.outletId || q.outletId || '';
      const staffId = body.staffId || q.staffId || '';
      return [ip, path, merchantId, outletId, staffId]
        .filter(Boolean)
        .join('|');
    } catch {
      return await super.getTracker(req as any);
    }
  }

  // Per-endpoint overrides via ENV and per-merchant multipliers
  // RL_LIMIT_QUOTE, RL_TTL_QUOTE, RL_LIMIT_COMMIT, RL_TTL_COMMIT, RL_LIMIT_REFUND, RL_TTL_REFUND
  // RL_MERCHANT_MULTIPLIERS (JSON): { "M-1": 2, "M-2": 0.5 }
  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    try {
      const { context, limit, ttl } = requestProps as any;
      const req: any = context.switchToHttp().getRequest();
      const path: string = (
        req?.originalUrl ||
        (req?.baseUrl ? `${req.baseUrl}${req.path || ''}` : '') ||
        req?.path ||
        req?.route?.path ||
        ''
      )
        .toLowerCase()
        .split('?')[0];
      const body = req?.body || {};
      const q = req?.query || {};
      const merchantId: string | undefined =
        body.merchantId || q.merchantId || undefined;

      const envNum = (name: string, def: number) => {
        const v = (process.env[name] || '').trim();
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : def;
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
      const integrationLimits = req?.integrationRateLimits;
      if (integrationLimits && req?.integrationId) {
        const pickIntegration = (key: string) => {
          const src = integrationLimits?.[key];
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
      let mult = 1;
      try {
        const raw = (process.env.RL_MERCHANT_MULTIPLIERS || '').trim();
        if (raw && merchantId) {
          const map = JSON.parse(raw);
          const m = Number(map[merchantId]);
          if (Number.isFinite(m) && m > 0) mult = m;
        }
      } catch {}

      const effLimit = Math.max(1, Math.floor(base.limit * mult));
      const effTtl = Math.max(100, Math.floor(base.ttl));

      // Call parent handleRequest with effective values (merge back into request props)
      const nextProps: ThrottlerRequest = {
        ...(requestProps as any),
        limit: effLimit,
        ttl: effTtl,
      };
      return await super.handleRequest(nextProps);
    } catch {
      return await super.handleRequest(requestProps);
    }
  }
}
