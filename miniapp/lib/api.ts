export type QrMintResp = { token: string; ttl: number };
export type BalanceResp = { merchantId: string; customerId: string; balance: number };
export type TransactionsResp = { items: Array<{ id: string; type: string; amount: number; orderId?: string|null; customerId: string; createdAt: string }>; nextBefore?: string|null };
export type LevelsResp = {
  merchantId: string;
  customerId: string;
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
  };
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

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

export async function teleauth(merchantId: string, initData: string): Promise<{ ok: boolean; customerId: string }> {
  return http('/loyalty/teleauth', { method: 'POST', body: JSON.stringify({ merchantId, initData }) });
}

export async function publicSettings(merchantId: string): Promise<{ merchantId: string; qrTtlSec: number; miniappThemePrimary?: string|null; miniappThemeBg?: string|null; miniappLogoUrl?: string|null }>
{ return http(`/loyalty/settings/${encodeURIComponent(merchantId)}`); }

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

export async function balance(merchantId: string, customerId: string): Promise<BalanceResp> {
  return http(`/loyalty/balance/${encodeURIComponent(merchantId)}/${encodeURIComponent(customerId)}`);
}

export async function levels(merchantId: string, customerId: string): Promise<LevelsResp> {
  return http(`/levels/${encodeURIComponent(merchantId)}/${encodeURIComponent(customerId)}`);
}

export async function mechanicsLevels(merchantId: string): Promise<MechanicsLevelsResp> {
  return http(`/loyalty/mechanics/levels/${encodeURIComponent(merchantId)}`);
}

export async function transactions(merchantId: string, customerId: string, limit = 20, before?: string): Promise<TransactionsResp> {
  const qs = new URLSearchParams({ merchantId, customerId, limit: String(limit), ...(before?{ before }: {}) });
  return http(`/loyalty/transactions?${qs.toString()}`);
}

export async function consentGet(merchantId: string, customerId: string): Promise<{ granted: boolean; consentAt?: string }>
{ return http(`/loyalty/consent?merchantId=${encodeURIComponent(merchantId)}&customerId=${encodeURIComponent(customerId)}`); }

export async function consentSet(merchantId: string, customerId: string, granted: boolean): Promise<{ ok: boolean }> {
  return http('/loyalty/consent', { method: 'POST', body: JSON.stringify({ merchantId, customerId, granted }) });
}

export async function referralLink(customerId: string, merchantId: string): Promise<ReferralLinkResp> {
  return http(
    `/referral/link/${encodeURIComponent(customerId)}?merchantId=${encodeURIComponent(merchantId)}`,
  );
}

export async function referralActivate(code: string, customerId: string): Promise<{ success: boolean; message?: string; referralId?: string }> {
  return http('/referral/activate', { method: 'POST', body: JSON.stringify({ code, refereeId: customerId }) });
}

export async function promoCodeApply(
  merchantId: string,
  customerId: string,
  code: string,
): Promise<{
  ok: boolean;
  promoCodeId: string;
  code: string;
  pointsIssued: number;
  pointsExpireInDays?: number | null;
  pointsExpireAt?: string | null;
  balance: number;
  tierAssigned?: string | null;
  message?: string;
}> {
  return http('/loyalty/promocodes/apply', {
    method: 'POST',
    body: JSON.stringify({ merchantId, customerId, code }),
  });
}
