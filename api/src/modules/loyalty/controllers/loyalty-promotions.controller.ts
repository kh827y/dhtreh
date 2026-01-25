import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CashierGuard } from '../../../core/guards/cashier.guard';
import { SubscriptionGuard } from '../../../core/guards/subscription.guard';
import { ErrorDto } from '../dto/dto';
import { LoyaltyPromotionsUseCase } from '../use-cases/loyalty-promotions.use-case';

@ApiTags('loyalty')
@UseGuards(CashierGuard, SubscriptionGuard)
@Controller('loyalty')
export class LoyaltyPromotionsController {
  constructor(private readonly useCase: LoyaltyPromotionsUseCase) {}

  // ===== Promotions (miniapp public) =====
  @Get('promotions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async listPromotions(
    @Query('merchantId') merchantId?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.useCase.listPromotions(merchantId, customerId);
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
    return this.useCase.claimPromotion(body);
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
    return this.useCase.submitReview(body);
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
    return this.useCase.dismissReviewPrompt(body);
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
    return this.useCase.applyPromoCode(body);
  }
}
