import type { LevelsResp, MechanicsLevelsResp } from "./api";

export type LevelInfo = LevelsResp;
export type TierDefinition = NonNullable<MechanicsLevelsResp["levels"]>[number] & {
  benefits?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

function ensureRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readValue(source: Record<string, unknown> | null, key: string): unknown {
  if (!source) return null;
  if (!Object.prototype.hasOwnProperty.call(source, key)) return null;
  return source[key];
}

function sanitizeNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function roundPercent(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

function pickPercent(...values: Array<{ source: unknown; kind: "bps" | "direct" }>): number | null {
  for (const entry of values) {
    const raw = sanitizeNumber(entry.source);
    if (raw == null) continue;
    const percent = entry.kind === "bps" ? raw / 100 : raw;
    return roundPercent(percent);
  }
  return null;
}

export function getProgressPercent(levelInfo: LevelInfo | null): number {
  if (!levelInfo) return 0;
  if (!levelInfo.next) return 100;
  const currentThreshold = Number(levelInfo.current?.threshold ?? 0) || 0;
  const distance = Math.max(1, Number(levelInfo.next.threshold ?? 0) - currentThreshold);
  const progress = Math.max(0, Number(levelInfo.value ?? 0) - currentThreshold);
  return Math.max(0, Math.min(100, Math.round((progress / distance) * 100)));
}

export function findTierDefinition(
  levelInfo: LevelInfo | null,
  catalog: Array<TierDefinition | null | undefined> | null | undefined,
): TierDefinition | null {
  if (!levelInfo?.current?.name) return null;
  if (!Array.isArray(catalog) || catalog.length === 0) return null;
  const target = levelInfo.current.name.trim().toLowerCase();
  if (!target) return null;
  for (const entry of catalog) {
    const name = typeof entry?.name === "string" ? entry.name.trim().toLowerCase() : "";
    if (name && name === target) {
      return entry ?? null;
    }
  }
  return null;
}

export function getTierEarnPercent(tier: TierDefinition | null | undefined): number | null {
  if (!tier) return null;
  const record = ensureRecord(tier);
  const benefits = ensureRecord(tier.benefits);
  const metadata = ensureRecord(tier.metadata);
  return (
    pickPercent({ source: readValue(record, "earnRatePercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(benefits, "earnPercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(benefits, "cashbackPercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(record, "rewardPercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(record, "cashbackPercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(metadata, "earnRatePercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(benefits, "earnRateBps"), kind: "bps" }) ??
    pickPercent({ source: readValue(record, "earnRateBps"), kind: "bps" })
  );
}

export function getTierRedeemPercent(tier: TierDefinition | null | undefined): number | null {
  if (!tier) return null;
  const record = ensureRecord(tier);
  const benefits = ensureRecord(tier.benefits);
  const metadata = ensureRecord(tier.metadata);
  return (
    pickPercent({ source: readValue(record, "redeemRatePercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(benefits, "redeemPercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(metadata, "redeemRatePercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(benefits, "redeemLimitPercent"), kind: "direct" }) ??
    pickPercent({ source: readValue(benefits, "redeemLimitBps"), kind: "bps" }) ??
    pickPercent({ source: readValue(benefits, "redeemRateBps"), kind: "bps" }) ??
    pickPercent({ source: readValue(record, "redeemRateBps"), kind: "bps" })
  );
}

export function getTierMinPayment(tier: TierDefinition | null | undefined): number | null {
  if (!tier) return null;
  const record = ensureRecord(tier);
  const benefits = ensureRecord(tier.benefits);
  const metadata = ensureRecord(tier.metadata);
  const candidates = [
    sanitizeNumber(readValue(record, "minPaymentAmount")),
    sanitizeNumber(readValue(benefits, "minPaymentAmount")),
    sanitizeNumber(readValue(benefits, "minPayableAmount")),
    sanitizeNumber(readValue(metadata, "minPaymentAmount")),
    sanitizeNumber(readValue(metadata, "minPayableAmount")),
    sanitizeNumber(readValue(metadata, "minPayment")),
  ];
  for (const value of candidates) {
    if (value != null) {
      return Math.max(0, Math.round(value));
    }
  }
  return null;
}
