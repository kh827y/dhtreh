export type RfmDistributionRow = { class: string; customers: number };

export type RfmCombination = {
  r: number;
  f: number;
  m: number;
  count: number;
};

export function parseRfmClass(value: string): { r: number; f: number; m: number } | null {
  const raw = String(value || "").trim();
  const parts = raw.split("-");
  if (parts.length !== 3) return null;
  const r = Number(parts[0]);
  const f = Number(parts[1]);
  const m = Number(parts[2]);
  if (![r, f, m].every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) {
    return null;
  }
  return { r, f, m };
}

export function buildRfmCombinations(
  rows: RfmDistributionRow[] | null | undefined,
): RfmCombination[] {
  if (!rows || rows.length === 0) return [];
  const combinations: RfmCombination[] = [];
  for (const row of rows) {
    const parsed = parseRfmClass(row?.class);
    if (!parsed) continue;
    const count = Number.isFinite(row?.customers) ? Math.max(0, Math.round(row.customers)) : 0;
    if (count <= 0) continue;
    combinations.push({ ...parsed, count });
  }
  return combinations;
}

export function getCombinationBadgeClass(combo: {
  r: number;
  f: number;
  m: number;
}): string {
  const avgScore = (combo.r + combo.f + combo.m) / 3;
  if (avgScore >= 4) return "bg-green-100 text-green-700";
  if (avgScore <= 2) return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

export function sumCombinations(combinations: Array<{ count: number }>): number {
  return combinations.reduce((acc, item) => acc + (Number.isFinite(item.count) ? item.count : 0), 0);
}
