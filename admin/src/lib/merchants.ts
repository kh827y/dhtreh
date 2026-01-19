const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || 'GET').toUpperCase();
  const extraHeaders = init?.headers
    ? Object.fromEntries(new Headers(init.headers).entries())
    : {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (method !== 'GET' && method !== 'HEAD' && !('x-admin-action' in headers)) {
    headers['x-admin-action'] = 'ui';
  }
  const res = await fetch(BASE + path, { ...init, headers });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type MerchantRow = {
  id: string;
  name: string;
  initialName: string;
  createdAt: string;
  portalLoginEnabled?: boolean;
  portalTotpEnabled?: boolean;
  portalEmail?: string | null;
  earnBps?: number | null;
  redeemLimitBps?: number | null;
  qrTtlSec?: number | null;
  subscriptionStatus?: string;
  subscriptionPlanName?: string | null;
  subscriptionEndsAt?: string | null;
  subscriptionDaysLeft?: number | null;
  subscriptionExpiresSoon?: boolean;
  subscriptionExpired?: boolean;
  maxOutlets?: number | null;
};

type MerchantSubscription = {
  status?: string;
  planName?: string;
  planId?: string;
  currentPeriodEnd?: string | null;
  daysLeft?: number | null;
  expiresSoon?: boolean;
  expired?: boolean;
};

export async function listMerchants(): Promise<MerchantRow[]> {
  type MerchantRowApi = MerchantRow & {
    settings?: { earnBps: number | null; redeemLimitBps: number | null; qrTtlSec: number | null; maxOutlets?: number | null };
    subscription?: MerchantSubscription | null;
  };
  const rows = await http<MerchantRowApi[]>(`/merchants`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    initialName: row.initialName || row.name,
    createdAt: row.createdAt,
    portalLoginEnabled: row.portalLoginEnabled,
    portalTotpEnabled: row.portalTotpEnabled,
    portalEmail: row.portalEmail ?? null,
    earnBps: row.settings?.earnBps ?? row.earnBps ?? null,
    redeemLimitBps: row.settings?.redeemLimitBps ?? row.redeemLimitBps ?? null,
    qrTtlSec: row.settings?.qrTtlSec ?? row.qrTtlSec ?? null,
    subscriptionStatus: row.subscription?.status ?? undefined,
    subscriptionPlanName:
      row.subscription?.planName ??
      row.subscription?.planId ??
      null,
    subscriptionEndsAt: row.subscription?.currentPeriodEnd ?? null,
    subscriptionDaysLeft: row.subscription?.daysLeft ?? null,
    subscriptionExpiresSoon: Boolean(row.subscription?.expiresSoon),
    subscriptionExpired: Boolean(row.subscription?.expired),
    maxOutlets: row.settings?.maxOutlets ?? row.maxOutlets ?? null,
  }));
}
export async function createMerchant(
  name: string,
  email: string,
  password: string,
  ownerName?: string,
  maxOutlets?: number | null,
): Promise<{ id: string; name: string; email: string }> {
  return http(`/merchants`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      email,
      password,
      portalEmail: email,
      portalPassword: password,
      ownerName,
      maxOutlets,
    }),
  });
}
export async function updateMerchant(id: string, patch: { name?: string; email?: string; password?: string }): Promise<{ id: string; name: string; email: string|null }> {
  const payload = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.email !== undefined ? { email: patch.email, portalEmail: patch.email } : {}),
    ...(patch.password !== undefined ? { password: patch.password, portalPassword: patch.password } : {}),
  };
  return http(`/merchants/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export async function deleteMerchant(id: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function setPortalLoginEnabled(merchantId: string, enabled: boolean): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/portal/login-enabled`, { method: 'POST', body: JSON.stringify({ enabled }) });
}
export async function initTotp(merchantId: string): Promise<{ secret: string; otpauth: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/portal/totp/init`, { method: 'POST' });
}
export async function verifyTotp(merchantId: string, code: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/portal/totp/verify`, { method: 'POST', body: JSON.stringify({ code }) });
}
export async function disableTotp(merchantId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/portal/totp/disable`, { method: 'POST' });
}
export async function impersonatePortal(merchantId: string): Promise<{ token: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/portal/impersonate`, { method: 'POST' });
}

// Cashier credentials
export async function getCashier(merchantId: string): Promise<{ login: string|null }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/cashier`);
}
export async function rotateCashier(merchantId: string, regenerateLogin?: boolean): Promise<{ login: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/cashier/rotate`, { method: 'POST', body: JSON.stringify({ regenerateLogin: !!regenerateLogin }) });
}
export async function setCashier(merchantId: string, login: string): Promise<{ login: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/cashier`, {
    method: 'POST',
    body: JSON.stringify({ login }),
  });
}

export async function updateMerchantSettings(
  merchantId: string,
  dto: {
    qrTtlSec?: number;
    maxOutlets?: number | null;
  },
): Promise<Record<string, unknown>> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/settings`, {
    method: 'PUT',
    body: JSON.stringify(dto),
  });
}

export async function grantSubscription(
  merchantId: string,
  payload: { days: number; planId?: string },
) {
  return http(`/merchants/${encodeURIComponent(merchantId)}/subscription`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resetSubscription(merchantId: string) {
  return http(`/merchants/${encodeURIComponent(merchantId)}/subscription`, {
    method: 'DELETE',
  });
}
