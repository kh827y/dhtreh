import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import {
  computeLevelState,
  parseLevelsConfig,
  type LevelRule,
} from '../loyalty/levels.util';

@Injectable()
export class LevelsService {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  async getLevel(
    merchantId: string,
    merchantCustomerId: string,
  ): Promise<{
    merchantId: string;
    merchantCustomerId: string;
    metric: 'earn' | 'redeem' | 'transactions';
    periodDays: number;
    value: number;
    current: LevelRule;
    next: LevelRule | null;
    progressToNext: number;
  }> {
    const s = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const base = parseLevelsConfig(s);
    // Заменяем список уровней на портал-управляемые LoyaltyTier, если они существуют
    let levels = base.levels;
    try {
      const tiers = await (this.prisma as any).loyaltyTier.findMany({
        where: { merchantId },
        orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
      });
      if (Array.isArray(tiers) && tiers.length) {
        levels = tiers.map((t: any) => ({
          name: String(t?.name || ''),
          threshold: Math.max(0, Number(t?.thresholdAmount ?? 0) || 0),
        }));
      }
    } catch {}
    const cfg = { periodDays: base.periodDays, metric: base.metric, levels };
    const mc = await (this.prisma as any).merchantCustomer?.findUnique?.({
      where: { id: merchantCustomerId },
      select: { customerId: true, merchantId: true },
    });
    if (!mc || mc.merchantId !== merchantId)
      throw new Error('merchant customer not found');
    const customerId = mc.customerId;

    const { value, current, next, progressToNext } = await computeLevelState({
      prisma: this.prisma,
      metrics: this.metrics,
      merchantId,
      merchantCustomerId,
      config: cfg,
    });
    return {
      merchantId,
      merchantCustomerId,
      metric: cfg.metric,
      periodDays: cfg.periodDays,
      value,
      current,
      next,
      progressToNext,
    };
  }
}
