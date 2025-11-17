export type ChartGroup = "day" | "week" | "month";

export type TimelinePoint = { date: string; greetings: number; purchases: number };
export type RevenuePoint = { date: string; revenue: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date(Date.UTC(1970, 0, 1));
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function bucketKey(date: Date, group: ChartGroup): string {
  let target = new Date(date);
  target.setUTCHours(0, 0, 0, 0);
  if (group === "week") {
    target = startOfWeek(target);
  } else if (group === "month") {
    target = startOfMonth(target);
  }
  return target.toISOString().slice(0, 10);
}

function sortKeys(keys: Iterable<string>): string[] {
  return Array.from(new Set(keys)).sort((a, b) => a.localeCompare(b));
}

export function groupTimeline(points: TimelinePoint[], group: ChartGroup) {
  const map = new Map<string, { greetings: number; purchases: number }>();
  for (const point of points) {
    const bucket = bucketKey(toDate(point.date), group);
    const current = map.get(bucket) ?? { greetings: 0, purchases: 0 };
    current.greetings += point.greetings || 0;
    current.purchases += point.purchases || 0;
    map.set(bucket, current);
  }
  return sortKeys(map.keys()).map((key) => ({
    bucket: key,
    greetings: map.get(key)?.greetings ?? 0,
    purchases: map.get(key)?.purchases ?? 0,
  }));
}

export function groupRevenue(points: RevenuePoint[], group: ChartGroup) {
  const map = new Map<string, number>();
  for (const point of points) {
    const bucket = bucketKey(toDate(point.date), group);
    map.set(bucket, (map.get(bucket) ?? 0) + (point.revenue || 0));
  }
  return sortKeys(map.keys()).map((key) => ({
    bucket: key,
    revenue: map.get(key) ?? 0,
  }));
}

export function formatBucketLabel(bucket: string, group: ChartGroup): string {
  const [yearStr, monthStr, dayStr] = bucket.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month >= 0 ? month : 0, day || 1));

  if (Number.isNaN(date.getTime())) return bucket;

  if (group === "month") {
    return date.toLocaleDateString("ru-RU", { month: "2-digit", year: "numeric" });
  }

  const base = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return group === "week" ? `Неделя с ${base}` : base;
}
