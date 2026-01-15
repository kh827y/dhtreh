import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { fetchReceiptAggregates } from '../common/receipt-aggregates.util';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../pg-lock.util';

type ParsedRfmSettings = {
  recencyMode: 'auto' | 'manual';
  recencyDays?: number;
  frequency?: { mode?: 'auto' | 'manual'; threshold?: number | null };
  monetary?: { mode?: 'auto' | 'manual'; threshold?: number | null };
};

type Quantiles = {
  q20: number | null;
  q40: number | null;
  q60: number | null;
  q80: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

@Injectable()
export class AnalyticsAggregatorWorker {
  private readonly logger = new Logger(AnalyticsAggregatorWorker.name);
  constructor(private prisma: PrismaService) {}

  private toJsonObject(
    value: Prisma.JsonValue | null | undefined,
  ): Prisma.JsonObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private parseRfmSettings(
    rulesJson: Prisma.JsonValue | null | undefined,
  ): ParsedRfmSettings {
    const root = this.toJsonObject(rulesJson);
    if (!root)
      return {
        recencyMode: 'auto',
      };
    const raw = root.rfm;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return { recencyMode: 'auto' };
    const rfm = raw as Record<string, unknown>;
    const recencyObject = this.toJsonObject(
      rfm.recency as Prisma.JsonValue,
    ) as {
      mode?: unknown;
      days?: unknown;
      recencyDays?: unknown;
      threshold?: unknown;
    } | null;
    const recencyModeFromObject =
      recencyObject?.mode === 'manual' ? 'manual' : 'auto';
    const recencyDaysFromObject = this.toNumber(
      recencyObject?.days ??
        recencyObject?.recencyDays ??
        recencyObject?.threshold,
    );
    let recencyMode: 'auto' | 'manual' = recencyModeFromObject;
    let recencyDays = recencyDaysFromObject;
    if (!(recencyDays && recencyDays > 0) && recencyMode === 'manual') {
      recencyMode = 'auto';
      recencyDays = undefined;
    }
    const frequencyRaw = this.toJsonObject(rfm.frequency as Prisma.JsonValue);
    const monetaryRaw = this.toJsonObject(rfm.monetary as Prisma.JsonValue);
    return {
      recencyMode,
      recencyDays:
        recencyDays && recencyDays > 0 ? Math.round(recencyDays) : undefined,
      frequency: frequencyRaw
        ? {
            mode: frequencyRaw.mode === 'manual' ? 'manual' : 'auto',
            threshold: this.toNumber(frequencyRaw.threshold),
          }
        : undefined,
      monetary: monetaryRaw
        ? {
            mode: monetaryRaw.mode === 'manual' ? 'manual' : 'auto',
            threshold: this.toNumber(monetaryRaw.threshold),
          }
        : undefined,
    };
  }

  private computeQuantiles(values: number[]): Quantiles {
    if (!values.length) {
      return { q20: null, q40: null, q60: null, q80: null };
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const pick = (p: number) => {
      const idx = Math.floor((sorted.length - 1) * p);
      return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? null;
    };
    return {
      q20: pick(0.2),
      q40: pick(0.4),
      q60: pick(0.6),
      q80: pick(0.8),
    };
  }

  private suggestUpperQuantile(
    values: number[],
    options: { minimum?: number } = {},
  ): number | null {
    if (!values.length) return null;
    const { q80, q60, q40 } = this.computeQuantiles(values);
    const candidate =
      q80 ?? q60 ?? q40 ?? values[values.length - 1] ?? values[0];
    if (candidate == null || !Number.isFinite(candidate)) return null;
    const rounded = Math.round(candidate);
    if (options.minimum != null) return Math.max(options.minimum, rounded);
    return rounded;
  }

  private normalizeThreshold(
    value: number | null | undefined,
    minimum: number,
  ): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return Math.max(minimum, Math.round(value));
  }

  private scoreRecency(daysSince: number, horizon: number): number {
    if (!Number.isFinite(daysSince)) return 1;
    const limit = Math.max(1, horizon);
    const bounded = Math.max(0, Math.min(daysSince, limit));
    const bucket = Math.min(4, Math.floor((bounded / limit) * 5));
    return 5 - bucket; // 5 — свежие/лояльные, 1 — потерянные
  }

  private scoreRecencyQuantile(
    daysSince: number,
    quantiles?: Quantiles | null,
  ): number {
    if (!Number.isFinite(daysSince)) return 1;
    if (!quantiles) return 1;
    const { q20, q40, q60, q80 } = quantiles;
    if (q20 == null || q40 == null || q60 == null || q80 == null) return 1;
    if (q20 === q40 && q40 === q60 && q60 === q80) {
      if (daysSince < q20) return 5;
      if (daysSince > q20) return 1;
      return q20 === 0 ? 5 : 3;
    }
    if (daysSince <= q20) return 5;
    if (daysSince <= q40) return 4;
    if (daysSince <= q60) return 3;
    if (daysSince <= q80) return 2;
    return 1;
  }

  private scoreDescending(
    value: number,
    threshold: number | null | undefined,
    quantiles?: Quantiles | null,
  ): number {
    if (!Number.isFinite(value)) return 1;
    if (threshold != null && Number.isFinite(threshold) && threshold > 0) {
      if (value >= threshold) return 5;
      if (value >= threshold * 0.75) return 4;
      if (value >= threshold * 0.5) return 3;
      if (value >= threshold * 0.25) return 2;
      return 1;
    }
    if (quantiles) {
      const { q20, q40, q60, q80 } = quantiles;
      if (q20 == null || q40 == null || q60 == null || q80 == null) return 1;
      if (q20 === q40 && q40 === q60 && q60 === q80) {
        if (value > q20) return 5;
        if (value < q20) return 1;
        return q20 === 0 ? 1 : 3;
      }
      if (value <= q20) return 1;
      if (value <= q40) return 2;
      if (value <= q60) return 3;
      if (value <= q80) return 4;
      return 5;
    }
    return 1;
  }

  private computeRecencyDaysBounded(
    lastOrderAt: Date | null | undefined,
    horizon: number,
    now: Date,
  ): number {
    if (!(lastOrderAt instanceof Date) || Number.isNaN(lastOrderAt.getTime())) {
      return horizon;
    }
    const diff = now.getTime() - lastOrderAt.getTime();
    if (diff <= 0) return 0;
    const days = Math.floor(diff / DAY_MS);
    return Math.max(0, Math.min(days, horizon));
  }

  private computeRecencyDaysRaw(
    lastOrderAt: Date | null | undefined,
    now: Date,
  ): number {
    if (!(lastOrderAt instanceof Date) || Number.isNaN(lastOrderAt.getTime())) {
      return Number.POSITIVE_INFINITY;
    }
    const diff = now.getTime() - lastOrderAt.getTime();
    if (diff <= 0) return 0;
    return Math.max(0, Math.floor(diff / DAY_MS));
  }

  // Ежедневная агрегация KPI за вчерашний день
  @Cron('0 2 * * *')
  async aggregateDailyKpis() {
    if (process.env.WORKERS_ENABLED !== '1') {
      this.logger.log('WORKERS_ENABLED!=1, skip analytics aggregation');
      return;
    }
    const lock = await pgTryAdvisoryLock(
      this.prisma,
      'cron:analytics_daily',
    );
    if (!lock.ok) return;
    const today = new Date();
    const day = new Date(today);
    day.setDate(day.getDate() - 1); // вчера
    day.setHours(0, 0, 0, 0);
    try {
      await this.aggregateForDate(day);
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
    }
  }

  // Публичный метод для ручного запуска (можно дергать из скриптов/команд)
  async aggregateForDate(dayStart: Date) {
    const from = startOfDay(dayStart);
    const to = endOfDay(dayStart);

    const merchants = await this.prisma.merchant.findMany({
      select: { id: true },
    });

    for (const m of merchants) {
      try {
        await this.aggregateMerchantDaily(m.id, from, to);
        await this.recalculateCustomerStatsForMerchant(m.id);
      } catch (e) {
        this.logger.error(
          `Failed to aggregate for merchant ${m.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private async aggregateMerchantDaily(
    merchantId: string,
    from: Date,
    to: Date,
  ) {
    // revenue/transactionCount/pointsIssued/pointsRedeemed
    const [earnSum, redeemSum, earnCount, earnRedeemCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { merchantId, type: 'EARN', createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          merchantId,
          type: 'REDEEM',
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({
        where: { merchantId, type: 'EARN', createdAt: { gte: from, lte: to } },
      }),
      this.prisma.transaction.count({
        where: {
          merchantId,
          type: { in: ['EARN', 'REDEEM'] },
          createdAt: { gte: from, lte: to },
        },
      }),
    ]);

    const revenue = Math.abs(earnSum._sum.amount || 0);
    const transactionCount = earnRedeemCount;
    const averageCheck = transactionCount > 0 ? revenue / transactionCount : 0;
    const pointsIssued = Math.abs(earnSum._sum.amount || 0);
    const pointsRedeemed = Math.abs(redeemSum._sum.amount || 0);

    const [newCustomers, activeCustomers] = await Promise.all([
      this.prisma.wallet.count({
        where: {
          merchantId,
          createdAt: { gte: from, lte: to },
          customer: { erasedAt: null },
        },
      }),
      this.prisma.transaction
        .groupBy({
          by: ['customerId'],
          where: {
            merchantId,
            createdAt: { gte: from, lte: to },
            customer: { erasedAt: null },
          },
        })
        .then((x) => x.length),
    ]);

    await this.prisma.merchantKpiDaily.upsert({
      where: { merchantId_date: { merchantId, date: from } as any },
      update: {
        revenue,
        transactionCount,
        averageCheck,
        newCustomers,
        activeCustomers,
        pointsIssued,
        pointsRedeemed,
      },
      create: {
        merchantId,
        date: from,
        revenue,
        transactionCount,
        averageCheck,
        newCustomers,
        activeCustomers,
        pointsIssued,
        pointsRedeemed,
      },
    });
  }

  // Пересчет CustomerStats целиком с учётом пользовательских границ RFM
  async recalculateCustomerStatsForMerchant(merchantId: string) {
    const [settingsRow, wallets, receipts] = await Promise.all([
      this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { rulesJson: true },
      }),
      this.prisma.wallet.findMany({
        where: { merchantId, customer: { erasedAt: null } },
        select: { customerId: true, createdAt: true },
      }),
      fetchReceiptAggregates(this.prisma, {
        merchantId,
        includeImportedBase: true,
      }),
    ]);

    const parsedSettings = this.parseRfmSettings(settingsRow?.rulesJson);
    const recencyMode =
      parsedSettings.recencyMode === 'manual' && parsedSettings.recencyDays
        ? 'manual'
        : 'auto';
    const recencyHorizon =
      recencyMode === 'manual' ? parsedSettings.recencyDays : undefined;

    const firstSeenMap = new Map<string, Date>();
    for (const w of wallets) {
      const prev = firstSeenMap.get(w.customerId);
      if (!prev || prev > w.createdAt)
        firstSeenMap.set(w.customerId, w.createdAt);
    }

    const stats: Array<{
      customerId: string;
      visits: number;
      totalSpent: number;
      lastOrderAt?: Date;
      firstSeenAt?: Date;
    }> = [];

    for (const r of receipts) {
      stats.push({
        customerId: r.customerId,
        visits: Math.max(0, Number(r.visits || 0)),
        totalSpent: Math.max(0, Number(r.totalSpent || 0)),
        lastOrderAt: r.lastPurchaseAt || undefined,
        firstSeenAt:
          firstSeenMap.get(r.customerId) ?? r.firstPurchaseAt ?? undefined,
      });
    }

    for (const [customerId, firstSeenAt] of firstSeenMap.entries()) {
      if (!stats.find((s) => s.customerId === customerId)) {
        stats.push({
          customerId,
          visits: 0,
          totalSpent: 0,
          lastOrderAt: undefined,
          firstSeenAt,
        });
      }
    }

    const now = new Date();

    const frequencySamples = stats
      .map((s) => Math.max(0, Number(s.visits ?? 0)))
      .filter((value) => value > 0);
    const monetarySamples = stats
      .map((s) => Math.max(0, Number(s.totalSpent ?? 0)))
      .filter((value) => value > 0);
    const recencySamples = stats
      .filter((s) => (s.visits ?? 0) > 0 && s.lastOrderAt)
      .map((s) => this.computeRecencyDaysRaw(s.lastOrderAt, now))
      .filter((value) => Number.isFinite(value) && value >= 0);

    const frequencyQuantiles = frequencySamples.length
      ? this.computeQuantiles(frequencySamples)
      : null;
    const monetaryQuantiles = monetarySamples.length
      ? this.computeQuantiles(monetarySamples)
      : null;
    const recencyQuantiles = recencySamples.length
      ? this.computeQuantiles(recencySamples)
      : null;

    const resolvedFrequencyThreshold =
      parsedSettings.frequency?.mode === 'manual'
        ? this.normalizeThreshold(parsedSettings.frequency.threshold, 1)
        : null;
    const frequencyThreshold =
      resolvedFrequencyThreshold != null ? resolvedFrequencyThreshold : null;

    const resolvedMoneyThreshold =
      parsedSettings.monetary?.mode === 'manual'
        ? this.normalizeThreshold(parsedSettings.monetary.threshold, 0)
        : null;
    const moneyThreshold =
      resolvedMoneyThreshold != null ? resolvedMoneyThreshold : null;

    for (const s of stats) {
      const visits = Math.max(0, Number(s.visits ?? 0));
      const totalSpent = Math.max(0, Number(s.totalSpent ?? 0));
      const daysSinceRaw = this.computeRecencyDaysRaw(
        s.lastOrderAt ?? null,
        now,
      );
      const boundedRecency =
        recencyMode === 'manual' && recencyHorizon
          ? this.computeRecencyDaysBounded(
              s.lastOrderAt ?? null,
              recencyHorizon,
              now,
            )
          : null;
      const rfmR =
        recencyMode === 'manual' && recencyHorizon
          ? this.scoreRecency(boundedRecency ?? recencyHorizon, recencyHorizon)
          : this.scoreRecencyQuantile(daysSinceRaw, recencyQuantiles);
      const rfmF = this.scoreDescending(
        visits,
        frequencyThreshold,
        frequencyThreshold == null ? frequencyQuantiles : null,
      );
      const rfmM = this.scoreDescending(
        totalSpent,
        moneyThreshold,
        moneyThreshold == null ? monetaryQuantiles : null,
      );
      const rfmScore = rfmR * 100 + rfmF * 10 + rfmM;
      const rfmClass = `${rfmR}-${rfmF}-${rfmM}`;

      const avgCheck = visits > 0 ? totalSpent / visits : 0;

      await this.prisma.customerStats.upsert({
        where: {
          merchantId_customerId: {
            merchantId,
            customerId: s.customerId,
          } as any,
        },
        update: {
          firstSeenAt: s.firstSeenAt ?? undefined,
          lastSeenAt: new Date(),
          lastOrderAt: s.lastOrderAt ?? null,
          visits,
          totalSpent,
          avgCheck,
          rfmR,
          rfmF,
          rfmM,
          rfmScore,
          rfmClass,
        },
        create: {
          merchantId,
          customerId: s.customerId,
          firstSeenAt: s.firstSeenAt ?? new Date(),
          lastSeenAt: new Date(),
          lastOrderAt: s.lastOrderAt ?? null,
          visits,
          totalSpent,
          avgCheck,
          rfmR,
          rfmF,
          rfmM,
          rfmScore,
          rfmClass,
        },
      });
    }
  }
}
