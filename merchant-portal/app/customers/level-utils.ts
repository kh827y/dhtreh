import type { CustomerRecord } from "./data";

export type LevelInfo = {
  id: string;
  name: string;
  isInitial?: boolean;
  thresholdAmount?: number | null;
};

export type LevelRank = "gold" | "silver" | "bronze" | "base";

export type LevelLookups = {
  byId: Map<string, LevelInfo>;
  byName: Map<string, LevelInfo>;
  initial: LevelInfo | null;
  rankById: Map<string, Exclude<LevelRank, "base">>;
};

export function buildLevelLookups(levels: LevelInfo[]): LevelLookups {
  const byId = new Map<string, LevelInfo>();
  const byName = new Map<string, LevelInfo>();
  levels.forEach((level) => {
    if (!level?.id) return;
    byId.set(level.id, level);
    if (level.name) {
      byName.set(level.name.toLowerCase(), level);
    }
  });
  const initial = levels.find((level) => level.isInitial) || null;

  const sorted = levels
    .filter((level) => !level.isInitial && typeof level.thresholdAmount === "number")
    .slice()
    .sort((a, b) => (a.thresholdAmount ?? 0) - (b.thresholdAmount ?? 0));
  const rankById = new Map<string, Exclude<LevelRank, "base">>();
  const top = sorted[sorted.length - 1];
  const second = sorted[sorted.length - 2];
  const third = sorted[sorted.length - 3];
  if (top) rankById.set(top.id, "gold");
  if (second) rankById.set(second.id, "silver");
  if (third) rankById.set(third.id, "bronze");

  return { byId, byName, initial, rankById };
}

export function resolveCustomerLevel(customer: CustomerRecord, lookups: LevelLookups): LevelInfo | null {
  if (customer.levelId && lookups.byId.has(customer.levelId)) {
    return lookups.byId.get(customer.levelId) || null;
  }
  const nameKey = customer.levelName?.toLowerCase();
  if (nameKey && lookups.byName.has(nameKey)) {
    return lookups.byName.get(nameKey) || null;
  }
  return null;
}

export function getCustomerLevelLabel(customer: CustomerRecord, lookups: LevelLookups): string {
  if (customer.levelName) return customer.levelName;
  const resolved = resolveCustomerLevel(customer, lookups);
  if (resolved?.name) return resolved.name;
  return lookups.initial?.name || "Base";
}

export function getCustomerLevelRank(customer: CustomerRecord, lookups: LevelLookups): LevelRank {
  const resolved = resolveCustomerLevel(customer, lookups);
  if (resolved?.isInitial) return "base";
  const rank = resolved ? lookups.rankById.get(resolved.id) : undefined;
  return rank ?? "base";
}

export function getAvatarClass(rank: LevelRank): string {
  if (rank === "gold") return "bg-yellow-400";
  if (rank === "silver") return "bg-gray-400";
  if (rank === "bronze") return "bg-orange-400";
  return "bg-slate-700";
}

export function getBadgeClass(rank: LevelRank): string {
  if (rank === "gold") return "bg-yellow-50 text-yellow-700 border-yellow-200";
  if (rank === "silver") return "bg-gray-50 text-gray-700 border-gray-200";
  if (rank === "bronze") return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}
