const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
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
  earnBps?: number;
  redeemLimitBps?: number;
  qrTtlSec?: number | null;
  requireBridgeSig?: boolean;
  requireStaffKey?: boolean;
  subscriptionStatus?: string;
  subscriptionPlanName?: string | null;
  subscriptionEndsAt?: string | null;
  subscriptionDaysLeft?: number | null;
  subscriptionExpiresSoon?: boolean;
  subscriptionExpired?: boolean;
  maxOutlets?: number | null;
};

export async function listMerchants(): Promise<MerchantRow[]> {
  const rows = await http<Array<MerchantRow & { settings?: { earnBps: number; redeemLimitBps: number; qrTtlSec: number | null; requireBridgeSig: boolean; requireStaffKey: boolean; maxOutlets?: number | null } }>>(`/merchants`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    initialName: row.initialName || row.name,
    createdAt: row.createdAt,
    portalLoginEnabled: row.portalLoginEnabled,
    portalTotpEnabled: row.portalTotpEnabled,
    portalEmail: row.portalEmail ?? null,
    earnBps: row.settings?.earnBps ?? row.earnBps ?? 300,
    redeemLimitBps: row.settings?.redeemLimitBps ?? row.redeemLimitBps ?? 5000,
    qrTtlSec: row.settings?.qrTtlSec ?? row.qrTtlSec ?? null,
    requireBridgeSig: row.settings?.requireBridgeSig ?? row.requireBridgeSig ?? false,
    requireStaffKey: row.settings?.requireStaffKey ?? row.requireStaffKey ?? false,
    subscriptionStatus: (row as any)?.subscription?.status ?? undefined,
    subscriptionPlanName:
      (row as any)?.subscription?.planName ??
      (row as any)?.subscription?.planId ??
      null,
    subscriptionEndsAt: (row as any)?.subscription?.currentPeriodEnd ?? null,
    subscriptionDaysLeft: (row as any)?.subscription?.daysLeft ?? null,
    subscriptionExpiresSoon: Boolean((row as any)?.subscription?.expiresSoon),
    subscriptionExpired: Boolean((row as any)?.subscription?.expired),
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
  return http(`/merchants`, { method: 'POST', body: JSON.stringify({ name, email, password, ownerName, maxOutlets }) });
}
export async function updateMerchant(id: string, patch: { name?: string; email?: string; password?: string }): Promise<{ id: string; name: string; email: string|null }> {
  return http(`/merchants/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });
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
export async function getCashier(merchantId: string): Promise<{ login: string|null; hasPassword: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/cashier`);
}
export async function rotateCashier(merchantId: string, regenerateLogin?: boolean): Promise<{ login: string; password: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/cashier/rotate`, { method: 'POST', body: JSON.stringify({ regenerateLogin: !!regenerateLogin }) });
}

export async function updateMerchantSettings(
  merchantId: string,
  dto: {
    qrTtlSec?: number;
    requireBridgeSig?: boolean;
    requireStaffKey?: boolean;
    maxOutlets?: number | null;
  },
): Promise<any> {
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
