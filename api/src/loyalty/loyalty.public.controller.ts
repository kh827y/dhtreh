import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma.service';
import { LoyaltyService } from './loyalty.service';

@ApiTags('loyalty-public')
@Controller('loyalty')
export class LoyaltyPublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
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
      where: { merchantId },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
    });
    const levels = tiers.map((t: any) => {
      const bps =
        typeof t.earnRateBps === 'number' ? Math.round(t.earnRateBps) : null;
      const percent = bps != null ? bps / 100 : null;
      const threshold = Number(t?.thresholdAmount ?? 0) || 0;
      const meta = t?.metadata ?? null;
      const minPaymentAmount =
        meta && typeof meta === 'object'
          ? Number(meta.minPaymentAmount ?? meta.minPayment ?? 0) || 0
          : null;
      return {
        id: t.id,
        name: t.name,
        threshold,
        cashbackPercent: percent,
        benefits: { cashbackPercent: percent },
        rewardPercent: percent,
        minPaymentAmount: minPaymentAmount,
      };
    });
    return { merchantId, levels };
  }

  // Публичный эндпоинт: бонус за регистрацию
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
}
