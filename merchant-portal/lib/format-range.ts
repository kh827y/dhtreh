export type TimeGrouping = "day" | "week" | "month";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parsePortalDate(bucket: string): Date | null {
  const [y, m, d] = bucket.split("-").map((part) => Number(part));
  if (!y || !m || !d) return null;
  const value = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

const normalizeSpaces = (value: string) => value.replace(/\u00a0/g, " ");

export function formatRangeLabel(bucket: string, grouping: TimeGrouping, timeZone?: string): string {
  const start = parsePortalDate(bucket);
  if (!start) return bucket;

  const tz = timeZone || "UTC";
  const formatDayShort = (date: Date) =>
    normalizeSpaces(
      new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: tz }).format(date),
    );
  const formatMonthLong = (date: Date) => {
    const withDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: tz }).format(date);
    const monthOnly = withDay.split(" ").slice(1).join(" ").trim();
    return normalizeSpaces(monthOnly || withDay);
  };

  if (grouping === "day") {
    return formatDayShort(start);
  }

  const end = new Date(start);
  if (grouping === "week") {
    end.setTime(end.getTime() + 6 * DAY_MS);
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    if (sameMonth) {
      const monthLabel = formatDayShort(end).split(" ").slice(1).join(" ").trim() || formatMonthLong(end);
      return `${start.getUTCDate()}-${end.getUTCDate()} ${monthLabel}`;
    }
    return `${formatDayShort(start)} - ${formatDayShort(end)}`;
  }

  // month grouping
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return `${start.getUTCDate()}-${end.getUTCDate()} ${formatMonthLong(end)}`;
}
