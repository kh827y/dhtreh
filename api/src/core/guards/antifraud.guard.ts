import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { AntiFraudService } from '../../modules/antifraud/antifraud.service';
import { AlertsService } from '../../modules/alerts/alerts.service';
import { TelegramStaffNotificationsService } from '../../modules/telegram/staff-notifications.service';
import { normalizeDeviceCode } from '../../shared/devices/device.util';
import { getRulesSection } from '../../shared/rules-json.util';
import { AppConfigService } from '../config/app-config.service';

function envNum(config: AppConfigService, name: string, def: number) {
  const n = config.getNumber(name);
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
  return def;
}

function envBool(config: AppConfigService, name: string, def: boolean) {
  return config.getBoolean(name, def);
}

type RequestLike = {
  method?: string;
  route?: { path?: string };
  path?: string;
  originalUrl?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  ips?: string[];
  socket?: { remoteAddress?: string };
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return undefined;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getHeader(req: RequestLike, name: string): string | undefined {
  const value = req.headers?.[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length) return value[0] || undefined;
  return undefined;
}

function readBlockFactors(rulesJson: unknown): string[] {
  const af = getRulesSection(rulesJson, 'af');
  const raw = af?.blockFactors;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
}

@Injectable()
export class AntiFraudGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private antifraud: AntiFraudService,
    private alerts: AlertsService,
    private staffNotify: TelegramStaffNotificationsService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // tests/dev bypass (can be forced on via ANTIFRAUD_GUARD_FORCE=on)
    if (this.config.getString('NODE_ENV') === 'test') {
      const force = (this.config.getString('ANTIFRAUD_GUARD_FORCE') || '')
        .trim()
        .toLowerCase();
      if (force !== 'on') return true;
    }
    const sw = (this.config.getString('ANTIFRAUD_GUARD') || '')
      .trim()
      .toLowerCase();
    if (sw === 'off' || sw === '0' || sw === 'false' || sw === 'no')
      return true;

    const req = ctx.switchToHttp().getRequest<RequestLike>();
    const method =
      typeof req.method === 'string' && req.method
        ? req.method.toUpperCase()
        : 'GET';
    const path: string =
      req?.route?.path || req?.path || req?.originalUrl || '';
    const p = String(path || '').toLowerCase();
    const isCommit =
      method === 'POST' &&
      (p.includes('/loyalty/commit') || p.endsWith('/commit'));
    const isRefund =
      method === 'POST' &&
      (p.includes('/loyalty/refund') || p.endsWith('/refund'));
    const isOperation = isCommit || isRefund;
    if (!isOperation) return true;

    // Context resolution
    const body = toRecord(req.body);
    const params = toRecord(req.params);
    const query = toRecord(req.query);
    let merchantId =
      asString(body?.merchantId) ||
      asString(params?.merchantId) ||
      asString(query?.merchantId);
    let customerId = asString(body?.customerId);
    let outletId =
      asString(body?.outletId) ||
      asString(params?.outletId) ||
      asString(query?.outletId);
    let staffId = asString(body?.staffId);
    let deviceId =
      asString(body?.deviceId) ||
      asString(params?.deviceId) ||
      asString(query?.deviceId);
    let resolvedDeviceId: string | undefined = undefined;

    if (isCommit) {
      const holdId = asString(body?.holdId);
      if (holdId) {
        try {
          const hold = await this.prisma.hold.findUnique({
            where: { id: holdId },
          });
          if (hold) {
            merchantId = hold.merchantId || merchantId;
            customerId = hold.customerId || customerId;
            outletId = hold.outletId || outletId;
            staffId = hold.staffId || staffId;
            deviceId = hold.deviceId || deviceId;
            resolvedDeviceId = hold.deviceId || resolvedDeviceId;
          }
        } catch {}
      }
    }

    if (!merchantId) return true; // cannot decide => allow

    if (!resolvedDeviceId && deviceId) {
      const rawCode = String(deviceId || '').trim();
      if (rawCode) {
        try {
          const { normalized } = normalizeDeviceCode(rawCode);
          const dev = await this.prisma.device.findFirst({
            where: {
              merchantId,
              codeNormalized: normalized,
              archivedAt: null,
            },
            select: { id: true },
          });
          resolvedDeviceId = dev?.id ?? resolvedDeviceId;
        } catch {
          // валидацию кода проведёт основной обработчик, тут не блокируем
        }
        if (!resolvedDeviceId) {
          try {
            const dev = await this.prisma.device.findUnique({
              where: { id: rawCode },
              select: { id: true, merchantId: true, archivedAt: true },
            });
            if (dev && !dev.archivedAt && dev.merchantId === merchantId) {
              resolvedDeviceId = dev.id;
            }
          } catch {}
        }
      }
    }

    // Limits (defaults)
    // Defaults from ENV
    const platformCustomer = {
      limit: envNum(this.config, 'AF_LIMIT_CUSTOMER', 5),
      windowSec: envNum(this.config, 'AF_WINDOW_CUSTOMER_SEC', 120),
      dailyCap: envNum(this.config, 'AF_DAILY_CAP_CUSTOMER', 5),
      weeklyCap: envNum(this.config, 'AF_WEEKLY_CAP_CUSTOMER', 0),
    } as const;
    let limits = {
      customer: {
        limit: platformCustomer.limit,
        windowSec: platformCustomer.windowSec,
        dailyCap: platformCustomer.dailyCap,
        weeklyCap: platformCustomer.weeklyCap,
        monthlyCap: envNum(this.config, 'AF_MONTHLY_CAP_CUSTOMER', 40),
        pointsCap: envNum(this.config, 'AF_POINTS_CAP_CUSTOMER', 3000),
        blockDaily: envBool(this.config, 'AF_BLOCK_DAILY_CUSTOMER', false),
      },
      outlet: {
        limit: envNum(this.config, 'AF_LIMIT_OUTLET', 20),
        windowSec: envNum(this.config, 'AF_WINDOW_OUTLET_SEC', 600),
        dailyCap: envNum(this.config, 'AF_DAILY_CAP_OUTLET', 0),
        weeklyCap: envNum(this.config, 'AF_WEEKLY_CAP_OUTLET', 0),
      },
      device: {
        limit: envNum(this.config, 'AF_LIMIT_DEVICE', 20),
        windowSec: envNum(this.config, 'AF_WINDOW_DEVICE_SEC', 600),
        dailyCap: envNum(this.config, 'AF_DAILY_CAP_DEVICE', 0),
        weeklyCap: envNum(this.config, 'AF_WEEKLY_CAP_DEVICE', 0),
      },
      staff: {
        limit: envNum(this.config, 'AF_LIMIT_STAFF', 60),
        windowSec: envNum(this.config, 'AF_WINDOW_STAFF_SEC', 600),
        dailyCap: envNum(this.config, 'AF_DAILY_CAP_STAFF', 0),
        weeklyCap: envNum(this.config, 'AF_WEEKLY_CAP_STAFF', 0),
      },
      merchant: {
        limit: envNum(this.config, 'AF_LIMIT_MERCHANT', 200),
        windowSec: envNum(this.config, 'AF_WINDOW_MERCHANT_SEC', 3600),
        dailyCap: envNum(this.config, 'AF_DAILY_CAP_MERCHANT', 0),
        weeklyCap: envNum(this.config, 'AF_WEEKLY_CAP_MERCHANT', 0),
      },
    } as const;

    // Per-merchant overrides via MerchantSettings.rulesJson.af
    let resetCfg: Record<string, unknown> | null = null;
    try {
      const s = merchantId
        ? await this.prisma.merchantSettings.findUnique({
            where: { merchantId },
          })
        : null;
      const af = getRulesSection(s?.rulesJson, 'af');
      if (af) {
        resetCfg = getRulesSection(af, 'reset');
        const outletCfg = getRulesSection(af, 'outlet') ?? {};
        const deviceCfg = getRulesSection(af, 'device') ?? {};
        const customerCfg = getRulesSection(af, 'customer') ?? {};
        const staffCfg = getRulesSection(af, 'staff') ?? {};
        const merchantCfg = getRulesSection(af, 'merchant') ?? {};
        limits = {
          customer: {
            limit: toNumber(customerCfg.limit, limits.customer.limit),
            windowSec: toNumber(
              customerCfg.windowSec,
              limits.customer.windowSec,
            ),
            dailyCap: toNumber(customerCfg.dailyCap, limits.customer.dailyCap),
            weeklyCap: toNumber(
              customerCfg.weeklyCap,
              limits.customer.weeklyCap,
            ),
            monthlyCap: toNumber(
              customerCfg.monthlyCap,
              limits.customer.monthlyCap,
            ),
            pointsCap: toNumber(
              customerCfg.pointsCap,
              limits.customer.pointsCap,
            ),
            blockDaily:
              customerCfg.blockDaily === undefined
                ? limits.customer.blockDaily
                : Boolean(customerCfg.blockDaily),
          },
          outlet: {
            limit: toNumber(outletCfg.limit, limits.outlet.limit),
            windowSec: toNumber(outletCfg.windowSec, limits.outlet.windowSec),
            dailyCap: toNumber(outletCfg.dailyCap, limits.outlet.dailyCap),
            weeklyCap: toNumber(outletCfg.weeklyCap, limits.outlet.weeklyCap),
          },
          device: {
            limit: toNumber(deviceCfg.limit, limits.device.limit),
            windowSec: toNumber(deviceCfg.windowSec, limits.device.windowSec),
            dailyCap: toNumber(deviceCfg.dailyCap, limits.device.dailyCap),
            weeklyCap: toNumber(deviceCfg.weeklyCap, limits.device.weeklyCap),
          },
          staff: {
            limit: toNumber(staffCfg.limit, limits.staff.limit),
            windowSec: toNumber(staffCfg.windowSec, limits.staff.windowSec),
            dailyCap: toNumber(staffCfg.dailyCap, limits.staff.dailyCap),
            weeklyCap: toNumber(staffCfg.weeklyCap, limits.staff.weeklyCap),
          },
          merchant: {
            limit: toNumber(merchantCfg.limit, limits.merchant.limit),
            windowSec: toNumber(
              merchantCfg.windowSec,
              limits.merchant.windowSec,
            ),
            dailyCap: toNumber(merchantCfg.dailyCap, limits.merchant.dailyCap),
            weeklyCap: toNumber(
              merchantCfg.weeklyCap,
              limits.merchant.weeklyCap,
            ),
          },
        } as const;
      }
    } catch {}

    const now = Date.now();
    const reset: Record<string, unknown> = resetCfg ?? {};
    const parseReset = (value: unknown) => {
      if (!value) return null;
      if (value instanceof Date) return new Date(value.getTime());
      if (typeof value !== 'string' && typeof value !== 'number') return null;
      const ms = Date.parse(String(value));
      if (!Number.isFinite(ms)) return null;
      return new Date(ms);
    };
    const resolveReset = (
      scope: 'merchant' | 'outlet' | 'device' | 'staff' | 'customer',
      id?: string,
    ) => {
      if (scope === 'merchant') return parseReset(reset.merchant);
      if (!id) return null;
      const bag = toRecord(reset[scope]);
      if (!bag) return null;
      return parseReset(bag[id]);
    };
    const clampStart = (base: Date, resetAt: Date | null) =>
      resetAt && resetAt > base ? resetAt : base;
    // rolling windows to avoid TZ/midnight edge cases
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // rolling 7-day window
    startOfWeek.setHours(0, 0, 0, 0);

    const resolvedOutletId = outletId || undefined;
    const resolvedDeviceIdFinal = resolvedDeviceId || undefined;
    const notifyVelocity = (
      scope: string,
      count: number,
      limit: number,
      notifyAdmin = false,
    ) => {
      this.metrics.inc('antifraud_velocity_block_total', {
        scope,
        operation: isCommit ? 'commit' : 'refund',
      });
      if (notifyAdmin) {
        try {
          this.alerts
            .antifraudBlocked({
              merchantId,
              reason: 'velocity',
              scope,
              ctx: {
                customerId,
                outletId: resolvedOutletId,
                staffId,
                deviceId: resolvedDeviceIdFinal,
                count,
                limit,
              },
            })
            .catch(() => {});
        } catch {}
      }
      try {
        this.staffNotify
          .enqueueEvent(merchantId, {
            kind: 'FRAUD',
            reason: 'velocity',
            scope,
            operation: isCommit ? 'commit' : 'refund',
            customerId: customerId ?? null,
            outletId: resolvedOutletId ?? null,
            staffId: staffId ?? null,
            deviceId: resolvedDeviceIdFinal ?? null,
            at: new Date().toISOString(),
            count,
            limit,
          })
          .catch(() => {});
      } catch {}
    };

    const block = (
      scope: string,
      count: number,
      limit: number,
      notifyAdmin = false,
    ) => {
      notifyVelocity(scope, count, limit, notifyAdmin);
      throw new HttpException(
        `Антифрод: превышен лимит операций (${scope}=${count}/${limit})`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    };

    // Merchant-level
    {
      const resetAt = resolveReset('merchant');
      const from = clampStart(
        new Date(now - limits.merchant.windowSec * 1000),
        resetAt,
      );
      const count = await this.prisma.transaction.count({
        where: { merchantId, createdAt: { gte: from } },
      });
      if (count >= limits.merchant.limit)
        block('merchant', count, limits.merchant.limit, false);
      if (limits.merchant.dailyCap && limits.merchant.dailyCap > 0) {
        const since = clampStart(since24h, resetAt);
        const daily = await this.prisma.transaction.count({
          where: { merchantId, createdAt: { gte: since } },
        });
        if (daily >= limits.merchant.dailyCap)
          block('merchant_daily', daily, limits.merchant.dailyCap, false);
      }
      if (limits.merchant.weeklyCap && limits.merchant.weeklyCap > 0) {
        const since = clampStart(startOfWeek, resetAt);
        const weekly = await this.prisma.transaction.count({
          where: { merchantId, createdAt: { gte: since } },
        });
        if (weekly >= limits.merchant.weeklyCap)
          block('merchant_weekly', weekly, limits.merchant.weeklyCap, false);
      }
    }

    // Outlet-level (if known)
    if (resolvedOutletId) {
      const resetAt = resolveReset('outlet', resolvedOutletId);
      const from = clampStart(
        new Date(now - limits.outlet.windowSec * 1000),
        resetAt,
      );
      const count = await this.prisma.transaction.count({
        where: {
          merchantId,
          outletId: resolvedOutletId,
          createdAt: { gte: from },
        },
      });
      if (count >= limits.outlet.limit)
        block('outlet', count, limits.outlet.limit, false);
      if (limits.outlet.dailyCap && limits.outlet.dailyCap > 0) {
        const since = clampStart(since24h, resetAt);
        const daily = await this.prisma.transaction.count({
          where: {
            merchantId,
            outletId: resolvedOutletId,
            createdAt: { gte: since },
          },
        });
        if (daily >= limits.outlet.dailyCap)
          block('outlet_daily', daily, limits.outlet.dailyCap, false);
      }
      if (limits.outlet.weeklyCap && limits.outlet.weeklyCap > 0) {
        const since = clampStart(startOfWeek, resetAt);
        const weekly = await this.prisma.transaction.count({
          where: {
            merchantId,
            outletId: resolvedOutletId,
            createdAt: { gte: since },
          },
        });
        if (weekly >= limits.outlet.weeklyCap)
          block('outlet_weekly', weekly, limits.outlet.weeklyCap, false);
      }
    }

    // Device-level (if known)
    if (resolvedDeviceIdFinal) {
      const resetAt = resolveReset('device', resolvedDeviceIdFinal);
      const from = clampStart(
        new Date(now - limits.device.windowSec * 1000),
        resetAt,
      );
      const count = await this.prisma.transaction.count({
        where: {
          merchantId,
          deviceId: resolvedDeviceIdFinal,
          createdAt: { gte: from },
        },
      });
      if (count >= limits.device.limit)
        block('device', count, limits.device.limit, false);
      if (limits.device.dailyCap && limits.device.dailyCap > 0) {
        const since = clampStart(since24h, resetAt);
        const daily = await this.prisma.transaction.count({
          where: {
            merchantId,
            deviceId: resolvedDeviceIdFinal,
            createdAt: { gte: since },
          },
        });
        if (daily >= limits.device.dailyCap)
          block('device_daily', daily, limits.device.dailyCap, false);
      }
      if (limits.device.weeklyCap && limits.device.weeklyCap > 0) {
        const since = clampStart(startOfWeek, resetAt);
        const weekly = await this.prisma.transaction.count({
          where: {
            merchantId,
            deviceId: resolvedDeviceIdFinal,
            createdAt: { gte: since },
          },
        });
        if (weekly >= limits.device.weeklyCap)
          block('device_weekly', weekly, limits.device.weeklyCap, false);
      }
    }

    // Staff-level (if known)
    if (staffId) {
      const resetAt = resolveReset('staff', staffId);
      const from = clampStart(
        new Date(now - limits.staff.windowSec * 1000),
        resetAt,
      );
      const count = await this.prisma.transaction.count({
        where: { merchantId, staffId, createdAt: { gte: from } },
      });
      if (count >= limits.staff.limit)
        block('staff', count, limits.staff.limit, false);
      if (limits.staff.dailyCap && limits.staff.dailyCap > 0) {
        const since = clampStart(since24h, resetAt);
        const daily = await this.prisma.transaction.count({
          where: { merchantId, staffId, createdAt: { gte: since } },
        });
        if (daily >= limits.staff.dailyCap)
          block('staff_daily', daily, limits.staff.dailyCap, false);
      }
      if (limits.staff.weeklyCap && limits.staff.weeklyCap > 0) {
        const since = clampStart(startOfWeek, resetAt);
        const weekly = await this.prisma.transaction.count({
          where: { merchantId, staffId, createdAt: { gte: since } },
        });
        if (weekly >= limits.staff.weeklyCap)
          block('staff_weekly', weekly, limits.staff.weeklyCap, false);
      }
    }

    // Customer-level only for commit (refund может не иметь customerId)
    if (isCommit && customerId) {
      const resetAt = resolveReset('customer', customerId);
      const platformCustomerLimit = Number(platformCustomer.limit);
      const platformCustomerWindow = Number(platformCustomer.windowSec);
      const enforcePlatformVelocity =
        Number.isFinite(platformCustomerLimit) &&
        platformCustomerLimit > 0 &&
        Number.isFinite(platformCustomerWindow) &&
        platformCustomerWindow > 0;
      if (enforcePlatformVelocity) {
        const from = clampStart(
          new Date(now - platformCustomerWindow * 1000),
          resetAt,
        );
        const count = await this.prisma.transaction.count({
          where: { merchantId, customerId, createdAt: { gte: from } },
        });
        if (count >= platformCustomerLimit) {
          block('customer', count, platformCustomerLimit, true);
        }
      }

      const enforceMerchantVelocity =
        Number.isFinite(limits.customer.limit) &&
        limits.customer.limit > 0 &&
        Number.isFinite(limits.customer.windowSec) &&
        limits.customer.windowSec > 0 &&
        !(
          limits.customer.limit === platformCustomerLimit &&
          limits.customer.windowSec === platformCustomerWindow
        );
      if (enforceMerchantVelocity) {
        const from = clampStart(
          new Date(now - limits.customer.windowSec * 1000),
          resetAt,
        );
        const count = await this.prisma.transaction.count({
          where: { merchantId, customerId, createdAt: { gte: from } },
        });
        if (count >= limits.customer.limit) {
          block('customer', count, limits.customer.limit, false);
        }
      }

      const platformDailyCap = Number(platformCustomer.dailyCap);
      const merchantDailyCap = Number(limits.customer.dailyCap);
      const enforcePlatformDailyCap =
        Number.isFinite(platformDailyCap) && platformDailyCap > 0;
      const enforceMerchantDailyCap =
        Number.isFinite(merchantDailyCap) && merchantDailyCap > 0;

      if (enforcePlatformDailyCap || enforceMerchantDailyCap) {
        const since = clampStart(since24h, resetAt);
        const daily = await this.prisma.transaction.count({
          where: { merchantId, customerId, createdAt: { gte: since } },
        });
        // 1) Жёсткий лимит платформы: AF_DAILY_CAP_CUSTOMER
        if (enforcePlatformDailyCap && daily >= platformDailyCap) {
          block('customer_daily', daily, platformDailyCap, true);
        }
        // 2) Мерчантский лимит + blockDaily (может быть ниже админского)
        if (enforceMerchantDailyCap && daily >= merchantDailyCap) {
          if (limits.customer.blockDaily) {
            block('customer_daily', daily, merchantDailyCap, false);
          } else {
            notifyVelocity('customer_daily', daily, merchantDailyCap, false);
          }
        }
      }

      const platformWeeklyCap = Number(platformCustomer.weeklyCap);
      const merchantWeeklyCap = Number(limits.customer.weeklyCap);
      const enforcePlatformWeeklyCap =
        Number.isFinite(platformWeeklyCap) && platformWeeklyCap > 0;
      if (enforcePlatformWeeklyCap) {
        const since = clampStart(startOfWeek, resetAt);
        const weekly = await this.prisma.transaction.count({
          where: { merchantId, customerId, createdAt: { gte: since } },
        });
        if (weekly >= platformWeeklyCap) {
          block('customer_weekly', weekly, platformWeeklyCap, true);
        }
      }
      const enforceMerchantWeeklyCap =
        Number.isFinite(merchantWeeklyCap) &&
        merchantWeeklyCap > 0 &&
        merchantWeeklyCap !== platformWeeklyCap;
      if (enforceMerchantWeeklyCap) {
        const since = clampStart(startOfWeek, resetAt);
        const weekly = await this.prisma.transaction.count({
          where: { merchantId, customerId, createdAt: { gte: since } },
        });
        if (weekly >= merchantWeeklyCap) {
          block('customer_weekly', weekly, merchantWeeklyCap, false);
        }
      }
      if (limits.customer.monthlyCap && limits.customer.monthlyCap > 0) {
        const monthAgo = clampStart(
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          resetAt,
        );
        const monthly = await this.prisma.transaction.count({
          where: { merchantId, customerId, createdAt: { gte: monthAgo } },
        });
        if (monthly >= limits.customer.monthlyCap)
          notifyVelocity(
            'customer_monthly',
            monthly,
            limits.customer.monthlyCap,
            false,
          );
      }
    }

    // Deep antifraud scoring (commit only, when hold context is known)
    if (isCommit) {
      try {
        const holdId = asString(body?.holdId);
        if (holdId) {
          const hold = await this.prisma.hold.findUnique({
            where: { id: holdId },
          });
          if (hold && hold.customerId && hold.merchantId) {
            const ipAddr =
              req.ip || req.ips?.[0] || req.socket?.remoteAddress || undefined;
            const ua = getHeader(req, 'user-agent');
            const ctx = {
              merchantId: hold.merchantId,
              customerId: hold.customerId,
              amount:
                hold.mode === 'REDEEM'
                  ? Math.abs(hold.redeemAmount || 0)
                  : Math.abs(hold.earnPoints || 0),
              type:
                hold.mode === 'REDEEM'
                  ? ('REDEEM' as const)
                  : ('EARN' as const),
              outletId: hold.outletId || undefined,
              staffId: hold.staffId || undefined,
              deviceId: hold.deviceId || resolvedDeviceIdFinal || undefined,
              ipAddress: ipAddr,
              userAgent: ua,
            };
            if (
              hold.mode === 'EARN' &&
              limits.customer.pointsCap &&
              limits.customer.pointsCap > 0
            ) {
              const earnPoints = Math.abs(Number(hold.earnPoints ?? 0));
              if (earnPoints > limits.customer.pointsCap) {
                this.metrics.inc('antifraud_blocked_total', {
                  level: 'LIMIT',
                  reason: 'points_cap',
                });
                try {
                  this.staffNotify
                    .enqueueEvent(hold.merchantId, {
                      kind: 'FRAUD',
                      reason: 'factor',
                      scope: 'points_cap',
                      amount: earnPoints,
                      customerId: hold.customerId ?? null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? resolvedDeviceIdFinal ?? null,
                      operation: isCommit ? 'commit' : 'refund',
                      at: new Date().toISOString(),
                      limit: limits.customer.pointsCap,
                    })
                    .catch(() => {});
                } catch {}
              }
            }
            // Быстрая проверка факторной блокировки: no_outlet_id
            try {
              const s = await this.prisma.merchantSettings.findUnique({
                where: { merchantId: hold.merchantId },
              });
              const blockFactors = readBlockFactors(s?.rulesJson);
              const hasOutletRule = blockFactors.includes('no_outlet_id');
              const hasDeviceRule = blockFactors.includes('no_device_id');
              const hasStaffRule = blockFactors.includes('no_staff_id');
              const shouldApplyNoOutlet = hasOutletRule && !hold.outletId;
              const shouldApplyNoDevice =
                hasDeviceRule && !(hold.deviceId || resolvedDeviceIdFinal);
              const shouldApplyNoStaff = hasStaffRule && !staffId;
              if (shouldApplyNoOutlet) {
                const factor = 'no_outlet_id';
                this.metrics.inc('antifraud_block_factor_total', { factor });
                try {
                  this.staffNotify
                    .enqueueEvent(hold.merchantId, {
                      kind: 'FRAUD',
                      reason: 'factor',
                      scope: factor,
                      operation: isCommit ? 'commit' : 'refund',
                      customerId: hold.customerId ?? null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? resolvedDeviceIdFinal ?? null,
                      at: new Date().toISOString(),
                    })
                    .catch(() => {});
                } catch {}
              }
              if (shouldApplyNoDevice) {
                const factor = 'no_device_id';
                this.metrics.inc('antifraud_block_factor_total', { factor });
                try {
                  this.staffNotify
                    .enqueueEvent(hold.merchantId, {
                      kind: 'FRAUD',
                      reason: 'factor',
                      scope: factor,
                      operation: isCommit ? 'commit' : 'refund',
                      customerId: hold.customerId ?? null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? resolvedDeviceIdFinal ?? null,
                      at: new Date().toISOString(),
                    })
                    .catch(() => {});
                } catch {}
              }
              if (shouldApplyNoStaff) {
                const factor = 'no_staff_id';
                this.metrics.inc('antifraud_block_factor_total', { factor });
                try {
                  this.staffNotify
                    .enqueueEvent(hold.merchantId, {
                      kind: 'FRAUD',
                      reason: 'factor',
                      scope: factor,
                      operation: isCommit ? 'commit' : 'refund',
                      customerId: hold.customerId ?? null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? resolvedDeviceIdFinal ?? null,
                      at: new Date().toISOString(),
                    })
                    .catch(() => {});
                } catch {}
              }
            } catch (e) {
              if (e instanceof HttpException) throw e;
            }
            const score = await this.antifraud.checkTransaction(ctx);
            this.metrics.inc('antifraud_check_total', {
              operation: isCommit ? 'commit' : 'refund',
            });
            this.metrics.inc('antifraud_risk_level_total', {
              level: String(score.level || 'UNKNOWN'),
            });
            // Сохраним запись о проверке (для истории/аналитики)
            try {
              await this.antifraud.recordFraudCheck(ctx, score, undefined);
            } catch {}
            if (score.shouldBlock) {
              this.metrics.inc('antifraud_blocked_total', {
                level: score.level,
                reason: 'risk',
              });
              try {
                this.staffNotify
                  .enqueueEvent(hold.merchantId, {
                    kind: 'FRAUD',
                    reason: 'risk',
                    level: String(score.level),
                    customerId: hold.customerId ?? null,
                    outletId: hold.outletId ?? null,
                    staffId: hold.staffId ?? null,
                    deviceId: hold.deviceId ?? resolvedDeviceIdFinal ?? null,
                    operation: isCommit ? 'commit' : 'refund',
                    at: new Date().toISOString(),
                  })
                  .catch(() => {});
              } catch {}
            }
            // Правила блокировки по факторам (rulesJson.af.blockFactors: string[])
            let blockFactors: string[] = [];
            try {
              const s = await this.prisma.merchantSettings.findUnique({
                where: { merchantId: hold.merchantId },
              });
              blockFactors = readBlockFactors(s?.rulesJson);
            } catch {}
            if (blockFactors.length && Array.isArray(score.factors)) {
              const factorKeys = score.factors.map((factor) => {
                const key = String(factor || '').split(':')[0];
                return key;
              });
              const matched = factorKeys.find((f: string) =>
                blockFactors.includes(f),
              );
              if (matched) {
                this.metrics.inc('antifraud_block_factor_total', {
                  factor: matched,
                });
                try {
                  this.staffNotify
                    .enqueueEvent(hold.merchantId, {
                      kind: 'FRAUD',
                      reason: 'factor',
                      scope: matched,
                      customerId: hold.customerId ?? null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? resolvedDeviceIdFinal ?? null,
                      operation: isCommit ? 'commit' : 'refund',
                      at: new Date().toISOString(),
                    })
                    .catch(() => {});
                } catch {}
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
