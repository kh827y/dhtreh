import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import { AnalyticsAggregatorWorker } from '../analytics-aggregator.worker';
import { UpdateRfmSettingsDto } from '../dto/update-rfm-settings.dto';
import { ensureRulesRoot, getRulesRoot } from '../../../shared/rules-json.util';
import { withJsonSchemaVersion } from '../../../shared/json-version.util';

type RfmRange = { min: number | null; max: number | null; count: number };
type RfmGroupSummary = {
  score: number;
  recency: RfmRange;
  frequency: RfmRange;
  monetary: RfmRange;
};
type ParsedRfmSettings = {
  recencyMode?: 'auto' | 'manual';
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

@Injectable()
export class AnalyticsRfmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AnalyticsCacheService,
    @Optional() private readonly aggregatorWorker?: AnalyticsAggregatorWorker,
  ) {}

  private cacheKey(
    prefix: string,
    parts: Array<string | number | null | undefined>,
  ) {
    return [
      prefix,
      ...parts.map((part) => (part == null ? '' : String(part))),
    ].join('|');
  }

  private toJsonObject(
    value: Prisma.JsonValue | null | undefined,
  ): Prisma.JsonObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private parseRfmSettings(
    rulesJson: Prisma.JsonValue | null | undefined,
  ): ParsedRfmSettings {
    const root = getRulesRoot(rulesJson);
    if (!root) return { recencyMode: 'auto' };
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

  private mergeRfmRules(
    rulesJson: Prisma.JsonValue | null | undefined,
    rfm: {
      recencyMode: 'auto' | 'manual';
      recencyDays?: number | null;
      frequency: { mode: 'auto' | 'manual'; threshold: number | null };
      monetary: { mode: 'auto' | 'manual'; threshold: number | null };
    },
  ): Prisma.JsonObject {
    const root = ensureRulesRoot(rulesJson);
    const next = { ...(root as Prisma.JsonObject) } as Prisma.JsonObject;
    next.rfm = {
      ...(rfm.recencyMode === 'manual' && rfm.recencyDays
        ? { recencyDays: rfm.recencyDays }
        : {}),
      recency: {
        mode: rfm.recencyMode,
        ...(rfm.recencyMode === 'manual' && rfm.recencyDays
          ? { recencyDays: rfm.recencyDays }
          : {}),
      },
      frequency: {
        mode: rfm.frequency.mode,
        ...(rfm.frequency.threshold != null
          ? { threshold: rfm.frequency.threshold }
          : {}),
      },
      monetary: {
        mode: rfm.monetary.mode,
        ...(rfm.monetary.threshold != null
          ? { threshold: rfm.monetary.threshold }
          : {}),
      },
    } as Prisma.JsonObject;
    return withJsonSchemaVersion(next) as Prisma.JsonObject;
  }

  private normalizeScore(value?: number | null): number | null {
    if (value === null || value === undefined) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const rounded = Math.round(num);
    if (rounded < 1 || rounded > 5) return null;
    return rounded;
  }

  private pushToBucket(
    buckets: Map<number, number[]>,
    score: number,
    value: number,
  ) {
    if (!Number.isFinite(value)) return;
    const bucket = buckets.get(score);
    if (bucket) {
      bucket.push(value);
    } else {
      buckets.set(score, [value]);
    }
  }

  private buildRange(values: number[]): RfmRange {
    if (!values.length) return { min: null, max: null, count: 0 };
    let min = values[0];
    let max = values[0];
    for (const value of values) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return { min, max, count: values.length };
  }

  private computeQuantiles(values: number[]) {
    if (!values.length) {
      return { q20: null, q40: null, q60: null, q80: null };
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const pick = (p: number) => {
      if (!sorted.length) return null;
      const idx = Math.floor((sorted.length - 1) * p);
      return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
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
    if (options.minimum != null) {
      return Math.max(options.minimum, rounded);
    }
    return rounded;
  }

  private normalizeThreshold(
    value: number | null | undefined,
    minimum: number,
  ): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return Math.max(minimum, Math.round(value));
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

  private scoreRecency(daysSince: number, horizon: number): number {
    if (!Number.isFinite(daysSince)) return 1;
    const limit = Math.max(1, horizon);
    const bounded = Math.max(0, Math.min(daysSince, limit));
    const bucket = Math.min(4, Math.floor((bounded / limit) * 5));
    return 5 - bucket;
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

  async getRfmGroupsAnalytics(merchantId: string) {
    const cacheKey = this.cacheKey('rfm-analytics', [merchantId]);
    const cached = this.cache.get<{
      merchantId: string;
      settings: Record<string, unknown>;
      groups: RfmGroupSummary[];
      distribution: Array<{ class: string; customers: number }>;
      totals: { customers: number };
    }>(cacheKey);
    if (cached) return cached;
    const [settingsRow, stats] = await Promise.all([
      this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { rulesJson: true },
      }),
      this.prisma.customerStats.findMany({
        where: { merchantId, customer: { erasedAt: null } },
        select: {
          rfmClass: true,
          rfmR: true,
          rfmF: true,
          rfmM: true,
          lastOrderAt: true,
          visits: true,
          totalSpent: true,
        },
      }),
    ]);
    const storedSettings = this.parseRfmSettings(settingsRow?.rulesJson);
    const recencyMode =
      storedSettings.recencyMode === 'manual' && storedSettings.recencyDays
        ? 'manual'
        : 'auto';
    const recencyHorizon =
      recencyMode === 'manual' ? storedSettings.recencyDays : undefined;
    const now = new Date();
    const recencyBuckets = new Map<number, number[]>();
    const frequencyBuckets = new Map<number, number[]>();
    const monetaryBuckets = new Map<number, number[]>();
    const frequencySamples: number[] = [];
    const monetarySamples: number[] = [];
    const recencySamples: number[] = [];
    const distribution = new Map<string, number>();

    const eligibleStats = stats.filter((row) => {
      const visits = Math.max(0, Number(row.visits ?? 0));
      const totalSpent = Math.max(0, Number(row.totalSpent ?? 0));
      return visits > 0 && totalSpent > 0;
    });

    const prepared = eligibleStats.map((row) => {
      const daysSinceRaw = this.computeRecencyDaysRaw(row.lastOrderAt, now);
      const visits = Math.max(0, Number(row.visits ?? 0));
      const totalSpent = Math.max(0, Number(row.totalSpent ?? 0));

      const rScore = this.normalizeScore(row.rfmR);
      const fScore = this.normalizeScore(row.rfmF);
      const mScore = this.normalizeScore(row.rfmM);

      if (visits > 0) frequencySamples.push(visits);
      if (totalSpent > 0) monetarySamples.push(totalSpent);
      if (visits > 0 && Number.isFinite(daysSinceRaw) && daysSinceRaw >= 0) {
        recencySamples.push(daysSinceRaw);
      }

      return {
        row,
        daysSinceRaw,
        visits,
        totalSpent,
        rScore,
        fScore,
        mScore,
      };
    });

    const frequencyQuantiles =
      frequencySamples.length > 0
        ? this.computeQuantiles(frequencySamples)
        : null;
    const monetaryQuantiles =
      monetarySamples.length > 0
        ? this.computeQuantiles(monetarySamples)
        : null;
    const recencyQuantiles =
      recencySamples.length > 0 ? this.computeQuantiles(recencySamples) : null;
    const frequencyMode =
      storedSettings.frequency?.mode === 'manual' ? 'manual' : 'auto';
    const moneyMode =
      storedSettings.monetary?.mode === 'manual' ? 'manual' : 'auto';
    const frequencyThreshold =
      frequencyMode === 'manual'
        ? this.normalizeThreshold(storedSettings.frequency?.threshold, 1)
        : null;
    const moneyThreshold =
      moneyMode === 'manual'
        ? this.normalizeThreshold(storedSettings.monetary?.threshold, 0)
        : null;

    for (const entry of prepared) {
      const boundedRecency =
        recencyMode === 'manual' && recencyHorizon
          ? this.computeRecencyDaysBounded(
              entry.row.lastOrderAt,
              recencyHorizon,
              now,
            )
          : null;
      const resolvedRScore =
        entry.rScore ??
        (recencyMode === 'manual' && recencyHorizon
          ? this.scoreRecency(boundedRecency ?? recencyHorizon, recencyHorizon)
          : this.scoreRecencyQuantile(entry.daysSinceRaw, recencyQuantiles));
      const resolvedFScore =
        entry.fScore ??
        this.scoreDescending(
          entry.visits,
          frequencyThreshold,
          frequencyThreshold == null ? frequencyQuantiles : null,
        );
      const resolvedMScore =
        entry.mScore ??
        this.scoreDescending(
          entry.totalSpent,
          moneyThreshold,
          moneyThreshold == null ? monetaryQuantiles : null,
        );

      if (resolvedRScore)
        this.pushToBucket(
          recencyBuckets,
          resolvedRScore,
          recencyMode === 'manual' && recencyHorizon
            ? (boundedRecency ?? recencyHorizon)
            : entry.daysSinceRaw,
        );
      if (resolvedFScore)
        this.pushToBucket(frequencyBuckets, resolvedFScore, entry.visits);
      if (resolvedMScore)
        this.pushToBucket(monetaryBuckets, resolvedMScore, entry.totalSpent);

      const classKey =
        typeof entry.row.rfmClass === 'string' && entry.row.rfmClass.trim()
          ? entry.row.rfmClass
          : resolvedRScore && resolvedFScore && resolvedMScore
            ? `${resolvedRScore}-${resolvedFScore}-${resolvedMScore}`
            : 'unknown';
      distribution.set(classKey, (distribution.get(classKey) ?? 0) + 1);
    }

    const suggestedFrequency = this.suggestUpperQuantile(frequencySamples, {
      minimum: 1,
    });
    const suggestedMoney = this.suggestUpperQuantile(monetarySamples, {
      minimum: 0,
    });

    const groups: RfmGroupSummary[] = [1, 2, 3, 4, 5].map((score) => ({
      score,
      recency: this.buildRange(recencyBuckets.get(score) ?? []),
      frequency: this.buildRange(frequencyBuckets.get(score) ?? []),
      monetary: this.buildRange(monetaryBuckets.get(score) ?? []),
    }));

    const settingsResponse = {
      recencyMode,
      recencyDays: recencyHorizon ?? null,
      frequencyMode,
      frequencyThreshold:
        frequencyMode === 'manual'
          ? (frequencyThreshold ?? null)
          : (suggestedFrequency ?? null),
      frequencySuggested: suggestedFrequency ?? null,
      moneyMode,
      moneyThreshold:
        moneyMode === 'manual' ? (moneyThreshold ?? null) : (suggestedMoney ?? null),
      moneySuggested: suggestedMoney ?? null,
    };

    const distributionRows = Array.from(distribution.entries())
      .map(([segment, customers]) => ({ class: segment, customers }))
      .sort(
        (a, b) =>
          (b.customers ?? 0) - (a.customers ?? 0) ||
          a.class.localeCompare(b.class),
      );

    const result = {
      merchantId,
      settings: settingsResponse,
      groups,
      distribution: distributionRows,
      totals: { customers: eligibleStats.length },
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  async updateRfmSettings(merchantId: string, dto: UpdateRfmSettingsDto) {
    const settingsRow = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const nextRules = this.mergeRfmRules(settingsRow?.rulesJson, {
      recencyMode: dto.recencyMode,
      recencyDays:
        dto.recencyMode === 'manual' ? (dto.recencyDays ?? null) : null,
      frequency: {
        mode: dto.frequencyMode,
        threshold:
          dto.frequencyMode === 'manual'
            ? (dto.frequencyThreshold ?? null)
            : null,
      },
      monetary: {
        mode: dto.moneyMode,
        threshold:
          dto.moneyMode === 'manual' ? (dto.moneyThreshold ?? null) : null,
      },
    });
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { rulesJson: nextRules, updatedAt: new Date() },
      create: { merchantId, rulesJson: nextRules },
    });
    if (this.aggregatorWorker?.recalculateCustomerStatsForMerchant) {
      await this.aggregatorWorker.recalculateCustomerStatsForMerchant(
        merchantId,
      );
    }
    return this.getRfmGroupsAnalytics(merchantId);
  }
}
