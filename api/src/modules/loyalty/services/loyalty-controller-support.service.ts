import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomInt } from 'crypto';
import {
  Prisma,
  PromotionRewardType,
  PromotionStatus,
  WalletType,
} from '@prisma/client';
import type { Customer, MerchantSettings } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { normalizePhoneE164 } from '../../../shared/common/phone.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { getRulesRoot, getRulesSection } from '../../../shared/rules-json.util';
import { looksLikeJwt, verifyQrToken } from '../utils/token.util';
import { CustomerProfileDto } from '../dto/dto';
import {
  asRecord,
  readErrorCode,
  readErrorMessage,
  readString,
} from '../controllers/loyalty-controller.utils';

// После рефакторинга Customer = per-merchant (бывший Customer)
type CustomerRecord = Customer & {
  profileName?: string | null;
  profileGender?: string | null;
  profileBirthDate?: Date | null;
  profileCompletedAt?: Date | null;
};

type EarnLotClient = { earnLot?: PrismaService['earnLot'] };

@Injectable()
export class LoyaltyControllerSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LookupCacheService,
    private readonly config: AppConfigService,
  ) {}

  async resolveOutlet(merchantId?: string, outletId?: string | null) {
    if (!merchantId) return null;
    if (outletId) {
      try {
        const found = await this.cache.getOutlet(merchantId, outletId);
        if (found) return found;
      } catch (err) {
        logIgnoredError(
          err,
          'LoyaltyControllerSupportService resolve outlet',
          undefined,
          'debug',
        );
      }
    }

    return null;
  }

  readCookie(req: Request, name: string): string | null {
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

  writeCashierSessionCookie(res: Response, token: string, maxAgeMs: number) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_session', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, Math.trunc(maxAgeMs)),
    });
  }

  hashIdempotencyPayload(payload: Record<string, unknown>): string {
    return createHash('sha256')
      .update(this.stableIdempotencyStringify(payload))
      .digest('hex');
  }

  clearCashierSessionCookie(res: Response) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_session', '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  writeCashierDeviceCookie(res: Response, token: string, maxAgeMs: number) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_device', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, Math.trunc(maxAgeMs)),
    });
  }

  clearCashierDeviceCookie(res: Response) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_device', '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  assertCashierOrigin(req: Request) {
    const originHeader =
      typeof req?.headers?.origin === 'string' ? req.headers.origin : '';
    const refererHeader =
      typeof req?.headers?.referer === 'string' ? req.headers.referer : '';
    if (!originHeader && !refererHeader) return;
    let origin = originHeader;
    if (!origin && refererHeader) {
      try {
        origin = new URL(refererHeader).origin;
      } catch (err) {
        logIgnoredError(
          err,
          'LoyaltyControllerSupportService parse referer origin',
          undefined,
          'debug',
        );
        origin = '';
      }
    }
    if (!origin) return;
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyControllerSupportService parse origin host',
        undefined,
        'debug',
      );
      originHost = '';
    }
    const requestHost = String(req.headers.host || '');
    if (originHost && requestHost && originHost === requestHost) return;
    const allowedOrigins = this.resolveCashierAllowedOrigins();
    if (allowedOrigins.length && allowedOrigins.includes(origin)) return;
    throw new ForbiddenException('Invalid origin');
  }

  resolveClientIp(req: Request): string | null {
    const ip =
      req.ip ||
      req.ips?.[0] ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress;
    return ip ? String(ip) : null;
  }

  normalizePhoneStrict(phone?: string): string {
    if (!phone) throw new BadRequestException('phone required');
    const normalized = normalizePhoneE164(phone);
    if (!normalized) throw new BadRequestException('invalid phone');
    return normalized;
  }

  resolvePromotionExpireDays(promo: {
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

  getEarnLotDelegate(client: EarnLotClient): EarnLotClient['earnLot'] | null {
    return client.earnLot ?? null;
  }

  // Проверка, что customer принадлежит merchant
  async ensureCustomer(
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

  async ensureCustomerByTelegram(
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

  toProfileDto(customer: CustomerRecord): CustomerProfileDto {
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

  async listPromotionsForCustomer(merchantId: string, customerId: string) {
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

  async fetchCustomerProfileFlags(
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
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyControllerSupportService fetchCustomerProfileFlags',
        undefined,
        'debug',
      );
      return { hasPhone: false, onboarded: false };
    }
  }

  async buildReviewsShareSettings(
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

  buildShareOptions(
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

  async mintShortCode(
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
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyControllerSupportService cleanup nonces',
        undefined,
        'debug',
      );
    }
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

  async resolveFromToken(userToken: string) {
    if (looksLikeJwt(userToken)) {
      const envSecret = this.config.getQrJwtSecret() || '';
      if (
        !envSecret ||
        (this.config.isProduction() && envSecret === 'dev_change_me')
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
        } catch (err) {
          logIgnoredError(
            err,
            'LoyaltyControllerSupportService delete nonce',
            undefined,
            'debug',
          );
        }
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

  getQrModeError(
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

  private shouldUseSecureCookies(): boolean {
    const configured = this.config.getCookieSecure();
    if (configured !== undefined) return configured;
    return this.config.isProduction();
  }

  private resolveCashierAllowedOrigins(): string[] {
    const raw = this.config.getCorsOrigins();
    if (raw.length) return raw;
    if (this.config.isProduction()) return [];
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

  private stableIdempotencyStringify(value: unknown): string {
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

  private computeProfileFlags(data: {
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

  private normalizeShortCode(userToken: string): string | null {
    if (!userToken) return null;
    const compact = userToken.replace(/\s+/g, '');
    return /^\d{9}$/.test(compact) ? compact : null;
  }
}
