export type RecencyGrouping = "day" | "week" | "month";

export type RecencyBucket = {
  index: number;
  value: number;
  label: string;
  customers: number;
};

export type RecencyResponse = {
  group: RecencyGrouping;
  totalCustomers: number;
  buckets: RecencyBucket[];
};

export type TimeActivityRow = {
  orders: number;
  customers: number;
  revenue: number;
  averageCheck: number;
};

export type DayActivityRow = TimeActivityRow & { day: number };
export type HourActivityRow = TimeActivityRow & { hour: number };
export type HeatmapCell = TimeActivityRow & { day: number; hour: number };

export type TimeActivityResponse = {
  dayOfWeek: DayActivityRow[];
  hours: HourActivityRow[];
  heatmap: HeatmapCell[];
};

export type ActivityMetric = "sales" | "revenue" | "avg_check";

export const weekDayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const hourLabels = Array.from({ length: 24 }, (_, idx) =>
  idx.toString().padStart(2, "0"),
);

const getMetricValue = (
  row: Partial<TimeActivityRow> | null | undefined,
  metric: ActivityMetric,
) => {
  if (!row) return 0;
  if (metric === "sales") return Math.max(0, Number(row.orders || 0));
  if (metric === "revenue") return Math.max(0, Number(row.revenue || 0));
  return Math.max(0, Number(row.averageCheck || 0));
};

export function toRecencyChartData(recency: RecencyResponse | null) {
  if (!recency?.buckets?.length) {
    return [] as Array<{ label: string; value: number; count: number }>;
  }
  return recency.buckets.map((bucket) => ({
    label: bucket.label || String(bucket.value ?? bucket.index),
    value: bucket.value ?? bucket.index,
    count: Math.max(0, bucket.customers || 0),
  }));
}

export function toDayOfWeekData(
  activity: TimeActivityResponse | null,
  metric: ActivityMetric,
) {
  const map = new Map<number, DayActivityRow>();
  for (const row of activity?.dayOfWeek || []) {
    const day = Math.min(Math.max(Number(row.day || 0), 1), 7);
    map.set(day, row);
  }
  return weekDayLabels.map((label, idx) => {
    const day = idx + 1;
    const row = map.get(day);
    return { name: label, value: getMetricValue(row, metric) };
  });
}

export function toHourOfDayData(
  activity: TimeActivityResponse | null,
  metric: ActivityMetric,
) {
  const map = new Map<number, HourActivityRow>();
  for (const row of activity?.hours || []) {
    const hour = Math.min(Math.max(Number(row.hour || 0), 0), 23);
    map.set(hour, row);
  }
  return hourLabels.map((label, idx) => {
    const row = map.get(idx);
    return { name: label, value: getMetricValue(row, metric) };
  });
}

export function toHeatmapData(
  activity: TimeActivityResponse | null,
  metric: ActivityMetric,
) {
  const map = new Map<string, HeatmapCell>();
  for (const cell of activity?.heatmap || []) {
    const day = Math.min(Math.max(Number(cell.day || 0), 1), 7);
    const hour = Math.min(Math.max(Number(cell.hour || 0), 0), 23);
    map.set(`${day}:${hour}`, { ...cell, day, hour });
  }

  const cells: Array<{ dayIndex: number; dayLabel: string; hour: number; value: number }> = [];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    for (let hour = 0; hour < 24; hour++) {
      const mapKey = `${dayIdx + 1}:${hour}`;
      const value = getMetricValue(map.get(mapKey), metric);
      cells.push({
        dayIndex: dayIdx,
        dayLabel: weekDayLabels[dayIdx] ?? "",
        hour,
        value,
      });
    }
  }

  const maxValue = cells.reduce((acc, cell) => Math.max(acc, cell.value), 0);

  return { cells, maxValue };
}
