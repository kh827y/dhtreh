import type { MetricsService } from '../metrics.service';
import type { PrismaService } from '../prisma.service';

export type LevelRule = { name: string; threshold: number };
export type LevelsConfig = {
  periodDays: number;
  metric: 'earn' | 'redeem' | 'transactions';
  levels: LevelRule[];
};

export type LevelsMetrics =
  | Pick<MetricsService, 'inc'>
  | { inc?: (metric: string, labels?: Record<string, string>) => unknown };
export type LevelsPrisma =
  | Pick<PrismaService, 'transaction' | 'receipt'>
  | {
      transaction: {
        count: (args: any) => Promise<number>;
        findMany: (args: any) => Promise<Array<{ amount?: number }>>;
      };
      receipt: {
        count: (args: any) => Promise<number>;
        findMany: (
          args: any,
        ) => Promise<Array<{ total?: number; eligibleTotal?: number }>>;
      };
    };

const DEFAULT_CONFIG: LevelsConfig = {
  periodDays: 365,
  metric: 'earn',
  levels: [{ name: 'Base', threshold: 0 }],
};

export function parseLevelsConfig(source: unknown): LevelsConfig {
  try {
    const root =
      source && typeof source === 'object'
        ? (source as Record<string, any>)
        : {};
    const cfg = root?.levelsCfg ?? root?.rulesJson?.levelsCfg ?? null;
    const rawLevels = Array.isArray(cfg?.levels)
      ? cfg.levels
      : DEFAULT_CONFIG.levels;
    const normalized = rawLevels
      .filter(
        (item: any) =>
          item && typeof item === 'object' && typeof item.name === 'string',
      )
      .map((item: any) => ({
        name: String(item.name),
        threshold: Math.max(0, Number(item.threshold ?? 0) || 0),
      }));
    const levels = normalized.length
      ? [...normalized].sort((a, b) => a.threshold - b.threshold)
      : DEFAULT_CONFIG.levels;
    const periodDays =
      Number(cfg?.periodDays ?? DEFAULT_CONFIG.periodDays) ||
      DEFAULT_CONFIG.periodDays;
    const metric = cfg?.metric;
    const resolvedMetric: LevelsConfig['metric'] =
      metric === 'redeem' || metric === 'transactions' ? metric : 'earn';
    return { periodDays, metric: resolvedMetric, levels };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function computeLevelState(args: {
  prisma: LevelsPrisma;
  metrics?: LevelsMetrics | null;
  merchantId: string;
  merchantCustomerId?: string | null;
  customerId?: string | null;
  config: LevelsConfig;
  now?: number | Date;
}): Promise<{
  value: number;
  current: LevelRule;
  next: LevelRule | null;
  progressToNext: number;
}> {
  const { prisma, metrics, merchantId, config } = args;
  const nowTs =
    args.now instanceof Date
      ? args.now.getTime()
      : typeof args.now === 'number'
        ? args.now
        : Date.now();
  const since = new Date(nowTs - config.periodDays * 24 * 60 * 60 * 1000);

  let customerId: string | null = args.customerId ?? null;
  const prismaAny = prisma as any;
  if (
    !customerId &&
    args.merchantCustomerId &&
    prismaAny?.merchantCustomer?.findUnique
  ) {
    const mc = await prismaAny.merchantCustomer.findUnique({
      where: { id: args.merchantCustomerId },
      select: { customerId: true, merchantId: true },
    });
    if (!mc || mc.merchantId !== merchantId)
      throw new Error('merchant customer not found');
    customerId = mc.customerId;
  }
  if (!customerId) throw new Error('customer not found');

  // Значение для прогресса считаем по чекам (покупкам), а не по баллам.
  // - Для metric === 'transactions' считаем количество чеков за период.
  // - Для остальных метрик считаем сумму покупок: используем сумму total (или eligibleTotal при необходимости).
  let value = 0;
  if (prismaAny?.receipt) {
    if (config.metric === 'transactions') {
      value = await prismaAny.receipt.count({
        where: { merchantId, customerId, createdAt: { gte: since } },
      });
    } else {
      const receipts = await prismaAny.receipt.findMany({
        where: { merchantId, customerId, createdAt: { gte: since } },
        select: { total: true, eligibleTotal: true },
      });
      for (const r of receipts) {
        // Используем общий чек (total) как сумму покупок; при желании можно переключиться на eligibleTotal
        const sum = Number(r?.total ?? 0);
        if (Number.isFinite(sum) && sum > 0) value += Math.round(sum);
      }
    }
  } else {
    // Фоллбек для тестов/моков без receipt-модели: прежняя логика по транзакциям
    if (config.metric === 'transactions') {
      value = await prisma.transaction.count({
        where: { merchantId, customerId, createdAt: { gte: since } },
      });
    } else {
      const type = config.metric === 'redeem' ? 'REDEEM' : 'EARN';
      const items = await prisma.transaction.findMany({
        where: { merchantId, customerId, type, createdAt: { gte: since } },
      });
      for (const item of items) {
        value += Math.abs(Number(item?.amount ?? 0) || 0);
      }
    }
  }

  let current = config.levels[0];
  let next: LevelRule | null = null;
  for (const lvl of config.levels) {
    if (value >= lvl.threshold) {
      current = lvl;
    } else {
      next = lvl;
      break;
    }
  }
  const progressToNext = next ? Math.max(0, next.threshold - value) : 0;
  try {
    metrics?.inc?.('levels_evaluations_total', { metric: config.metric });
  } catch {}
  return { value, current, next, progressToNext };
}

export function resolveLevelBenefits(
  source: unknown,
  levelName: string,
): { earnBpsBonus: number; redeemLimitBpsBonus: number } {
  const root =
    source && typeof source === 'object' ? (source as Record<string, any>) : {};
  const benefits = root?.levelBenefits ?? root?.rulesJson?.levelBenefits ?? {};
  const earnMap = benefits?.earnBpsBonusByLevel ?? {};
  const redeemMap = benefits?.redeemLimitBpsBonusByLevel ?? {};
  const earnBpsBonus = Math.max(0, Number(earnMap?.[levelName] ?? 0) || 0);
  const redeemLimitBpsBonus = Math.max(
    0,
    Number(redeemMap?.[levelName] ?? 0) || 0,
  );
  return { earnBpsBonus, redeemLimitBpsBonus };
}
