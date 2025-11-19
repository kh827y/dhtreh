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
  reviewDismissedAt?: string | null;
  pending?: boolean;
  maturesAt?: string | null;
  daysUntilMature?: number | null;
  source?: string | null;
  comment?: string | null;
  canceledAt?: string | null;
  relatedOperationAt?: string | null;
  earnAmount?: number | null;
  redeemAmount?: number | null;
};

export const REVIEW_LOOKBACK_MS = 72 * 60 * 60 * 1000;

const BLOCKED_TOKENS = ["refund", "return", "reversal", "adjust", "complimentary", "referral", "gift", "promo", "campaign", "burn"];
const PURCHASE_EVENT_TOKENS = [
  "earn_purchase",
  "redeem_purchase",
  "commit_purchase",
  "purchase",
  "commit_loyalty",
  "earn_loyalty",
  "redeem_loyalty",
  "earn",
  "redeem",
  "commit",
];

export function isPurchaseTransaction(type: string, orderId?: string | null): boolean {
  if (!type) return false;
  const normalized = type.toLowerCase();
  if (BLOCKED_TOKENS.some((token) => normalized.includes(token))) return false;
  if (normalized.includes("purchase")) return true;
  if (PURCHASE_EVENT_TOKENS.some((token) => normalized.includes(token))) {
    return Boolean(orderId && orderId.trim());
  }
  return false;
}

export function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
