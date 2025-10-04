export type TransactionItem = {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
  orderId: string | null;
  outletId: string | null;
  staffId: string | null;
  reviewId: string | null;
  reviewRating: number | null;
  reviewCreatedAt: string | null;
};

export const REVIEW_LOOKBACK_MS = 72 * 60 * 60 * 1000;

const PURCHASE_EVENT_TYPES = [
  "purchase", "earn", "redeem", "commit", "commit_loyalty", "earn_loyalty", "redeem_loyalty",
  "earn_purchase", "redeem_purchase",
];

export function isPurchaseTransaction(type: string, orderId?: string | null): boolean {
  if (!type) return false;
  const normalized = type.toLowerCase();
  if (orderId && orderId.trim()) return true;
  return PURCHASE_EVENT_TYPES.some((token) => normalized.includes(token));
}

export function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
