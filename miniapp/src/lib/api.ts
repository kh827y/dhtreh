export type QrMintResp = { token: string; ttl: number };
export type BalanceResp = { merchantId: string; customerId: string; balance: number };
export type TransactionsResp = {
  items: Array<{
    id: string;
    type: string;
    amount: number;
    orderId?: string | null;
    customerId: string;
    createdAt: string;
    receiptTotal?: number | null;
    redeemApplied?: number | null;
    outletId?: string | null;
    staffId?: string | null;
    reviewId?: string | null;
    reviewRating?: number | null;
    reviewCreatedAt?: string | null;
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
  }>;
  nextBefore?: string | null;
};
export type LevelRuleResp = {
  name: string;
  threshold: number;
  earnRateBps?: number | null;
  redeemRateBps?: number | null;
  minPaymentAmount?: number | null;
  isHidden?: boolean | null;
};

export type LevelsResp = {
  merchantId: string;
  customerId: string;
  metric: 'earn'|'redeem'|'transactions';
  periodDays: number;
  value: number;
  current: LevelRuleResp;
  next: LevelRuleResp | null;
  progressToNext: number;
};
export type MechanicsLevelsResp = {
  merchantId?: string;
  levels?: Array<{
    id?: string;
    name?: string;
    threshold?: number;
    minPaymentAmount?: number | null;
    cashbackPercent?: number | null;
    redeemRateBps?: number | null;
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

export type LoyaltyRealtimeEvent = {
  id: string;
  merchantId: string;
  customerId: string;
  transactionId?: string | null;
  transactionType?: string | null;
  amount?: number | null;
  eventType: string;
  emittedAt: string;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
const API_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || '');
  if (!Number.isFinite(parsed)) return 15_000;
  return Math.min(Math.max(Math.floor(parsed), 3_000), 120_000);
})();
const API_LONG_POLL_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.NEXT_PUBLIC_API_LONG_POLL_TIMEOUT_MS || '');
  if (!Number.isFinite(parsed)) return 45_000;
  return Math.min(Math.max(Math.floor(parsed), API_TIMEOUT_MS), 180_000);
})();
let telegramInitDataAuth: string | null = null;

export function setTelegramAuthInitData(initData: string | null) {
  if (typeof initData === 'string' && initData.includes('hash=')) {
    telegramInitDataAuth = initData;
  } else {
    telegramInitDataAuth = null;
  }
}

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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (!headers.Authorization && telegramInitDataAuth) {
    headers.Authorization = `tma ${telegramInitDataAuth}`;
  }
  const { cache, ...rest } = init || {};
  const timeoutMs = path.startsWith('/loyalty/events/poll')
    ? API_LONG_POLL_TIMEOUT_MS
    : API_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (rest.signal) {
    if (rest.signal.aborted) {
      onAbort();
    } else {
      rest.signal.addEventListener('abort', onAbort, { once: true });
    }
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const res = await fetch(API_BASE + path, {
    cache: cache ?? 'no-store',
    ...rest,
    headers,
    signal: controller.signal,
  }).catch((error) => {
    if (timedOut) {
      throw new Error('Превышено время ожидания ответа сервера');
    }
    throw error;
  }).finally(() => {
    clearTimeout(timeout);
    if (rest.signal) {
      rest.signal.removeEventListener('abort', onAbort);
    }
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let message = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.message === 'string') message = parsed.message;
        else if (Array.isArray(parsed.message) && parsed.message[0]) {
          message = String(parsed.message[0]);
        } else if (typeof parsed.error === 'string') {
          message = parsed.error;
        }
      }
    } catch {
      /* ignore */
    }
    if (!message) message = res.statusText || 'Request failed';
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export type TeleauthResponse = {
  ok: boolean;
  customerId: string | null;
  merchantCustomerId?: string | null;
  hasPhone: boolean;
  onboarded: boolean;
  registered?: boolean;
};

export async function teleauth(
  merchantId: string,
  initData: string,
  opts?: { create?: boolean },
): Promise<TeleauthResponse> {
  const res = await http<TeleauthResponse>('/loyalty/teleauth', {
    method: 'POST',
    body: JSON.stringify({
      merchantId,
      initData,
      ...(opts && typeof opts.create === 'boolean' ? { create: opts.create } : {}),
    }),
  });
  return {
    ...res,
    merchantCustomerId: res.merchantCustomerId ?? res.customerId ?? null,
  };
}

export type BootstrapResp = {
  profile: CustomerProfile | null;
  consent: { granted: boolean; consentAt?: string | null } | null;
  balance: BalanceResp | null;
  levels: LevelsResp | null;
  transactions: TransactionsResp | null;
  promotions: PromotionItem[] | null;
};

export async function bootstrap(
  merchantId: string,
  customerId: string,
  opts?: { transactionsLimit?: number },
): Promise<BootstrapResp> {
  const qs = new URLSearchParams({ merchantId, customerId });
  if (opts?.transactionsLimit) {
    qs.set('transactionsLimit', String(opts.transactionsLimit));
  }
  return http(`/loyalty/bootstrap?${qs.toString()}`);
}

export async function submitReview(payload: {
  merchantId: string;
  customerId: string;
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
    customerId: payload.customerId,
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
  reviewsEnabled?: boolean | null;
  referralEnabled?: boolean | null;
  reviewsShare?: ReviewsShareSettings;
  supportTelegram?: string | null;
};

export async function publicSettings(merchantId: string): Promise<PublicSettingsResp> {
  return http(`/loyalty/settings/${encodeURIComponent(merchantId)}`);
}

export async function mintQr(
  customerId: string,
  merchantId?: string,
  ttlSec?: number,
  initData?: string | null,
): Promise<QrMintResp> {
  return http('/loyalty/qr', {
    method: 'POST',
    body: JSON.stringify({ customerId, merchantId, ttlSec, initData: initData || undefined }),
  });
}

export type PromotionItem = {
  id: string;
  name: string;
  description: string | null;
  rewardType: 'POINTS' | 'DISCOUNT' | 'CASHBACK' | 'LEVEL_UP' | 'CUSTOM';
  rewardValue: number | null;
  rewardMetadata?: Record<string, unknown> | null;
  productNames?: string[];
  categoryNames?: string[];
  startAt: string | null;
  endAt: string | null;
  pointsExpireInDays: number | null;
  canClaim: boolean;
  claimed: boolean;
};

export async function promotionsList(
  merchantId: string,
  customerId: string,
): Promise<PromotionItem[]> {
  const qs = new URLSearchParams({ merchantId, customerId });
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
  customerId: string,
  promotionId: string,
  outletId?: string | null,
): Promise<PromotionClaimResp> {
  const body: Record<string, unknown> = {
    merchantId,
    customerId,
    promotionId,
  };
  if (typeof outletId === 'string' && outletId.trim()) body.outletId = outletId.trim();
  return http('/loyalty/promotions/claim', { method: 'POST', body: JSON.stringify(body) });
}

export async function balance(
  merchantId: string,
  customerId: string,
): Promise<BalanceResp> {
  return http(
    `/loyalty/balance/${encodeURIComponent(merchantId)}/${encodeURIComponent(customerId)}`,
  );
}

export async function levels(
  merchantId: string,
  customerId: string,
): Promise<LevelsResp> {
  return http(`/levels/${encodeURIComponent(merchantId)}/${encodeURIComponent(customerId)}`);
}

export async function mechanicsLevels(merchantId: string): Promise<MechanicsLevelsResp> {
  return http(`/loyalty/mechanics/levels/${encodeURIComponent(merchantId)}`);
}

export async function transactions(
  merchantId: string,
  customerId: string,
  limit = 20,
  before?: string,
  opts?: { fresh?: boolean },
): Promise<TransactionsResp> {
  const qs = new URLSearchParams({
    merchantId,
    customerId,
    limit: String(limit),
    ...(before ? { before } : {}),
  });
  const path = `/loyalty/transactions?${qs.toString()}${opts?.fresh ? `&_=${Date.now()}` : ''}`;
  if (opts?.fresh) {
    return http(path);
  }
  return httpDedup(path, undefined, 1500);
}

export async function grantRegistrationBonus(
  merchantId: string,
  customerId: string,
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
    customerId,
  };
  if (typeof outletId === 'string' && outletId.trim()) body.outletId = outletId.trim();
  return http('/loyalty/mechanics/registration-bonus', { method: 'POST', body: JSON.stringify(body) });
}

export async function consentGet(
  merchantId: string,
  customerId: string,
): Promise<{ granted: boolean; consentAt?: string }> {
  return http(`/loyalty/consent?merchantId=${encodeURIComponent(merchantId)}&customerId=${encodeURIComponent(customerId)}`);
}

export async function consentSet(
  merchantId: string,
  customerId: string,
  granted: boolean,
): Promise<{ ok: boolean }> {
  return http('/loyalty/consent', {
    method: 'POST',
    body: JSON.stringify({ merchantId, customerId, granted }),
  });
}

export async function referralLink(
  customerId: string,
  merchantId: string,
): Promise<ReferralLinkResp> {
  if (
    typeof customerId !== 'string' ||
    !customerId ||
    customerId === 'undefined' ||
    customerId.trim() === '' ||
    typeof merchantId !== 'string' ||
    !merchantId
  ) {
    throw new Error('customerId and merchantId are required and must be valid');
  }
  return httpDedup(
    `/referral/link/${encodeURIComponent(customerId)}?merchantId=${encodeURIComponent(merchantId)}`,
    undefined,
    2000,
  );
}

export async function referralActivate(
  code: string,
  customerId: string,
): Promise<{ success: boolean; message?: string; referralId?: string }> {
  return http('/referral/activate', {
    method: 'POST',
    body: JSON.stringify({ code, customerId }),
  });
}

export async function pollLoyaltyEvents(
  merchantId: string,
  customerId: string,
  signal?: AbortSignal,
): Promise<{ event: LoyaltyRealtimeEvent | null; retryAfterMs?: number }> {
  const qs = new URLSearchParams({ merchantId, customerId });
  return http(`/loyalty/events/poll?${qs.toString()}`, { signal });
}

export async function dismissReviewPrompt(
  merchantId: string,
  customerId: string,
  transactionId: string,
): Promise<{ ok: boolean; dismissedAt: string }> {
  return http('/loyalty/reviews/dismiss', {
    method: 'POST',
    body: JSON.stringify({ merchantId, customerId, transactionId }),
  });
}

export async function promoCodeApply(
  merchantId: string,
  customerId: string,
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
    body: JSON.stringify({ merchantId, customerId, code }),
  });
}

// ===== Profile (cross-device) =====
export type CustomerProfile = {
  name: string | null;
  gender: 'male' | 'female' | null;
  birthDate: string | null; // YYYY-MM-DD
  customerId?: string | null;
};

export type CustomerPhoneStatus = {
  hasPhone: boolean;
};

export async function profileGet(
  merchantId: string,
  customerId: string,
): Promise<CustomerProfile> {
  const qs = new URLSearchParams({ merchantId, customerId });
  return http(`/loyalty/profile?${qs.toString()}`);
}

export async function profilePhoneStatus(
  merchantId: string,
  customerId: string,
): Promise<CustomerPhoneStatus> {
  const qs = new URLSearchParams({ merchantId, customerId });
  return http(`/loyalty/profile/phone-status?${qs.toString()}`);
}

export async function profileSave(
  merchantId: string,
  customerId: string,
  profile: { name: string; gender: 'male' | 'female'; birthDate: string; phone?: string },
): Promise<CustomerProfile> {
  return http('/loyalty/profile', {
    method: 'POST',
    body: JSON.stringify({ merchantId, customerId, ...profile }),
  });
}
