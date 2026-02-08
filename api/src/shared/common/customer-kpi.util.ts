const MS_PER_DAY = 86_400_000;

const clampPrecision = (value: number | undefined, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(6, Math.floor(num)));
};

const roundTo = (value: number, precision: number) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const normalizeNonNegative = (value: unknown) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
};

export type CustomerKpiInput = {
  visits: number | null | undefined;
  totalSpent: number | null | undefined;
  firstPurchaseAt?: Date | null;
  lastPurchaseAt?: Date | null;
  fallbackAverageCheck?: number | null | undefined;
  averageCheckPrecision?: number;
  visitFrequencyPrecision?: number;
  now?: Date;
};

export type CustomerKpiSnapshot = {
  visits: number;
  totalSpent: number;
  averageCheck: number;
  daysSinceLastVisit: number | null;
  visitFrequencyDays: number | null;
};

export function computeDaysSinceLastVisit(
  value: Date | null | undefined,
  now = new Date(),
): number | null {
  if (!value) return null;
  const diff = now.getTime() - value.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

export function computeVisitFrequencyDays(
  visits: number | null | undefined,
  firstPurchaseAt: Date | null | undefined,
  lastPurchaseAt: Date | null | undefined,
  precision = 2,
): number | null {
  const normalizedVisits = Math.max(0, Math.floor(normalizeNonNegative(visits)));
  if (normalizedVisits <= 1) return null;
  const from = firstPurchaseAt ?? lastPurchaseAt ?? null;
  const to = lastPurchaseAt ?? firstPurchaseAt ?? null;
  if (!from || !to) return null;
  const diffDays = Math.max(
    0,
    roundTo((to.getTime() - from.getTime()) / MS_PER_DAY, 0),
  );
  if (diffDays <= 0) return null;
  return roundTo(diffDays / (normalizedVisits - 1), clampPrecision(precision, 2));
}

export function buildCustomerKpiSnapshot(
  input: CustomerKpiInput,
): CustomerKpiSnapshot {
  const visits = Math.max(0, Math.floor(normalizeNonNegative(input.visits)));
  const totalSpent = normalizeNonNegative(input.totalSpent);
  const averageCheckPrecision = clampPrecision(input.averageCheckPrecision, 0);
  const visitFrequencyPrecision = clampPrecision(input.visitFrequencyPrecision, 2);
  const averageCheck =
    visits > 0
      ? roundTo(totalSpent / visits, averageCheckPrecision)
      : roundTo(normalizeNonNegative(input.fallbackAverageCheck), averageCheckPrecision);

  const lastPurchaseAt = input.lastPurchaseAt ?? input.firstPurchaseAt ?? null;
  return {
    visits,
    totalSpent,
    averageCheck,
    daysSinceLastVisit: computeDaysSinceLastVisit(lastPurchaseAt, input.now),
    visitFrequencyDays: computeVisitFrequencyDays(
      visits,
      input.firstPurchaseAt,
      input.lastPurchaseAt ?? input.firstPurchaseAt ?? null,
      visitFrequencyPrecision,
    ),
  };
}

