import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';

export type PromoRule = {
  if?: { categoryIn?: string[]; minEligible?: number };
  then?: { discountFixed?: number; discountPct?: number };
  name?: string;
};

@Injectable()
export class PromosService {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  private getRules(merchantId: string): PromoRule[] {
    // rules under merchantSettings.rulesJson.promos
    try {
      // Note: using prisma in caller to avoid extra roundtrip; keep simple here
      return [];
    } catch {
      return [];
    }
  }

  private computeDiscount(
    eligibleTotal: number,
    category?: string | null,
    rules?: PromoRule[],
  ): { discount: number; rule?: PromoRule | null } {
    const list = Array.isArray(rules) ? rules : [];
    let best = 0;
    let matched: PromoRule | null = null;
    const cat = category || undefined;
    for (const r of list) {
      try {
        const cond = (r.if || {}) as any;
        if (
          Array.isArray(cond.categoryIn) &&
          cat &&
          !cond.categoryIn.includes(cat)
        )
          continue;
        if (
          cond.minEligible != null &&
          eligibleTotal < Number(cond.minEligible)
        )
          continue;
        const act = (r.then || {}) as any;
        let d = 0;
        if (act.discountFixed != null)
          d = Math.max(d, Number(act.discountFixed) || 0);
        if (act.discountPct != null)
          d = Math.max(
            d,
            Math.floor(((Number(act.discountPct) || 0) * eligibleTotal) / 100),
          );
        if (d > best) {
          best = d;
          matched = r;
        }
      } catch {}
    }
    best = Math.max(0, Math.min(best, Math.floor(eligibleTotal)));
    return { discount: best, rule: matched };
  }

  async preview(
    merchantId: string,
    customerId: string | undefined,
    eligibleTotal: number,
    category?: string,
  ) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!Number.isFinite(eligibleTotal) || eligibleTotal <= 0)
      throw new BadRequestException('eligibleTotal must be > 0');
    const s = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const rules: PromoRule[] = ((s as any)?.rulesJson?.promos as any[]) || [];
    const { discount, rule } = this.computeDiscount(
      eligibleTotal,
      category,
      rules,
    );
    this.metrics.inc('promos_preview_requests_total', {
      result: discount > 0 ? 'ok' : 'no_match',
    });
    return {
      canApply: discount > 0,
      discount,
      name: (rule as any)?.name ?? null,
    };
  }
}
