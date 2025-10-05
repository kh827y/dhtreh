import { Body, Controller, Post, Get, Param, Query, BadRequestException, Res, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiExtraModels, ApiHeader, ApiOkResponse, ApiTags, ApiUnauthorizedResponse, getSchemaPath } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LoyaltyService } from './loyalty.service';
import { MerchantsService } from '../merchants/merchants.service';
import { CommitDto, QrMintDto, QuoteDto, RefundDto, QuoteRedeemRespDto, QuoteEarnRespDto, CommitRespDto, RefundRespDto, QrMintRespDto, OkDto, BalanceDto, PublicSettingsDto, TransactionsRespDto, PublicOutletDto, PublicStaffDto, ConsentGetRespDto, ErrorDto } from './dto';
import { looksLikeJwt, signQrToken, verifyQrToken } from './token.util';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { CashierGuard } from '../guards/cashier.guard';
import { AntiFraudGuard } from '../guards/antifraud.guard';
import { SubscriptionGuard } from '../guards/subscription.guard';
import type { Request, Response } from 'express';
import { createHmac } from 'crypto';
import { verifyBridgeSignature as verifyBridgeSigUtil } from './bridge.util';
import { validateTelegramInitData } from './telegram.util';
import { PromosService } from '../promos/promos.service';
import { PromoCodesService } from '../promocodes/promocodes.service';
import { ReviewService } from '../reviews/review.service';
import type { MerchantSettings } from '@prisma/client';
import { LedgerAccount, TxnType, WalletType, PromotionStatus, PromotionRewardType } from '@prisma/client';

@Controller('loyalty')
@UseGuards(CashierGuard)
@ApiTags('loyalty')
@ApiExtraModels(QuoteRedeemRespDto, QuoteEarnRespDto)
export class LoyaltyController {
  constructor(
    private readonly service: LoyaltyService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly promos: PromosService,
    private readonly promoCodes: PromoCodesService,
    private readonly merchants: MerchantsService,
    private readonly reviews: ReviewService,
  ) {}

  private async resolveOutlet(merchantId?: string, outletId?: string | null) {
    if (!merchantId) return null;
    if (outletId) {
      try {
        const found = await this.prisma.outlet.findFirst({ where: { id: outletId, merchantId } });
        if (found) return found;
      } catch {}
    }
    return null;
  }

  

  // ===== Promotions (miniapp public) =====
  @Get('promotions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async listPromotions(
    @Query('merchantId') merchantId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const mid = typeof merchantId === 'string' ? merchantId.trim() : '';
    const cid = typeof customerId === 'string' ? customerId.trim() : '';
    if (!mid) throw new BadRequestException('merchantId required');
    if (!cid) throw new BadRequestException('customerId required');
    const now = new Date();
    const promos = await this.prisma.loyaltyPromotion.findMany({
      where: {
        merchantId: mid,
        status: { in: ['ACTIVE', 'SCHEDULED'] as any },
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }, { status: 'SCHEDULED' as any }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          { OR: [{ segmentId: null }, { audience: { customers: { some: { customerId: cid } } } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { metrics: true },
    });
    const existing = await this.prisma.promotionParticipant.findMany({
      where: { merchantId: mid, customerId: cid, promotionId: { in: promos.map((p) => p.id) } },
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
      canClaim: p.status === PromotionStatus.ACTIVE && p.rewardType === PromotionRewardType.POINTS && (p.rewardValue ?? 0) > 0 && !claimedSet.has(p.id),
      claimed: claimedSet.has(p.id),
    }));
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
    const merchantId = typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    const customerId = typeof body?.customerId === 'string' ? body.customerId.trim() : '';
    const promotionId = typeof body?.promotionId === 'string' ? body.promotionId.trim() : '';
    const outletId = typeof body?.outletId === 'string' && body.outletId.trim() ? body.outletId.trim() : null;
    const staffId = typeof body?.staffId === 'string' && body.staffId.trim() ? body.staffId.trim() : null;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');
    if (!promotionId) throw new BadRequestException('promotionId required');

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const promo = await tx.loyaltyPromotion.findFirst({ where: { id: promotionId, merchantId } });
      if (!promo) throw new BadRequestException('promotion not found');
      if (promo.status !== PromotionStatus.ACTIVE) throw new BadRequestException('promotion is not active');
      if (promo.startAt && promo.startAt > now) throw new BadRequestException('promotion not started yet');
      if (promo.endAt && promo.endAt < now) throw new BadRequestException('promotion ended');
      if (promo.rewardType !== PromotionRewardType.POINTS) throw new BadRequestException('promotion is not points type');
      const points = Math.max(0, Math.floor(Number(promo.rewardValue ?? 0)));
      if (!Number.isFinite(points) || points <= 0) throw new BadRequestException('invalid reward value');

      // audience check
      if (promo.segmentId) {
        const inSeg = await tx.segmentCustomer.findFirst({ where: { segmentId: promo.segmentId, customerId } });
        if (!inSeg) throw new BadRequestException('not eligible for promotion');
      }

      // idempotency: if already participated — return alreadyClaimed
      const existing = await tx.promotionParticipant.findFirst({ where: { merchantId, promotionId, customerId } });
      if (existing) {
        const walletEx = await tx.wallet.findFirst({ where: { merchantId, customerId, type: WalletType.POINTS } });
        return {
          ok: true,
          alreadyClaimed: true,
          promotionId,
          pointsIssued: 0,
          balance: walletEx?.balance ?? 0,
        } as const;
      }

      // Ensure wallet
      let wallet = await tx.wallet.findFirst({ where: { merchantId, customerId, type: WalletType.POINTS } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { merchantId, customerId, type: WalletType.POINTS, balance: 0 } });
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
        this.metrics.inc('loyalty_ledger_amount_total', { type: 'earn' }, points);
      }

      // Earn lot (optional)
      const expireDays = promo.pointsExpireInDays ?? null;
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
              expiresAt: expireDays ? new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000) : null,
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
          create: { promotionId, merchantId, participantsCount: 1, pointsIssued: points },
          update: { participantsCount: { increment: 1 }, pointsIssued: { increment: points } },
        });
      } catch {}

      this.metrics.inc('loyalty_promotions_claim_total', { result: 'ok' });
      return {
        ok: true,
        promotionId,
        pointsIssued: points,
        pointsExpireInDays: expireDays,
        pointsExpireAt: expireDays ? new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000).toISOString() : null,
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
    const settings = settingsHint ?? (await this.prisma.merchantSettings.findUnique({ where: { merchantId } }));
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
        const outletId = typeof outletIdRaw === 'string' ? outletIdRaw.trim() : '';
        const urlCandidate =
          typeof value === 'string'
            ? value
            : value && typeof value === 'object'
              ? ((value as any).url ?? (value as any).link ?? (value as any).href ?? '')
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
            push((entry as any).outletId ?? (entry as any).id, (entry as any).url ?? (entry as any).link ?? entry);
          }
          return;
        }
        for (const [key, value] of Object.entries(source)) {
          if (typeof value === 'string') {
            push(key, value);
          } else if (value && typeof value === 'object') {
            push((value as any).outletId ?? key, (value as any).url ?? (value as any).link ?? null);
          }
        }
      };
      collect(cfg?.outlets);
      collect(cfg?.links);
      collect(cfg?.byOutlet);
      collect(cfg?.urls);
      if (!map.size && cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        for (const [key, value] of Object.entries(cfg)) {
          if (['enabled', 'url', 'threshold', 'platforms'].includes(key)) continue;
          if (typeof value === 'string') {
            push(key, value);
          } else if (value && typeof value === 'object') {
            push(key, (value as any).url ?? (value as any).link ?? null);
          }
        }
      }
      return Array.from(map.entries()).map(([outletId, url]) => ({ outletId, url }));
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

    const outletLinkMap = new Map<string, Array<{ outletId: string; url: string }>>();
    const pushOutletLink = (platformId: string, outletId: string, url: string) => {
      if (!platformId || !outletId || !url) return;
      const list = outletLinkMap.get(platformId) ?? [];
      const existingIndex = list.findIndex((entry) => entry.outletId === outletId);
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
        const platformId = typeof platformIdRaw === 'string' ? platformIdRaw.trim() : '';
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
      const urlRaw = cfg && typeof (cfg as any).url === 'string' ? (cfg as any).url.trim() : '';
      const url = urlRaw || null;
      const outletsList = outletLinkMap.get(id) ?? [];
      const hasExplicitPlatformEnabled = cfg != null && Object.prototype.hasOwnProperty.call(cfg, 'enabled');
      const platformEnabled = hasExplicitPlatformEnabled ? Boolean((cfg as any).enabled) : true;
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
    share:
      | null
      | {
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
    const normalizedOutletId = typeof outletId === 'string' && outletId.trim() ? outletId.trim() : null;
    if (!normalizedOutletId) return [];
    const result: Array<{ id: string; url: string }> = [];
    for (const platform of share.platforms) {
      if (!platform || !platform.enabled) continue;
      const outlets = Array.isArray(platform.outlets) ? platform.outlets : [];
      const outletMatch = outlets.find(
        (item) => item && item.outletId === normalizedOutletId && typeof item.url === 'string' && item.url.trim(),
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
        const msg  = String(e?.message || e || '');
        if (code === 'ERR_JWT_EXPIRED' || /JWTExpired/i.test(code) || /"exp"/i.test(msg)) {
          // отдадим 400 с предсказуемым текстом, чтобы фронт показал «QR истёк»
          throw new BadRequestException('JWTExpired: "exp" claim timestamp check failed');
        }
        throw new BadRequestException('Bad QR token');
      }
    }
    const now = Math.floor(Date.now() / 1000);
    return { customerId: userToken, merchantAud: undefined, jti: `plain:${userToken}:${now}`, iat: now, exp: now + 3600 };
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
    const merchantId = typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId is required');

    const customerId = typeof body?.customerId === 'string' ? body.customerId.trim() : '';
    if (!customerId) throw new BadRequestException('customerId is required');

    const ratingRaw = typeof body?.rating === 'string' ? Number(body.rating) : body?.rating;
    if (!Number.isFinite(ratingRaw)) throw new BadRequestException('rating is required');
    const rating = Math.round(Number(ratingRaw));
    if (rating < 1 || rating > 5) throw new BadRequestException('rating must be between 1 and 5');

    const comment = typeof body?.comment === 'string' ? body.comment.trim() : '';
    const orderIdRaw = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const orderId = orderIdRaw.length > 0 ? orderIdRaw : undefined;
    const transactionIdRaw =
      typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
    const transactionId = transactionIdRaw.length > 0 ? transactionIdRaw : undefined;
    const outletIdRaw = typeof body?.outletId === 'string' ? body.outletId.trim() : '';
    const outletId = outletIdRaw.length > 0 ? outletIdRaw : undefined;
    const staffIdRaw = typeof body?.staffId === 'string' ? body.staffId.trim() : '';
    const staffId = staffIdRaw.length > 0 ? staffIdRaw : undefined;
    if (!orderId && !transactionId) {
      throw new BadRequestException('transactionId или orderId обязательны для отзыва');
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
        customerId,
        orderId,
        transactionId,
        rating,
        comment,
        title,
        tags,
        photos,
        isAnonymous: false,
      },
      { autoApprove: true, metadata },
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
      const enabled = !!(sharePayload?.enabled);
      const threshold = sharePayload?.threshold ?? 5;
      const hasOptions = (sharePayload?.options?.length ?? 0) > 0;
      const outcomeShown = hasOutlet && enabled && rating >= threshold && hasOptions;
      let reason = 'ok';
      if (!hasOutlet) reason = 'no_outlet';
      else if (!enabled) reason = 'disabled';
      else if (rating < threshold) reason = 'low_rating';
      else if (!hasOptions) reason = 'no_options';
      this.metrics.inc('reviews_share_stage_total', { outcome: outcomeShown ? 'shown' : 'hidden', reason });
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

  // ===== Cashier Auth (public) =====
  @Post('cashier/login')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, merchantId: { type: 'string' } } } })
  async cashierLogin(@Body() body: { merchantLogin?: string; password9?: string }) {
    const merchantLogin = String(body?.merchantLogin || '');
    const password9 = String(body?.password9 || '');
    if (!merchantLogin || !password9 || password9.length !== 9) throw new BadRequestException('merchantLogin and 9-digit password required');
    const r = await this.merchants.authenticateCashier(merchantLogin, password9);
    return { ok: true, merchantId: r.merchantId } as any;
  }
  @Post('cashier/staff-token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ schema: { type: 'object', properties: { token: { type: 'string' } } } })
  async cashierStaffToken(@Body() body: { merchantLogin?: string; password9?: string; staffIdOrLogin?: string; outletId?: string; pinCode?: string }) {
    const merchantLogin = String(body?.merchantLogin || '');
    const password9 = String(body?.password9 || '');
    const staffIdOrLogin = body?.staffIdOrLogin != null ? String(body.staffIdOrLogin) : '';
    const outletId = String(body?.outletId || '');
    const pinCode = String(body?.pinCode || '');
    if (!merchantLogin || !password9 || password9.length !== 9) throw new BadRequestException('merchantLogin and 9-digit password required');
    if (!outletId) throw new BadRequestException('outletId required');
    if (!pinCode) throw new BadRequestException('pinCode required');
    return this.merchants.issueStaffTokenByPin(merchantLogin, password9, staffIdOrLogin, outletId, pinCode);
  }
  @Post('cashier/staff-access')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ schema: { type: 'object', properties: { staff: { type: 'object', additionalProperties: true }, accesses: { type: 'array', items: { type: 'object', additionalProperties: true } } } } })
  async cashierStaffAccess(@Body() body: { merchantLogin?: string; password9?: string; pinCode?: string }) {
    const merchantLogin = String(body?.merchantLogin || '');
    const password9 = String(body?.password9 || '');
    const pinCode = String(body?.pinCode || '');
    if (!merchantLogin || !password9 || password9.length !== 9) throw new BadRequestException('merchantLogin and 9-digit password required');
    if (!pinCode || pinCode.length !== 4) throw new BadRequestException('pinCode (4 digits) required');
    const auth = await this.merchants.authenticateCashier(merchantLogin, password9);
    return this.merchants.getStaffAccessByPin(auth.merchantId, pinCode);
  }

  private async verifyStaffKey(merchantId: string, key: string): Promise<boolean> {
    if (!key) return false;
    try {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
      const staff = await this.prisma.staff.findFirst({
        where: { 
          merchantId, 
          apiKeyHash: hash,
          status: 'ACTIVE'
        }
      });
      return !!staff;
    } catch {
      return false;
    }
  }

  private async enforceRequireStaffKey(merchantId: string, req: Request): Promise<void> {
    const settings = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
    if (!settings?.requireStaffKey) return;
    
    const staffKey = req.headers['x-staff-key'] as string | undefined;
    const bridgeSig = req.headers['x-bridge-signature'] as string | undefined;
    
    // If requireStaffKey is enabled, must have either staff key or bridge signature
    if (!staffKey && !bridgeSig) {
      throw new UnauthorizedException('X-Staff-Key or X-Bridge-Signature required');
    }
    
    if (staffKey) {
      const valid = await this.verifyStaffKey(merchantId, staffKey);
      if (!valid) throw new UnauthorizedException('Invalid staff key');
    }
  }

  @Post('qr')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Bridge-Signature', required: false, description: 'Bridge signature (if requireBridgeSig enabled)' })
  @ApiHeader({ name: 'X-Staff-Key', required: false, description: 'Staff API key' })
  @ApiOkResponse({ type: QrMintRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async mintQr(@Body() dto: QrMintDto, @Req() req: Request) {
    // Optional authentication signals: teleauth or staff key or bridge signature; enforce only if merchant requires
    const hasTeleauth = !!(req as any).teleauth?.customerId;
    const hasInitData = typeof dto.initData === 'string' && dto.initData.trim().length > 0;
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
    if (!hasAuth && !staffKey && dto.merchantId) {
      const settings = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      if (settings?.requireBridgeSig) {
        if (!bridgeSig) throw new UnauthorizedException('X-Bridge-Signature required');
        const bodyForSig = JSON.stringify({ merchantId: dto.merchantId, customerId: dto.customerId });
        let verified = false;
        if (settings.bridgeSecret && verifyBridgeSigUtil(bridgeSig, bodyForSig, settings.bridgeSecret)) verified = true;
        else if ((settings as any)?.bridgeSecretNext && verifyBridgeSigUtil(bridgeSig, bodyForSig, (settings as any).bridgeSecretNext)) verified = true;
        if (!verified) throw new UnauthorizedException('Invalid bridge signature');
      }
    }

    // Если указаны merchantId и initData — валидируем Telegram initData токеном мерчанта
    const secret = process.env.QR_JWT_SECRET || 'dev_change_me';
    if (dto.initData && dto.merchantId) {
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      const botToken = (s as any)?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
      if (!botToken) throw new BadRequestException('Bot token not configured');
      const r = validateTelegramInitData(botToken, dto.initData);
      if (!r.ok) throw new BadRequestException('Invalid initData');
      // опционально: если включено требование start_param, проверим соответствие merchantId
      if ((s as any)?.telegramStartParamRequired) {
        try {
          const p = new URLSearchParams(dto.initData);
          const sp = p.get('start_param') || p.get('startapp') || '';
          if (sp && sp !== dto.merchantId) throw new BadRequestException('merchantId mismatch with start_param');
        } catch {}
      }
    } else {
      // Нет initData: допускаем только если у мерчанта явно НЕ требуется staff key
      if (!dto.merchantId) throw new BadRequestException('merchantId required');
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      const requireStaffKey = Boolean(s?.requireStaffKey);
      if (requireStaffKey) {
        // Guard заблокирует без X-Staff-Key; здесь оставим явную проверку для ясности ответов
        throw new BadRequestException('Staff key required');
      }
    }

    let ttl = dto.ttlSec ?? 60;
    if (!dto.ttlSec && dto.merchantId) {
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      if (s?.qrTtlSec) ttl = s.qrTtlSec;
    }
    const token = await signQrToken(secret, dto.customerId, dto.merchantId, ttl);
    return { token, ttl };
  }

  @Post('quote')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Staff-Key', required: false, description: 'Ключ кассира (если включено requireStaffKey)' })
  @ApiHeader({ name: 'X-Bridge-Signature', required: false, description: 'Подпись Bridge (если включено requireBridgeSig)' })
  @ApiOkResponse({ schema: { oneOf: [ { $ref: getSchemaPath(QuoteRedeemRespDto) }, { $ref: getSchemaPath(QuoteEarnRespDto) } ] } })
  @ApiBadRequestResponse({ type: ErrorDto })
  async quote(@Body() dto: QuoteDto, @Req() req: Request & { requestId?: string }) {
    const t0 = Date.now();
    try {
      const v = await this.resolveFromToken(dto.userToken);
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      if (s?.requireJwtForQuote && !looksLikeJwt(dto.userToken)) {
        this.metrics.inc('loyalty_quote_requests_total', { result: 'error', reason: 'jwt_required' });
        throw new BadRequestException('JWT required for quote');
      }
      if (v.merchantAud && v.merchantAud !== 'any' && v.merchantAud !== dto.merchantId) {
        this.metrics.inc('loyalty_quote_requests_total', { result: 'error', reason: 'merchant_mismatch' });
        throw new BadRequestException('QR выписан для другого мерчанта');
      }
      // атрибуция staffId по x-staff-key, если не передан явно
      let staffId = dto.staffId;
      if (!staffId) {
        const key = (req.headers['x-staff-key'] as string | undefined) || undefined;
        if (key) {
          try {
            const hash = require('crypto').createHash('sha256').update(key, 'utf8').digest('hex');
            const staff = await this.prisma.staff.findFirst({ where: { merchantId: dto.merchantId, apiKeyHash: hash, status: 'ACTIVE' } });
            if (staff) staffId = staff.id;
          } catch {}
        }
      }
      const outlet = await this.resolveOutlet(dto.merchantId, dto.outletId ?? null);
      const qrMeta = looksLikeJwt(dto.userToken) ? { jti: v.jti, iat: v.iat, exp: v.exp } : undefined;
      // проверка подписи Bridge при необходимости
      if (s?.requireBridgeSig) {
        const sig = (req.headers['x-bridge-signature'] as string | undefined) || '';
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
      // Применение ваучера/промо: сначала уменьшаем сумму eligible/total, затем рассчитываем quote
      let adjTotal = Math.max(0, Math.floor(dto.total));
      let adjEligible = Math.max(0, Math.floor(dto.eligibleTotal));
      try {
        // Промо
        const pr = await this.promos.preview(dto.merchantId, v.customerId, adjEligible, dto.category);
        if (pr?.canApply && pr.discount > 0) {
          const d = Math.min(adjEligible, Math.max(0, Math.floor(pr.discount)));
          adjEligible = Math.max(0, adjEligible - d);
          adjTotal = Math.max(0, adjTotal - d);
        }
      } catch {}
      const normalizedOutletId = dto.outletId ?? outlet?.id ?? undefined;
      const data = await this.service.quote({ ...dto, outletId: normalizedOutletId, total: adjTotal, eligibleTotal: adjEligible, staffId, userToken: v.customerId }, qrMeta);
      this.metrics.inc('loyalty_quote_requests_total', { result: 'ok' });
      return data;
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/JWTExpired|"exp"/.test(msg)) this.metrics.inc('loyalty_jwt_expired_total');
      this.metrics.inc('loyalty_quote_requests_total', { result: 'error' });
      throw e;
    } finally {
      this.metrics.observe('loyalty_quote_latency_ms', Date.now() - t0);
    }
  }

  @Post('commit')
  @UseGuards(SubscriptionGuard, AntiFraudGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Идемпотентность COMMIT' })
  @ApiHeader({ name: 'X-Bridge-Signature', required: false, description: 'Подпись Bridge (если включено requireBridgeSig)' })
  @ApiOkResponse({ type: CommitRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async commit(@Body() dto: CommitDto, @Res({ passthrough: true }) res: Response, @Req() req: Request & { requestId?: string }) {
    const t0 = Date.now();
    let data: any;
    // кешируем hold для извлечения контекста (merchantId, outletId, staffId)
    let holdCached: any = null;
    try { holdCached = await this.prisma.hold.findUnique({ where: { id: dto.holdId } }); } catch {}
    const merchantIdEff = dto.merchantId || holdCached?.merchantId;
    if (merchantIdEff) {
      await this.enforceRequireStaffKey(merchantIdEff, req);
    }
    let promoCandidate: { id: string } | null = null;
    if (dto.promoCode && holdCached?.customerId && merchantIdEff) {
      try {
        const promo = await this.promoCodes.findActiveByCode(merchantIdEff, dto.promoCode);
        if (promo) promoCandidate = { id: promo.id };
      } catch {}
    }
    // проверка подписи Bridge до выполнения, с учётом outlet из hold
    try {
      const s = merchantIdEff ? await this.prisma.merchantSettings.findUnique({ where: { merchantId: merchantIdEff } }) : null;
      if (s?.requireBridgeSig) {
        const sig = (req.headers['x-bridge-signature'] as string | undefined) || '';
        const outlet = await this.resolveOutlet(merchantIdEff, holdCached?.outletId ?? null);
        let secret: string | null = outlet?.bridgeSecret ?? null;
        let alt: string | null = outlet?.bridgeSecretNext ?? null;
        if (!secret && !alt) {
          secret = s?.bridgeSecret || null;
          alt = (s as any)?.bridgeSecretNext || null;
        }
        const bodyForSig = JSON.stringify({ merchantId: merchantIdEff, holdId: dto.holdId, orderId: dto.orderId, receiptNumber: dto.receiptNumber ?? undefined });
        let ok = false;
        if (secret && verifyBridgeSigUtil(sig, bodyForSig, secret)) ok = true;
        else if (alt && verifyBridgeSigUtil(sig, bodyForSig, alt)) ok = true;
        if (!ok) throw new UnauthorizedException('Invalid bridge signature');
      }
    } catch {}
    try {
      const idemKey = (req.headers['idempotency-key'] as string | undefined) || undefined;
      const commitOpts = promoCandidate
        ? { promoCode: { promoCodeId: promoCandidate.id, code: dto.promoCode } }
        : undefined;
      if (idemKey) {
        const merchantForIdem = merchantIdEff || undefined;
        if (merchantForIdem) {
          const saved = await this.prisma.idempotencyKey.findUnique({
            where: { merchantId_key: { merchantId: merchantForIdem, key: idemKey } },
          });
          if (saved) {
            data = saved.response as any;
          } else {
            data = await this.service.commit(
              dto.holdId,
              dto.orderId,
              dto.receiptNumber,
              req.requestId ?? dto.requestId,
              commitOpts,
            );
            if (data && typeof data === 'object' && (data as any).alreadyCommitted === true) {
              const { alreadyCommitted, ...rest } = data as any;
              data = rest;
            }
            try {
              const ttlH = Number(process.env.IDEMPOTENCY_TTL_HOURS || '72');
              const exp = new Date(Date.now() + ttlH * 3600 * 1000);
              await this.prisma.idempotencyKey.create({
                data: { merchantId: merchantForIdem, key: idemKey, response: data, expiresAt: exp },
              });
            } catch {}
          }
        } else {
          data = await this.service.commit(
            dto.holdId,
            dto.orderId,
            dto.receiptNumber,
            req.requestId ?? dto.requestId,
            commitOpts,
          );
        }
      } else {
        data = await this.service.commit(
          dto.holdId,
          dto.orderId,
          dto.receiptNumber,
          req.requestId ?? dto.requestId,
          commitOpts,
        );
      }
      this.metrics.inc('loyalty_commit_requests_total', { result: data?.alreadyCommitted ? 'already_committed' : 'ok' });
    } catch (e) {
      this.metrics.inc('loyalty_commit_requests_total', { result: 'error' });
      throw e;
    } finally {
      this.metrics.observe('loyalty_commit_latency_ms', Date.now() - t0);
    }
    try {
      const s = merchantIdEff ? await this.prisma.merchantSettings.findUnique({ where: { merchantId: merchantIdEff } }) : null;
      const useNext = Boolean((s as any)?.useWebhookNext) && !!(s as any)?.webhookSecretNext;
      const secret = (useNext ? (s as any)?.webhookSecretNext : s?.webhookSecret) as string | undefined;
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const body = JSON.stringify(data);
        const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('base64');
        res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
        if (merchantIdEff) res.setHeader('X-Merchant-Id', merchantIdEff);
        res.setHeader('X-Signature-Timestamp', ts);
        const kid = useNext ? (s as any)?.webhookKeyIdNext : s?.webhookKeyId;
        if (kid) res.setHeader('X-Signature-Key-Id', kid);
        if (req.requestId) res.setHeader('X-Request-Id', req.requestId);
      }
    } catch {}
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
        await this.enforceRequireStaffKey(merchantId, req);
      }
    } catch {}
    return this.service.cancel(holdId);
  }

  @Get('balance/:merchantId/:customerId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: BalanceDto })
  balance2(@Param('merchantId') merchantId: string, @Param('customerId') customerId: string) {
    return this.service.balance(merchantId, customerId);
  }

  // Публичные настройки, доступные мини-аппе (без админ-ключа)
  @Get('settings/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: PublicSettingsDto })
  async publicSettings(@Param('merchantId') merchantId: string) {
    const { settings: s, share } = await this.buildReviewsShareSettings(merchantId);
    return {
      merchantId,
      qrTtlSec: s?.qrTtlSec ?? 120,
      miniappThemePrimary: (s as any)?.miniappThemePrimary ?? null,
      miniappThemeBg: (s as any)?.miniappThemeBg ?? null,
      miniappLogoUrl: (s as any)?.miniappLogoUrl ?? null,
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
  async applyPromoCode(@Body() body: { merchantId?: string; customerId?: string; code?: string }) {
    return this.service.applyPromoCode({
      merchantId: body?.merchantId,
      customerId: body?.customerId,
      code: body?.code,
    });
  }

  @Post('refund')
  @UseGuards(SubscriptionGuard, AntiFraudGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Идемпотентность REFUND' })
  @ApiHeader({ name: 'X-Bridge-Signature', required: false, description: 'Подпись Bridge (если включено requireBridgeSig)' })
  @ApiOkResponse({ type: RefundRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async refund(@Body() dto: RefundDto, @Res({ passthrough: true }) res: Response, @Req() req: Request & { requestId?: string }) {
    await this.enforceRequireStaffKey(dto.merchantId, req);
    let data: any;
    // проверка подписи Bridge до выполнения
    try {
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      if (s?.requireBridgeSig) {
        const sig = (req.headers['x-bridge-signature'] as string | undefined) || '';
        let receiptOutletId: string | null = null;
        try {
          const rcp = await this.prisma.receipt.findUnique({
            where: { merchantId_orderId: { merchantId: dto.merchantId, orderId: dto.orderId } },
            select: { outletId: true },
          });
          receiptOutletId = rcp?.outletId ?? null;
        } catch {}
        const outlet = await this.resolveOutlet(dto.merchantId, receiptOutletId);
        let secret: string | null = outlet?.bridgeSecret ?? null;
        let alt: string | null = outlet?.bridgeSecretNext ?? null;
        if (!secret && !alt) {
          secret = s?.bridgeSecret || null;
          alt = (s as any)?.bridgeSecretNext || null;
        }
        const bodyForSig = JSON.stringify({ merchantId: dto.merchantId, orderId: dto.orderId, refundTotal: dto.refundTotal, refundEligibleTotal: dto.refundEligibleTotal ?? undefined });
        let ok = false;
        if (secret && verifyBridgeSigUtil(sig, bodyForSig, secret)) ok = true;
        else if (alt && verifyBridgeSigUtil(sig, bodyForSig, alt)) ok = true;
        if (!ok) throw new UnauthorizedException('Invalid bridge signature');
      }
    } catch {}
    try {
      const idemKey = (req.headers['idempotency-key'] as string | undefined) || undefined;
      if (idemKey) {
        const saved = await this.prisma.idempotencyKey.findUnique({ where: { merchantId_key: { merchantId: dto.merchantId, key: idemKey } } });
        if (saved) {
          data = saved.response as any;
        } else {
          data = await this.service.refund(dto.merchantId, dto.orderId, dto.refundTotal, dto.refundEligibleTotal, req.requestId);
          try {
            const ttlH = Number(process.env.IDEMPOTENCY_TTL_HOURS || '72');
            const exp = new Date(Date.now() + ttlH * 3600 * 1000);
            await this.prisma.idempotencyKey.create({ data: { merchantId: dto.merchantId, key: idemKey, response: data, expiresAt: exp } });
          } catch {}
        }
      } else {
        data = await this.service.refund(dto.merchantId, dto.orderId, dto.refundTotal, dto.refundEligibleTotal, req.requestId);
      }
      this.metrics.inc('loyalty_refund_requests_total', { result: 'ok' });
    } catch (e) {
      this.metrics.inc('loyalty_refund_requests_total', { result: 'error' });
      throw e;
    }
    try {
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      const secret = s?.webhookSecret;
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const body = JSON.stringify(data);
        const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('base64');
        res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
        res.setHeader('X-Merchant-Id', dto.merchantId);
        res.setHeader('X-Signature-Timestamp', ts);
        if (s?.webhookKeyId) res.setHeader('X-Signature-Key-Id', s.webhookKeyId);
        if (req.requestId) res.setHeader('X-Request-Id', req.requestId);
      }
    } catch {}
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
    if (merchantId) {
      try {
        const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
        if (s && (s as any).telegramBotToken) token = (s as any).telegramBotToken as string;
        // если включено требование start_param — сверим merchantId с deep-link параметром
        if ((s as any)?.telegramStartParamRequired) {
          try {
            const p = new URLSearchParams(initData);
            const sp = p.get('start_param') || p.get('startapp') || '';
            if (sp && sp !== merchantId) throw new BadRequestException('merchantId mismatch with start_param');
          } catch {}
        }
      } catch {}
    }
    if (!token) throw new BadRequestException('Bot token not configured');
    const r = validateTelegramInitData(token, initData || '');
    if (!r.ok || !r.userId) throw new BadRequestException('Invalid initData');
    // По tgId ищем/создаём клиента. Пытаемся подтянуть legacy id 'tg:<id>'
    const tgId = String(r.userId);
    const legacyId = 'tg:' + tgId;
    const existingByTg = await this.prisma.customer.findUnique({ where: { tgId } }).catch(() => null);
    if (existingByTg) return { ok: true, customerId: existingByTg.id };
    const legacy = await this.prisma.customer.findUnique({ where: { id: legacyId } }).catch(() => null);
    if (legacy) {
      try { await this.prisma.customer.update({ where: { id: legacy.id }, data: { tgId } }); } catch {}
      return { ok: true, customerId: legacy.id };
    }
    const created = await this.prisma.customer.create({ data: { tgId } });
    return { ok: true, customerId: created.id };
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
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100) : 20;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    return this.service.transactions(merchantId, customerId, limit, before, { outletId, staffId });
  }

  // Публичные списки для фронтов (без AdminGuard)
  @Get('outlets/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ schema: { type: 'array', items: { $ref: getSchemaPath(PublicOutletDto) } } })
  async publicOutlets(@Param('merchantId') merchantId: string) {
    const items = await this.prisma.outlet.findMany({ where: { merchantId }, orderBy: { name: 'asc' } });
    return items.map(o => ({ id: o.id, name: o.name, address: o.address ?? undefined }));
  }

  @Get('staff/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ schema: { type: 'array', items: { $ref: getSchemaPath(PublicStaffDto) } } })
  async publicStaff(@Param('merchantId') merchantId: string) {
    const items = await this.prisma.staff.findMany({ where: { merchantId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    return items.map(s => ({ id: s.id, login: s.login ?? undefined, role: s.role }));
  }

  // verifyBridgeSignature: вынесен в ./bridge.util.ts

  // Согласия на коммуникации
  @Get('consent')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(ConsentGetRespDto) } })
  async getConsent(@Query('merchantId') merchantId: string, @Query('customerId') customerId: string) {
    const c = await this.prisma.consent.findUnique({ where: { merchantId_customerId: { merchantId, customerId } } });
    return { granted: !!c, consentAt: c?.consentAt?.toISOString() };
  }

  @Post('consent')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(OkDto) } })
  async setConsent(@Body() body: { merchantId: string; customerId: string; granted: boolean }) {
    if (!body?.merchantId || !body?.customerId) throw new BadRequestException('merchantId and customerId required');
    if (body.granted) {
      await this.prisma.consent.upsert({ where: { merchantId_customerId: { merchantId: body.merchantId, customerId: body.customerId } }, update: { consentAt: new Date() }, create: { merchantId: body.merchantId, customerId: body.customerId, consentAt: new Date() } });
    } else {
      try { await this.prisma.consent.delete({ where: { merchantId_customerId: { merchantId: body.merchantId, customerId: body.customerId } } }); } catch {}
    }
    return { ok: true };
  }
}
