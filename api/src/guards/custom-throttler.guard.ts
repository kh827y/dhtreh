import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    try {
      const ip =
        req.ip || req.ips?.[0] || req.socket?.remoteAddress || 'unknown';
      const path = (req.route?.path || req.path || req.originalUrl || '').split(
        '?',
      )[0];
      const integrationId = req.integrationId || req.integration?.id;
      if (integrationId) {
        return [integrationId, path].filter(Boolean).join('|');
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
        req?.route?.path ||
        req?.path ||
        req?.originalUrl ||
        ''
      ).toLowerCase();
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
          const src = (integrationLimits as any)?.[key];
          const l = Number(src?.limit);
          const t = Number(src?.ttl);
          return {
            limit: Number.isFinite(l) && l > 0 ? l : base.limit,
            ttl: Number.isFinite(t) && t > 0 ? t : base.ttl,
          };
        };
        if (path.includes('/api/integrations/bonus/calculate')) {
          base = pickIntegration('calculate');
        } else if (path.includes('/api/integrations/bonus')) {
          base = pickIntegration('bonus');
        } else if (path.includes('/api/integrations/refund')) {
          base = pickIntegration('refund');
        } else if (path.includes('/api/integrations/code')) {
          base = pickIntegration('code');
        } else if (path.includes('/api/integrations/client/migrate')) {
          base = pickIntegration('clientMigrate');
        } else if (path.includes('/api/integrations/operations')) {
          base = pickIntegration('operations');
        } else if (path.includes('/api/integrations/outlets')) {
          base = pickIntegration('outlets');
        } else if (path.includes('/api/integrations/devices')) {
          base = pickIntegration('devices');
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
