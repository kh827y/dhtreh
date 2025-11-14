import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma.service';
import { LoyaltyService } from './loyalty.service';
import { TelegramMiniappGuard } from '../guards/telegram-miniapp.guard';
import { LoyaltyEventsService } from './loyalty-events.service';
import {
  ensureBaseTier,
  toLevelRule,
} from './tier-defaults.util';

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
    await ensureBaseTier(this.prisma, merchantId).catch(() => null);
    const tiers = await this.prisma.loyaltyTier.findMany({
      where: { merchantId, isHidden: false },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
    });
    const levels = tiers.map((t: any) => {
      const rule = toLevelRule(t);
      const bps =
        typeof rule.earnRateBps === 'number' ? rule.earnRateBps : null;
      const percent = bps != null ? bps / 100 : null;
      return {
        id: t.id,
        name: t.name,
        threshold: rule.threshold,
        cashbackPercent: percent,
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
      merchantCustomerId?: string;
      outletId?: string | null;
      staffId?: string | null;
    },
  ) {
    const merchantId =
      typeof body?.merchantId === 'string' ? body.merchantId.trim() : '';
    const merchantCustomerId =
      typeof body?.merchantCustomerId === 'string'
        ? body.merchantCustomerId.trim()
        : '';
    const outletId =
      typeof body?.outletId === 'string' && body.outletId.trim()
        ? body.outletId.trim()
        : null;
    const staffId =
      typeof body?.staffId === 'string' && body.staffId.trim()
        ? body.staffId.trim()
        : null;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!merchantCustomerId)
      throw new BadRequestException('merchantCustomerId required');

    const merchantCustomer = await (this.prisma as any)?.merchantCustomer
      ?.findUnique?.({
        where: { id: merchantCustomerId },
        select: { customerId: true, merchantId: true },
      })
      .catch(() => null);
    if (!merchantCustomer || merchantCustomer.merchantId !== merchantId)
      throw new BadRequestException('merchant customer not found');
    const customerId = merchantCustomer.customerId;

    return this.loyalty.grantRegistrationBonus({
      merchantId,
      customerId,
      outletId,
      staffId,
    });
  }

  @UseGuards(TelegramMiniappGuard)
  @Get('events/poll')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async pollEvents(
    @Query('merchantId') merchantId?: string,
    @Query('merchantCustomerId') merchantCustomerId?: string,
  ) {
    const sanitizedMerchantId = (merchantId || '').trim();
    const sanitizedMerchantCustomerId = (merchantCustomerId || '').trim();
    if (!sanitizedMerchantId) {
      throw new BadRequestException('merchantId is required');
    }
    if (!sanitizedMerchantCustomerId) {
      throw new BadRequestException('merchantCustomerId is required');
    }
    const event = await this.events.waitForCustomerEvent(
      sanitizedMerchantId,
      sanitizedMerchantCustomerId,
    );
    return { event };
  }
}
