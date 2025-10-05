import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma.service';

@ApiTags('loyalty-public')
@Controller('loyalty')
export class LoyaltyPublicController {
  constructor(private readonly prisma: PrismaService) {}

  // Публичный каталог уровней для миниаппы
  @Get('mechanics/levels/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ schema: { type: 'object', properties: {
    merchantId: { type: 'string' },
    levels: { type: 'array', items: { type: 'object', additionalProperties: true } }
  } } })
  async mechanicsLevels(@Param('merchantId') merchantId: string) {
    const tiers = await this.prisma.loyaltyTier.findMany({
      where: { merchantId },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
    });
    const levels = tiers.map((t: any) => {
      const bps = typeof t.earnRateBps === 'number' ? Math.round(t.earnRateBps) : null;
      const percent = bps != null ? bps / 100 : null;
      const threshold = Number(t?.thresholdAmount ?? 0) || 0;
      const meta = (t as any)?.metadata ?? null;
      const minPaymentAmount = meta && typeof meta === 'object' ? Number((meta as any).minPaymentAmount ?? (meta as any).minPayment ?? 0) || 0 : null;
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
}
