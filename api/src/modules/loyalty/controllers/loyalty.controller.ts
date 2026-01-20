import {
  Body,
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Res,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LoyaltyService } from '../services/loyalty.service';
import { MerchantsService } from '../../merchants/merchants.service';
import {
  CommitDto,
  QrMintDto,
  QuoteDto,
  RefundDto,
  QuoteRedeemRespDto,
  QuoteEarnRespDto,
  CommitRespDto,
  RefundRespDto,
  QrMintRespDto,
  OkDto,
  BalanceDto,
  CashierOutletTransactionsRespDto,
  CashierCustomerResolveDto,
  CashierCustomerResolveRespDto,
  PublicSettingsDto,
  TransactionsRespDto,
  PublicOutletDto,
  PublicStaffDto,
  ConsentGetRespDto,
  ErrorDto,
  CustomerProfileDto,
  CustomerProfileSaveDto,
  CustomerPhoneStatusDto,
} from '../dto/dto';
import { createHash, createHmac, randomInt } from 'crypto';
import { looksLikeJwt, signQrToken, verifyQrToken } from '../utils/token.util';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { CashierGuard } from '../../../core/guards/cashier.guard';
import { AntiFraudGuard } from '../../../core/guards/antifraud.guard';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import {
  AllowInactiveSubscription,
  SubscriptionGuard,
} from '../../../core/guards/subscription.guard';
import type { Request, Response } from 'express';
import { validateTelegramInitData } from '../utils/telegram.util';
import { PromoCodesService } from '../../promocodes/promocodes.service';
import { ReviewService } from '../../reviews/review.service';
import { LevelsService } from '../../levels/levels.service';
import { getRulesRoot, getRulesSection } from '../../../shared/rules-json.util';
import type { MerchantSettings, Customer } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  LedgerAccount,
  TxnType,
  WalletType,
  PromotionStatus,
  PromotionRewardType,
} from '@prisma/client';

// После рефакторинга Customer = per-merchant (бывший Customer)
type CustomerRecord = Customer & {
  profileName?: string | null;
  profileGender?: string | null;
  profileBirthDate?: Date | null;
  profileCompletedAt?: Date | null;
};

const ALL_CUSTOMERS_SEGMENT_KEY = 'all-customers';

type CommitOptions = NonNullable<Parameters<LoyaltyService['commit']>[4]>;
type CashierSessionInfo = {
  merchantId?: string | null;
  outletId?: string | null;
  staffId?: string | null;
};
type CashierRequest = Request & { cashierSession?: CashierSessionInfo };
type TeleauthRequest = Request & { teleauth?: { customerId?: string | null } };
type RequestWithRequestId = Request & { requestId?: string };
type OptionalEarnLotClient = { earnLot?: PrismaService['earnLot'] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const readErrorCode = (err: unknown): string => {
  const record = asRecord(err);
  const code = record?.code;
  if (typeof code === 'string') return code;
  const name = record?.name;
  return typeof name === 'string' ? name : '';
};

const readErrorMessage = (err: unknown): string => {
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

@Controller('loyalty')
@UseGuards(CashierGuard, SubscriptionGuard)
@ApiTags('loyalty')
@ApiExtraModels(QuoteRedeemRespDto, QuoteEarnRespDto)
export class LoyaltyController {
  constructor(
    private readonly service: LoyaltyService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly promoCodes: PromoCodesService,
    private readonly merchants: MerchantsService,
    private readonly reviews: ReviewService,
    private readonly levelsService: LevelsService,
    private readonly cache: LookupCacheService,
  ) {}

  private async resolveOutlet(merchantId?: string, outletId?: string | null) {
    if (!merchantId) return null;
    if (outletId) {
      try {
        const found = await this.cache.getOutlet(merchantId, outletId);
        if (found) return found;
      } catch {}
    }

    return null;
  }

  private readCookie(req: Request, name: string): string | null {
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

  private shouldUseSecureCookies(): boolean {
    const raw = (process.env.COOKIE_SECURE || '').trim().toLowerCase();
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return process.env.NODE_ENV === 'production';
  }

  private writeCashierSessionCookie(
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

  private hashIdempotencyPayload(payload: Record<string, unknown>): string {
    return createHash('sha256')
      .update(this.stableIdempotencyStringify(payload))
      .digest('hex');
  }

  private clearCashierSessionCookie(res: Response) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_session', '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  private writeCashierDeviceCookie(
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

  private clearCashierDeviceCookie(res: Response) {
    const secure = this.shouldUseSecureCookies();
    res.cookie('cashier_device', '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  private resolveCashierAllowedOrigins(): string[] {
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

  private assertCashierOrigin(req: Request) {
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

  private resolveClientIp(req: Request): string | null {
    const ip =
      req.ip ||
      req.ips?.[0] ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress;
    return ip ? String(ip) : null;
  }

  private normalizePhoneStrict(phone?: string): string {
    if (!phone) throw new BadRequestException('phone required');
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('8')) cleaned = '7' + cleaned.substring(1);
    if (cleaned.length === 10 && !cleaned.startsWith('7'))
      cleaned = '7' + cleaned;
    if (cleaned.length !== 11) throw new BadRequestException('invalid phone');
    return '+' + cleaned;
  }

  private resolvePromotionExpireDays(promo: {
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

  private getEarnLotDelegate(
    client: OptionalEarnLotClient,
  ): OptionalEarnLotClient['earnLot'] | null {
    return client.earnLot ?? null;
  }

  // Проверка, что customer принадлежит merchant
  private async ensureCustomer(
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

  private async ensureCustomerByTelegram(
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

  private toProfileDto(customer: CustomerRecord): CustomerProfileDto {
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

  private async listPromotionsForCustomer(
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

  private async fetchCustomerProfileFlags(
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

  // ===== Promotions (miniapp public) =====
  @Get('promotions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async listPromotions(
    @Query('merchantId') merchantId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const mid = typeof merchantId === 'string' ? merchantId.trim() : '';
    const mcid = typeof customerId === 'string' ? customerId.trim() : '';
    if (!mid) throw new BadRequestException('merchantId required');
    if (!mcid) throw new BadRequestException('customerId required');
    return this.listPromotionsForCustomer(mid, mcid);
  }

  @Post('promotions/claim')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async claimPromotion(
    @Body()
    body: {
      merchantId?: string;
      customerId?: string;
      promotionId?: string;
      outletId?: string | null;
      staffId?: string | null;
    },
  ) {
    const merchantId =
      typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    const customerId =
      typeof body?.customerId === 'string' ? body.customerId.trim() : '';
    const promotionId =
      typeof body?.promotionId === 'string' ? body.promotionId.trim() : '';
    const outletId =
      typeof body?.outletId === 'string' && body.outletId.trim()
        ? body.outletId.trim()
        : null;
    const staffId =
      typeof body?.staffId === 'string' && body.staffId.trim()
        ? body.staffId.trim()
        : null;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');
    if (!promotionId) throw new BadRequestException('promotionId required');

    const customer = await this.ensureCustomer(merchantId, customerId);
    if (customer.accrualsBlocked) {
      throw new BadRequestException('accruals blocked');
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const promo = await tx.loyaltyPromotion.findFirst({
        where: { id: promotionId, merchantId },
      });
      if (!promo) throw new BadRequestException('promotion not found');
      if (promo.status !== PromotionStatus.ACTIVE)
        throw new BadRequestException('promotion is not active');
      if (promo.startAt && promo.startAt > now)
        throw new BadRequestException('promotion not started yet');
      if (promo.endAt && promo.endAt < now)
        throw new BadRequestException('promotion ended');
      if (promo.rewardType !== PromotionRewardType.POINTS)
        throw new BadRequestException('promotion is not points type');
      let points = Math.max(0, Math.floor(Number(promo.rewardValue ?? 0)));
      if (!Number.isFinite(points) || points <= 0)
        throw new BadRequestException('invalid reward value');

      const settings = await tx.merchantSettings.findUnique({
        where: { merchantId },
        select: { earnDailyCap: true, earnCooldownSec: true },
      });
      const earnCooldownSec = Number(settings?.earnCooldownSec ?? 0) || 0;
      if (earnCooldownSec > 0) {
        const last = await tx.transaction.findFirst({
          where: {
            merchantId,
            customerId,
            canceledAt: null,
            type: { in: [TxnType.EARN, TxnType.CAMPAIGN, TxnType.REFERRAL] },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (last) {
          const diffSec = Math.floor(
            (Date.now() - last.createdAt.getTime()) / 1000,
          );
          if (diffSec < earnCooldownSec) {
            throw new BadRequestException('earn cooldown');
          }
        }
      }

      const earnDailyCap = Number(settings?.earnDailyCap ?? 0) || 0;
      if (earnDailyCap > 0) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const usedAgg = await tx.transaction.aggregate({
          where: {
            merchantId,
            customerId,
            canceledAt: null,
            createdAt: { gte: since },
            type: { in: [TxnType.EARN, TxnType.CAMPAIGN, TxnType.REFERRAL] },
          },
          _sum: { amount: true },
        });
        const used = Math.max(0, Number(usedAgg._sum.amount ?? 0));
        const left = Math.max(0, earnDailyCap - used);
        if (left <= 0) {
          throw new BadRequestException('earn daily cap reached');
        }
        if (points > left) {
          points = left;
        }
      }

      // audience check
      if (promo.segmentId) {
        const audience = await tx.customerSegment.findUnique({
          where: { id: promo.segmentId },
          select: { systemKey: true, isSystem: true, rules: true },
        });
        const rules = asRecord(audience?.rules) ?? {};
        const isAllAudience =
          audience?.systemKey === ALL_CUSTOMERS_SEGMENT_KEY ||
          (audience?.isSystem && rules?.kind === 'all') ||
          rules?.kind === 'all';
        if (!isAllAudience) {
          const inSeg = await tx.segmentCustomer.findFirst({
            where: { segmentId: promo.segmentId, customerId },
          });
          if (!inSeg)
            throw new BadRequestException('not eligible for promotion');
        }
      }

      // idempotency: if already participated — return alreadyClaimed
      const existing = await tx.promotionParticipant.findFirst({
        where: { merchantId, promotionId, customerId },
      });
      if (existing) {
        const walletEx = await tx.wallet.findFirst({
          where: { merchantId, customerId, type: WalletType.POINTS },
        });
        return {
          ok: true,
          alreadyClaimed: true,
          promotionId,
          pointsIssued: 0,
          balance: walletEx?.balance ?? 0,
        } as const;
      }

      // Ensure wallet
      let wallet = await tx.wallet.findFirst({
        where: { merchantId, customerId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { merchantId, customerId, type: WalletType.POINTS, balance: 0 },
        });
      }

      // Update balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: points } },
      });
      const balance = updatedWallet.balance;

      // Transaction record
      await tx.transaction.create({
        data: {
          merchantId,
          customerId,
          type: TxnType.CAMPAIGN,
          amount: points,
          orderId: null,
          outletId,
          staffId,
          metadata: {
            source: 'PROMOTION',
            promotionId,
            promotionName: promo.name ?? null,
            comment: promo.name ?? null,
          },
        },
      });

      // Ledger (optional)
      if (process.env.LEDGER_FEATURE === '1') {
        await tx.ledgerEntry.create({
          data: {
            merchantId,
            customerId,
            debit: LedgerAccount.MERCHANT_LIABILITY,
            credit: LedgerAccount.CUSTOMER_BALANCE,
            amount: points,
            orderId: null,
            receiptId: null,
            outletId,
            staffId,
            meta: { mode: 'PROMOTION', promotionId },
          },
        });
        this.metrics.inc('loyalty_ledger_entries_total', { type: 'earn' });
        this.metrics.inc(
          'loyalty_ledger_amount_total',
          { type: 'earn' },
          points,
        );
      }

      // Earn lot (optional)
      const expireDays = this.resolvePromotionExpireDays(promo);
      if (process.env.EARN_LOTS_FEATURE === '1') {
        const earnLot =
          this.getEarnLotDelegate(tx) ?? this.getEarnLotDelegate(this.prisma);
        if (earnLot) {
          await earnLot.create({
            data: {
              merchantId,
              customerId,
              points,
              consumedPoints: 0,
              earnedAt: new Date(),
              maturesAt: null,
              expiresAt: expireDays
                ? new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000)
                : null,
              orderId: null,
              receiptId: null,
              outletId,
              staffId,
              status: 'ACTIVE',
            },
          });
        }
      }

      // Participant
      await tx.promotionParticipant.create({
        data: {
          promotionId,
          merchantId,
          customerId,
          outletId,
          pointsIssued: points,
        },
      });

      // Metrics
      try {
        await tx.loyaltyPromotionMetric.upsert({
          where: { promotionId },
          create: {
            promotionId,
            merchantId,
            participantsCount: 1,
            pointsIssued: points,
          },
          update: {
            participantsCount: { increment: 1 },
            pointsIssued: { increment: points },
          },
        });
      } catch {}

      this.metrics.inc('loyalty_promotions_claim_total', { result: 'ok' });
      return {
        ok: true,
        promotionId,
        pointsIssued: points,
        pointsExpireInDays: expireDays,
        pointsExpireAt: expireDays
          ? new Date(
              Date.now() + expireDays * 24 * 60 * 60 * 1000,
            ).toISOString()
          : null,
        balance,
      } as const;
    });
  }

  private async buildReviewsShareSettings(
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

  private buildShareOptions(
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

  private normalizeShortCode(userToken: string): string | null {
    if (!userToken) return null;
    const compact = userToken.replace(/\s+/g, '');
    return /^\d{9}$/.test(compact) ? compact : null;
  }

  private async mintShortCode(
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
  private async resolveFromToken(userToken: string) {
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

  private getQrModeError(
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

  @Post('reviews')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async submitReview(
    @Body()
    body: {
      merchantId?: string;
      customerId?: string;
      orderId?: string | null;
      rating?: number | string;
      comment?: string;
      title?: string;
      tags?: unknown;
      photos?: unknown;
      transactionId?: string;
      outletId?: string | null;
      staffId?: string | null;
    },
  ) {
    const merchantId =
      typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId is required');

    const customerId =
      typeof body?.customerId === 'string' ? body.customerId.trim() : '';
    if (!customerId) throw new BadRequestException('customerId is required');

    const customer = await this.ensureCustomer(merchantId, customerId);
    const settings = await this.cache.getMerchantSettings(merchantId);
    const rules = getRulesRoot(settings?.rulesJson) ?? {};
    const reviewsConfig = getRulesSection(rules, 'reviews');
    const reviewsEnabled =
      reviewsConfig && reviewsConfig.enabled !== undefined
        ? Boolean(reviewsConfig.enabled)
        : true;
    if (!reviewsEnabled) {
      throw new BadRequestException('Сбор отзывов отключен');
    }

    const ratingRaw =
      typeof body?.rating === 'string' ? Number(body.rating) : body?.rating;
    if (!Number.isFinite(ratingRaw))
      throw new BadRequestException('rating is required');
    const rating = Math.round(Number(ratingRaw));
    if (rating < 1 || rating > 5)
      throw new BadRequestException('rating must be between 1 and 5');

    const comment =
      typeof body?.comment === 'string' ? body.comment.trim() : '';
    const orderIdRaw =
      typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const orderId = orderIdRaw.length > 0 ? orderIdRaw : undefined;
    const transactionIdRaw =
      typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
    const transactionId =
      transactionIdRaw.length > 0 ? transactionIdRaw : undefined;
    const outletIdRaw =
      typeof body?.outletId === 'string' ? body.outletId.trim() : '';
    const outletId = outletIdRaw.length > 0 ? outletIdRaw : undefined;
    const staffIdRaw =
      typeof body?.staffId === 'string' ? body.staffId.trim() : '';
    const staffId = staffIdRaw.length > 0 ? staffIdRaw : undefined;
    if (!orderId && !transactionId) {
      throw new BadRequestException(
        'transactionId или orderId обязательны для отзыва',
      );
    }
    const titleRaw = typeof body?.title === 'string' ? body.title.trim() : '';
    const title = titleRaw.length > 0 ? titleRaw : undefined;
    const tags = Array.isArray(body?.tags)
      ? body.tags
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter((tag) => tag.length > 0)
      : [];
    const photos = Array.isArray(body?.photos)
      ? body.photos
          .map((photo) => (typeof photo === 'string' ? photo.trim() : ''))
          .filter((photo) => photo.length > 0)
      : [];

    const metadata: Record<string, unknown> = { source: 'loyalty-miniapp' };
    if (transactionId) {
      metadata.transactionId = transactionId;
    }
    if (outletId) {
      metadata.outletId = outletId;
    }
    if (staffId) {
      metadata.staffId = staffId;
    }

    const result = await this.reviews.createReview(
      {
        merchantId,
        customerId: customer.id,
        orderId,
        transactionId,
        rating,
        comment,
        title,
        tags,
        photos,
        isAnonymous: false,
      },
      {
        autoApprove: true,
        metadata: { ...metadata, customerId: customer.id },
      },
    );
    let sharePayload: {
      enabled: boolean;
      threshold: number;
      options: Array<{ id: string; url: string }>;
    } | null = null;
    try {
      const { share } = await this.buildReviewsShareSettings(
        merchantId,
        settings,
      );
      if (share) {
        sharePayload = {
          enabled: share.enabled,
          threshold: share.threshold,
          options: this.buildShareOptions(share, outletId ?? null),
        };
      }
    } catch {}

    // Наблюдаемость: метрика решения по второму шагу (share)
    try {
      const hasOutlet = !!outletId;
      const enabled = !!sharePayload?.enabled;
      const threshold = sharePayload?.threshold ?? 5;
      const hasOptions = (sharePayload?.options?.length ?? 0) > 0;
      const outcomeShown =
        hasOutlet && enabled && rating >= threshold && hasOptions;
      let reason = 'ok';
      if (!hasOutlet) reason = 'no_outlet';
      else if (!enabled) reason = 'disabled';
      else if (rating < threshold) reason = 'low_rating';
      else if (!hasOptions) reason = 'no_options';
      this.metrics.inc('reviews_share_stage_total', {
        outcome: outcomeShown ? 'shown' : 'hidden',
        reason,
      });
    } catch {}

    return {
      ok: true,
      reviewId: result.id,
      status: result.status,
      rewardPoints: result.rewardPoints,
      message: result.message,
      share: sharePayload,
    } as const;
  }

  @Post('reviews/dismiss')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async dismissReviewPrompt(
    @Body()
    body: {
      merchantId?: string;
      customerId?: string;
      transactionId?: string;
    },
  ) {
    const merchantId =
      typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    const customerId =
      typeof body?.customerId === 'string' ? body.customerId.trim() : '';
    const transactionId =
      typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId is required');
    if (!customerId) throw new BadRequestException('customerId is required');
    if (!transactionId)
      throw new BadRequestException('transactionId is required');

    const customer = await this.ensureCustomer(merchantId, customerId);
    const tx = await this.prisma.transaction.findFirst({
      where: { id: transactionId, merchantId, customerId: customer.id },
      select: { id: true, type: true, amount: true },
    });
    if (!tx) throw new BadRequestException('transaction not found');

    const dismissedAt = new Date();
    const payload = { dismissedAt: dismissedAt.toISOString() };
    const eventId = `review_dismissed:${tx.id}`;

    await this.prisma.loyaltyRealtimeEvent.upsert({
      where: { id: eventId },
      update: {
        merchantId,
        customerId: customer.id,
        transactionId: tx.id,
        transactionType: tx.type,
        amount: tx.amount,
        eventType: 'loyalty.review.dismissed',
        payload,
        emittedAt: dismissedAt,
        deliveredAt: null,
      },
      create: {
        id: eventId,
        merchantId,
        customerId: customer.id,
        transactionId: tx.id,
        transactionType: tx.type,
        amount: tx.amount,
        eventType: 'loyalty.review.dismissed',
        payload,
        emittedAt: dismissedAt,
        deliveredAt: null,
      },
    });

    try {
      const message = JSON.stringify({
        id: eventId,
        merchantId,
        customerId: customer.id,
        transactionId: tx.id,
        transactionType: tx.type,
        amount: tx.amount,
        eventType: 'loyalty.review.dismissed',
        emittedAt: payload.dismissedAt,
      });
      await this.prisma.$executeRaw`
        SELECT pg_notify('loyalty_realtime_events', ${message}::text)
      `;
    } catch {}

    return { ok: true, dismissedAt: payload.dismissedAt };
  }

  // ===== Cashier Auth (public) =====

  @Post('cashier/activate')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        merchantId: { type: 'string' },
        login: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async cashierActivate(
    @Body() body: { merchantLogin?: string; activationCode?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const merchantLogin = String(body?.merchantLogin || '');
    const activationCode = String(body?.activationCode || '');
    const result = await this.merchants.activateCashierDeviceByCode(
      merchantLogin,
      activationCode,
      {
        ip: this.resolveClientIp(req),
        userAgent: req.headers['user-agent'] || null,
      },
    );
    const ttlMs = 1000 * 60 * 60 * 24 * 180; // ~180 дней
    this.writeCashierDeviceCookie(res, result.token, ttlMs);
    return {
      ok: true,
      merchantId: result.merchantId,
      login: result.login,
      expiresAt: result.expiresAt,
    };
  }

  @Get('cashier/device')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        merchantId: { type: 'string', nullable: true },
        login: { type: 'string', nullable: true },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
        lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  async cashierDevice(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.readCookie(req, 'cashier_device');
    if (!token) return { active: false };
    const session = await this.merchants.getCashierDeviceSessionByToken(token);
    if (!session) {
      this.clearCashierDeviceCookie(res);
      return { active: false };
    }
    return {
      active: true,
      merchantId: session.merchantId,
      login: session.login,
      expiresAt: session.expiresAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    };
  }

  @Delete('cashier/device')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  async logoutCashierDevice(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCashierOrigin(req);
    const token = this.readCookie(req, 'cashier_device');
    if (token) {
      await this.merchants.revokeCashierDeviceSessionByToken(token);
    }
    this.clearCashierDeviceCookie(res);
    return { ok: true };
  }
  @Post('cashier/staff-access')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        staff: { type: 'object', additionalProperties: true },
        accesses: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  async cashierStaffAccess(
    @Body()
    body: {
      merchantLogin?: string;
      pinCode?: string;
    },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCashierOrigin(req);
    const merchantLogin = String(body?.merchantLogin || '')
      .trim()
      .toLowerCase();
    const pinCode = String(body?.pinCode || '');
    if (!merchantLogin) throw new BadRequestException('merchantLogin required');
    if (!pinCode || pinCode.length !== 4)
      throw new BadRequestException('pinCode (4 digits) required');

    const deviceToken = this.readCookie(req, 'cashier_device');
    if (!deviceToken) {
      throw new UnauthorizedException('Device not activated');
    }
    const deviceSession =
      await this.merchants.getCashierDeviceSessionByToken(deviceToken);
    if (!deviceSession) {
      this.clearCashierDeviceCookie(res);
      throw new UnauthorizedException('Device not activated');
    }

    const merchant = await this.prisma.merchant.findFirst({
      where: { cashierLogin: merchantLogin },
      select: { id: true },
    });
    if (!merchant)
      throw new UnauthorizedException('Invalid cashier merchant login');
    if (merchant.id !== deviceSession.merchantId) {
      throw new UnauthorizedException('Device activated for another merchant');
    }

    return this.merchants.getStaffAccessByPin(
      deviceSession.merchantId,
      pinCode,
      deviceSession.id,
    );
  }

  @Post('cashier/session')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        merchantId: { type: 'string' },
        sessionId: { type: 'string' },
        staff: { type: 'object', additionalProperties: true },
        outlet: { type: 'object', additionalProperties: true },
        startedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async startCashierSession(
    @Body()
    body: {
      merchantLogin?: string;
      pinCode?: string;
      rememberPin?: boolean;
    },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCashierOrigin(req);
    const merchantLogin = String(body?.merchantLogin || '')
      .trim()
      .toLowerCase();
    const pinCode = String(body?.pinCode || '');
    const rememberPin = Boolean(body?.rememberPin);
    if (!merchantLogin) throw new BadRequestException('merchantLogin required');
    if (!pinCode || pinCode.length !== 4)
      throw new BadRequestException('pinCode (4 digits) required');

    const deviceToken = this.readCookie(req, 'cashier_device');
    if (!deviceToken) {
      throw new UnauthorizedException('Device not activated');
    }
    const deviceSession =
      await this.merchants.getCashierDeviceSessionByToken(deviceToken);
    if (!deviceSession) {
      this.clearCashierDeviceCookie(res);
      throw new UnauthorizedException('Device not activated');
    }

    const merchant = await this.prisma.merchant.findFirst({
      where: { cashierLogin: merchantLogin },
      select: { id: true },
    });
    if (!merchant)
      throw new UnauthorizedException('Invalid cashier merchant login');
    if (merchant.id !== deviceSession.merchantId) {
      throw new UnauthorizedException('Device activated for another merchant');
    }

    const result = await this.merchants.startCashierSessionByMerchantId(
      deviceSession.merchantId,
      pinCode,
      rememberPin,
      {
        ip: this.resolveClientIp(req),
        userAgent: req.headers['user-agent'] || null,
      },
      deviceSession.id,
    );
    const ttlMs = rememberPin
      ? 1000 * 60 * 60 * 24 * 180 // ~180 дней
      : 1000 * 60 * 60 * 12; // 12 часов
    this.writeCashierSessionCookie(res, result.token, ttlMs);
    return {
      ok: true,
      merchantId: result.session.merchantId,
      sessionId: result.session.id,
      staff: result.session.staff,
      outlet: result.session.outlet,
      startedAt: result.session.startedAt,
      rememberPin: result.session.rememberPin,
    };
  }

  @Get('cashier/session')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        merchantId: { type: 'string', nullable: true },
        sessionId: { type: 'string', nullable: true },
        staff: { type: 'object', nullable: true, additionalProperties: true },
        outlet: { type: 'object', nullable: true, additionalProperties: true },
        startedAt: { type: 'string', format: 'date-time', nullable: true },
        lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  async currentCashierSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.readCookie(req, 'cashier_session');
    if (!token) return { active: false };
    const session = await this.merchants.getCashierSessionByToken(token);
    if (!session) {
      this.clearCashierSessionCookie(res);
      return { active: false };
    }
    return {
      active: true,
      merchantId: session.merchantId,
      sessionId: session.id,
      staff: session.staff,
      outlet: session.outlet,
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt,
      rememberPin: session.rememberPin,
    };
  }

  @Post('cashier/customer')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: CashierCustomerResolveRespDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async resolveCashierCustomer(
    @Req() req: CashierRequest,
    @Body() dto: CashierCustomerResolveDto,
  ) {
    this.assertCashierOrigin(req);
    const merchantId =
      typeof dto?.merchantId === 'string' ? dto.merchantId.trim() : '';
    const userToken =
      typeof dto?.userToken === 'string' ? dto.userToken.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!userToken) throw new BadRequestException('userToken required');
    const settings = await this.cache.getMerchantSettings(merchantId);
    const requireJwtForQuote = Boolean(settings?.requireJwtForQuote);
    const resolved = await this.resolveFromToken(userToken);
    const modeError = this.getQrModeError(resolved.kind, requireJwtForQuote);
    if (modeError) {
      throw new BadRequestException(modeError.message);
    }
    if (
      resolved.merchantAud &&
      resolved.merchantAud !== 'any' &&
      resolved.merchantAud !== merchantId
    ) {
      throw new BadRequestException('QR выписан для другого мерчанта');
    }
    const customer = await this.ensureCustomer(merchantId, resolved.customerId);
    const customerName =
      typeof customer.name === 'string' && customer.name.trim().length > 0
        ? customer.name.trim()
        : null;
    let balance: number | null = null;
    let redeemLimitBps: number | null = null;
    let minPaymentAmount: number | null = null;
    try {
      const balanceResp = await this.service.balance(merchantId, customer.id);
      balance =
        typeof balanceResp?.balance === 'number' ? balanceResp.balance : null;
    } catch {}
    try {
      const outletId =
        typeof req?.cashierSession?.outletId === 'string'
          ? req.cashierSession.outletId
          : null;
      const rates = await this.service.getBaseRatesForCustomer(
        merchantId,
        customer.id,
        { outletId },
      );
      redeemLimitBps =
        typeof rates?.redeemLimitBps === 'number'
          ? Math.max(0, Math.floor(Number(rates.redeemLimitBps)))
          : null;
      minPaymentAmount =
        typeof rates?.tierMinPayment === 'number'
          ? Math.max(0, Math.floor(Number(rates.tierMinPayment)))
          : null;
    } catch {}
    return {
      customerId: customer.id,
      name: customerName,
      balance,
      redeemLimitBps,
      minPaymentAmount,
    } satisfies CashierCustomerResolveRespDto;
  }

  @Delete('cashier/session')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  async logoutCashierSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCashierOrigin(req);
    const token = this.readCookie(req, 'cashier_session');
    if (token) {
      await this.merchants.endCashierSessionByToken(token, 'logout');
    }
    this.clearCashierSessionCookie(res);
    return { ok: true };
  }

  @Get('cashier/leaderboard')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        settings: { type: 'object', additionalProperties: true },
        period: { type: 'object', additionalProperties: true },
        items: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  async cashierLeaderboard(
    @Req() req: CashierRequest,
    @Query('merchantId') merchantIdQuery?: string,
    @Query('outletId') outletId?: string,
    @Query('limit') limit?: string,
  ) {
    const session = req?.cashierSession ?? null;
    const merchantId =
      session?.merchantId ??
      (typeof merchantIdQuery === 'string' && merchantIdQuery.trim()
        ? merchantIdQuery.trim()
        : null);
    if (!merchantId) {
      throw new BadRequestException('merchantId required');
    }
    const normalizedOutlet =
      typeof outletId === 'string' && outletId.trim()
        ? outletId.trim()
        : undefined;
    let parsedLimit: number | undefined;
    if (typeof limit === 'string' && limit.trim()) {
      const numeric = Number(limit);
      if (Number.isFinite(numeric) && numeric > 0) {
        parsedLimit = Math.floor(numeric);
      }
    }
    const result = await this.service.getStaffMotivationLeaderboard(
      merchantId,
      {
        outletId: normalizedOutlet ?? null,
        limit: parsedLimit,
      },
    );
    return {
      enabled: result.settings.enabled,
      settings: {
        enabled: result.settings.enabled,
        pointsForNewCustomer: result.settings.pointsForNewCustomer,
        pointsForExistingCustomer: result.settings.pointsForExistingCustomer,
        leaderboardPeriod: result.settings.leaderboardPeriod,
        customDays: result.settings.customDays,
        updatedAt: result.settings.updatedAt
          ? result.settings.updatedAt.toISOString()
          : null,
      },
      period: {
        kind: result.period.period,
        customDays: result.period.customDays,
        from: result.period.from.toISOString(),
        to: result.period.to.toISOString(),
        days: result.period.days,
        label: result.period.label,
      },
      items: result.items.map((item) => ({
        staffId: item.staffId,
        staffName: item.staffName,
        staffDisplayName: item.staffDisplayName,
        staffLogin: item.staffLogin,
        outletId: item.outletId,
        outletName: item.outletName,
        points: item.points,
      })),
    };
  }

  @Get('cashier/outlet-transactions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { $ref: getSchemaPath(CashierOutletTransactionsRespDto) },
  })
  async cashierOutletTransactions(
    @Req() req: CashierRequest,
    @Query('merchantId') merchantIdQuery?: string,
    @Query('outletId') outletIdQuery?: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
  ) {
    const session = req?.cashierSession ?? null;
    const merchantId =
      session?.merchantId ??
      (typeof merchantIdQuery === 'string' && merchantIdQuery.trim()
        ? merchantIdQuery.trim()
        : null);
    const outletId =
      session?.outletId ??
      (typeof outletIdQuery === 'string' && outletIdQuery.trim()
        ? outletIdQuery.trim()
        : null);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!outletId) throw new BadRequestException('outletId required');
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100)
      : 20;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    if (beforeStr && Number.isNaN(before?.getTime() ?? NaN)) {
      throw new BadRequestException('before is invalid');
    }
    return this.service.outletTransactions(merchantId, outletId, limit, before);
  }

  @Post('qr')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: QrMintRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async mintQr(@Body() dto: QrMintDto, @Req() req: TeleauthRequest) {
    const merchantId =
      typeof dto.merchantId === 'string' ? dto.merchantId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId required');
    const settings = await this.cache.getMerchantSettings(merchantId);
    const teleauthCustomerId = req.teleauth?.customerId ?? null;
    let customerId =
      typeof dto.customerId === 'string' ? dto.customerId.trim() : '';
    if (!customerId && teleauthCustomerId) {
      customerId = String(teleauthCustomerId);
    }

    // Если передан initData — валидируем и берём customerId из Telegram
    if (dto.initData) {
      const botToken =
        typeof settings?.telegramBotToken === 'string'
          ? settings.telegramBotToken
          : '';
      if (!botToken) throw new BadRequestException('Bot token not configured');
      const r = validateTelegramInitData(botToken, dto.initData);
      if (!r.ok || !r.userId) throw new BadRequestException('Invalid initData');
      if (settings?.telegramStartParamRequired) {
        const p = new URLSearchParams(dto.initData);
        const sp = p.get('start_param') || p.get('startapp') || '';
        if (!sp) {
          throw new BadRequestException('start_param required');
        }
        const trimmed = sp.trim();
        const isReferral = /^ref[_-]/i.test(trimmed);
        if (!isReferral && trimmed !== merchantId) {
          throw new BadRequestException('merchantId mismatch with start_param');
        }
      }
      const tgId = String(r.userId);
      const ensured = await this.ensureCustomerByTelegram(
        merchantId,
        tgId,
        dto.initData,
      );
      customerId = ensured.customerId;
    }

    if (!customerId) {
      throw new BadRequestException('customerId required');
    }

    const envSecret = process.env.QR_JWT_SECRET || '';
    if (
      !envSecret ||
      (process.env.NODE_ENV === 'production' && envSecret === 'dev_change_me')
    ) {
      throw new BadRequestException('QR_JWT_SECRET not configured');
    }
    const secret = envSecret;

    let ttl = dto.ttlSec ?? 300;
    if (!dto.ttlSec && settings?.qrTtlSec) ttl = settings.qrTtlSec;
    await this.ensureCustomer(merchantId, customerId);
    const requireJwtForQuote = Boolean(settings?.requireJwtForQuote);
    const token = requireJwtForQuote
      ? await signQrToken(secret, customerId, merchantId, ttl)
      : await this.mintShortCode(merchantId, customerId, ttl);
    return { token, ttl };
  }

  @Post('quote')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(QuoteRedeemRespDto) },
        { $ref: getSchemaPath(QuoteEarnRespDto) },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  async quote(
    @Body() dto: QuoteDto,
    @Req() _req: Request & { requestId?: string },
  ) {
    const t0 = Date.now();
    try {
      const v = await this.resolveFromToken(dto.userToken);
      const s = await this.cache.getMerchantSettings(dto.merchantId);
      const modeError = this.getQrModeError(
        v.kind,
        Boolean(s?.requireJwtForQuote),
      );
      if (modeError) {
        this.metrics.inc('loyalty_quote_requests_total', {
          result: 'error',
          reason: modeError.reason,
        });
        throw new BadRequestException(modeError.message);
      }
      const customerId = v.customerId;
      const customer = await this.ensureCustomer(dto.merchantId, customerId);
      if (
        v.merchantAud &&
        v.merchantAud !== 'any' &&
        v.merchantAud !== dto.merchantId
      ) {
        this.metrics.inc('loyalty_quote_requests_total', {
          result: 'error',
          reason: 'merchant_mismatch',
        });
        throw new BadRequestException('QR выписан для другого мерчанта');
      }
      const staffId = dto.staffId;
      const outlet = await this.resolveOutlet(
        dto.merchantId,
        dto.outletId ?? null,
      );
      const qrMeta =
        v.kind === 'jwt' || v.kind === 'short'
          ? { jti: v.jti, iat: v.iat, exp: v.exp, kind: v.kind }
          : undefined;
      // Расчёт quote без внешних промо-скидок (используем исходные суммы)
      const adjTotal = Math.max(0, Math.floor(dto.total));
      const normalizedOutletId = dto.outletId ?? outlet?.id ?? undefined;
      const data = await this.service.quote(
        {
          ...dto,
          outletId: normalizedOutletId,
          total: adjTotal,
          staffId,
          customerId: customer.id,
        },
        qrMeta,
      );
      this.metrics.inc('loyalty_quote_requests_total', { result: 'ok' });
      return data;
    } catch (err: unknown) {
      const msg = readErrorMessage(err);
      if (/JWTExpired|"exp"/.test(msg))
        this.metrics.inc('loyalty_jwt_expired_total');
      this.metrics.inc('loyalty_quote_requests_total', { result: 'error' });
      throw err;
    } finally {
      this.metrics.observe('loyalty_quote_latency_ms', Date.now() - t0);
    }
  }

  @Post('commit')
  @UseGuards(AntiFraudGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Идемпотентность COMMIT',
  })
  @ApiOkResponse({ type: CommitRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async commit(
    @Body() dto: CommitDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: RequestWithRequestId,
  ) {
    const t0 = Date.now();
    let data: unknown;
    // кешируем hold для извлечения контекста (merchantId, outletId, staffId)
    let holdCached: Awaited<
      ReturnType<PrismaService['hold']['findUnique']>
    > | null = null;
    try {
      holdCached = await this.prisma.hold.findUnique({
        where: { id: dto.holdId },
      });
    } catch {}
    const merchantIdEff = holdCached?.merchantId || dto.merchantId;

    let customerId: string | null = null;
    if (holdCached?.customerId && merchantIdEff) {
      const customer = await this.ensureCustomer(
        merchantIdEff,
        holdCached.customerId,
      );
      customerId = customer.id;
    }
    try {
      const idemKey =
        (req.headers['idempotency-key'] as string | undefined) || undefined;
      const expectedMerchantId =
        typeof dto?.merchantId === 'string' ? dto.merchantId.trim() : '';
      const commitOptsPayload: CommitOptions = {};
      if (dto.positions && Array.isArray(dto.positions)) {
        commitOptsPayload.positions = dto.positions;
      }
      if (expectedMerchantId) {
        commitOptsPayload.expectedMerchantId = expectedMerchantId;
      }
      const commitOpts =
        Object.keys(commitOptsPayload).length > 0
          ? commitOptsPayload
          : undefined;
      const merchantForIdem = merchantIdEff || undefined;
      const scope = 'loyalty/commit';
      const requestHash =
        idemKey && merchantForIdem
          ? this.hashIdempotencyPayload({
              merchantId: merchantForIdem,
              holdId: dto.holdId,
              orderId: dto.orderId ?? null,
              receiptNumber: dto.receiptNumber ?? null,
              positions: commitOpts?.positions ?? null,
            })
          : null;
      if (idemKey && merchantForIdem) {
        const ttlH = Number(process.env.IDEMPOTENCY_TTL_HOURS || '72');
        const exp = new Date(Date.now() + ttlH * 3600 * 1000);
        const keyWhere = {
          merchantId: merchantForIdem,
          scope,
          key: idemKey,
        };
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { merchantId_scope_key: keyWhere },
        });
        if (existing) {
          if (existing.requestHash && existing.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key уже использован с другим запросом',
            );
          }
          if (existing.response) {
            data = existing.response;
          } else {
            throw new ConflictException('Idempotency-Key уже обрабатывается');
          }
        } else {
          try {
            await this.prisma.idempotencyKey.create({
              data: {
                merchantId: merchantForIdem,
                scope,
                key: idemKey,
                requestHash,
                expiresAt: exp,
                response: Prisma.JsonNull,
              },
            });
          } catch {
            const saved = await this.prisma.idempotencyKey.findUnique({
              where: { merchantId_scope_key: keyWhere },
            });
            if (saved) {
              if (saved.requestHash && saved.requestHash !== requestHash) {
                throw new ConflictException(
                  'Idempotency-Key уже использован с другим запросом',
                );
              }
              if (saved.response) {
                data = saved.response;
              } else {
                throw new ConflictException(
                  'Idempotency-Key уже обрабатывается',
                );
              }
            }
          }
          if (data === undefined) {
            try {
              const commitResult: unknown = await this.service.commit(
                dto.holdId,
                dto.orderId,
                dto.receiptNumber,
                req.requestId,
                commitOpts,
              );
              data = commitResult;
              const dataRecord = asRecord(data);
              if (dataRecord?.alreadyCommitted === true) {
                const rest = { ...dataRecord };
                delete (rest as Record<string, unknown>).alreadyCommitted;
                data = rest;
              }
              await this.prisma.idempotencyKey.update({
                where: { merchantId_scope_key: keyWhere },
                data: {
                  response: (data ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                  expiresAt: exp,
                },
              });
            } catch (e) {
              try {
                await this.prisma.idempotencyKey.delete({
                  where: { merchantId_scope_key: keyWhere },
                });
              } catch {}
              throw e;
            }
          }
        }
      } else {
        const commitResult: unknown = await this.service.commit(
          dto.holdId,
          dto.orderId,
          dto.receiptNumber,
          req.requestId,
          commitOpts,
        );
        data = commitResult;
      }
      const dataRecord = asRecord(data);
      this.metrics.inc('loyalty_commit_requests_total', {
        result: dataRecord?.alreadyCommitted ? 'already_committed' : 'ok',
      });
    } catch (e) {
      this.metrics.inc('loyalty_commit_requests_total', { result: 'error' });
      throw e;
    } finally {
      this.metrics.observe('loyalty_commit_latency_ms', Date.now() - t0);
    }
    try {
      const s = merchantIdEff
        ? await this.cache.getMerchantSettings(merchantIdEff)
        : null;
      const useNext =
        Boolean(s?.useWebhookNext) && Boolean(s?.webhookSecretNext);
      const secret = useNext ? s?.webhookSecretNext : s?.webhookSecret;
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const body = JSON.stringify(data);
        const sig = createHmac('sha256', secret)
          .update(`${ts}.${body}`)
          .digest('base64');
        res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
        if (merchantIdEff) res.setHeader('X-Merchant-Id', merchantIdEff);
        res.setHeader('X-Signature-Timestamp', ts);
        const kid = useNext ? s?.webhookKeyIdNext : s?.webhookKeyId;
        if (kid) res.setHeader('X-Signature-Key-Id', kid);
        if (req.requestId) res.setHeader('X-Request-Id', req.requestId);
      }
    } catch {}
    const dataRecord = asRecord(data);
    if (customerId && dataRecord) {
      dataRecord.customerId = customerId;
    }
    return data;
  }

  @Post('cancel')
  @ApiOkResponse({ type: OkDto })
  async cancel(@Body('holdId') holdId: string, @Req() req: CashierRequest) {
    if (!holdId) throw new BadRequestException('holdId required');
    return this.service.cancel(holdId, req.cashierSession?.merchantId);
  }

  @Get('balance/:merchantId/:customerId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: BalanceDto })
  balance2(
    @Param('merchantId') merchantId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.service.balance(merchantId, customerId);
  }

  // Публичные настройки, доступные мини-аппе (без админ-ключа)
  @Get('settings/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: PublicSettingsDto })
  async publicSettings(@Param('merchantId') merchantId: string) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const { share } = await this.buildReviewsShareSettings(
      merchantId,
      settings,
    );
    const referralActive = await this.prisma.referralProgram.findFirst({
      where: { merchantId, status: 'ACTIVE', isActive: true },
      select: { id: true },
    });
    const referralEnabled = Boolean(referralActive);
    const rulesRaw = getRulesRoot(settings?.rulesJson) ?? {};
    const miniappRules = getRulesSection(rulesRaw, 'miniapp');
    const supportTelegramRaw = miniappRules?.supportTelegram ?? null;
    const supportTelegram =
      typeof supportTelegramRaw === 'string' && supportTelegramRaw.trim()
        ? supportTelegramRaw.trim()
        : null;
    const reviewsRules = getRulesSection(rulesRaw, 'reviews');
    const reviewsEnabled =
      reviewsRules && reviewsRules.enabled !== undefined
        ? Boolean(reviewsRules.enabled)
        : true;
    return {
      merchantId,
      qrTtlSec: settings?.qrTtlSec ?? 300,
      miniappThemePrimary: settings?.miniappThemePrimary ?? null,
      miniappThemeBg: settings?.miniappThemeBg ?? null,
      miniappLogoUrl: settings?.miniappLogoUrl ?? null,
      supportTelegram,
      reviewsEnabled,
      referralEnabled,
      reviewsShare: share,
    } satisfies PublicSettingsDto;
  }

  @Get('miniapp-logo/:merchantId/:assetId')
  async getMiniappLogo(
    @Param('merchantId') merchantId: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const asset = await this.prisma.communicationAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset || asset.merchantId !== merchantId) {
      throw new NotFoundException('Logo not found');
    }
    if (asset.kind !== 'MINIAPP_LOGO') {
      throw new NotFoundException('Logo not found');
    }
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', asset.mimeType ?? 'application/octet-stream');
    res.setHeader(
      'Content-Length',
      String(asset.byteSize ?? asset.data?.length ?? 0),
    );
    if (asset.fileName) {
      res.setHeader('X-Filename', encodeURIComponent(asset.fileName));
    }
    res.send(asset.data);
  }

  @Post('promocodes/apply')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        promoCodeId: { type: 'string' },
        code: { type: 'string' },
        pointsIssued: { type: 'number' },
        pointsExpireInDays: { type: 'number', nullable: true },
        pointsExpireAt: { type: 'string', format: 'date-time', nullable: true },
        balance: { type: 'number' },
        tierAssigned: { type: 'string', nullable: true },
        message: { type: 'string', nullable: true },
      },
    },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  async applyPromoCode(
    @Body()
    body: {
      merchantId?: string;
      customerId?: string;
      code?: string;
    },
  ) {
    if (!body?.merchantId || !body?.customerId)
      throw new BadRequestException('merchantId and customerId required');
    const customer = await this.ensureCustomer(
      body.merchantId,
      body.customerId,
    );
    return this.service.applyPromoCode({
      merchantId: body.merchantId,
      customerId: customer.id,
      code: body?.code,
    });
  }

  @Post('refund')
  @UseGuards(AntiFraudGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Идемпотентность REFUND',
  })
  @ApiOkResponse({ type: RefundRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async refund(
    @Body() dto: RefundDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: RequestWithRequestId,
  ) {
    const merchantId =
      typeof dto?.merchantId === 'string' ? dto.merchantId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId required');
    const dtoRecord = asRecord(dto) ?? {};
    const rawInvoice =
      readString(dtoRecord.invoice_num) ??
      readString(dtoRecord.invoiceNum) ??
      readString(dtoRecord.orderId) ??
      readString(dtoRecord.order_id);
    let invoiceNum =
      typeof rawInvoice === 'string' && rawInvoice.trim().length > 0
        ? rawInvoice.trim()
        : '';
    const rawOrderId = readString(dtoRecord.order_id);
    let orderId =
      typeof rawOrderId === 'string' && rawOrderId.trim().length > 0
        ? rawOrderId.trim()
        : '';
    const receiptNumber =
      typeof dto?.receiptNumber === 'string' &&
      dto.receiptNumber.trim().length > 0
        ? dto.receiptNumber.trim()
        : null;
    if (!invoiceNum && !orderId) {
      if (!receiptNumber) {
        throw new BadRequestException('invoice_num или order_id обязательны');
      }
      const receipts = await this.prisma.receipt.findMany({
        where: { merchantId, receiptNumber },
        select: { orderId: true, id: true },
        take: 2,
      });
      if (receipts.length === 0 || !receipts[0]?.orderId) {
        throw new BadRequestException('Receipt not found');
      }
      if (receipts.length > 1) {
        throw new BadRequestException(
          'Multiple receipts found for receiptNumber',
        );
      }
      invoiceNum = receipts[0].orderId;
      orderId = receipts[0].id ?? '';
    }
    let operationDate: Date | null = null;
    if (dto.operationDate) {
      const parsed = new Date(dto.operationDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('operationDate must be a valid date');
      }
      operationDate = parsed;
    }
    dtoRecord.merchantId = merchantId;
    dtoRecord.invoice_num = invoiceNum;
    dtoRecord.order_id = orderId;
    let customerId: string | null = null;
    let data: unknown;
    try {
      const idemKey =
        (req.headers['idempotency-key'] as string | undefined) || undefined;
      const scope = 'loyalty/refund';
      const requestHash = idemKey
        ? this.hashIdempotencyPayload({
            merchantId,
            invoiceNum: invoiceNum || null,
            orderId: orderId || null,
            receiptNumber,
            deviceId: dto.deviceId ?? null,
            operationDate: operationDate ? operationDate.toISOString() : null,
          })
        : null;
      if (idemKey) {
        const ttlH = Number(process.env.IDEMPOTENCY_TTL_HOURS || '72');
        const exp = new Date(Date.now() + ttlH * 3600 * 1000);
        const keyWhere = { merchantId, scope, key: idemKey };
        const saved = await this.prisma.idempotencyKey.findUnique({
          where: { merchantId_scope_key: keyWhere },
        });
        if (saved) {
          if (saved.requestHash && saved.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key уже использован с другим запросом',
            );
          }
          if (saved.response) {
            data = saved.response;
          } else {
            throw new ConflictException('Idempotency-Key уже обрабатывается');
          }
        } else {
          try {
            await this.prisma.idempotencyKey.create({
              data: {
                merchantId,
                scope,
                key: idemKey,
                requestHash,
                expiresAt: exp,
                response: Prisma.JsonNull,
              },
            });
          } catch {
            const existing = await this.prisma.idempotencyKey.findUnique({
              where: { merchantId_scope_key: keyWhere },
            });
            if (existing) {
              if (
                existing.requestHash &&
                existing.requestHash !== requestHash
              ) {
                throw new ConflictException(
                  'Idempotency-Key уже использован с другим запросом',
                );
              }
              if (existing.response) {
                data = existing.response;
              } else {
                throw new ConflictException(
                  'Idempotency-Key уже обрабатывается',
                );
              }
            }
          }
          if (data === undefined) {
            try {
              const refundResult: unknown = await this.service.refund({
                merchantId,
                invoiceNum,
                orderId,
                requestId: req.requestId,
                deviceId: dto.deviceId,
                operationDate,
              });
              data = refundResult;
              try {
                let receipt = await this.prisma.receipt.findUnique({
                  where: {
                    merchantId_orderId: {
                      merchantId,
                      orderId: invoiceNum,
                    },
                  },
                  select: { customerId: true },
                });
                if (!receipt && orderId) {
                  receipt = await this.prisma.receipt.findFirst({
                    where: { id: orderId, merchantId },
                    select: { customerId: true },
                  });
                }
                if (receipt?.customerId) {
                  const mc = await this.ensureCustomer(
                    merchantId,
                    receipt.customerId,
                  );
                  customerId = mc.id;
                }
              } catch {}
              await this.prisma.idempotencyKey.update({
                where: { merchantId_scope_key: keyWhere },
                data: {
                  response: (data ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                  expiresAt: exp,
                },
              });
            } catch (e) {
              try {
                await this.prisma.idempotencyKey.delete({
                  where: { merchantId_scope_key: keyWhere },
                });
              } catch {}
              throw e;
            }
          }
        }
      } else {
        const refundResult: unknown = await this.service.refund({
          merchantId,
          invoiceNum,
          orderId,
          requestId: req.requestId,
          deviceId: dto.deviceId,
          operationDate,
        });
        data = refundResult;
        try {
          let receipt = await this.prisma.receipt.findUnique({
            where: {
              merchantId_orderId: {
                merchantId,
                orderId: invoiceNum,
              },
            },
            select: { customerId: true },
          });
          if (!receipt && orderId) {
            receipt = await this.prisma.receipt.findFirst({
              where: { id: orderId, merchantId },
              select: { customerId: true },
            });
          }
          if (receipt?.customerId) {
            const mc = await this.ensureCustomer(
              merchantId,
              receipt.customerId,
            );
            customerId = mc.id;
          }
        } catch {}
      }
      this.metrics.inc('loyalty_refund_requests_total', { result: 'ok' });
    } catch (e) {
      this.metrics.inc('loyalty_refund_requests_total', { result: 'error' });
      throw e;
    }
    try {
      const s = await this.cache.getMerchantSettings(merchantId);
      const secret = s?.webhookSecret;
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const body = JSON.stringify(data);
        const sig = createHmac('sha256', secret)
          .update(`${ts}.${body}`)
          .digest('base64');
        res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
        res.setHeader('X-Merchant-Id', merchantId);
        res.setHeader('X-Signature-Timestamp', ts);
        if (s?.webhookKeyId)
          res.setHeader('X-Signature-Key-Id', s.webhookKeyId);
        if (req.requestId) res.setHeader('X-Request-Id', req.requestId);
      }
    } catch {}
    const dataRecord = asRecord(data);
    if (customerId && dataRecord) {
      dataRecord.customerId = customerId;
    }
    return data;
  }

  // Telegram miniapp auth: принимает merchantId + initData, валидирует токеном бота мерчанта и возвращает customerId
  @Post('teleauth')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async teleauth(
    @Body()
    body: {
      merchantId?: string;
      initData?: string;
      create?: boolean;
    },
  ) {
    const merchantId =
      typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    const initData = body?.initData || '';
    const shouldCreate = body?.create !== false;
    if (!merchantId) {
      throw new BadRequestException('merchantId required');
    }
    if (!initData) throw new BadRequestException('initData is required');
    const settings = await this.cache.getMerchantSettings(merchantId);
    const token =
      typeof settings?.telegramBotToken === 'string'
        ? settings.telegramBotToken.trim()
        : '';
    if (!token) throw new BadRequestException('Bot token not configured');
    const startParamRequired = Boolean(settings?.telegramStartParamRequired);
    const params = new URLSearchParams(initData);
    const startParam =
      params.get('start_param') || params.get('startapp') || '';
    if (startParamRequired) {
      if (!startParam) {
        throw new BadRequestException('start_param is required');
      }
      const trimmed = startParam.trim();
      const isReferral = /^ref[_-]/i.test(trimmed);
      if (!isReferral && trimmed !== merchantId) {
        throw new BadRequestException('merchantId mismatch with start_param');
      }
    }
    const r = validateTelegramInitData(token, initData || '');
    if (!r.ok || !r.userId) throw new BadRequestException('Invalid initData');
    // Customer теперь per-merchant модель
    const tgId = String(r.userId);

    // Ищем или создаём Customer по tgId для данного мерчанта
    let customer = await this.prisma.customer.findUnique({
      where: { merchantId_tgId: { merchantId, tgId } },
    });

    if (!customer) {
      if (!shouldCreate) {
        return {
          ok: true,
          customerId: null,
          registered: false,
          hasPhone: false,
          onboarded: false,
        };
      }
      customer = await this.prisma.customer.create({
        data: { merchantId, tgId },
      });
      // Создаём связь в CustomerTelegram
      await this.prisma.customerTelegram
        .create({
          data: { merchantId, tgId, customerId: customer.id },
        })
        .catch(() => {});
    }

    const flags = await this.fetchCustomerProfileFlags(customer.id);
    return { ok: true, customerId: customer.id, registered: true, ...flags };
  }

  @Get('profile')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: CustomerProfileDto })
  async getProfile(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
  ) {
    const customer = await this.ensureCustomer(merchantId, customerId);
    return this.toProfileDto(customer);
  }

  @Get('profile/phone-status')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: CustomerPhoneStatusDto })
  async getProfilePhoneStatus(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
  ) {
    const customer = await this.ensureCustomer(merchantId, customerId);
    const rawPhone = customer?.phone ?? null;
    const hasPhone = typeof rawPhone === 'string' && rawPhone.trim().length > 0;
    return { hasPhone } satisfies CustomerPhoneStatusDto;
  }

  @Post('profile')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: CustomerProfileDto })
  async saveProfile(@Body() body: CustomerProfileSaveDto) {
    const merchantId =
      typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    const customerId =
      typeof body?.customerId === 'string' ? body.customerId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');

    const customer = await this.ensureCustomer(merchantId, customerId);

    if (typeof body?.name !== 'string' || !body.name.trim()) {
      throw new BadRequestException('name must be provided');
    }
    const name = body.name.trim();
    if (name.length > 120) throw new BadRequestException('name is too long');

    if (body?.gender !== 'male' && body?.gender !== 'female') {
      throw new BadRequestException('gender must be "male" or "female"');
    }
    const gender: 'male' | 'female' = body.gender;

    if (
      typeof body?.birthDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)
    ) {
      throw new BadRequestException('birthDate must be in format YYYY-MM-DD');
    }
    const birthDate = body.birthDate;
    const parsed = new Date(`${birthDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('birthDate is invalid');
    }

    const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';
    const mustRequirePhone = !customer.phone;
    if (mustRequirePhone && !phoneRaw) {
      throw new BadRequestException(
        'Без номера телефона мы не можем зарегистрировать вас в программе лояльности',
      );
    }
    let phoneNormalized: string | null = null;
    let phoneDigits: string | null = null;
    if (phoneRaw) {
      phoneNormalized = this.normalizePhoneStrict(phoneRaw);
      phoneDigits = phoneNormalized.replace(/\D/g, '');
    }

    // Customer теперь per-merchant модель, обновляем напрямую
    const completionMark = new Date();
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let targetCustomer = customer;
        let mergedCustomerId: string | null = null;

        if (phoneNormalized) {
          let existingByPhone = await tx.customer.findUnique({
            where: { merchantId_phone: { merchantId, phone: phoneNormalized } },
          });
          if (!existingByPhone && phoneDigits) {
            existingByPhone = await tx.customer.findUnique({
              where: { merchantId_phone: { merchantId, phone: phoneDigits } },
            });
          }
          if (existingByPhone && existingByPhone.id !== customer.id) {
            const currentTgId =
              typeof customer.tgId === 'string' ? customer.tgId : null;
            const existingTgId =
              typeof existingByPhone.tgId === 'string'
                ? existingByPhone.tgId
                : null;
            if (existingTgId && existingTgId !== currentTgId) {
              throw new BadRequestException('Номер телефона уже используется');
            }
            const earnLot = this.getEarnLotDelegate(tx);
            const earnLotsCountPromise = earnLot
              ? earnLot
                  .count({
                    where: { merchantId, customerId: customer.id },
                  })
                  .catch(() => 0)
              : Promise.resolve(0);
            const [transactionsCount, earnLotsCount, wallet] =
              await Promise.all([
                tx.transaction
                  .count({ where: { merchantId, customerId: customer.id } })
                  .catch(() => 0),
                earnLotsCountPromise,
                tx.wallet
                  .findFirst({
                    where: {
                      merchantId,
                      customerId: customer.id,
                      type: WalletType.POINTS,
                    },
                    select: { balance: true },
                  })
                  .catch(() => null),
              ]);
            const walletBalance = wallet?.balance ?? 0;
            if (
              transactionsCount > 0 ||
              earnLotsCount > 0 ||
              walletBalance > 0
            ) {
              throw new BadRequestException(
                'Этот профиль уже содержит историю операций. Автоматическое объединение недоступно.',
              );
            }
            mergedCustomerId = existingByPhone.id;
            targetCustomer = existingByPhone;
            if (currentTgId && existingTgId !== currentTgId) {
              await tx.customer.update({
                where: { id: existingByPhone.id },
                data: { tgId: currentTgId },
              });
              await tx.customerTelegram.upsert({
                where: { merchantId_tgId: { merchantId, tgId: currentTgId } },
                update: { customerId: existingByPhone.id },
                create: {
                  merchantId,
                  tgId: currentTgId,
                  customerId: existingByPhone.id,
                },
              });
              await tx.customer.update({
                where: { id: customer.id },
                data: { tgId: null },
              });
            }
          }
        }

        const updates: Prisma.CustomerUpdateInput = {
          profileName: name,
          profileCompletedAt: completionMark,
        };
        if (!targetCustomer.name) {
          updates.name = name;
        }
        const targetGender =
          targetCustomer.gender === 'male' || targetCustomer.gender === 'female'
            ? targetCustomer.gender
            : null;
        if (!targetGender) {
          updates.gender = gender;
          updates.profileGender = gender;
        }
        if (!targetCustomer.birthday) {
          updates.birthday = parsed;
          updates.profileBirthDate = parsed;
        }
        if (phoneNormalized) {
          updates.phone = phoneNormalized;
        }

        const updatedCustomer = await tx.customer.update({
          where: { id: targetCustomer.id },
          data: updates,
        });

        const walletUpsertArgs = {
          where: {
            customerId_merchantId_type: {
              customerId: updatedCustomer.id,
              merchantId,
              type: WalletType.POINTS,
            },
          },
          update: {},
          create: {
            customerId: updatedCustomer.id,
            merchantId,
            type: WalletType.POINTS,
          },
        } satisfies Prisma.WalletUpsertArgs;
        await tx.wallet.upsert(walletUpsertArgs);

        return { updatedCustomer, mergedCustomerId };
      });
      const payload = this.toProfileDto(result.updatedCustomer);
      return result.mergedCustomerId
        ? { ...payload, customerId: result.mergedCustomerId }
        : payload;
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const code = readErrorCode(err);
      const msg = readErrorMessage(err);
      if (code === 'P2002' || /Unique constraint/i.test(msg)) {
        throw new BadRequestException('Номер телефона уже используется');
      }
      throw err;
    }
  }

  @Get('transactions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(TransactionsRespDto) } })
  transactions(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100)
      : 20;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    if (beforeStr && Number.isNaN(before?.getTime() ?? NaN)) {
      throw new BadRequestException('before is invalid');
    }
    return this.service.transactions(merchantId, customerId, limit, before, {
      outletId,
      staffId,
    });
  }

  // Публичные списки для фронтов (без AdminGuard)
  @Get('outlets/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'array', items: { $ref: getSchemaPath(PublicOutletDto) } },
  })
  async publicOutlets(@Param('merchantId') merchantId: string) {
    const items = await this.prisma.outlet.findMany({
      where: { merchantId },
      orderBy: { name: 'asc' },
    });
    return items.map((o) => ({
      id: o.id,
      name: o.name,
    }));
  }

  @Get('staff/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'array', items: { $ref: getSchemaPath(PublicStaffDto) } },
  })
  async publicStaff(@Param('merchantId') merchantId: string) {
    const items = await this.prisma.staff.findMany({
      where: { merchantId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((s) => ({
      id: s.id,
      role: s.role,
    }));
  }

  // Согласия на коммуникации
  @Get('consent')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(ConsentGetRespDto) } })
  async getConsent(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
  ) {
    const customer = await this.ensureCustomer(merchantId, customerId);
    const c = await this.prisma.consent.findUnique({
      where: { merchantId_customerId: { merchantId, customerId: customer.id } },
    });
    return { granted: !!c, consentAt: c?.consentAt?.toISOString() };
  }

  @Get('bootstrap')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async bootstrap(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
    @Query('transactionsLimit') txLimitStr?: string,
  ) {
    const limit = txLimitStr
      ? Math.min(Math.max(parseInt(txLimitStr, 10) || 20, 1), 100)
      : 20;
    const customer = await this.ensureCustomer(merchantId, customerId);
    const consent = await this.prisma.consent.findUnique({
      where: {
        merchantId_customerId: {
          merchantId,
          customerId: customer.id,
        },
      },
    });
    const [balanceResp, levelsResp, transactionsResp, promotions] =
      await Promise.all([
        this.service.balance(merchantId, customerId),
        this.levelsService.getLevel(merchantId, customerId),
        this.service.transactions(merchantId, customerId, limit, undefined, {}),
        this.listPromotionsForCustomer(merchantId, customerId),
      ]);
    return {
      profile: this.toProfileDto(customer),
      consent: {
        granted: !!consent,
        consentAt: consent?.consentAt?.toISOString() ?? null,
      },
      balance: balanceResp,
      levels: levelsResp,
      transactions: transactionsResp,
      promotions,
    };
  }

  @Post('consent')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(OkDto) } })
  async setConsent(
    @Body()
    body: {
      merchantId?: string;
      customerId?: string;
      granted?: boolean;
    },
  ) {
    if (!body?.merchantId || !body?.customerId)
      throw new BadRequestException('merchantId and customerId required');
    const customer = await this.ensureCustomer(
      body.merchantId,
      body.customerId,
    );
    if (body.granted) {
      await this.prisma.consent.upsert({
        where: {
          merchantId_customerId: {
            merchantId: body.merchantId,
            customerId: customer.id,
          },
        },
        update: { consentAt: new Date() },
        create: {
          merchantId: body.merchantId,
          customerId: customer.id,
          consentAt: new Date(),
        },
      });
    } else {
      try {
        await this.prisma.consent.delete({
          where: {
            merchantId_customerId: {
              merchantId: body.merchantId,
              customerId: customer.id,
            },
          },
        });
      } catch {}
    }
    return { ok: true };
  }
}
