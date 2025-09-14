import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';

export type LevelRule = { name: string; threshold: number };
export type LevelsConfig = { periodDays: number; metric: 'earn'|'redeem'|'transactions'; levels: LevelRule[] };

@Injectable()
export class LevelsService {
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  private parseConfig(s: any): LevelsConfig {
    const cfg = ((s && s.rulesJson && (s.rulesJson as any).levelsCfg) || (s && (s as any).levelsCfg)) as any;
    const levels: LevelRule[] = Array.isArray(cfg?.levels)
      ? cfg.levels
          .filter((x: any) => x && typeof x === 'object' && typeof x.name === 'string')
          .map((x: any) => ({ name: String(x.name), threshold: Math.max(0, Number(x.threshold || 0)) }))
      : [ { name: 'Base', threshold: 0 } ];
    const periodDays: number = Number(cfg?.periodDays || 365) || 365;
    const metric: 'earn'|'redeem'|'transactions' = (cfg?.metric === 'redeem' || cfg?.metric === 'transactions') ? cfg.metric : 'earn';
    const ordered = [...levels].sort((a,b) => a.threshold - b.threshold);
    return { periodDays, metric, levels: ordered };
  }

  async getLevel(merchantId: string, customerId: string): Promise<{ merchantId: string; customerId: string; metric: 'earn'|'redeem'|'transactions'; periodDays: number; value: number; current: LevelRule; next: LevelRule|null; progressToNext: number }> {
    const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
    const cfg = this.parseConfig(s);
    const since = new Date(Date.now() - cfg.periodDays * 24 * 60 * 60 * 1000);

    let value = 0;
    if (cfg.metric === 'transactions') {
      value = await this.prisma.transaction.count({ where: { merchantId, customerId, createdAt: { gte: since } } });
    } else {
      const type = cfg.metric === 'redeem' ? 'REDEEM' : 'EARN';
      const items = await this.prisma.transaction.findMany({ where: { merchantId, customerId, type: type as any, createdAt: { gte: since } } });
      value = items.reduce((sum, t: any) => sum + Math.abs(Number(t.amount || 0)), 0);
    }

    let current = cfg.levels[0];
    let next: LevelRule | null = null;
    for (const lvl of cfg.levels) {
      if (value >= lvl.threshold) current = lvl;
      else { next = lvl; break; }
    }
    const progressToNext = next ? Math.max(0, next.threshold - value) : 0;
    try { this.metrics.inc('levels_evaluations_total', { metric: cfg.metric }); } catch {}
    return { merchantId, customerId, metric: cfg.metric, periodDays: cfg.periodDays, value, current, next, progressToNext };
  }
}
