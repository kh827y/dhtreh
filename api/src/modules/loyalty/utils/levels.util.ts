import type { MetricsService } from '../../../core/metrics/metrics.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const readNumberField = (record: JsonRecord, key: string): number | null => {
  if (!record) return null;
  return readNumber(record[key]);
};

export type LevelRule = {
  name: string;
  threshold: number;
  earnRateBps?: number | null;
  redeemRateBps?: number | null;
  minPaymentAmount?: number | null;
  isHidden?: boolean;
};
export type LevelsConfig = {
  periodDays: number;
  metric: 'earn' | 'redeem' | 'transactions';
  levels: LevelRule[];
};

export const DEFAULT_LEVELS_PERIOD_DAYS = 365;
export const DEFAULT_LEVELS_METRIC: LevelsConfig['metric'] = 'earn';

export function normalizeLevelsPeriodDays(
  value: unknown,
  fallback = DEFAULT_LEVELS_PERIOD_DAYS,
): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

export type LevelsMetrics =
  | Pick<MetricsService, 'inc'>
  | { inc?: (metric: string, labels?: Record<string, string>) => unknown };
export type LevelsPrisma =
  | Pick<PrismaService, 'transaction' | 'receipt' | 'customer'>
  | {
      transaction: {
        count: (args: unknown) => Promise<number>;
        findMany: (args: unknown) => Promise<
          Array<{
            amount?: number | null;
            orderId?: string | null;
            metadata?: unknown;
            canceledAt?: Date | null;
          }>
        >;
      };
      receipt?: {
        count: (args: unknown) => Promise<number>;
        findMany: (args: unknown) => Promise<
          Array<{
            total?: number | null;
            eligibleTotal?: number | null;
            canceledAt?: Date | null;
            orderId?: string | null;
          }>
        >;
      };
      customer?: {
        findUnique: (args: unknown) => Promise<{
          id: string;
          merchantId: string;
        } | null>;
      };
    };

export async function computeLevelState(args: {
  prisma: LevelsPrisma;
  metrics?: LevelsMetrics | null;
  merchantId: string;
  customerId?: string | null;
  config: LevelsConfig;
  now?: number | Date;
  includeCanceled?: boolean;
  includeRefunds?: boolean;
}): Promise<{
  value: number;
  current: LevelRule;
  next: LevelRule | null;
  progressToNext: number;
  refundsCount?: number;
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
  const customerClient = 'customer' in prisma ? prisma.customer : undefined;
  if (args.customerId && customerClient?.findUnique) {
    const mc = await customerClient.findUnique({
      where: { id: args.customerId },
      select: { id: true, merchantId: true },
    });
    if (!mc || mc.merchantId !== merchantId)
      throw new Error('merchant customer not found');
    customerId = mc.id;
  }
  if (!customerId) throw new Error('customer not found');

  // Значение для прогресса считаем по чекам (покупкам), а не по баллам.
  // - Для metric === 'transactions' считаем количество чеков за период.
  // - Для остальных метрик считаем сумму покупок: используем сумму total (или eligibleTotal при необходимости).
  let value = 0;
  let refundsCount = 0;
  const receiptClient = 'receipt' in prisma ? prisma.receipt : undefined;
  if (receiptClient) {
    if (config.metric === 'transactions') {
      value = await receiptClient.count({
        where: {
          merchantId,
          customerId,
          createdAt: { gte: since },
          ...(args.includeCanceled ? {} : { canceledAt: null }),
        },
      });
    } else {
      const receipts = await receiptClient.findMany({
        where: {
          merchantId,
          customerId,
          createdAt: { gte: since },
          ...(args.includeCanceled ? {} : { canceledAt: null }),
        },
        select: {
          total: true,
          eligibleTotal: true,
          canceledAt: true,
          orderId: true,
        },
      });
      const receiptTotals = new Map<string, number>();
      const canceledOrders = new Set<string>();
      const refundedByOrder = new Map<string, number>();
      for (const r of receipts) {
        // Используем общий чек (total) как сумму покупок; при желании можно переключиться на eligibleTotal
        const sum = Number(r?.total ?? 0);
        const orderId =
          r?.orderId && typeof r.orderId === 'string' ? r.orderId : null;
        if (orderId && Number.isFinite(sum)) {
          if (!receiptTotals.has(orderId)) {
            receiptTotals.set(orderId, Math.max(0, Math.round(sum)));
          }
        }
        if (Number.isFinite(sum) && sum > 0) value += Math.round(sum);
        if (args.includeRefunds && r?.canceledAt) {
          value -= Math.max(0, Math.round(sum));
          refundsCount += 1;
          if (orderId) canceledOrders.add(orderId);
        }
      }
      if (args.includeRefunds && receiptTotals.size > 0 && prisma.transaction) {
        const refunds = await prisma.transaction.findMany({
          where: {
            merchantId,
            customerId,
            type: 'REFUND',
            canceledAt: null,
            createdAt: { gte: since },
          },
          select: { orderId: true, metadata: true },
        });
        for (const refund of refunds) {
          const orderId =
            refund?.orderId && typeof refund.orderId === 'string'
              ? refund.orderId
              : null;
          if (!orderId || canceledOrders.has(orderId)) continue;
          const total = receiptTotals.get(orderId);
          if (total == null) continue;
          const meta =
            refund && isRecord(refund.metadata) ? refund.metadata : null;
          let share = 1;
          const rawShare =
            (meta ? readNumberField(meta, 'share') : null) ??
            (meta ? readNumberField(meta, 'refundShare') : null);
          if (
            rawShare != null &&
            Number.isFinite(rawShare) &&
            rawShare > 0 &&
            rawShare <= 1
          ) {
            share = rawShare;
          } else if (meta && total > 0) {
            const rt = readNumberField(meta, 'refundTotal');
            if (rt != null && Number.isFinite(rt) && rt >= 0) {
              share = Math.min(1, Math.max(0, rt / total));
            }
          }
          const refunded = Math.max(0, Math.round(total * share));
          const alreadyRefunded = refundedByOrder.get(orderId) ?? 0;
          const remaining = Math.max(0, total - alreadyRefunded);
          const applied = Math.min(remaining, refunded);
          if (applied > 0) {
            refundedByOrder.set(orderId, alreadyRefunded + applied);
            value -= applied;
            refundsCount += 1;
          }
        }
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

  if (value < 0) value = 0;
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
  return { value, current, next, progressToNext, refundsCount };
}
