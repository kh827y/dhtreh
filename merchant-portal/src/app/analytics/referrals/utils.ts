export type ReferralTimelinePoint = {
  date: string;
  registrations: number;
  firstPurchases: number;
};

export const normalizeTimeline = (
  points?: ReferralTimelinePoint[] | null,
): ReferralTimelinePoint[] => {
  if (!points || points.length === 0) return [];
  const map = new Map<string, ReferralTimelinePoint>();
  for (const point of points) {
    const key = String(point?.date || "");
    if (!key) continue;
    const registrations = Number.isFinite(point?.registrations)
      ? Math.max(0, Math.round(point.registrations))
      : 0;
    const firstPurchases = Number.isFinite(point?.firstPurchases)
      ? Math.max(0, Math.round(point.firstPurchases))
      : 0;
    const existing = map.get(key);
    if (existing) {
      existing.registrations += registrations;
      existing.firstPurchases += firstPurchases;
      map.set(key, existing);
    } else {
      map.set(key, {
        date: key,
        registrations,
        firstPurchases,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
};

export const hasTimelineData = (points: ReferralTimelinePoint[]) =>
  points.some((point) => point.registrations > 0 || point.firstPurchases > 0);

export const formatNumber = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString("ru-RU");
};

export const formatCurrency = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `₽${Math.round(value).toLocaleString("ru-RU")}`;
};

export const formatShortDate = (isoDate: string) => {
  if (!isoDate) return "";
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  const label = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(parsed)
    .replace(".", "")
    .trim();
  const [dayPart, monthPartRaw] = label.split(/\s+/);
  const monthPart = monthPartRaw
    ? monthPartRaw.slice(0, 3)
    : "";
  const normalizedMonth =
    monthPart.charAt(0).toUpperCase() + monthPart.slice(1);
  return [dayPart, normalizedMonth].filter(Boolean).join(" ").trim();
};

export const computeBonusProgress = (
  bonuses?: number | null,
  revenue?: number | null,
) => {
  if (!bonuses || bonuses <= 0) return 0;
  if (!revenue || revenue <= 0) return 100;
  return Math.min(100, Math.round((bonuses / revenue) * 100));
};

export const computeDeltaPercent = (
  current?: number | null,
  previous?: number | null,
) => {
  if (
    typeof current !== "number" ||
    typeof previous !== "number" ||
    Number.isNaN(previous) ||
    previous === 0
  ) {
    return null;
  }
  const raw = ((current - previous) / previous) * 100;
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw * 10) / 10;
};
