export type QrMintResp = { token: string; ttl: number };
export type BalanceResp = { merchantId: string; merchantCustomerId: string; balance: number };
export type TransactionsResp = {
  items: Array<{
    id: string;
    type: string;
    amount: number;
    orderId?: string | null;
    customerId: string;
    createdAt: string;
    outletId?: string | null;
    staffId?: string | null;
    reviewId?: string | null;
  reviewRating?: number | null;
  reviewCreatedAt?: string | null;
  pending?: boolean;
  maturesAt?: string | null;
  daysUntilMature?: number | null;
  source?: string | null;
  comment?: string | null;
  canceledAt?: string | null;
  relatedOperationAt?: string | null;
  }>;
  nextBefore?: string | null;
};
export type LevelsResp = {
  merchantId: string;
  merchantCustomerId: string;
  metric: 'earn'|'redeem'|'transactions';
  periodDays: number;
  value: number;
  current: { name: string; threshold: number };
  next: { name: string; threshold: number } | null;
  progressToNext: number;
};
export type MechanicsLevelsResp = {
  merchantId?: string;
  levels?: Array<{
    id?: string;
    name?: string;
    threshold?: number;
    cashbackPercent?: number | null;
    benefits?: { cashbackPercent?: number | null } | null;
    rewardPercent?: number | null;
  }>;
};

export type ReferralLinkResp = {
  code: string;
  link: string;
  qrCode: string;
  program: {
    id: string;
    name: string;
    description?: string | null;
    rewardType: 'FIXED' | 'PERCENT';
    referrerReward: number;
    refereeReward: number;
    merchantName: string;
    messageTemplate: string;
    placeholders: string[];
    shareMessageTemplate?: string;
  };
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

// Lightweight in-flight deduplication and short-lived cache for GETs
const __inflight = new Map<string, Promise<unknown>>();
const __cache = new Map<string, { ts: number; data: unknown }>();
function __key(path: string, init?: RequestInit) {
  return JSON.stringify({ p: path, m: init?.method || 'GET', b: init?.body || null });
}
async function httpDedup<T>(path: string, init?: RequestInit, cacheTtlMs = 0): Promise<T> {
  const key = __key(path, init);
  if (cacheTtlMs > 0) {
    const c = __cache.get(key);
    if (c && Date.now() - c.ts <= cacheTtlMs) return c.data as T;
  }
  const inflight = __inflight.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;
  const p = http<T>(path, init)
    .then((data) => {
      if (cacheTtlMs > 0) __cache.set(key, { ts: Date.now(), data });
      return data;
    })
    .finally(() => {
      __inflight.delete(key);
    });
  __inflight.set(key, p as unknown as Promise<unknown>);
  return p;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function teleauth(
  merchantId: string,
  initData: string,
): Promise<{ ok: boolean; merchantCustomerId: string }> {
  return http('/loyalty/teleauth', {
    method: 'POST',
    body: JSON.stringify({ merchantId, initData }),
  });
}

export async function submitReview(payload: {
  merchantId: string;
  merchantCustomerId: string;
  rating: number;
  comment?: string;
  orderId?: string | null;
  transactionId?: string | null;
  outletId?: string | null;
  staffId?: string | null;
  title?: string;
  tags?: string[];
  photos?: string[];
}): Promise<SubmitReviewResponse> {
  const body: Record<string, unknown> = {
    merchantId: payload.merchantId,
    merchantCustomerId: payload.merchantCustomerId,
    rating: payload.rating,
    comment: payload.comment ?? '',
  };
  if (payload.orderId) body.orderId = payload.orderId;
  if (payload.transactionId) body.transactionId = payload.transactionId;
  if (payload.outletId) body.outletId = payload.outletId;
  if (payload.staffId) body.staffId = payload.staffId;
  if (payload.title) body.title = payload.title;
  if (payload.tags && payload.tags.length) body.tags = payload.tags;
  if (payload.photos && payload.photos.length) body.photos = payload.photos;
  return http('/loyalty/reviews', { method: 'POST', body: JSON.stringify(body) });
}

export type ReviewsSharePlatformOutlet = {
  outletId: string;
  url: string;
};

export type ReviewsSharePlatform = {
  id: string;
  enabled: boolean;
  url: string | null;
  outlets: ReviewsSharePlatformOutlet[];
};

export type ReviewsShareSettings = {
  enabled: boolean;
  threshold: number;
  platforms: ReviewsSharePlatform[];
} | null;

export type SubmitReviewShareOption = {
  id: string;
  url: string;
};

export type SubmitReviewResponse = {
  ok: boolean;
  reviewId: string;
  status: string;
  rewardPoints: number;
  message: string;
  share?: {
    enabled: boolean;
    threshold: number;
    options: SubmitReviewShareOption[];
  } | null;
};

export type PublicSettingsResp = {
  merchantId: string;
  qrTtlSec: number;
  miniappThemePrimary?: string | null;
  miniappThemeBg?: string | null;
  miniappLogoUrl?: string | null;
  reviewsShare?: ReviewsShareSettings;
};

export async function publicSettings(merchantId: string): Promise<PublicSettingsResp> {
  return http(`/loyalty/settings/${encodeURIComponent(merchantId)}`);
}

export async function mintQr(
  merchantCustomerId: string,
  merchantId?: string,
  ttlSec?: number,
  initData?: string | null,
): Promise<QrMintResp> {
  return http('/loyalty/qr', {
    method: 'POST',
    body: JSON.stringify({ merchantCustomerId, merchantId, ttlSec, initData: initData || undefined }),
  });
}

export type PromotionItem = {
  id: string;
  name: string;
  description: string | null;
  rewardType: 'POINTS' | 'DISCOUNT' | 'CASHBACK' | 'LEVEL_UP' | 'CUSTOM';
  rewardValue: number | null;
  startAt: string | null;
  endAt: string | null;
  pointsExpireInDays: number | null;
  canClaim: boolean;
  claimed: boolean;
};

export async function promotionsList(
  merchantId: string,
  merchantCustomerId: string,
): Promise<PromotionItem[]> {
  const qs = new URLSearchParams({ merchantId, merchantCustomerId });
  return http(`/loyalty/promotions?${qs.toString()}`);
}

export type PromotionClaimResp = {
  ok: boolean;
  promotionId: string;
  pointsIssued: number;
  pointsExpireInDays?: number | null;
  pointsExpireAt?: string | null;
  balance: number;
  alreadyClaimed?: boolean;
};

export async function promotionClaim(
  merchantId: string,
  merchantCustomerId: string,
  promotionId: string,
  outletId?: string | null,
): Promise<PromotionClaimResp> {
  const body: Record<string, unknown> = {
    merchantId,
    merchantCustomerId,
    promotionId,
  };
  if (typeof outletId === 'string' && outletId.trim()) body.outletId = outletId.trim();
  return http('/loyalty/promotions/claim', { method: 'POST', body: JSON.stringify(body) });
}

export async function balance(
  merchantId: string,
  merchantCustomerId: string,
): Promise<BalanceResp> {
  return http(
    `/loyalty/balance/${encodeURIComponent(merchantId)}/${encodeURIComponent(merchantCustomerId)}`,
  );
}

export async function levels(
  merchantId: string,
  merchantCustomerId: string,
): Promise<LevelsResp> {
  return http(`/levels/${encodeURIComponent(merchantId)}/${encodeURIComponent(merchantCustomerId)}`);
}

export async function mechanicsLevels(merchantId: string): Promise<MechanicsLevelsResp> {
  return http(`/loyalty/mechanics/levels/${encodeURIComponent(merchantId)}`);
}

export async function transactions(
  merchantId: string,
  merchantCustomerId: string,
  limit = 20,
  before?: string,
): Promise<TransactionsResp> {
  const qs = new URLSearchParams({
    merchantId,
    merchantCustomerId,
    limit: String(limit),
    ...(before ? { before } : {}),
  });
  return httpDedup(`/loyalty/transactions?${qs.toString()}`, undefined, 1500);
}

export async function grantRegistrationBonus(
  merchantId: string,
  merchantCustomerId: string,
  outletId?: string | null,
): Promise<{
  ok: boolean;
  pointsIssued: number;
  referenceId?: string;
  alreadyGranted?: boolean;
  expiresInDays?: number | null;
  pointsExpireAt?: string | null;
  balance: number;
}> {
  const body: Record<string, unknown> = {
    merchantId,
    merchantCustomerId,
  };
  if (typeof outletId === 'string' && outletId.trim()) body.outletId = outletId.trim();
  return http('/loyalty/mechanics/registration-bonus', { method: 'POST', body: JSON.stringify(body) });
}

export async function consentGet(
  merchantId: string,
  merchantCustomerId: string,
): Promise<{ granted: boolean; consentAt?: string }> {
  return http(`/loyalty/consent?merchantId=${encodeURIComponent(merchantId)}&merchantCustomerId=${encodeURIComponent(merchantCustomerId)}`);
}

export async function consentSet(
  merchantId: string,
  merchantCustomerId: string,
  granted: boolean,
): Promise<{ ok: boolean }> {
  return http('/loyalty/consent', {
    method: 'POST',
    body: JSON.stringify({ merchantId, merchantCustomerId, granted }),
  });
}

export async function referralLink(
  merchantCustomerId: string,
  merchantId: string,
): Promise<ReferralLinkResp> {
  if (
    typeof merchantCustomerId !== 'string' ||
    !merchantCustomerId ||
    merchantCustomerId === 'undefined' ||
    merchantCustomerId.trim() === '' ||
    typeof merchantId !== 'string' ||
    !merchantId
  ) {
    throw new Error('merchantCustomerId and merchantId are required and must be valid');
  }
  return httpDedup(
    `/referral/link/${encodeURIComponent(merchantCustomerId)}?merchantId=${encodeURIComponent(merchantId)}`,
    undefined,
    2000,
  );
}

export async function referralActivate(
  code: string,
  merchantCustomerId: string,
): Promise<{ success: boolean; message?: string; referralId?: string }> {
  return http('/referral/activate', {
    method: 'POST',
    body: JSON.stringify({ code, merchantCustomerId }),
  });
}

export async function promoCodeApply(
  merchantId: string,
  merchantCustomerId: string,
  code: string,
): Promise<{
  ok: boolean;
  promotionId: string | null;
  alreadyUsed: boolean;
  message?: string;
  balance?: number;
  earnApplied?: number;
  redeemApplied?: number;
}> {
  return http('/loyalty/promocodes/apply', {
    method: 'POST',
    body: JSON.stringify({ merchantId, merchantCustomerId, code }),
  });
}

// ===== Profile (cross-device) =====
export type CustomerProfile = {
  name: string | null;
  gender: 'male' | 'female' | null;
  birthDate: string | null; // YYYY-MM-DD
};

export type CustomerPhoneStatus = {
  hasPhone: boolean;
};

export async function profileGet(
  merchantId: string,
  merchantCustomerId: string,
): Promise<CustomerProfile> {
  const qs = new URLSearchParams({ merchantId, merchantCustomerId });
  return http(`/loyalty/profile?${qs.toString()}`);
}

export async function profilePhoneStatus(
  merchantId: string,
  merchantCustomerId: string,
): Promise<CustomerPhoneStatus> {
  const qs = new URLSearchParams({ merchantId, merchantCustomerId });
  return http(`/loyalty/profile/phone-status?${qs.toString()}`);
}

export async function profileSave(
  merchantId: string,
  merchantCustomerId: string,
  profile: { name: string; gender: 'male' | 'female'; birthDate: string; phone?: string },
): Promise<CustomerProfile> {
  return http('/loyalty/profile', {
    method: 'POST',
    body: JSON.stringify({ merchantId, merchantCustomerId, ...profile }),
  });
}
