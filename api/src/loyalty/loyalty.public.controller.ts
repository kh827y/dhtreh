import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { LoyaltyService } from './loyalty.service';
import { TelegramMiniappGuard } from '../guards/telegram-miniapp.guard';
import { LoyaltyEventsService } from './loyalty-events.service';
import { toLevelRule } from './tier-defaults.util';

@ApiTags('loyalty-public')
@Controller('loyalty')
export class LoyaltyPublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly events: LoyaltyEventsService,
  ) {}

  // Публичный каталог уровней для миниаппы
  @Get('mechanics/levels/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        levels: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  async mechanicsLevels(@Param('merchantId') merchantId: string) {
    const tiers = await this.prisma.loyaltyTier.findMany({
      where: { merchantId, isHidden: false },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
    });
    const levels = tiers.map((t: any) => {
      const rule = toLevelRule(t);
      const bps =
        typeof rule.earnRateBps === 'number' ? rule.earnRateBps : null;
      const percent = bps != null ? bps / 100 : null;
      const redeemRateBps =
        typeof rule.redeemRateBps === 'number' ? rule.redeemRateBps : null;
      return {
        id: t.id,
        name: t.name,
        threshold: rule.threshold,
        cashbackPercent: percent,
        redeemRateBps,
        benefits: { cashbackPercent: percent },
        rewardPercent: percent,
        minPaymentAmount: rule.minPaymentAmount ?? null,
      };
    });
    return { merchantId, levels };
  }

  // Публичный эндпоинт: бонус за регистрацию
  @UseGuards(TelegramMiniappGuard)
  @Post('mechanics/registration-bonus')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async grantRegistrationBonus(
    @Body()
    body: {
      merchantId?: string;
      customerId?: string;
      outletId?: string | null;
      staffId?: string | null;
    },
  ) {
    const merchantId =
      typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    const customerId =
      typeof body?.customerId === 'string' ? body.customerId.trim() : '';
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

    // Customer теперь per-merchant модель
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, merchantId: true },
    });
    if (!customer || customer.merchantId !== merchantId)
      throw new BadRequestException('customer not found');

    return this.loyalty.grantRegistrationBonus({
      merchantId,
      customerId: customer.id,
      outletId,
      staffId,
    });
  }

  @UseGuards(TelegramMiniappGuard)
  @Get('events/poll')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async pollEvents(
    @Query('merchantId') merchantId?: string,
    @Query('customerId') customerId?: string,
    @Req() req?: Request,
  ) {
    const sanitizedMerchantId = (merchantId || '').trim();
    const sanitizedCustomerId = (customerId || '').trim();
    if (!sanitizedMerchantId) {
      throw new BadRequestException('merchantId is required');
    }
    if (!sanitizedCustomerId) {
      throw new BadRequestException('customerId is required');
    }
    const pollKey = this.events.tryAcquireCustomerPoll(
      sanitizedMerchantId,
      sanitizedCustomerId,
    );
    if (!pollKey) {
      return { event: null, retryAfterMs: 2500 };
    }
    const controller = new AbortController();
    const handleClose = () => controller.abort();
    req?.on('close', handleClose);
    const event = await this.events
      .waitForCustomerEvent(
        sanitizedMerchantId,
        sanitizedCustomerId,
        25000,
        controller.signal,
      )
      .finally(() => {
        req?.off('close', handleClose);
        this.events.releaseCustomerPoll(pollKey);
      });
    return { event };
  }
}
