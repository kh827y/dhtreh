"use client";

import { type LevelInfo } from "./levels";
import { type PromotionItem } from "./api";
import { type TransactionItem } from "./reviewUtils";

export type SnapshotTelegramProfile = {
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

export type SnapshotReferralInfo = {
  enabled: boolean;
  info: {
    code: string;
    link: string;
    messageTemplate: string;
    placeholders: string[];
    merchantName: string;
    friendReward: number;
    inviterReward: number;
    shareMessageTemplate?: string;
  } | null;
  inviteCode?: string;
  inviteApplied?: boolean;
};

export type MiniappSnapshot = {
  version: number;
  merchantId: string;
  customerId: string;
  cachedAt: number;
  balance: number | null;
  levelInfo: LevelInfo | null;
  cashbackPercent: number | null;
  transactions: TransactionItem[];
  nextBefore: string | null;
  promotions: PromotionItem[];
  promotionsUpdatedAt: number | null;
  referral: SnapshotReferralInfo | null;
  telegramProfile: SnapshotTelegramProfile | null;
};

export type SnapshotPatch = Partial<
  Omit<
    MiniappSnapshot,
    | "version"
    | "merchantId"
    | "customerId"
    | "referral"
    | "telegramProfile"
    | "transactions"
    | "promotions"
  >
> & {
  transactions?: TransactionItem[];
  promotions?: PromotionItem[];
  referral?: Partial<SnapshotReferralInfo> | null;
  telegramProfile?: SnapshotTelegramProfile | null;
};

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_PREFIX = "miniapp.snapshot.v1";

function snapshotKey(merchantId: string, customerId: string): string {
  return `${SNAPSHOT_PREFIX}:${merchantId}:${customerId}`;
}

export function loadSnapshot(merchantId: string, customerId: string): MiniappSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(snapshotKey(merchantId, customerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MiniappSnapshot & { merchantCustomerId?: string };
    if (!parsed || parsed.version !== SNAPSHOT_VERSION) return null;
    const parsedCustomerId = parsed.customerId ?? parsed.merchantCustomerId;
    if (parsed.merchantId !== merchantId || parsedCustomerId !== customerId) return null;
    return { ...parsed, customerId: parsedCustomerId };
  } catch {
    return null;
  }
}

export function clearSnapshot(merchantId: string, customerId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(snapshotKey(merchantId, customerId));
  } catch {
    // ignore storage errors
  }
}

function createEmptySnapshot(merchantId: string, customerId: string, ts: number): MiniappSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    merchantId,
    customerId,
    cachedAt: ts,
    balance: null,
    levelInfo: null,
    cashbackPercent: null,
    transactions: [],
    nextBefore: null,
    promotions: [],
    promotionsUpdatedAt: null,
    referral: null,
    telegramProfile: null,
  };
}

function mergeReferral(
  prev: SnapshotReferralInfo | null,
  patch: Partial<SnapshotReferralInfo>,
): SnapshotReferralInfo {
  return {
    enabled: patch.enabled ?? prev?.enabled ?? false,
    info: patch.info === undefined ? prev?.info ?? null : patch.info,
    inviteCode: patch.inviteCode ?? prev?.inviteCode,
    inviteApplied: patch.inviteApplied ?? prev?.inviteApplied,
  };
}

function mergeTelegramProfile(
  prev: SnapshotTelegramProfile | null,
  nextProfile: SnapshotTelegramProfile | null | undefined,
): SnapshotTelegramProfile | null {
  if (nextProfile === undefined) return prev ?? null;
  if (nextProfile === null) return null;
  return {
    ...prev,
    ...nextProfile,
  };
}

export function applySnapshotPatch(
  prev: MiniappSnapshot | null,
  patch: SnapshotPatch,
  merchantId: string,
  customerId: string,
): MiniappSnapshot {
  const now = Date.now();
  const base =
    prev && prev.merchantId === merchantId && prev.customerId === customerId
      ? prev
      : createEmptySnapshot(merchantId, customerId, now);
  const next: MiniappSnapshot = {
    ...base,
    cachedAt: patch.cachedAt ?? now,
    balance: patch.balance ?? base.balance,
    levelInfo: patch.levelInfo ?? base.levelInfo,
    cashbackPercent: patch.cashbackPercent ?? base.cashbackPercent,
    transactions: patch.transactions ?? base.transactions,
    nextBefore: patch.nextBefore ?? base.nextBefore,
    promotions: patch.promotions ?? base.promotions,
    promotionsUpdatedAt: patch.promotionsUpdatedAt ?? base.promotionsUpdatedAt,
    referral:
      patch.referral === undefined
        ? base.referral
        : patch.referral === null
          ? null
          : mergeReferral(base.referral ?? null, patch.referral),
    telegramProfile: mergeTelegramProfile(base.telegramProfile ?? null, patch.telegramProfile),
  };
  next.version = SNAPSHOT_VERSION;
  next.merchantId = merchantId;
  next.customerId = customerId;
  return next;
}

export function saveSnapshot(snapshot: MiniappSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(snapshotKey(snapshot.merchantId, snapshot.customerId), JSON.stringify(snapshot));
  } catch {
    // storage quota/availability issues are non-fatal
  }
}
