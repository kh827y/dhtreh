import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { AntiFraudService } from '../antifraud/antifraud.service';
import { AlertsService } from '../alerts/alerts.service';

function envNum(name: string, def: number) {
  const v = (process.env[name] || '').trim();
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

@Injectable()
export class AntiFraudGuard implements CanActivate {
  constructor(private prisma: PrismaService, private metrics: MetricsService, private antifraud: AntiFraudService, private alerts: AlertsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // tests/dev bypass (can be forced on via ANTIFRAUD_GUARD_FORCE=on)
    if (process.env.NODE_ENV === 'test') {
      const force = (process.env.ANTIFRAUD_GUARD_FORCE || '').trim().toLowerCase();
      if (force !== 'on') return true;
    }
    const sw = (process.env.ANTIFRAUD_GUARD || '').trim().toLowerCase();
    if (sw === 'off' || sw === '0' || sw === 'false' || sw === 'no') return true;

    const req = ctx.switchToHttp().getRequest() as any;
    const method: string = (req.method || 'GET').toUpperCase();
    const path: string = req?.route?.path || req?.path || req?.originalUrl || '';
    const p = String(path || '').toLowerCase();
    const isCommit = method === 'POST' && (p.includes('/loyalty/commit') || p.endsWith('/commit'));
    const isRefund = method === 'POST' && (p.includes('/loyalty/refund') || p.endsWith('/refund'));
    const isOperation = isCommit || isRefund;
    if (!isOperation) return true;

    // Context resolution
    let merchantId: string | undefined = req.body?.merchantId || req?.params?.merchantId || req?.query?.merchantId;
    let customerId: string | undefined = req.body?.customerId;
    let outletId: string | undefined = req.body?.outletId || req?.params?.outletId || req?.query?.outletId;
    let deviceId: string | undefined = req.body?.deviceId || req?.params?.deviceId || req?.query?.deviceId;
    let staffId: string | undefined = req.body?.staffId;

    if (isCommit) {
      const holdId = req.body?.holdId as string | undefined;
      if (holdId) {
        try {
          const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
          if (hold) {
            merchantId = hold.merchantId || merchantId;
            customerId = hold.customerId || customerId;
            outletId = hold.outletId || outletId;
            deviceId = hold.deviceId || deviceId;
            staffId = hold.staffId || staffId;
          }
        } catch {}
      }
    }

    if (!merchantId) return true; // cannot decide => allow

    // Limits (defaults)
    // Defaults from ENV
    let limits = {
      customer: { limit: envNum('AF_LIMIT_CUSTOMER', 5), windowSec: envNum('AF_WINDOW_CUSTOMER_SEC', 120), dailyCap: envNum('AF_DAILY_CAP_CUSTOMER', 0), weeklyCap: envNum('AF_WEEKLY_CAP_CUSTOMER', 0) },
      outlet:   { limit: envNum('AF_LIMIT_OUTLET', envNum('AF_LIMIT_DEVICE', 20)), windowSec: envNum('AF_WINDOW_OUTLET_SEC', envNum('AF_WINDOW_DEVICE_SEC', 600)), dailyCap: envNum('AF_DAILY_CAP_OUTLET', envNum('AF_DAILY_CAP_DEVICE', 0)),   weeklyCap: envNum('AF_WEEKLY_CAP_OUTLET', envNum('AF_WEEKLY_CAP_DEVICE', 0)) },
      staff:    { limit: envNum('AF_LIMIT_STAFF', 60), windowSec: envNum('AF_WINDOW_STAFF_SEC', 600), dailyCap: envNum('AF_DAILY_CAP_STAFF', 0),     weeklyCap: envNum('AF_WEEKLY_CAP_STAFF', 0) },
      merchant: { limit: envNum('AF_LIMIT_MERCHANT', 200), windowSec: envNum('AF_WINDOW_MERCHANT_SEC', 3600), dailyCap: envNum('AF_DAILY_CAP_MERCHANT', 0), weeklyCap: envNum('AF_WEEKLY_CAP_MERCHANT', 0) },
    } as const;

    // Per-merchant overrides via MerchantSettings.rulesJson.af
    try {
      const s = merchantId ? await this.prisma.merchantSettings.findUnique({ where: { merchantId } }) : null;
      const af = s && s.rulesJson && (s.rulesJson as any).af ? (s.rulesJson as any).af : null;
      if (af) {
        const outletCfg = af.outlet ?? af.device ?? {};
        limits = {
          customer: { limit: Number(af.customer?.limit ?? limits.customer.limit), windowSec: Number(af.customer?.windowSec ?? limits.customer.windowSec), dailyCap: Number(af.customer?.dailyCap ?? limits.customer.dailyCap), weeklyCap: Number(af.customer?.weeklyCap ?? limits.customer.weeklyCap) },
          outlet:   { limit: Number(outletCfg?.limit ?? limits.outlet.limit),     windowSec: Number(outletCfg?.windowSec ?? limits.outlet.windowSec),       dailyCap: Number(outletCfg?.dailyCap ?? limits.outlet.dailyCap),     weeklyCap: Number(outletCfg?.weeklyCap ?? limits.outlet.weeklyCap) },
          staff:    { limit: Number(af.staff?.limit ?? limits.staff.limit),       windowSec: Number(af.staff?.windowSec ?? limits.staff.windowSec),         dailyCap: Number(af.staff?.dailyCap ?? limits.staff.dailyCap),       weeklyCap: Number(af.staff?.weeklyCap ?? limits.staff.weeklyCap) },
          merchant: { limit: Number(af.merchant?.limit ?? limits.merchant.limit), windowSec: Number(af.merchant?.windowSec ?? limits.merchant.windowSec),   dailyCap: Number(af.merchant?.dailyCap ?? limits.merchant.dailyCap), weeklyCap: Number(af.merchant?.weeklyCap ?? limits.merchant.weeklyCap) },
        } as const;
      }
    } catch {}

    const now = Date.now();
    // rolling windows to avoid TZ/midnight edge cases
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // rolling 7-day window
    startOfWeek.setHours(0,0,0,0);

    // Helper for block
    const resolvedOutletId = outletId || undefined;
    const legacyDeviceId = deviceId || undefined;
    const block = (scope: string, count: number, limit: number) => {
      this.metrics.inc('antifraud_velocity_block_total', { scope, operation: isCommit ? 'commit' : 'refund' });
      try {
        this.alerts
          .antifraudBlocked({ merchantId, reason: 'velocity', scope, ctx: { customerId, outletId: resolvedOutletId ?? legacyDeviceId, deviceId: legacyDeviceId, staffId } })
          .catch(() => {});
      } catch {}
      throw new HttpException(`Антифрод: превышен лимит операций (${scope}=${count}/${limit})`, HttpStatus.TOO_MANY_REQUESTS);
    };

    // Merchant-level
    {
      const from = new Date(now - limits.merchant.windowSec * 1000);
      const count = await this.prisma.transaction.count({ where: { merchantId, createdAt: { gte: from } } });
      if (count >= limits.merchant.limit) block('merchant', count, limits.merchant.limit);
      if (limits.merchant.dailyCap && limits.merchant.dailyCap > 0) {
        const daily = await this.prisma.transaction.count({ where: { merchantId, createdAt: { gte: since24h } } });
        if (daily >= limits.merchant.dailyCap) block('merchant_daily', daily, limits.merchant.dailyCap);
      }
      if (limits.merchant.weeklyCap && limits.merchant.weeklyCap > 0) {
        const weekly = await this.prisma.transaction.count({ where: { merchantId, createdAt: { gte: startOfWeek } } });
        if (weekly >= limits.merchant.weeklyCap) block('merchant_weekly', weekly, limits.merchant.weeklyCap);
      }
    }

    // Outlet-level (if known)
    if (resolvedOutletId) {
      const from = new Date(now - limits.outlet.windowSec * 1000);
      const count = await this.prisma.transaction.count({ where: { merchantId, outletId: resolvedOutletId, createdAt: { gte: from } } });
      if (count >= limits.outlet.limit) block('outlet', count, limits.outlet.limit);
      if (limits.outlet.dailyCap && limits.outlet.dailyCap > 0) {
        const daily = await this.prisma.transaction.count({ where: { merchantId, outletId: resolvedOutletId, createdAt: { gte: since24h } } });
        if (daily >= limits.outlet.dailyCap) block('outlet_daily', daily, limits.outlet.dailyCap);
      }
      if (limits.outlet.weeklyCap && limits.outlet.weeklyCap > 0) {
        const weekly = await this.prisma.transaction.count({ where: { merchantId, outletId: resolvedOutletId, createdAt: { gte: startOfWeek } } });
        if (weekly >= limits.outlet.weeklyCap) block('outlet_weekly', weekly, limits.outlet.weeklyCap);
      }
    } else if (legacyDeviceId) {
      // Backward compatibility: fallback to device-based limits if outlet is отсутствует
      const from = new Date(now - limits.outlet.windowSec * 1000);
      const count = await this.prisma.transaction.count({ where: { merchantId, deviceId: legacyDeviceId, createdAt: { gte: from } } });
      if (count >= limits.outlet.limit) block('device', count, limits.outlet.limit);
      if (limits.outlet.dailyCap && limits.outlet.dailyCap > 0) {
        const daily = await this.prisma.transaction.count({ where: { merchantId, deviceId: legacyDeviceId, createdAt: { gte: since24h } } });
        if (daily >= limits.outlet.dailyCap) block('device_daily', daily, limits.outlet.dailyCap);
      }
      if (limits.outlet.weeklyCap && limits.outlet.weeklyCap > 0) {
        const weekly = await this.prisma.transaction.count({ where: { merchantId, deviceId: legacyDeviceId, createdAt: { gte: startOfWeek } } });
        if (weekly >= limits.outlet.weeklyCap) block('device_weekly', weekly, limits.outlet.weeklyCap);
      }
    }

    // Staff-level (if known)
    if (staffId) {
      const from = new Date(now - limits.staff.windowSec * 1000);
      const count = await this.prisma.transaction.count({ where: { merchantId, staffId, createdAt: { gte: from } } });
      if (count >= limits.staff.limit) block('staff', count, limits.staff.limit);
      if (limits.staff.dailyCap && limits.staff.dailyCap > 0) {
        const daily = await this.prisma.transaction.count({ where: { merchantId, staffId, createdAt: { gte: since24h } } });
        if (daily >= limits.staff.dailyCap) block('staff_daily', daily, limits.staff.dailyCap);
      }
      if (limits.staff.weeklyCap && limits.staff.weeklyCap > 0) {
        const weekly = await this.prisma.transaction.count({ where: { merchantId, staffId, createdAt: { gte: startOfWeek } } });
        if (weekly >= limits.staff.weeklyCap) block('staff_weekly', weekly, limits.staff.weeklyCap);
      }
    }

    // Customer-level only for commit (refund может не иметь customerId)
    if (isCommit && customerId) {
      const from = new Date(now - limits.customer.windowSec * 1000);
      const count = await this.prisma.transaction.count({ where: { merchantId, customerId, createdAt: { gte: from } } });
      if (count >= limits.customer.limit) block('customer', count, limits.customer.limit);
      if (limits.customer.dailyCap && limits.customer.dailyCap > 0) {
        const daily = await this.prisma.transaction.count({ where: { merchantId, customerId, createdAt: { gte: since24h } } });
        if (daily >= limits.customer.dailyCap) block('customer_daily', daily, limits.customer.dailyCap);
      }
      if (limits.customer.weeklyCap && limits.customer.weeklyCap > 0) {
        const weekly = await this.prisma.transaction.count({ where: { merchantId, customerId, createdAt: { gte: startOfWeek } } });
        if (weekly >= limits.customer.weeklyCap) block('customer_weekly', weekly, limits.customer.weeklyCap);
      }
    }

    // Deep antifraud scoring (commit only, when hold context is known)
    if (isCommit) {
      try {
        const holdId = req.body?.holdId as string | undefined;
        if (holdId) {
          const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
          if (hold && hold.customerId && hold.merchantId) {
            const xfwd = (req.headers?.['x-forwarded-for'] as string | undefined) || '';
            const ipAddr = (xfwd.split(',')[0]?.trim()) || (req.ip || req.ips?.[0] || req.socket?.remoteAddress || undefined);
            const ua = (req.headers?.['user-agent'] as string | undefined) || undefined;
            const ctx = {
              merchantId: hold.merchantId,
              customerId: hold.customerId,
              amount: hold.mode === 'REDEEM' ? Math.abs(hold.redeemAmount || 0) : Math.abs(hold.earnPoints || 0),
              type: hold.mode === 'REDEEM' ? 'REDEEM' as const : 'EARN' as const,
              deviceId: hold.deviceId || undefined,
              outletId: hold.outletId || undefined,
              staffId: hold.staffId || undefined,
              ipAddress: ipAddr,
              userAgent: ua,
              };
            // Быстрая проверка факторной блокировки: no_outlet_id
            try {
              const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: hold.merchantId } });
              const af = s && s.rulesJson && (s.rulesJson as any).af ? (s.rulesJson as any).af : null;
              const blockFactors: string[] = Array.isArray(af?.blockFactors) ? af.blockFactors : [];
              const hasLegacyOnly = blockFactors.includes('no_device_id');
              const hasOutletRule = blockFactors.includes('no_outlet_id');
              const shouldApplyNoOutlet = (hasOutletRule || hasLegacyOnly) && !hold.outletId;
              if (shouldApplyNoOutlet) {
                const factor = hasOutletRule ? 'no_outlet_id' : 'no_device_id';
                this.metrics.inc('antifraud_block_factor_total', { factor });
                try {
                  this.alerts
                    .antifraudBlocked({ merchantId: hold.merchantId, reason: 'factor', factor, ctx: { customerId: hold.customerId, outletId: hold.outletId || hold.deviceId, deviceId: hold.deviceId, staffId: hold.staffId } })
                    .catch(() => {});
                } catch {}
                throw new HttpException(`Антифрод: заблокировано правилом по фактору (${factor})`, HttpStatus.TOO_MANY_REQUESTS);
              }
            } catch {}
            const score = await this.antifraud.checkTransaction(ctx);
            this.metrics.inc('antifraud_check_total', { operation: isCommit ? 'commit' : 'refund' });
            this.metrics.inc('antifraud_risk_level_total', { level: String((score as any).level || 'UNKNOWN') });
            // Сохраним запись о проверке (для истории/аналитики)
            try { await this.antifraud.recordFraudCheck(ctx, score, undefined); } catch {}
            if (score.shouldBlock) {
              this.metrics.inc('antifraud_blocked_total', { level: score.level, reason: 'risk' });
              try {
                this.alerts
                  .antifraudBlocked({ merchantId: hold.merchantId, reason: 'risk', level: String(score.level), ctx: { customerId: hold.customerId, outletId: hold.outletId || hold.deviceId, deviceId: hold.deviceId, staffId: hold.staffId } })
                  .catch(() => {});
              } catch {}
              throw new HttpException(`Антифрод: высокий риск (${score.level}). Факторы: ${score.factors?.slice(0,5).join(', ')}`, HttpStatus.TOO_MANY_REQUESTS);
            }
            // Правила блокировки по факторам (rulesJson.af.blockFactors: string[])
            let blockFactors: string[] = [];
            try {
              const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: hold.merchantId } });
              const af = s && s.rulesJson && (s.rulesJson as any).af ? (s.rulesJson as any).af : null;
              blockFactors = Array.isArray(af?.blockFactors) ? af.blockFactors : [];
            } catch {}
            if (blockFactors.length && Array.isArray(score.factors)) {
              const factorKeys = score.factors.map((f: string) => String(f || '').split(':')[0]);
              const matched = factorKeys.find((f: string) => blockFactors.includes(f));
              if (matched) {
                this.metrics.inc('antifraud_block_factor_total', { factor: matched });
                try {
                  this.alerts
                    .antifraudBlocked({ merchantId: hold.merchantId, reason: 'factor', factor: matched, ctx: { customerId: hold.customerId, outletId: hold.outletId || hold.deviceId, deviceId: hold.deviceId, staffId: hold.staffId } })
                    .catch(() => {});
                } catch {}
                throw new HttpException(`Антифрод: заблокировано правилом по фактору (${matched})`, HttpStatus.TOO_MANY_REQUESTS);
              }
            }
            // HIGH риск: не требуем дополнительных подтверждений (по требованию заказчика)
          }
        }
      } catch (e) {
        // Не гасим целенаправленные блокировки
        if (e instanceof HttpException) throw e;
        // Иначе молча пропускаем (не блокируем легитимные транзакции из-за ошибок)
      }
    }

    return true;
  }
}
