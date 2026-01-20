import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { LoyaltyService } from '../services/loyalty.service';
import { CustomerProfileDto } from '../dto/dto';
import { createHash, randomInt } from 'crypto';
import { looksLikeJwt, verifyQrToken } from '../utils/token.util';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import type { Request, Response } from 'express';
import { getRulesRoot, getRulesSection } from '../../../shared/rules-json.util';
import type { MerchantSettings, Customer } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  WalletType,
  PromotionStatus,
  PromotionRewardType,
} from '@prisma/client';

// После рефакторинга Customer = per-merchant (бывший Customer)
export type CustomerRecord = Customer & {
  profileName?: string | null;
  profileGender?: string | null;
  profileBirthDate?: Date | null;
  profileCompletedAt?: Date | null;
};

export const ALL_CUSTOMERS_SEGMENT_KEY = 'all-customers';

export type CommitOptions = NonNullable<Parameters<LoyaltyService['commit']>[4]>;
export type CashierSessionInfo = {
  merchantId?: string | null;
  outletId?: string | null;
  staffId?: string | null;
};
export type CashierRequest = Request & { cashierSession?: CashierSessionInfo };
export type TeleauthRequest = Request & { teleauth?: { customerId?: string | null } };
export type RequestWithRequestId = Request & { requestId?: string };
export type OptionalEarnLotClient = { earnLot?: PrismaService['earnLot'] };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

export const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export const readErrorCode = (err: unknown): string => {
  const record = asRecord(err);
  const code = record?.code;
  if (typeof code === 'string') return code;
  const name = record?.name;
  return typeof name === 'string' ? name : '';
};

export const readErrorMessage = (err: unknown): string => {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  const record = asRecord(err);
  const message = record?.message;
  if (typeof message === 'string') return message;
  if (typeof err === 'number' || typeof err === 'boolean' || err == null) {
    return String(err ?? '');
  }
  return '';
};

export class LoyaltyControllerBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly cache: LookupCacheService,
  ) {}

  protected async resolveOutlet(merchantId?: string, outletId?: string | null) {
    if (!merchantId) return null;
    if (outletId) {
      try {
        const found = await this.cache.getOutlet(merchantId, outletId);
        if (found) return found;
      } catch {}
    }

    return null;
  }

  protected readCookie(req: Request, name: string): string | null {
    const header = req?.headers?.cookie;
    if (!header || typeof header !== 'string') return null;
    const parts = header.split(';');
    for (const part of parts) {
      const [rawKey, ...rest] = part.split('=');
      if (!rawKey) continue;
      const key = rawKey.trim();
      if (key === name) {
        const value = rest.join('=').trim();
        return decodeURIComponent(value || '');
      }
    }
    return null;
  }

  protected shouldUseSecureCookies(): boolean {
    const raw = (process.env.COOKIE_SECURE || '').trim().toLowerCase();
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return process.env.NODE_ENV === 'production';
  }

  protected writeCashierSessionCookie(
    res: Response,
    token: string,
    maxAgeMs: number,
  ) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_session', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, Math.trunc(maxAgeMs)),
    });
  }

  protected stableIdempotencyStringify(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value
        .map((item) => this.stableIdempotencyStringify(item))
        .join(',')}]`;
    }
    const record = asRecord(value) ?? {};
    const keys = Object.keys(record).sort();
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${this.stableIdempotencyStringify(
            record[key],
          )}`,
      )
      .join(',')}}`;
  }

  protected hashIdempotencyPayload(payload: Record<string, unknown>): string {
    return createHash('sha256')
      .update(this.stableIdempotencyStringify(payload))
      .digest('hex');
  }

  protected clearCashierSessionCookie(res: Response) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_session', '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  protected writeCashierDeviceCookie(
    res: Response,
    token: string,
    maxAgeMs: number,
  ) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_device', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, Math.trunc(maxAgeMs)),
    });
  }

  protected clearCashierDeviceCookie(res: Response) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_device', '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  protected resolveCashierAllowedOrigins(): string[] {
    const raw = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (raw.length) return raw;
    if (process.env.NODE_ENV === 'production') return [];
    return [
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3002',
      'http://localhost:3003',
      'http://127.0.0.1:3003',
      'http://localhost:3004',
      'http://127.0.0.1:3004',
    ];
  }

  protected assertCashierOrigin(req: Request) {
    const originHeader =
      typeof req?.headers?.origin === 'string' ? req.headers.origin : '';
    const refererHeader =
      typeof req?.headers?.referer === 'string' ? req.headers.referer : '';
    if (!originHeader && !refererHeader) return;
    let origin = originHeader;
    if (!origin && refererHeader) {
      try {
        origin = new URL(refererHeader).origin;
      } catch {
        origin = '';
      }
    }
    if (!origin) return;
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = '';
    }
    const requestHost = String(req.headers.host || '');
    if (originHost && requestHost && originHost === requestHost) return;
    const allowedOrigins = this.resolveCashierAllowedOrigins();
    if (allowedOrigins.length && allowedOrigins.includes(origin)) return;
    throw new ForbiddenException('Invalid origin');
  }

  protected resolveClientIp(req: Request): string | null {
    const ip =
      req.ip ||
      req.ips?.[0] ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress;
    return ip ? String(ip) : null;
  }

  protected normalizePhoneStrict(phone?: string): string {
    if (!phone) throw new BadRequestException('phone required');
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('8')) cleaned = '7' + cleaned.substring(1);
    if (cleaned.length === 10 && !cleaned.startsWith('7'))
      cleaned = '7' + cleaned;
    if (cleaned.length !== 11) throw new BadRequestException('invalid phone');
    return '+' + cleaned;
  }

  protected resolvePromotionExpireDays(promo: {
    pointsExpireInDays: number | null;
    rewardMetadata?: unknown;
    endAt?: Date | null;
  }): number | null {
    const explicit = Number(promo.pointsExpireInDays);
    if (Number.isFinite(explicit) && explicit > 0)
      return Math.max(1, Math.trunc(explicit));
    const meta = asRecord(promo.rewardMetadata);
    const metaNested = asRecord(meta?.metadata);
    const shouldExpire = Boolean(
      meta?.pointsExpire ??
        metaNested?.pointsExpire ??
        meta?.pointsExpireAfterEnd,
    );
    if (!shouldExpire) return null;
    if (promo.endAt instanceof Date) {
      const diffMs = promo.endAt.getTime() - Date.now();
      const days = Math.ceil(diffMs / 86_400_000);
      if (!Number.isFinite(days)) return null;
      return Math.max(1, days);
    }
    return null;
  }

  protected getEarnLotDelegate(
    client: OptionalEarnLotClient,
  ): OptionalEarnLotClient['earnLot'] | null {
    return client.earnLot ?? null;
  }

  // Проверка, что customer принадлежит merchant
  protected async ensureCustomer(
    merchantId: string,
    customerId: string,
  ): Promise<CustomerRecord> {
    const mid = typeof merchantId === 'string' ? merchantId.trim() : '';
    const cid = typeof customerId === 'string' ? customerId.trim() : '';
    if (!mid) throw new BadRequestException('merchantId required');
    if (!cid) throw new BadRequestException('customerId required');

    const customer = await this.prisma.customer.findUnique({
      where: { id: cid },
    });

    if (!customer || customer.merchantId !== mid) {
      throw new BadRequestException('customer not found');
    }

    return customer as CustomerRecord;
  }

  protected async ensureCustomerByTelegram(
    merchantId: string,
    tgId: string,
    _initData?: string,
  ): Promise<{ customerId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { merchantId_tgId: { merchantId, tgId } },
        select: { id: true },
      });
      if (existing) {
        const walletUpsertArgs = {
          where: {
            customerId_merchantId_type: {
              customerId: existing.id,
              merchantId,
              type: WalletType.POINTS,
            },
          },
          update: {},
          create: {
            customerId: existing.id,
            merchantId,
            type: WalletType.POINTS,
          },
        } satisfies Prisma.WalletUpsertArgs;
        await tx.wallet.upsert(walletUpsertArgs);
        await tx.customerTelegram.upsert({
          where: { merchantId_tgId: { merchantId, tgId } },
          update: { customerId: existing.id },
          create: { merchantId, tgId, customerId: existing.id },
        });
        return { customerId: existing.id };
      }

      const created = await tx.customer.create({
        data: { merchantId, tgId },
        select: { id: true },
      });

      await tx.customerTelegram.upsert({
        where: { merchantId_tgId: { merchantId, tgId } },
        update: { customerId: created.id },
        create: { merchantId, tgId, customerId: created.id },
      });

      const walletUpsertArgs = {
        where: {
          customerId_merchantId_type: {
            customerId: created.id,
            merchantId,
            type: WalletType.POINTS,
          },
        },
        update: {},
        create: {
          customerId: created.id,
          merchantId,
          type: WalletType.POINTS,
        },
      } satisfies Prisma.WalletUpsertArgs;
      await tx.wallet.upsert(walletUpsertArgs);

      return { customerId: created.id };
    });
  }

  protected toProfileDto(customer: CustomerRecord): CustomerProfileDto {
    const profileName =
      typeof customer.profileName === 'string' && customer.profileName.trim()
        ? customer.profileName.trim()
        : null;
    const rawGender = customer.gender ?? customer.profileGender ?? null;
    const gender =
      rawGender === 'male' || rawGender === 'female' ? rawGender : null;
    const rawBirthDate = customer.birthday ?? customer.profileBirthDate ?? null;
    const birthDate = rawBirthDate
      ? rawBirthDate.toISOString().slice(0, 10)
      : null;
    return {
      name: profileName ?? null,
      gender,
      birthDate,
    } satisfies CustomerProfileDto;
  }

  protected async listPromotionsForCustomer(
    merchantId: string,
    customerId: string,
  ) {
    await this.ensureCustomer(merchantId, customerId);

    const now = new Date();
    const promos = await this.prisma.loyaltyPromotion.findMany({
      where: {
        merchantId,
        status: { in: [PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED] },
        AND: [
          {
            OR: [
              { startAt: null },
              { startAt: { lte: now } },
              { status: PromotionStatus.SCHEDULED },
            ],
          },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          {
            OR: [
              { segmentId: null },
              { audience: { systemKey: 'all-customers' } },
              { audience: { rules: { path: ['kind'], equals: 'all' } } },
              {
                audience: {
                  isSystem: true,
                  rules: { path: ['kind'], equals: 'all' },
                },
              },
              {
                audience: {
                  customers: { some: { customerId } },
                },
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { metrics: true },
    });
    const rewardMetaById = new Map<
      string,
      {
        rewardMetadata: Record<string, unknown> | null;
        productIds: string[];
        categoryIds: string[];
      }
    >();
    const productIdSet = new Set<string>();
    const categoryIdSet = new Set<string>();
    for (const promo of promos) {
      const meta = asRecord(promo.rewardMetadata);
      const productIds = Array.isArray(meta?.productIds)
        ? meta.productIds
            .map((id) => String(id ?? '').trim())
            .filter((id): id is string => id.length > 0)
        : [];
      const categoryIds = Array.isArray(meta?.categoryIds)
        ? meta.categoryIds
            .map((id) => String(id ?? '').trim())
            .filter((id): id is string => id.length > 0)
        : [];
      productIds.forEach((id) => productIdSet.add(id));
      categoryIds.forEach((id) => categoryIdSet.add(id));
      rewardMetaById.set(promo.id, {
        rewardMetadata: meta,
        productIds,
        categoryIds,
      });
    }
    const productNamesById = new Map<string, string>();
    if (productIdSet.size > 0) {
      const products = await this.prisma.product.findMany({
        where: { merchantId, id: { in: Array.from(productIdSet) } },
        select: { id: true, name: true },
      });
      for (const product of products) {
        if (product?.id && product?.name) {
          productNamesById.set(product.id, product.name);
        }
      }
    }
    const categoryNamesById = new Map<string, string>();
    if (categoryIdSet.size > 0) {
      const categories = await this.prisma.productCategory.findMany({
        where: { merchantId, id: { in: Array.from(categoryIdSet) } },
        select: { id: true, name: true },
      });
      for (const category of categories) {
        if (category?.id && category?.name) {
          categoryNamesById.set(category.id, category.name);
        }
      }
    }
    const existing = await this.prisma.promotionParticipant.findMany({
      where: {
        merchantId,
        customerId,
        promotionId: { in: promos.map((p) => p.id) },
      },
      select: { promotionId: true },
    });
    const claimedSet = new Set(existing.map((e) => e.promotionId));
    return promos.map((p) => ({
      ...(() => {
        const meta = rewardMetaById.get(p.id);
        const productNames = meta?.productIds
          ? meta.productIds
              .map((id) => productNamesById.get(id))
              .filter((value): value is string => Boolean(value))
          : [];
        const categoryNames = meta?.categoryIds
          ? meta.categoryIds
              .map((id) => categoryNamesById.get(id))
              .filter((value): value is string => Boolean(value))
          : [];
        return {
          rewardMetadata: meta?.rewardMetadata ?? null,
          productNames,
          categoryNames,
        };
      })(),
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      rewardType: p.rewardType,
      rewardValue: p.rewardValue ?? null,
      startAt: p.startAt ? p.startAt.toISOString() : null,
      endAt: p.endAt ? p.endAt.toISOString() : null,
      pointsExpireInDays: p.pointsExpireInDays ?? null,
      canClaim:
        p.status === PromotionStatus.ACTIVE &&
        p.rewardType === PromotionRewardType.POINTS &&
        (p.rewardValue ?? 0) > 0 &&
        !claimedSet.has(p.id),
      claimed: claimedSet.has(p.id),
    }));
  }

  protected computeProfileFlags(data: {
    name?: string | null;
    phone?: string | null;
    gender?: string | null;
    birthday?: Date | null;
    profileCompletedAt?: Date | null;
  }) {
    const hasPhone =
      typeof data.phone === 'string' && data.phone.trim().length > 0;
    const hasName =
      typeof data.name === 'string' && data.name.trim().length > 0;
    const hasBirthDate =
      data.birthday instanceof Date && !Number.isNaN(data.birthday.getTime());
    const genderOk = data.gender === 'male' || data.gender === 'female';
    const completionOk =
      data.profileCompletedAt === undefined
        ? true
        : data.profileCompletedAt instanceof Date &&
          !Number.isNaN(data.profileCompletedAt.getTime());
    return {
      hasPhone,
      onboarded:
        hasPhone && hasName && hasBirthDate && genderOk && completionOk,
    };
  }

  protected async fetchCustomerProfileFlags(
    customerId: string,
  ): Promise<{ hasPhone: boolean; onboarded: boolean }> {
    try {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          name: true,
          profileName: true,
          phone: true,
          gender: true,
          birthday: true,
          profileGender: true,
          profileBirthDate: true,
          profileCompletedAt: true,
        },
      });
      if (!customer) return { hasPhone: false, onboarded: false };
      const resolvedName =
        typeof customer.profileName === 'string' && customer.profileName.trim()
          ? customer.profileName.trim()
          : customer.profileCompletedAt &&
              typeof customer.name === 'string' &&
              customer.name.trim()
            ? customer.name.trim()
            : null;
      return this.computeProfileFlags({
        name: resolvedName,
        phone: customer.phone ?? null,
        gender: customer.gender ?? customer.profileGender ?? null,
        birthday: customer.birthday ?? customer.profileBirthDate ?? null,
        profileCompletedAt: customer.profileCompletedAt ?? null,
      });
    } catch {
      return { hasPhone: false, onboarded: false };
    }
  }

  protected async buildReviewsShareSettings(
    merchantId: string,
    settingsHint?: Pick<MerchantSettings, 'rulesJson'> | null,
  ): Promise<{
    settings: Pick<MerchantSettings, 'rulesJson'> | null;
    share: {
      enabled: boolean;
      threshold: number;
      platforms: Array<{
        id: string;
        enabled: boolean;
        url: string | null;
        outlets: Array<{ outletId: string; url: string }>;
      }>;
    } | null;
  }> {
    const settings =
      settingsHint === undefined
        ? await this.prisma.merchantSettings.findUnique({
            where: { merchantId },
          })
        : settingsHint;
    const rules = getRulesRoot(settings?.rulesJson);
    const shareRaw = getRulesSection(rules, 'reviewsShare');

    if (!shareRaw) {
      return { settings: settings ?? null, share: null };
    }

    const platformsRaw = getRulesSection(shareRaw, 'platforms');

    const normalizePlatformOutlets = (cfg: unknown) => {
      const map = new Map<string, string>();
      const push = (outletIdRaw: unknown, value: unknown) => {
        const outletId =
          typeof outletIdRaw === 'string' ? outletIdRaw.trim() : '';
        const urlCandidate =
          typeof value === 'string'
            ? value
            : (() => {
                const record = asRecord(value);
                if (!record) return '';
                return (
                  readString(record.url) ??
                  readString(record.link) ??
                  readString(record.href) ??
                  ''
                );
              })();
        const url = typeof urlCandidate === 'string' ? urlCandidate.trim() : '';
        if (!outletId || !url) return;
        if (!map.has(outletId)) {
          map.set(outletId, url);
        }
      };
      const collect = (source: unknown) => {
        if (!source || typeof source !== 'object') return;
        if (Array.isArray(source)) {
          for (const entry of source) {
            const entryRecord = asRecord(entry);
            if (!entryRecord) continue;
            push(entryRecord.outletId ?? entryRecord.id, entryRecord);
          }
          return;
        }
        const sourceRecord = asRecord(source);
        if (!sourceRecord) return;
        for (const [key, value] of Object.entries(sourceRecord)) {
          if (typeof value === 'string') {
            push(key, value);
          } else if (value && typeof value === 'object') {
            const valueRecord = asRecord(value);
            const outletId = readString(valueRecord?.outletId) ?? key;
            push(outletId, value);
          }
        }
      };
      const cfgRecord = asRecord(cfg);
      collect(cfgRecord?.outlets);
      collect(cfgRecord?.links);
      collect(cfgRecord?.byOutlet);
      collect(cfgRecord?.urls);
      if (!map.size && cfgRecord) {
        for (const [key, value] of Object.entries(cfgRecord)) {
          if (['enabled', 'url', 'threshold', 'platforms'].includes(key))
            continue;
          if (typeof value === 'string') {
            push(key, value);
          } else if (value && typeof value === 'object') {
            push(key, value);
          }
        }
      }
      return Array.from(map.entries()).map(([outletId, url]) => ({
        outletId,
        url,
      }));
    };

    const platformConfigMap = new Map<string, Record<string, unknown>>();
    if (platformsRaw) {
      for (const [id, cfg] of Object.entries(platformsRaw)) {
        const cfgRecord = asRecord(cfg);
        if (!cfgRecord) continue;
        const normalizedId = String(id || '').trim();
        if (!normalizedId) continue;
        platformConfigMap.set(normalizedId, cfgRecord);
      }
    }

    const outletLinkMap = new Map<
      string,
      Array<{ outletId: string; url: string }>
    >();
    const pushOutletLink = (
      platformId: string,
      outletId: string,
      url: string,
    ) => {
      if (!platformId || !outletId || !url) return;
      const list = outletLinkMap.get(platformId) ?? [];
      const existingIndex = list.findIndex(
        (entry) => entry.outletId === outletId,
      );
      if (existingIndex >= 0) {
        list[existingIndex] = { outletId, url };
      } else {
        list.push({ outletId, url });
      }
      outletLinkMap.set(platformId, list);
    };

    for (const [id, cfg] of platformConfigMap.entries()) {
      const baseOutlets = normalizePlatformOutlets(cfg) ?? [];
      for (const entry of baseOutlets) {
        pushOutletLink(id, entry.outletId, entry.url);
      }
    }

    const outlets = await this.prisma.outlet.findMany({
      where: { merchantId },
      select: { id: true, reviewLinks: true },
    });

    for (const outlet of outlets) {
      const source =
        outlet.reviewLinks && typeof outlet.reviewLinks === 'object'
          ? (outlet.reviewLinks as Record<string, unknown>)
          : {};
      const links: Record<string, string> = {};
      for (const [platformIdRaw, value] of Object.entries(source)) {
        const platformId =
          typeof platformIdRaw === 'string' ? platformIdRaw.trim() : '';
        if (!platformId) continue;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed) links[platformId] = trimmed;
        }
      }
      for (const [platformIdRaw, url] of Object.entries(links)) {
        const platformId = platformIdRaw.trim();
        if (!platformId) continue;
        pushOutletLink(platformId, outlet.id, url);
      }
    }

    const orderedIds: string[] = [];
    const pushOrdered = (id: string) => {
      if (!id) return;
      if (!orderedIds.includes(id)) orderedIds.push(id);
    };
    const KNOWN_PLATFORMS = ['yandex', 'twogis', 'google'];
    KNOWN_PLATFORMS.forEach(pushOrdered);
    Array.from(platformConfigMap.keys()).forEach(pushOrdered);
    Array.from(outletLinkMap.keys()).forEach(pushOrdered);

    const shareEnabled = Boolean(shareRaw?.enabled);
    const thresholdRaw = Number(shareRaw?.threshold);
    const threshold =
      Number.isFinite(thresholdRaw) && thresholdRaw >= 1 && thresholdRaw <= 5
        ? Math.round(thresholdRaw)
        : 5;

    const platforms = orderedIds.map((id) => {
      const cfg = platformConfigMap.get(id);
      const urlRaw = readString(cfg?.url) ?? '';
      const url = urlRaw.trim() || null;
      const outletsList = outletLinkMap.get(id) ?? [];
      const hasExplicitPlatformEnabled = cfg != null && 'enabled' in cfg;
      const platformEnabled = hasExplicitPlatformEnabled
        ? Boolean(cfg?.enabled)
        : true;
      const enabled = shareEnabled && platformEnabled;
      return { id, enabled, url, outlets: outletsList };
    });

    return {
      settings: settings ?? null,
      share: {
        enabled: shareEnabled,
        threshold,
        platforms,
      },
    };
  }

  protected buildShareOptions(
    share: null | {
      enabled: boolean;
      threshold: number;
      platforms: Array<{
        id: string;
        enabled: boolean;
        url: string | null;
        outlets: Array<{ outletId: string; url: string }>;
      }>;
    },
    outletId?: string | null,
  ): Array<{ id: string; url: string }> {
    // Показывать ссылки только для конкретной торговой точки.
    // Без фоллбеков на другие точки или platform.url — строго соответствуем требованиям задачи.
    if (!share || !share.enabled) return [];
    const normalizedOutletId =
      typeof outletId === 'string' && outletId.trim() ? outletId.trim() : null;
    if (!normalizedOutletId) return [];
    const result: Array<{ id: string; url: string }> = [];
    for (const platform of share.platforms) {
      if (!platform || !platform.enabled) continue;
      const outlets = Array.isArray(platform.outlets) ? platform.outlets : [];
      const outletMatch = outlets.find(
        (item) =>
          item &&
          item.outletId === normalizedOutletId &&
          typeof item.url === 'string' &&
          item.url.trim(),
      );
      if (!outletMatch) continue;
      result.push({ id: platform.id, url: outletMatch.url.trim() });
    }
    return result;
  }

  protected normalizeShortCode(userToken: string): string | null {
    if (!userToken) return null;
    const compact = userToken.replace(/\s+/g, '');
    return /^\d{9}$/.test(compact) ? compact : null;
  }

  protected async mintShortCode(
    merchantId: string,
    customerId: string,
    ttlSec: number,
  ): Promise<string> {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + Math.max(5, ttlSec) * 1000);
    try {
      await this.prisma.qrNonce.deleteMany({
        where: {
          merchantId,
          usedAt: null,
          expiresAt: { lt: issuedAt },
        },
      });
    } catch {}
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = String(randomInt(100000000, 1000000000));
      try {
        await this.prisma.qrNonce.create({
          data: {
            jti: code,
            customerId,
            merchantId,
            issuedAt,
            expiresAt,
            usedAt: null,
          },
        });
        return code;
      } catch (err: unknown) {
        const codeHint = readErrorCode(err);
        if (
          codeHint === 'P2002' ||
          /Unique constraint/i.test(readErrorMessage(err))
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException('Failed to mint short QR code');
  }

  // Plain ID, 9-digit short code, or JWT
  protected async resolveFromToken(userToken: string) {
    if (looksLikeJwt(userToken)) {
      const envSecret = process.env.QR_JWT_SECRET || '';
      if (
        !envSecret ||
        (process.env.NODE_ENV === 'production' && envSecret === 'dev_change_me')
      ) {
        throw new BadRequestException('QR_JWT_SECRET not configured');
      }
      const secret = envSecret;
      try {
        const v = await verifyQrToken(secret, userToken);
        return { ...v, kind: 'jwt' as const };
      } catch (err: unknown) {
        const code = readErrorCode(err);
        const msg = readErrorMessage(err);
        if (
          code === 'ERR_JWT_EXPIRED' ||
          /JWTExpired/i.test(code) ||
          /"exp"/i.test(msg)
        ) {
          // отдадим 400 с предсказуемым текстом, чтобы фронт показал «QR истёк»
          throw new BadRequestException(
            'JWTExpired: "exp" claim timestamp check failed',
          );
        }
        throw new BadRequestException('Bad QR token');
      }
    }
    const shortCode = this.normalizeShortCode(userToken);
    if (shortCode) {
      const nonce = await this.prisma.qrNonce.findUnique({
        where: { jti: shortCode },
      });
      if (!nonce) {
        throw new BadRequestException('Bad QR token');
      }
      const expMs = nonce.expiresAt?.getTime?.() ?? NaN;
      if (!Number.isFinite(expMs) || expMs <= Date.now()) {
        try {
          await this.prisma.qrNonce.delete({ where: { jti: shortCode } });
        } catch {}
        throw new BadRequestException(
          'JWTExpired: "exp" claim timestamp check failed',
        );
      }
      return {
        customerId: nonce.customerId,
        merchantAud: nonce.merchantId ?? undefined,
        jti: nonce.jti,
        iat: Math.floor(nonce.issuedAt.getTime() / 1000),
        exp: Math.floor(nonce.expiresAt.getTime() / 1000),
        kind: 'short' as const,
      };
    }
    const now = Math.floor(Date.now() / 1000);
    return {
      customerId: userToken,
      merchantAud: undefined,
      jti: `plain:${userToken}:${now}`,
      iat: now,
      exp: now + 3600,
      kind: 'plain' as const,
    } as const;
  }

  protected getQrModeError(
    kind: 'jwt' | 'short' | 'plain',
    requireJwtForQuote: boolean,
  ): {
    message: string;
    reason: 'jwt_required' | 'short_code_required';
  } | null {
    if (requireJwtForQuote) {
      if (kind !== 'jwt') {
        return { message: 'JWT required for quote', reason: 'jwt_required' };
      }
      return null;
    }
    if (kind !== 'short') {
      return {
        message: 'Short QR code required',
        reason: 'short_code_required',
      };
    }
    return null;
  }
}
  
