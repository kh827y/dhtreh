export type TimeGrouping = "day" | "week" | "month";

export type SummaryTimelinePoint = {
  date: string;
  registrations: number;
  salesCount: number;
  salesAmount: number;
};

export type SummaryMetrics = {
  salesAmount: number;
  orders: number;
  averageCheck: number;
  newCustomers: number;
  activeCustomers: number;
  averagePurchasesPerCustomer: number;
  visitFrequencyDays: number | null;
  pointsBurned: number;
};

export type DashboardResponse = {
  period: { from: string; to: string; type: string };
  previousPeriod: { from: string; to: string; type: string };
  metrics: SummaryMetrics;
  previousMetrics: SummaryMetrics;
  timeline: {
    current: SummaryTimelinePoint[];
    previous: SummaryTimelinePoint[];
    grouping: TimeGrouping;
  };
  composition: { newChecks: number; repeatChecks: number };
  retention: {
    activeCurrent: number;
    activePrevious: number;
    retained: number;
    retentionRate: number;
    churnRate: number;
  };
};

export type ChartPoint = {
  label: string;
  revenue: number;
  prevRevenue: number;
  registrations: number;
  prevRegistrations: number;
};

export function formatNumber(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

export function formatDecimal(value?: number | null, fractionDigits = 1): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPeriodLabel(period?: { from: string; to: string; type: string }): string {
  if (!period) return "";
  const from = parseDate(period.from);
  const to = parseDate(period.to);

  const formatFull = (date: Date) =>
    new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);

  const formatMonth = (date: Date) =>
    new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);

  if (period.type === "yesterday") return "Вчера";
  if (period.type === "week") return "Эта неделя";
  if (period.type === "month" && from) return capitalize(formatMonth(from));
  if (period.type === "quarter" && from) {
    const quarter = Math.floor(from.getUTCMonth() / 3) + 1;
    return `${quarter} квартал ${from.getUTCFullYear()}`;
  }
  if (period.type === "year" && from) return `${from.getUTCFullYear()} год`;
  if (from && to) return `${formatFull(from)} — ${formatFull(to)}`;
  return "";
}

export function buildChartPoints(timeline: DashboardResponse["timeline"]): ChartPoint[] {
  const length = Math.max(timeline.current.length, timeline.previous.length);
  return Array.from({ length }).map((_, index) => {
    const current = timeline.current[index];
    const previous = timeline.previous[index];
    const rawLabel = current?.date || previous?.date || `${index + 1}`;

    return {
      label: formatDayLabel(rawLabel),
      revenue: current?.salesAmount ?? 0,
      prevRevenue: previous?.salesAmount ?? 0,
      registrations: current?.registrations ?? 0,
      prevRegistrations: previous?.registrations ?? 0,
    };
  });
}

export function calcDelta(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) {
    return { value: null as number | null, direction: "neutral" as const };
  }
  const delta = ((current - previous) / previous) * 100;
  if (Math.abs(delta) < 0.0001) return { value: 0, direction: "neutral" as const };
  return { value: delta, direction: delta > 0 ? ("up" as const) : ("down" as const) };
}

export function hasTimelineData(timeline: DashboardResponse["timeline"]): boolean {
  return (
    timeline.current.some(
      (point) =>
        (point.registrations ?? 0) > 0 ||
        (point.salesAmount ?? 0) > 0 ||
        (point.salesCount ?? 0) > 0,
    ) ||
    timeline.previous.some(
      (point) =>
        (point.registrations ?? 0) > 0 ||
        (point.salesAmount ?? 0) > 0 ||
        (point.salesCount ?? 0) > 0,
    )
  );
}

export function formatDayLabel(date: string) {
  if (!date || date.length < 10) return date;
  const [, month, day] = date.split("-");
  return `${day}.${month}` || date;
}

function parseDate(value?: string) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
