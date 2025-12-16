export type GenderItem = {
  sex: string;
  customers: number;
  transactions: number;
  revenue: number;
  averageCheck: number;
};

export type AgeItem = {
  age: number;
  customers: number;
  transactions: number;
  revenue: number;
  averageCheck: number;
};

export type SexAgeItem = {
  sex: string;
  age: number;
  customers: number;
  transactions: number;
  revenue: number;
  averageCheck: number;
};

export type PortraitResponse = {
  gender: GenderItem[];
  age: AgeItem[];
  sexAge: SexAgeItem[];
};

export type GenderBucket = {
  key: "M" | "F" | "U";
  label: string;
  customers: number;
  transactions: number;
  revenue: number;
  averageCheck: number;
  share: number;
};

export type AgeRangeBucket = {
  label: string;
  from: number;
  to: number | null;
};

export type AgeRangeStats = {
  label: string;
  clients: number;
  avgCheck: number;
  sales: number;
  revenue: number;
};

export type CombinedDemographyRow = {
  age: string;
  male_clients: number;
  male_avg_check: number;
  male_revenue: number;
  female_clients: number;
  female_avg_check: number;
  female_revenue: number;
};

export const SEX_LABELS: Record<"M" | "F" | "U", string> = {
  M: "Мужчины",
  F: "Женщины",
  U: "Не указан",
};

export const AGE_RANGES: AgeRangeBucket[] = [
  { label: "До 18", from: 0, to: 17 },
  { label: "18-24", from: 18, to: 24 },
  { label: "25-34", from: 25, to: 34 },
  { label: "35-44", from: 35, to: 44 },
  { label: "45-54", from: 45, to: 54 },
  { label: "55+", from: 55, to: null },
];

export function normalizeSexKey(sex: string | null | undefined): "M" | "F" | "U" {
  const value = (sex || "").toString().trim().toUpperCase();
  if (value === "M" || value === "MALE" || value === "М" || value === "МУЖ" || value === "МУЖСКОЙ") {
    return "M";
  }
  if (value === "F" || value === "FEMALE" || value === "Ж" || value === "ЖЕН" || value === "ЖЕНСКИЙ") {
    return "F";
  }
  return "U";
}

export function clampAgeValue(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value < 0) return 0;
  if (value > 120) return 120;
  return Math.round(value);
}

export function normalizeGenderBuckets(items: GenderItem[]): GenderBucket[] {
  const map = new Map<"M" | "F" | "U", GenderBucket>();

  for (const item of items || []) {
    const key = normalizeSexKey(item.sex);
    const existing = map.get(key) || {
      key,
      label: SEX_LABELS[key],
      customers: 0,
      transactions: 0,
      revenue: 0,
      averageCheck: 0,
      share: 0,
    };
    existing.customers += Math.max(0, item.customers || 0);
    existing.transactions += Math.max(0, item.transactions || 0);
    existing.revenue += Math.max(0, item.revenue || 0);
    map.set(key, existing);
  }

  let totalCustomers = 0;
  for (const bucket of map.values()) {
    if (bucket.transactions > 0) {
      bucket.averageCheck = Math.round(bucket.revenue / bucket.transactions);
    } else {
      bucket.averageCheck = 0;
    }
    bucket.revenue = Math.round(bucket.revenue);
    totalCustomers += bucket.customers;
  }

  for (const bucket of map.values()) {
    bucket.share = totalCustomers > 0 ? Math.round((bucket.customers / totalCustomers) * 1000) / 10 : 0;
  }

  return Array.from(map.values()).sort((a, b) => b.customers - a.customers);
}

export function aggregateAgeRanges(
  items: AgeItem[],
  ranges: AgeRangeBucket[] = AGE_RANGES,
): AgeRangeStats[] {
  return ranges.map((range) => {
    let clients = 0;
    let transactions = 0;
    let revenue = 0;

    for (const item of items || []) {
      const age = clampAgeValue(item.age);
      if (age == null) continue;
      const fitsRange = range.to == null ? age >= range.from : age >= range.from && age <= range.to;
      if (!fitsRange) continue;
      clients += Math.max(0, item.customers || 0);
      transactions += Math.max(0, item.transactions || 0);
      revenue += Math.max(0, item.revenue || 0);
    }

    const avgCheck =
      transactions > 0 ? Math.round(revenue / transactions) : 0;

    return {
      label: range.label,
      clients,
      avgCheck,
      sales: transactions,
      revenue: Math.round(revenue),
    };
  });
}

export function buildCombinedDemography(data: SexAgeItem[]): CombinedDemographyRow[] {
  const map = new Map<
    number,
    { male: { customers: number; transactions: number; revenue: number }; female: { customers: number; transactions: number; revenue: number } }
  >();

  for (const item of data || []) {
    const sex = normalizeSexKey(item.sex);
    if (sex === "U") continue;
    const age = clampAgeValue(item.age);
    if (age == null) continue;
    const existing =
      map.get(age) ||
      {
        male: { customers: 0, transactions: 0, revenue: 0 },
        female: { customers: 0, transactions: 0, revenue: 0 },
      };
    const target = sex === "M" ? existing.male : existing.female;
    target.customers += Math.max(0, item.customers || 0);
    target.transactions += Math.max(0, item.transactions || 0);
    target.revenue += Math.max(0, item.revenue || 0);
    map.set(age, existing);
  }

  const ages = Array.from(map.keys()).sort((a, b) => a - b);

  return ages
    .map((age) => {
      const entry = map.get(age)!;
      const maleAvg = entry.male.transactions > 0 ? Math.round(entry.male.revenue / entry.male.transactions) : 0;
      const femaleAvg = entry.female.transactions > 0 ? Math.round(entry.female.revenue / entry.female.transactions) : 0;
      const maleRevenue = Math.round(entry.male.revenue);
      const femaleRevenue = Math.round(entry.female.revenue);
      return {
        age: age.toString(),
        male_clients: entry.male.customers,
        male_avg_check: maleAvg,
        male_revenue: maleRevenue,
        female_clients: entry.female.customers,
        female_avg_check: femaleAvg,
        female_revenue: femaleRevenue,
      };
    })
    .filter(
      (row) =>
        row.male_clients ||
        row.female_clients ||
        row.male_revenue ||
        row.female_revenue ||
        row.male_avg_check ||
        row.female_avg_check,
    );
}
