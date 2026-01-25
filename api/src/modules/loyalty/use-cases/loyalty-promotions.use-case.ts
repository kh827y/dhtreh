import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LedgerAccount,
  PromotionRewardType,
  PromotionStatus,
  TxnType,
  WalletType,
} from '@prisma/client';
import { LoyaltyService } from '../services/loyalty.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { ReviewService } from '../../reviews/review.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { getRulesRoot, getRulesSection } from '../../../shared/rules-json.util';
import {
  ALL_CUSTOMERS_SEGMENT_KEY,
  asRecord,
} from '../controllers/loyalty-controller.utils';
import { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';
import type {
  PromoCodeApplyDto,
  PromotionClaimDto,
  ReviewDismissDto,
  ReviewSubmitDto,
} from '../dto/dto';

@Injectable()
export class LoyaltyPromotionsUseCase {
  constructor(
    private readonly service: LoyaltyService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly reviews: ReviewService,
    private readonly cache: LookupCacheService,
    private readonly config: AppConfigService,
    private readonly support: LoyaltyControllerSupportService,
  ) {}

  async listPromotions(merchantId?: string, customerId?: string) {
    const mid = typeof merchantId === 'string' ? merchantId.trim() : '';
    const mcid = typeof customerId === 'string' ? customerId.trim() : '';
    if (!mid) throw new BadRequestException('merchantId required');
    if (!mcid) throw new BadRequestException('customerId required');
    return this.support.listPromotionsForCustomer(mid, mcid);
  }

  async claimPromotion(body: PromotionClaimDto) {
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

    const customer = await this.support.ensureCustomer(merchantId, customerId);
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

      let wallet = await tx.wallet.findFirst({
        where: { merchantId, customerId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { merchantId, customerId, type: WalletType.POINTS, balance: 0 },
        });
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: points } },
      });
      const balance = updatedWallet.balance;

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

      if (this.config.isLedgerEnabled()) {
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

      const expireDays = this.support.resolvePromotionExpireDays(promo);
      if (this.config.isEarnLotsEnabled()) {
        const earnLot =
          this.support.getEarnLotDelegate(tx) ??
          this.support.getEarnLotDelegate(this.prisma);
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

      await tx.promotionParticipant.create({
        data: {
          promotionId,
          merchantId,
          customerId,
          outletId,
          pointsIssued: points,
        },
      });

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
      } catch (err) {
        logIgnoredError(
          err,
          'LoyaltyPromotionsUseCase metrics',
          undefined,
          'debug',
        );
      }

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

  async submitReview(body: ReviewSubmitDto) {
    const merchantId =
      typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId is required');

    const customerId =
      typeof body?.customerId === 'string' ? body.customerId.trim() : '';
    if (!customerId) throw new BadRequestException('customerId is required');

    const customer = await this.support.ensureCustomer(merchantId, customerId);
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
      const { share } = await this.support.buildReviewsShareSettings(
        merchantId,
        settings,
      );
      if (share) {
        sharePayload = {
          enabled: share.enabled,
          threshold: share.threshold,
          options: this.support.buildShareOptions(share, outletId ?? null),
        };
      }
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyPromotionsUseCase share settings',
        undefined,
        'debug',
      );
    }

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
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyPromotionsUseCase share metrics',
        undefined,
        'debug',
      );
    }

    return {
      ok: true,
      reviewId: result.id,
      status: result.status,
      rewardPoints: result.rewardPoints,
      message: result.message,
      share: sharePayload,
    } as const;
  }

  async dismissReviewPrompt(body: ReviewDismissDto) {
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

    const customer = await this.support.ensureCustomer(merchantId, customerId);
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
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyPromotionsUseCase notify',
        undefined,
        'debug',
      );
    }

    return { ok: true, dismissedAt: payload.dismissedAt };
  }

  async applyPromoCode(body: PromoCodeApplyDto) {
    if (!body?.merchantId || !body?.customerId)
      throw new BadRequestException('merchantId and customerId required');
    const customer = await this.support.ensureCustomer(
      body.merchantId,
      body.customerId,
    );
    return this.service.applyPromoCode({
      merchantId: body.merchantId,
      customerId: customer.id,
      code: body?.code,
    });
  }
}
