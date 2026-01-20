import { Injectable, Logger } from '@nestjs/common';
import { Prisma, StaffOutletAccessStatus, StaffStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';

type CacheEntry<T> = {
  value: T | null;
  expiresAt: number;
};

export type MerchantSettingsSnapshot = {
  merchantId: string;
  rulesJson: Prisma.JsonValue | null;
  requireJwtForQuote: boolean;
  telegramBotToken: string | null;
  telegramStartParamRequired: boolean;
  qrTtlSec: number | null;
  webhookSecret: string | null;
  webhookKeyId: string | null;
  useWebhookNext: boolean;
  webhookSecretNext: string | null;
  webhookKeyIdNext: string | null;
};

export type OutletSnapshot = {
  id: string;
  merchantId: string;
  name: string | null;
};

export type StaffSnapshot = {
  id: string;
  merchantId: string;
  status: StaffStatus;
  firstName: string | null;
  lastName: string | null;
  login: string | null;
  email: string | null;
  allowedOutletId: string | null;
  accessOutletIds: string[];
};

@Injectable()
export class LookupCacheService {
  private readonly logger = new Logger(LookupCacheService.name);
  private readonly settingsCache = new Map<
    string,
    CacheEntry<MerchantSettingsSnapshot>
  >();
  private readonly outletCache = new Map<string, CacheEntry<OutletSnapshot>>();
  private readonly staffCache = new Map<string, CacheEntry<StaffSnapshot>>();
  private readonly maxEntries: number;
  private readonly settingsTtlMs: number;
  private readonly outletTtlMs: number;
  private readonly staffTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {
    const max = this.config.getNumber('CACHE_MAX_ENTRIES', 5000) ?? 5000;
    this.maxEntries = Math.max(100, Math.floor(max));
    const settingsTtl =
      this.config.getNumber('CACHE_TTL_SETTINGS_MS', 30000) ?? 30000;
    const outletTtl =
      this.config.getNumber('CACHE_TTL_OUTLET_MS', 30000) ?? 30000;
    const staffTtl =
      this.config.getNumber('CACHE_TTL_STAFF_MS', 15000) ?? 15000;
    this.settingsTtlMs = Math.max(1000, Math.floor(settingsTtl));
    this.outletTtlMs = Math.max(1000, Math.floor(outletTtl));
    this.staffTtlMs = Math.max(1000, Math.floor(staffTtl));
  }

  private readCache<T>(
    map: Map<string, CacheEntry<T>>,
    key: string,
  ): T | null | undefined {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCache<T>(
    map: Map<string, CacheEntry<T>>,
    key: string,
    value: T | null,
    ttlMs: number,
  ) {
    map.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (map.size > this.maxEntries) {
      this.prune(map);
    }
  }

  private prune<T>(map: Map<string, CacheEntry<T>>) {
    const now = Date.now();
    for (const [key, entry] of map.entries()) {
      if (entry.expiresAt <= now) {
        map.delete(key);
      }
    }
    if (map.size > this.maxEntries) {
      map.clear();
      this.logger.warn('Cache cleared due to size limit');
    }
  }

  private settingsKey(merchantId: string) {
    return `settings:${merchantId}`;
  }

  private outletKey(merchantId: string, outletId: string) {
    return `outlet:${merchantId}:${outletId}`;
  }

  private staffKey(merchantId: string, staffId: string) {
    return `staff:${merchantId}:${staffId}`;
  }

  invalidateSettings(merchantId: string) {
    this.settingsCache.delete(this.settingsKey(merchantId));
  }

  invalidateOutlet(merchantId: string, outletId?: string) {
    if (outletId) {
      this.outletCache.delete(this.outletKey(merchantId, outletId));
      return;
    }
    const prefix = `outlet:${merchantId}:`;
    for (const key of this.outletCache.keys()) {
      if (key.startsWith(prefix)) {
        this.outletCache.delete(key);
      }
    }
  }

  invalidateStaff(merchantId: string, staffId?: string) {
    if (staffId) {
      this.staffCache.delete(this.staffKey(merchantId, staffId));
      return;
    }
    const prefix = `staff:${merchantId}:`;
    for (const key of this.staffCache.keys()) {
      if (key.startsWith(prefix)) {
        this.staffCache.delete(key);
      }
    }
  }

  async getMerchantSettings(
    merchantId: string,
  ): Promise<MerchantSettingsSnapshot | null> {
    const key = this.settingsKey(merchantId);
    const cached = this.readCache(this.settingsCache, key);
    if (cached !== undefined) return cached;

    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: {
        rulesJson: true,
        requireJwtForQuote: true,
        telegramBotToken: true,
        telegramStartParamRequired: true,
        qrTtlSec: true,
        webhookSecret: true,
        webhookKeyId: true,
        useWebhookNext: true,
        webhookSecretNext: true,
        webhookKeyIdNext: true,
      },
    });
    const value: MerchantSettingsSnapshot | null = settings
      ? {
          merchantId,
          rulesJson: settings.rulesJson ?? null,
          requireJwtForQuote: Boolean(settings.requireJwtForQuote),
          telegramBotToken: settings.telegramBotToken ?? null,
          telegramStartParamRequired: Boolean(
            settings.telegramStartParamRequired,
          ),
          qrTtlSec: settings.qrTtlSec ?? null,
          webhookSecret: settings.webhookSecret ?? null,
          webhookKeyId: settings.webhookKeyId ?? null,
          useWebhookNext: Boolean(settings.useWebhookNext),
          webhookSecretNext: settings.webhookSecretNext ?? null,
          webhookKeyIdNext: settings.webhookKeyIdNext ?? null,
        }
      : null;
    this.setCache(this.settingsCache, key, value, this.settingsTtlMs);
    return value;
  }

  async getOutlet(
    merchantId: string,
    outletId: string,
  ): Promise<OutletSnapshot | null> {
    const key = this.outletKey(merchantId, outletId);
    const cached = this.readCache(this.outletCache, key);
    if (cached !== undefined) return cached;

    const outlet = await this.prisma.outlet.findFirst({
      where: { id: outletId, merchantId },
      select: { id: true, merchantId: true, name: true },
    });
    const value: OutletSnapshot | null = outlet
      ? {
          id: outlet.id,
          merchantId: outlet.merchantId,
          name: outlet.name ?? null,
        }
      : null;
    this.setCache(this.outletCache, key, value, this.outletTtlMs);
    return value;
  }

  async getStaff(
    merchantId: string,
    staffId: string,
  ): Promise<StaffSnapshot | null> {
    const key = this.staffKey(merchantId, staffId);
    const cached = this.readCache(this.staffCache, key);
    if (cached !== undefined) return cached;

    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, merchantId, status: StaffStatus.ACTIVE },
      select: {
        id: true,
        merchantId: true,
        status: true,
        firstName: true,
        lastName: true,
        login: true,
        email: true,
        allowedOutletId: true,
        accesses: {
          where: { status: StaffOutletAccessStatus.ACTIVE },
          select: { outletId: true },
        },
      },
    });
    const value: StaffSnapshot | null = staff
      ? {
          id: staff.id,
          merchantId: staff.merchantId,
          status: staff.status,
          firstName: staff.firstName ?? null,
          lastName: staff.lastName ?? null,
          login: staff.login ?? null,
          email: staff.email ?? null,
          allowedOutletId: staff.allowedOutletId ?? null,
          accessOutletIds: Array.isArray(staff.accesses)
            ? staff.accesses
                .map((a) => a.outletId)
                .filter((id): id is string => Boolean(id))
            : [],
        }
      : null;
    this.setCache(this.staffCache, key, value, this.staffTtlMs);
    return value;
  }
}
