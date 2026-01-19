export type ChartGroup = "day" | "week" | "month";

export type AttemptPoint = { date: string; invitations: number; returns: number };
export type RevenuePoint = { date: string; total: number; firstPurchases: number };
export type RfmReturnPoint = { date: string; segment: string; returned: number };

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

export function groupAttemptsTimeline(points: AttemptPoint[], group: ChartGroup) {
  const map = new Map<string, { invitations: number; returns: number }>();
  for (const point of points) {
    const bucket = bucketKey(toDate(point.date), group);
    const current = map.get(bucket) ?? { invitations: 0, returns: 0 };
    current.invitations += point.invitations || 0;
    current.returns += point.returns || 0;
    map.set(bucket, current);
  }
  return sortKeys(map.keys()).map(key => ({
    bucket: key,
    invitations: map.get(key)?.invitations ?? 0,
    returns: map.get(key)?.returns ?? 0,
  }));
}

export function groupRevenueTimeline(points: RevenuePoint[], group: ChartGroup) {
  const map = new Map<string, { total: number; firstPurchases: number }>();
  for (const point of points) {
    const bucket = bucketKey(toDate(point.date), group);
    const current = map.get(bucket) ?? { total: 0, firstPurchases: 0 };
    current.total += point.total || 0;
    current.firstPurchases += point.firstPurchases || 0;
    map.set(bucket, current);
  }
  return sortKeys(map.keys()).map(key => ({
    bucket: key,
    total: map.get(key)?.total ?? 0,
    firstPurchases: map.get(key)?.firstPurchases ?? 0,
  }));
}

export function groupRfmReturnsTimeline(points: RfmReturnPoint[], group: ChartGroup) {
  const map = new Map<string, number>(); // key `${bucket}|${segment}`
  for (const point of points) {
    const bucket = bucketKey(toDate(point.date), group);
    const key = `${bucket}|${point.segment}`;
    map.set(key, (map.get(key) ?? 0) + (point.returned || 0));
  }

  return Array.from(map.entries())
    .map(([key, returned]) => {
      const [bucket = "", ...segmentParts] = key.split("|");
      return { bucket, segment: segmentParts.join("|"), returned };
    })
    .sort((a, b) => a.bucket.localeCompare(b.bucket) || a.segment.localeCompare(b.segment));
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
