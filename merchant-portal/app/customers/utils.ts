export type CustomerStats = {
  visits?: number | null;
  totalSpent?: number | null;
  avgCheck?: number | null;
  lastOrderAt?: string | null;
  rfmClass?: string | null;
};

export type CustomerSegment = {
  id: string;
  name?: string | null;
};

export type CustomerRecord = {
  id: string;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  birthday?: string | null;
  gender?: string | null;
  createdAt?: string | null;
  tags?: string[] | null;
  segments?: CustomerSegment[] | null;
  stats?: CustomerStats | null;
};

export function normalizeCustomer(raw: any): CustomerRecord {
  if (!raw || typeof raw !== "object") {
    return { id: "" };
  }
  const stats = raw.stats && typeof raw.stats === "object" ? raw.stats : null;
  const segments = Array.isArray(raw.segments)
    ? raw.segments.map((segment: any) => ({
        id: String(segment?.id ?? segment?.segmentId ?? ""),
        name: segment?.name ?? segment?.segment?.name ?? null,
      }))
    : null;

  return {
    id: String(raw.id ?? ""),
    phone: raw.phone ?? raw.login ?? null,
    email: raw.email ?? null,
    name: raw.name ?? null,
    birthday: raw.birthday ?? null,
    gender: raw.gender ?? null,
    createdAt: raw.createdAt ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags : null,
    segments,
    stats: stats
      ? {
          visits: typeof stats.visits === "number" ? stats.visits : Number(stats.visits) || 0,
          totalSpent: typeof stats.totalSpent === "number" ? stats.totalSpent : Number(stats.totalSpent) || 0,
          avgCheck: typeof stats.avgCheck === "number" ? stats.avgCheck : Number(stats.avgCheck) || 0,
          lastOrderAt: stats.lastOrderAt
            ? new Date(stats.lastOrderAt).toISOString()
            : null,
          rfmClass: typeof stats.rfmClass === "string" ? stats.rfmClass : null,
        }
      : null,
  };
}

export function formatPhone(phone?: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D+/g, "");
  if (digits.length === 11) {
    const code = digits.slice(1, 4);
    const part1 = digits.slice(4, 7);
    const part2 = digits.slice(7, 9);
    const part3 = digits.slice(9, 11);
    return `+${digits[0]} (${code}) ${part1}-${part2}-${part3}`;
  }
  if (phone.startsWith("+")) return phone;
  return `+${phone}`;
}

export function formatCurrency(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)} ₽`;
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatSegments(segments?: CustomerSegment[] | null): string {
  if (!segments?.length) return "—";
  const names = segments
    .map((segment) => segment?.name)
    .filter((name): name is string => Boolean(name && name.trim()));
  return names.length ? names.join(", ") : "—";
}

export function formatVisits(stats?: CustomerStats | null): string {
  if (!stats) return "—";
  const visits = Number(stats.visits || 0);
  return visits > 0 ? `${visits}` : "—";
}

export function calculateAge(birthday?: string | null): number | null {
  if (!birthday) return null;
  const date = new Date(birthday);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}
