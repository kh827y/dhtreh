import {
  Body,
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  BadRequestException,
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
import { LoyaltyService } from './loyalty.service';
import { MerchantsService } from '../merchants/merchants.service';
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
} from './dto';
import { looksLikeJwt, signQrToken, verifyQrToken } from './token.util';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { CashierGuard } from '../guards/cashier.guard';
import { AntiFraudGuard } from '../guards/antifraud.guard';
import {
  AllowInactiveSubscription,
  SubscriptionGuard,
} from '../guards/subscription.guard';
import type { Request, Response } from 'express';
import { createHmac } from 'crypto';
import { verifyBridgeSignature as verifyBridgeSigUtil } from './bridge.util';
import { validateTelegramInitData } from './telegram.util';
import { PromoCodesService } from '../promocodes/promocodes.service';
import { ReviewService } from '../reviews/review.service';
import { LevelsService } from '../levels/levels.service';
import type { MerchantSettings, Customer } from '@prisma/client';
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
  ) {}

  private async resolveOutlet(merchantId?: string, outletId?: string | null) {
    if (!merchantId) return null;
    if (outletId) {
      try {
        const found = await this.prisma.outlet.findFirst({
          where: { id: outletId, merchantId },
        });
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

  private writeCashierSessionCookie(
    res: Response,
    token: string,
    maxAgeMs: number,
  ) {
    const secure = process.env.NODE_ENV === 'production';
    res.cookie('cashier_session', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, Math.trunc(maxAgeMs)),
    });
  }

  private clearCashierSessionCookie(res: Response) {
    const secure = process.env.NODE_ENV === 'production';
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
    const secure = process.env.NODE_ENV === 'production';
    res.cookie('cashier_device', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, Math.trunc(maxAgeMs)),
    });
  }

  private clearCashierDeviceCookie(res: Response) {
    const secure = process.env.NODE_ENV === 'production';
    res.cookie('cashier_device', '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  private resolveClientIp(req: Request): string | null {
    const header = req.headers['x-forwarded-for'];
    if (Array.isArray(header) && header.length) {
      return header[0]?.split(',')?.[0]?.trim() || null;
    }
    if (typeof header === 'string' && header.trim()) {
      return header.split(',')[0]?.trim() || null;
    }
    if (req.ip) return req.ip;
    const remote = (req as any)?.socket?.remoteAddress;
    return remote ? String(remote) : null;
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
    rewardMetadata?: any;
    endAt?: Date | null;
  }): number | null {
    const explicit = Number(promo.pointsExpireInDays);
    if (Number.isFinite(explicit) && explicit > 0)
      return Math.max(1, Math.trunc(explicit));
    const meta =
      promo.rewardMetadata && typeof promo.rewardMetadata === 'object'
        ? (promo.rewardMetadata as Record<string, any>)
        : null;
    const shouldExpire = Boolean(
      meta?.pointsExpire ??
        meta?.metadata?.pointsExpire ??
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
    initData?: string,
  ): Promise<{ customerId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { merchantId_tgId: { merchantId, tgId } },
        select: { id: true },
      });
      if (existing) {
        await tx.wallet.upsert({
          where: {
            customerId_merchantId_type: {
              customerId: existing.id,
              merchantId,
              type: WalletType.POINTS,
            } as any,
          },
          update: {},
          create: {
            customerId: existing.id,
            merchantId,
            type: WalletType.POINTS,
          },
        } as any);
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

      await tx.wallet.upsert({
        where: {
          customerId_merchantId_type: {
            customerId: created.id,
            merchantId,
            type: WalletType.POINTS,
          } as any,
        },
        update: {},
        create: {
          customerId: created.id,
          merchantId,
          type: WalletType.POINTS,
        },
      } as any);

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
    const customer = await this.ensureCustomer(merchantId, customerId);

    const now = new Date();
    const promos = await this.prisma.loyaltyPromotion.findMany({
      where: {
        merchantId,
        rewardType: PromotionRewardType.POINTS,
        rewardValue: { gt: 0 },
        status: { in: ['ACTIVE', 'SCHEDULED'] as any },
        AND: [
          {
            OR: [
              { startAt: null },
              { startAt: { lte: now } },
              { status: 'SCHEDULED' as any },
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
      const points = Math.max(0, Math.floor(Number(promo.rewardValue ?? 0)));
      if (!Number.isFinite(points) || points <= 0)
        throw new BadRequestException('invalid reward value');

      // audience check
      if (promo.segmentId) {
        const audience = await tx.customerSegment.findUnique({
          where: { id: promo.segmentId },
          select: { systemKey: true, isSystem: true, rules: true },
        });
        const rules =
          audience && audience.rules && typeof audience.rules === 'object'
            ? (audience.rules as Record<string, any>)
            : {};
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
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      const currentBalance = fresh?.balance ?? 0;
      const balance = currentBalance + points;
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance } });

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
        const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
        if (earnLot?.create) {
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
    settingsHint?: MerchantSettings | null,
  ): Promise<{
    settings: MerchantSettings | null;
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
      settingsHint ??
      (await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
      }));
    const rules =
      settings?.rulesJson && typeof settings.rulesJson === 'object'
        ? (settings.rulesJson as Record<string, any>)
        : null;
    const shareRaw =
      rules?.reviewsShare && typeof rules.reviewsShare === 'object'
        ? (rules.reviewsShare as Record<string, any>)
        : null;

    if (!shareRaw) {
      return { settings: settings ?? null, share: null };
    }

    const platformsRaw =
      shareRaw?.platforms && typeof shareRaw.platforms === 'object'
        ? (shareRaw.platforms as Record<string, any>)
        : null;

    const normalizePlatformOutlets = (cfg: any) => {
      const map = new Map<string, string>();
      const push = (outletIdRaw: unknown, value: unknown) => {
        const outletId =
          typeof outletIdRaw === 'string' ? outletIdRaw.trim() : '';
        const urlCandidate =
          typeof value === 'string'
            ? value
            : value && typeof value === 'object'
              ? ((value as any).url ??
                (value as any).link ??
                (value as any).href ??
                '')
              : '';
        const url = typeof urlCandidate === 'string' ? urlCandidate.trim() : '';
        if (!outletId || !url) return;
        if (!map.has(outletId)) {
          map.set(outletId, url);
        }
      };
      const collect = (source: any) => {
        if (!source || typeof source !== 'object') return;
        if (Array.isArray(source)) {
          for (const entry of source) {
            if (!entry || typeof entry !== 'object') continue;
            push(entry.outletId ?? entry.id, entry.url ?? entry.link ?? entry);
          }
          return;
        }
        for (const [key, value] of Object.entries(source)) {
          if (typeof value === 'string') {
            push(key, value);
          } else if (value && typeof value === 'object') {
            push(
              (value as any).outletId ?? key,
              (value as any).url ?? (value as any).link ?? null,
            );
          }
        }
      };
      collect(cfg?.outlets);
      collect(cfg?.links);
      collect(cfg?.byOutlet);
      collect(cfg?.urls);
      if (!map.size && cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        for (const [key, value] of Object.entries(cfg)) {
          if (['enabled', 'url', 'threshold', 'platforms'].includes(key))
            continue;
          if (typeof value === 'string') {
            push(key, value);
          } else if (value && typeof value === 'object') {
            push(key, (value as any).url ?? (value as any).link ?? null);
          }
        }
      }
      return Array.from(map.entries()).map(([outletId, url]) => ({
        outletId,
        url,
      }));
    };

    const platformConfigMap = new Map<string, Record<string, any>>();
    if (platformsRaw) {
      for (const [id, cfg] of Object.entries(platformsRaw)) {
        if (!cfg || typeof cfg !== 'object') continue;
        const normalizedId = String(id || '').trim();
        if (!normalizedId) continue;
        platformConfigMap.set(normalizedId, cfg as Record<string, any>);
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
      const urlRaw =
        cfg && typeof (cfg as any).url === 'string'
          ? (cfg as any).url.trim()
          : '';
      const url = urlRaw || null;
      const outletsList = outletLinkMap.get(id) ?? [];
      const hasExplicitPlatformEnabled =
        cfg != null && Object.prototype.hasOwnProperty.call(cfg, 'enabled');
      const platformEnabled = hasExplicitPlatformEnabled
        ? Boolean((cfg as any).enabled)
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

  // Plain ID или JWT
  private async resolveFromToken(userToken: string) {
    if (looksLikeJwt(userToken)) {
      const secret = process.env.QR_JWT_SECRET || 'dev_change_me';
      try {
        const v = await verifyQrToken(secret, userToken);
        return v; // { customerId, merchantAud, jti, iat, exp }
      } catch (e: any) {
        const code = e?.code || e?.name || '';
        const msg = String(e?.message || e || '');
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
    const now = Math.floor(Date.now() / 1000);
    return {
      customerId: userToken,
      merchantAud: undefined,
      jti: `plain:${userToken}:${now}`,
      iat: now,
      exp: now + 3600,
    } as const;
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
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const rules =
      settings?.rulesJson &&
      typeof settings.rulesJson === 'object' &&
      !Array.isArray(settings.rulesJson)
        ? (settings.rulesJson as Record<string, any>)
        : {};
    const reviewsEnabled =
      rules?.reviews && typeof rules.reviews === 'object'
        ? rules.reviews.enabled !== undefined
          ? Boolean(rules.reviews.enabled)
          : true
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

    const metadata: Record<string, any> = { source: 'loyalty-miniapp' };
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
      const { share } = await this.buildReviewsShareSettings(merchantId);
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
      const prismaAny = this.prisma as any;
      if (prismaAny?.$executeRaw) {
        await prismaAny.$executeRaw`
          SELECT pg_notify('loyalty_realtime_events', ${message}::text)
        `;
      }
    } catch {}

    return { ok: true, dismissedAt: payload.dismissedAt };
  }

  // ===== Cashier Auth (public) =====
  @Post('cashier/login')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, merchantId: { type: 'string' } },
    },
  })
  async cashierLogin(
    @Body() body: { merchantLogin?: string; password9?: string },
  ) {
    const merchantLogin = String(body?.merchantLogin || '');
    const password9 = String(body?.password9 || '');
    if (!merchantLogin || !password9 || password9.length !== 9)
      throw new BadRequestException(
        'merchantLogin and 9-digit password required',
      );
    const r = await this.merchants.authenticateCashier(
      merchantLogin,
      password9,
    );
    return { ok: true, merchantId: r.merchantId } as any;
  }

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
    const token = this.readCookie(req, 'cashier_device');
    if (token) {
      await this.merchants.revokeCashierDeviceSessionByToken(token);
    }
    this.clearCashierDeviceCookie(res);
    return { ok: true };
  }
  @Post('cashier/staff-token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'object', properties: { token: { type: 'string' } } },
  })
  async cashierStaffToken(
    @Body()
    body: {
      merchantLogin?: string;
      password9?: string;
      staffIdOrLogin?: string;
      outletId?: string;
      pinCode?: string;
    },
  ) {
    const merchantLogin = String(body?.merchantLogin || '');
    const password9 = String(body?.password9 || '');
    const staffIdOrLogin =
      body?.staffIdOrLogin != null ? String(body.staffIdOrLogin) : '';
    const outletId = String(body?.outletId || '');
    const pinCode = String(body?.pinCode || '');
    if (!merchantLogin || !password9 || password9.length !== 9)
      throw new BadRequestException(
        'merchantLogin and 9-digit password required',
      );
    if (!outletId) throw new BadRequestException('outletId required');
    if (!pinCode) throw new BadRequestException('pinCode required');
    return this.merchants.issueStaffTokenByPin(
      merchantLogin,
      password9,
      staffIdOrLogin,
      outletId,
      pinCode,
    );
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
    if (!merchant) throw new UnauthorizedException('Invalid cashier merchant login');
    if (merchant.id !== deviceSession.merchantId) {
      throw new UnauthorizedException('Device activated for another merchant');
    }

    return this.merchants.getStaffAccessByPin(deviceSession.merchantId, pinCode);
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
    if (!merchant) throw new UnauthorizedException('Invalid cashier merchant login');
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
    @Req() req: any,
    @Body() dto: CashierCustomerResolveDto,
  ) {
    const merchantId =
      typeof dto?.merchantId === 'string' ? dto.merchantId.trim() : '';
    const userToken =
      typeof dto?.userToken === 'string' ? dto.userToken.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!userToken) throw new BadRequestException('userToken required');
    const resolved = await this.resolveFromToken(userToken);
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
    @Req() req: any,
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
    @Req() req: any,
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
    return this.service.outletTransactions(merchantId, outletId, limit, before);
  }

  private async verifyStaffKey(
    merchantId: string,
    key: string,
  ): Promise<boolean> {
    if (!key) return false;
    try {
      const crypto = require('crypto');
      const hash = crypto
        .createHash('sha256')
        .update(key, 'utf8')
        .digest('hex');
      const staff = await this.prisma.staff.findFirst({
        where: {
          merchantId,
          apiKeyHash: hash,
          status: 'ACTIVE',
        },
      });
      return !!staff;
    } catch {
      return false;
    }
  }

  private async enforceRequireStaffKey(
    merchantId: string,
    req: Request,
  ): Promise<void> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    if (!settings?.requireStaffKey) return;

    const staffKey = req.headers['x-staff-key'] as string | undefined;
    const bridgeSig = req.headers['x-bridge-signature'] as string | undefined;

    // Для кассы staff-key необязателен; если передан — валидируем, иначе пропускаем
    if (staffKey) {
      const valid = await this.verifyStaffKey(merchantId, staffKey);
      if (!valid) throw new UnauthorizedException('Invalid staff key');
    }
    // Bridge-подпись для интеграций; в кассе не требуем, но если пришла — проверяем валидность ниже по коду
    if (!staffKey && bridgeSig) {
      // в этом методе не валидируем подпись, проверка выполняется в конкретных хендлерах при наличии заголовка
      return;
    }
  }

  @Post('qr')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({
    name: 'X-Bridge-Signature',
    required: false,
    description: 'Bridge signature (if requireBridgeSig enabled)',
  })
  @ApiHeader({
    name: 'X-Staff-Key',
    required: false,
    description: 'Staff API key',
  })
  @ApiOkResponse({ type: QrMintRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async mintQr(@Body() dto: QrMintDto, @Req() req: Request) {
    // Optional authentication signals: teleauth or staff key or bridge signature; enforce only if merchant requires
    const hasTeleauth = !!(req as any).teleauth?.customerId;
    const hasInitData =
      typeof dto.initData === 'string' && dto.initData.trim().length > 0;
    const hasAuth = hasTeleauth || hasInitData;
    const staffKey = req.headers['x-staff-key'] as string | undefined;
    const bridgeSig = req.headers['x-bridge-signature'] as string | undefined;

    // Verify staff key if provided
    if (staffKey && !hasAuth) {
      if (!dto.merchantId) throw new BadRequestException('merchantId required');
      const valid = await this.verifyStaffKey(dto.merchantId, staffKey);
      if (!valid) throw new UnauthorizedException('Invalid staff key');
    }

    // If merchant requires Bridge signature for QR minting, enforce it
    if (!hasAuth && !staffKey && dto.merchantId && dto.customerId) {
      const settings = await this.prisma.merchantSettings.findUnique({
        where: { merchantId: dto.merchantId },
      });
      if (settings?.requireBridgeSig) {
        if (!bridgeSig)
          throw new UnauthorizedException('X-Bridge-Signature required');
        const bodyForSig = JSON.stringify({
          merchantId: dto.merchantId,
          customerId: dto.customerId,
        });
        let verified = false;
        if (
          settings.bridgeSecret &&
          verifyBridgeSigUtil(bridgeSig, bodyForSig, settings.bridgeSecret)
        )
          verified = true;
        else if (
          (settings as any)?.bridgeSecretNext &&
          verifyBridgeSigUtil(
            bridgeSig,
            bodyForSig,
            (settings as any).bridgeSecretNext,
          )
        )
          verified = true;
        if (!verified)
          throw new UnauthorizedException('Invalid bridge signature');
      }
    }

    // Если указаны merchantId и initData — валидируем Telegram initData токеном мерчанта
    const secret = process.env.QR_JWT_SECRET || 'dev_change_me';
    if (dto.initData && dto.merchantId) {
      const s = await this.prisma.merchantSettings.findUnique({
        where: { merchantId: dto.merchantId },
      });
      const botToken =
        (s as any)?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
      if (!botToken) throw new BadRequestException('Bot token not configured');
      const r = validateTelegramInitData(botToken, dto.initData);
      if (!r.ok) throw new BadRequestException('Invalid initData');
      // опционально: если включено требование start_param, проверим соответствие merchantId
      if ((s as any)?.telegramStartParamRequired) {
        try {
          const p = new URLSearchParams(dto.initData);
          const sp = p.get('start_param') || p.get('startapp') || '';
          if (sp && sp !== dto.merchantId)
            throw new BadRequestException(
              'merchantId mismatch with start_param',
            );
        } catch {}
      }
    } else {
      // Нет initData: допускаем только если у мерчанта явно НЕ требуется staff key
      if (!dto.merchantId) throw new BadRequestException('merchantId required');
      const s = await this.prisma.merchantSettings.findUnique({
        where: { merchantId: dto.merchantId },
      });
      const requireStaffKey = Boolean(s?.requireStaffKey);
      if (requireStaffKey) {
        // Guard заблокирует без X-Staff-Key; здесь оставим явную проверку для ясности ответов
        throw new BadRequestException('Staff key required');
      }
    }

    let ttl = dto.ttlSec ?? 60;
    if (!dto.ttlSec && dto.merchantId) {
      const s = await this.prisma.merchantSettings.findUnique({
        where: { merchantId: dto.merchantId },
      });
      if (s?.qrTtlSec) ttl = s.qrTtlSec;
    }
    if (!dto.merchantId) throw new BadRequestException('merchantId required');
    await this.ensureCustomer(dto.merchantId, dto.customerId);
    const token = await signQrToken(
      secret,
      dto.customerId,
      dto.merchantId,
      ttl,
    );
    return { token, ttl };
  }

  @Post('quote')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiHeader({
    name: 'X-Staff-Key',
    required: false,
    description: 'Ключ кассира (если включено requireStaffKey)',
  })
  @ApiHeader({
    name: 'X-Bridge-Signature',
    required: false,
    description: 'Подпись Bridge (если включено requireBridgeSig)',
  })
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
    @Req() req: Request & { requestId?: string },
  ) {
    const t0 = Date.now();
    try {
      const v = await this.resolveFromToken(dto.userToken);
      const customerId = v.customerId;
      const customer = await this.ensureCustomer(dto.merchantId, customerId);
      const s = await this.prisma.merchantSettings.findUnique({
        where: { merchantId: dto.merchantId },
      });
      if (s?.requireJwtForQuote && !looksLikeJwt(dto.userToken)) {
        this.metrics.inc('loyalty_quote_requests_total', {
          result: 'error',
          reason: 'jwt_required',
        });
        throw new BadRequestException('JWT required for quote');
      }
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
      // атрибуция staffId по x-staff-key, если не передан явно
      let staffId = dto.staffId;
      if (!staffId) {
        const key =
          (req.headers['x-staff-key'] as string | undefined) || undefined;
        if (key) {
          try {
            const hash = require('crypto')
              .createHash('sha256')
              .update(key, 'utf8')
              .digest('hex');
            const staff = await this.prisma.staff.findFirst({
              where: {
                merchantId: dto.merchantId,
                apiKeyHash: hash,
                status: 'ACTIVE',
              },
            });
            if (staff) staffId = staff.id;
          } catch {}
        }
      }
      const outlet = await this.resolveOutlet(
        dto.merchantId,
        dto.outletId ?? null,
      );
      const qrMeta = looksLikeJwt(dto.userToken)
        ? { jti: v.jti, iat: v.iat, exp: v.exp }
        : undefined;
      // проверка подписи Bridge при необходимости
      if (s?.requireBridgeSig) {
        const sig =
          (req.headers['x-bridge-signature'] as string | undefined) || '';
        if (sig) {
          let secret: string | null = outlet?.bridgeSecret ?? null;
          let alt: string | null = outlet?.bridgeSecretNext ?? null;
          if (!secret && !alt) {
            secret = s?.bridgeSecret || null;
            alt = (s as any)?.bridgeSecretNext || null;
          }
          const bodyForSig = JSON.stringify(dto);
          let ok = false;
          if (secret && verifyBridgeSigUtil(sig, bodyForSig, secret)) ok = true;
          else if (alt && verifyBridgeSigUtil(sig, bodyForSig, alt)) ok = true;
          if (!ok) throw new UnauthorizedException('Invalid bridge signature');
        }
      }
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
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/JWTExpired|"exp"/.test(msg))
        this.metrics.inc('loyalty_jwt_expired_total');
      this.metrics.inc('loyalty_quote_requests_total', { result: 'error' });
      throw e;
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
  @ApiHeader({
    name: 'X-Bridge-Signature',
    required: false,
    description: 'Подпись Bridge (если включено requireBridgeSig)',
  })
  @ApiOkResponse({ type: CommitRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async commit(
    @Body() dto: CommitDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request & { requestId?: string },
  ) {
    const t0 = Date.now();
    let data: any;
    // кешируем hold для извлечения контекста (merchantId, outletId, staffId)
    let holdCached: any = null;
    try {
      holdCached = await this.prisma.hold.findUnique({
        where: { id: dto.holdId },
      });
    } catch {}
    const merchantIdEff = dto.merchantId || holdCached?.merchantId;
    // staff-key больше не требуется для кассы; проверяем только при явном заголовке
    if (merchantIdEff) {
      const staffKeyHeader = req.headers['x-staff-key'] as string | undefined;
      if (staffKeyHeader) {
        const valid = await this.verifyStaffKey(merchantIdEff, staffKeyHeader);
        if (!valid) throw new UnauthorizedException('Invalid staff key');
      }
    }

    let customerId: string | null = null;
    if (holdCached?.customerId && merchantIdEff) {
      const customer = await this.ensureCustomer(
        merchantIdEff,
        holdCached.customerId,
      );
      customerId = customer.id;
    }
    // проверка подписи Bridge до выполнения, с учётом outlet из hold
    try {
      const s = merchantIdEff
        ? await this.prisma.merchantSettings.findUnique({
            where: { merchantId: merchantIdEff },
          })
        : null;
      if (s?.requireBridgeSig) {
        const sig =
          (req.headers['x-bridge-signature'] as string | undefined) || '';
        if (sig) {
          const outlet = await this.resolveOutlet(
            merchantIdEff,
            holdCached?.outletId ?? null,
          );
          let secret: string | null = outlet?.bridgeSecret ?? null;
          let alt: string | null = outlet?.bridgeSecretNext ?? null;
          if (!secret && !alt) {
            secret = s?.bridgeSecret || null;
            alt = (s as any)?.bridgeSecretNext || null;
          }
          const bodyForSig = JSON.stringify({
            merchantId: merchantIdEff,
            holdId: dto.holdId,
            orderId: dto.orderId,
            receiptNumber: dto.receiptNumber ?? undefined,
          });
          let ok = false;
          if (secret && verifyBridgeSigUtil(sig, bodyForSig, secret)) ok = true;
          else if (alt && verifyBridgeSigUtil(sig, bodyForSig, alt)) ok = true;
          if (!ok) throw new UnauthorizedException('Invalid bridge signature');
        }
      }
    } catch {}
    try {
      const idemKey =
        (req.headers['idempotency-key'] as string | undefined) || undefined;
      const commitOpts =
        dto.positions && Array.isArray(dto.positions)
          ? { positions: dto.positions }
          : undefined;
      if (idemKey) {
        const merchantForIdem = merchantIdEff || undefined;
        if (merchantForIdem) {
          const saved = await this.prisma.idempotencyKey.findUnique({
            where: {
              merchantId_key: { merchantId: merchantForIdem, key: idemKey },
            },
          });
          if (saved) {
            data = saved.response as any;
          } else {
            data = await this.service.commit(
              dto.holdId,
              dto.orderId,
              dto.receiptNumber,
              req.requestId,
              commitOpts,
            );
            if (
              data &&
              typeof data === 'object' &&
              data.alreadyCommitted === true
            ) {
              const { alreadyCommitted, ...rest } = data;
              data = rest;
            }
            try {
              const ttlH = Number(process.env.IDEMPOTENCY_TTL_HOURS || '72');
              const exp = new Date(Date.now() + ttlH * 3600 * 1000);
              await this.prisma.idempotencyKey.create({
                data: {
                  merchantId: merchantForIdem,
                  key: idemKey,
                  response: data,
                  expiresAt: exp,
                },
              });
            } catch {}
          }
        } else {
          data = await this.service.commit(
            dto.holdId,
            dto.orderId,
            dto.receiptNumber,
            req.requestId,
            commitOpts,
          );
        }
      } else {
        data = await this.service.commit(
          dto.holdId,
          dto.orderId,
          dto.receiptNumber,
          req.requestId,
          commitOpts,
        );
      }
      this.metrics.inc('loyalty_commit_requests_total', {
        result: data?.alreadyCommitted ? 'already_committed' : 'ok',
      });
    } catch (e) {
      this.metrics.inc('loyalty_commit_requests_total', { result: 'error' });
      throw e;
    } finally {
      this.metrics.observe('loyalty_commit_latency_ms', Date.now() - t0);
    }
    try {
      const s = merchantIdEff
        ? await this.prisma.merchantSettings.findUnique({
            where: { merchantId: merchantIdEff },
          })
        : null;
      const useNext =
        Boolean((s as any)?.useWebhookNext) && !!(s as any)?.webhookSecretNext;
      const secret = (
        useNext ? (s as any)?.webhookSecretNext : s?.webhookSecret
      ) as string | undefined;
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const body = JSON.stringify(data);
        const sig = createHmac('sha256', secret)
          .update(`${ts}.${body}`)
          .digest('base64');
        res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
        if (merchantIdEff) res.setHeader('X-Merchant-Id', merchantIdEff);
        res.setHeader('X-Signature-Timestamp', ts);
        const kid = useNext ? (s as any)?.webhookKeyIdNext : s?.webhookKeyId;
        if (kid) res.setHeader('X-Signature-Key-Id', kid);
        if (req.requestId) res.setHeader('X-Request-Id', req.requestId);
      }
    } catch {}
    if (customerId && data && typeof data === 'object') {
      data.customerId = customerId;
    }
    return data;
  }

  @Post('cancel')
  @ApiOkResponse({ type: OkDto })
  async cancel(@Body('holdId') holdId: string, @Req() req: Request) {
    if (!holdId) throw new BadRequestException('holdId required');
    try {
      const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
      const merchantId = hold?.merchantId;
      if (merchantId) {
        const staffKeyHeader = req.headers['x-staff-key'] as string | undefined;
        if (staffKeyHeader) {
          const valid = await this.verifyStaffKey(merchantId, staffKeyHeader);
          if (!valid) throw new UnauthorizedException('Invalid staff key');
        }
      }
    } catch {}
    return this.service.cancel(holdId);
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
    const { settings: s, share } =
      await this.buildReviewsShareSettings(merchantId);
    const rulesRaw =
      s?.rulesJson && typeof s.rulesJson === 'object' && !Array.isArray(s.rulesJson)
        ? (s.rulesJson as Record<string, any>)
        : {};
    const reviewsEnabled =
      rulesRaw?.reviews && typeof rulesRaw.reviews === 'object'
        ? rulesRaw.reviews.enabled !== undefined
          ? Boolean(rulesRaw.reviews.enabled)
          : true
        : true;
    return {
      merchantId,
      qrTtlSec: s?.qrTtlSec ?? 120,
      miniappThemePrimary: (s as any)?.miniappThemePrimary ?? null,
      miniappThemeBg: (s as any)?.miniappThemeBg ?? null,
      miniappLogoUrl: (s as any)?.miniappLogoUrl ?? null,
      reviewsEnabled,
      reviewsShare: share,
    } as any;
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
  @ApiHeader({
    name: 'X-Bridge-Signature',
    required: false,
    description: 'Подпись Bridge (если включено requireBridgeSig)',
  })
  @ApiOkResponse({ type: RefundRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async refund(
    @Body() dto: RefundDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request & { requestId?: string },
  ) {
    const merchantId =
      typeof dto?.merchantId === 'string' ? dto.merchantId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId required');
    const rawInvoice =
      (dto as any)?.invoice_num ??
      (dto as any)?.invoiceNum ??
      (dto as any)?.orderId ??
      (dto as any)?.order_id;
    let invoiceNum =
      typeof rawInvoice === 'string' && rawInvoice.trim().length > 0
        ? rawInvoice.trim()
        : '';
    let orderId =
      typeof (dto as any)?.order_id === 'string' &&
      (dto as any).order_id.trim().length > 0
        ? (dto as any).order_id.trim()
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
      const receipt = await this.prisma.receipt.findFirst({
        where: { merchantId, receiptNumber },
        select: { orderId: true, id: true },
      });
      if (!receipt?.orderId) {
        throw new BadRequestException('Receipt not found');
      }
      invoiceNum = receipt.orderId;
      orderId = receipt.id ?? '';
    }
    let operationDate: Date | null = null;
    if (dto.operationDate) {
      const parsed = new Date(dto.operationDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('operationDate must be a valid date');
      }
      operationDate = parsed;
    }
    (dto as any).merchantId = merchantId;
    (dto as any).invoice_num = invoiceNum;
    (dto as any).order_id = orderId;
    const staffKeyHeader = req.headers['x-staff-key'] as string | undefined;
    if (staffKeyHeader) {
      const valid = await this.verifyStaffKey(merchantId, staffKeyHeader);
      if (!valid) throw new UnauthorizedException('Invalid staff key');
    }
    let customerId: string | null = null;
    let data: any;
    // проверка подписи Bridge до выполнения
    try {
      const s = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
      });
      if (s?.requireBridgeSig) {
        const sig =
          (req.headers['x-bridge-signature'] as string | undefined) || '';
        if (sig) {
          let receiptOutletId: string | null = null;
          try {
            const rcp = await this.prisma.receipt.findUnique({
              where: {
                merchantId_orderId: {
                  merchantId,
                  orderId,
                },
              },
              select: { outletId: true },
            });
            receiptOutletId = rcp?.outletId ?? null;
          } catch {}
          const outlet = await this.resolveOutlet(merchantId, receiptOutletId);
          let secret: string | null = outlet?.bridgeSecret ?? null;
          let alt: string | null = outlet?.bridgeSecretNext ?? null;
          if (!secret && !alt) {
            secret = s?.bridgeSecret || null;
            alt = (s as any)?.bridgeSecretNext || null;
          }
          const bodyForSig = JSON.stringify({
            merchantId,
            invoice_num: invoiceNum,
            order_id: orderId || undefined,
          });
          let ok = false;
          if (secret && verifyBridgeSigUtil(sig, bodyForSig, secret)) ok = true;
          else if (alt && verifyBridgeSigUtil(sig, bodyForSig, alt)) ok = true;
          if (!ok) throw new UnauthorizedException('Invalid bridge signature');
        }
      }
    } catch {}
    try {
      const idemKey =
        (req.headers['idempotency-key'] as string | undefined) || undefined;
      if (idemKey) {
        const saved = await this.prisma.idempotencyKey.findUnique({
          where: {
            merchantId_key: { merchantId, key: idemKey },
          },
        });
        if (saved) {
          data = saved.response as any;
        } else {
          data = await this.service.refund({
            merchantId,
            invoiceNum,
            orderId,
            requestId: req.requestId,
            deviceId: dto.deviceId,
            operationDate,
          });
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
          try {
            const ttlH = Number(process.env.IDEMPOTENCY_TTL_HOURS || '72');
            const exp = new Date(Date.now() + ttlH * 3600 * 1000);
            await this.prisma.idempotencyKey.create({
              data: {
                merchantId,
                key: idemKey,
                response: data,
                expiresAt: exp,
              },
            });
          } catch {}
        }
      } else {
        data = await this.service.refund({
          merchantId,
          invoiceNum,
          orderId,
          requestId: req.requestId,
          deviceId: dto.deviceId,
          operationDate,
        });
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
      const s = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
      });
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
    if (customerId && data && typeof data === 'object') {
      data.customerId = customerId;
    }
    return data;
  }

  // Telegram miniapp auth: принимает merchantId + initData, валидирует токеном бота мерчанта и возвращает customerId
  @Post('teleauth')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async teleauth(@Body() body: { merchantId?: string; initData?: string }) {
    const merchantId = body?.merchantId;
    const initData = body?.initData || '';
    if (!initData) throw new BadRequestException('initData is required');
    // определяем токен бота: из настроек мерчанта или глобальный (dev)
    let token = process.env.TELEGRAM_BOT_TOKEN || '';
    let startParamRequired = false;
    if (merchantId) {
      try {
        const s = await this.prisma.merchantSettings.findUnique({
          where: { merchantId },
        });
        if (s && (s as any).telegramBotToken)
          token = (s as any).telegramBotToken as string;
        // если включено требование start_param — сверим merchantId с deep-link параметром
        startParamRequired = Boolean((s as any)?.telegramStartParamRequired);
        if (startParamRequired) {
          try {
            const p = new URLSearchParams(initData);
            const sp = p.get('start_param') || p.get('startapp') || '';
            if (sp && sp !== merchantId)
              throw new BadRequestException(
                'merchantId mismatch with start_param',
              );
          } catch {}
        }
      } catch {}
    }
    if (!token) throw new BadRequestException('Bot token not configured');
    const r = validateTelegramInitData(token, initData || '');
    if (!r.ok || !r.userId) throw new BadRequestException('Invalid initData');
    // Validate optional signed start_param (JWT-like HS256) when present
    try {
      const p = new URLSearchParams(initData);
      const sp = p.get('start_param') || p.get('startapp') || '';
      if (sp) {
        const parts = sp.split('.');
        const looksLikeJwt =
          parts.length === 3 &&
          parts.every((x) => x && /^[A-Za-z0-9_-]+$/.test(x));
        if (looksLikeJwt) {
          const secret = process.env.TMA_LINK_SECRET || '';
          if (!secret)
            throw new BadRequestException(
              'Server misconfigured: TMA_LINK_SECRET not set',
            );
          const [h, pld, sig] = parts;
          const data = `${h}.${pld}`;
          const expected = createHmac('sha256', secret)
            .update(data)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
          if (expected !== sig)
            throw new BadRequestException('Invalid start_param signature');
          const json = JSON.parse(
            Buffer.from(
              pld.replace(/-/g, '+').replace(/_/g, '/'),
              'base64',
            ).toString('utf8'),
          );
          const claimedMerchant =
            typeof json?.merchantId === 'string' ? json.merchantId : '';
          if (merchantId && claimedMerchant && claimedMerchant !== merchantId) {
            throw new BadRequestException(
              'merchantId mismatch with start_param',
            );
          }
        }
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      // ignore malformed start_param
    }
    // Customer теперь per-merchant модель
    const tgId = String(r.userId);
    if (!merchantId) {
      throw new BadRequestException('merchantId required');
    }

    // Ищем или создаём Customer по tgId для данного мерчанта
    let customer = await this.prisma.customer.findUnique({
      where: { merchantId_tgId: { merchantId, tgId } },
    });

    if (!customer) {
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
    return { ok: true, customerId: customer.id, ...flags };
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

    const phoneRaw =
      typeof (body as any)?.phone === 'string'
        ? (body as any).phone.trim()
        : '';
    const mustRequirePhone = !customer.phone;
    if (mustRequirePhone && !phoneRaw) {
      throw new BadRequestException(
        'Без номера телефона мы не можем зарегистрировать вас в программе лояльности',
      );
    }
    let phoneNormalized: string | null = null;
    if (phoneRaw) {
      phoneNormalized = this.normalizePhoneStrict(phoneRaw);
    }

    // Customer теперь per-merchant модель, обновляем напрямую
    const completionMark = new Date();
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let targetCustomer = customer;
        let mergedCustomerId: string | null = null;

        if (phoneNormalized) {
          const existingByPhone = await tx.customer.findFirst({
            where: { merchantId, phone: phoneNormalized },
          });
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

        const updates: Record<string, any> = {
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

        await tx.wallet.upsert({
          where: {
            customerId_merchantId_type: {
              customerId: updatedCustomer.id,
              merchantId,
              type: WalletType.POINTS,
            } as any,
          },
          update: {},
          create: {
            customerId: updatedCustomer.id,
            merchantId,
            type: WalletType.POINTS,
          },
        } as any);

        return { updatedCustomer, mergedCustomerId };
      });
      const payload = this.toProfileDto(result.updatedCustomer);
      return result.mergedCustomerId
        ? { ...payload, customerId: result.mergedCustomerId }
        : payload;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      const code = e?.code || '';
      const msg = String(e?.message || '');
      if (code === 'P2002' || /Unique constraint/i.test(msg)) {
        throw new BadRequestException('Номер телефона уже используется');
      }
      throw e;
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
      address: o.address ?? undefined,
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
      login: s.login ?? undefined,
      role: s.role,
    }));
  }

  // verifyBridgeSignature: вынесен в ./bridge.util.ts

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
