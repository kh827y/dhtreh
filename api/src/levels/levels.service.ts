import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { computeLevelState, parseLevelsConfig, type LevelRule } from '../loyalty/levels.util';

@Injectable()
export class LevelsService {
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  async getLevel(merchantId: string, customerId: string): Promise<{ merchantId: string; customerId: string; metric: 'earn'|'redeem'|'transactions'; periodDays: number; value: number; current: LevelRule; next: LevelRule|null; progressToNext: number }> {
    const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
    const cfg = parseLevelsConfig(s);
    const { value, current, next, progressToNext } = await computeLevelState({
      prisma: this.prisma,
      metrics: this.metrics,
      merchantId,
      customerId,
      config: cfg,
    });
    return { merchantId, customerId, metric: cfg.metric, periodDays: cfg.periodDays, value, current, next, progressToNext };
  }
}
