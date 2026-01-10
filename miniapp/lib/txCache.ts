import { type TransactionItem } from "./reviewUtils";

const CACHE_PREFIX = "miniapp.tx.v1";
const DEFAULT_MAX_AGE_MS = 2 * 60 * 1000;

function cacheKey(merchantId: string, customerId: string) {
  return `${CACHE_PREFIX}:${merchantId}:${customerId}`;
}

export function readTxCache(
  merchantId: string | null | undefined,
  customerId: string | null | undefined,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): TransactionItem[] | null {
  if (!merchantId || !customerId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(merchantId, customerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cachedAt?: number; items?: TransactionItem[] };
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (typeof parsed.cachedAt !== "number" || !Number.isFinite(parsed.cachedAt)) return null;
    if (Date.now() - parsed.cachedAt > maxAgeMs) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

export function writeTxCache(
  merchantId: string | null | undefined,
  customerId: string | null | undefined,
  items: TransactionItem[],
) {
  if (!merchantId || !customerId || typeof window === "undefined") return;
  try {
    localStorage.setItem(
      cacheKey(merchantId, customerId),
      JSON.stringify({ cachedAt: Date.now(), items }),
    );
  } catch {
    // ignore cache failures
  }
}
