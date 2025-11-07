export const STAFF_MOTIVATION_DEFAULT_NEW_POINTS = 30;
export const STAFF_MOTIVATION_DEFAULT_EXISTING_POINTS = 10;

export const STAFF_MOTIVATION_ALLOWED_PERIODS = [
  'week',
  'month',
  'quarter',
  'year',
  'custom',
] as const;

export type StaffMotivationPeriod =
  (typeof STAFF_MOTIVATION_ALLOWED_PERIODS)[number];

const PERIOD_DAY_MAP: Record<
  Exclude<StaffMotivationPeriod, 'custom'>,
  number
> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

export const STAFF_MOTIVATION_MAX_CUSTOM_DAYS = 365;

export function normalizePeriod(
  raw: string | null | undefined,
  customDays: number | null | undefined,
): { period: StaffMotivationPeriod; customDays: number | null } {
  const normalized = (typeof raw === 'string' ? raw : '').toLowerCase();
  const period = STAFF_MOTIVATION_ALLOWED_PERIODS.includes(
    normalized as StaffMotivationPeriod,
  )
    ? (normalized as StaffMotivationPeriod)
    : 'week';

  if (period !== 'custom') {
    return { period, customDays: null };
  }

  const days = clampDays(customDays);
  return { period: 'custom', customDays: days };
}

export function resolvePeriodDays(
  period: StaffMotivationPeriod,
  customDays: number | null | undefined,
): number {
  if (period === 'custom') {
    return clampDays(customDays) ?? 30;
  }
  return PERIOD_DAY_MAP[period] ?? 7;
}

export function calculatePeriodWindow(
  period: StaffMotivationPeriod,
  customDays: number | null | undefined,
  now: Date = new Date(),
): { from: Date; to: Date; days: number } {
  const days = resolvePeriodDays(period, customDays);
  const to = new Date(now);
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from, to, days };
}

export function periodLabel(
  period: StaffMotivationPeriod,
  customDays: number | null | undefined,
): string {
  switch (period) {
    case 'week':
      return 'Последние 7 дней';
    case 'month':
      return 'Последние 30 дней';
    case 'quarter':
      return 'Последние 90 дней';
    case 'year':
      return 'Последние 365 дней';
    case 'custom': {
      const days = clampDays(customDays) ?? 30;
      const suffix =
        days % 10 === 1 && days % 100 !== 11
          ? 'день'
          : days % 10 >= 2 &&
              days % 10 <= 4 &&
              (days % 100 < 10 || days % 100 >= 20)
            ? 'дня'
            : 'дней';
      return `Последние ${days} ${suffix}`;
    }
    default:
      return 'Последние 7 дней';
  }
}

function clampDays(value: number | null | undefined): number | null {
  if (!Number.isFinite(value ?? null)) return null;
  const num = Math.floor(Number(value ?? 0));
  if (num <= 0) return 1;
  if (num > STAFF_MOTIVATION_MAX_CUSTOM_DAYS)
    return STAFF_MOTIVATION_MAX_CUSTOM_DAYS;
  return num;
}
