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
};

export async function listMerchants(): Promise<MerchantRow[]> {
  const rows = await http<Array<MerchantRow & { settings?: { earnBps: number; redeemLimitBps: number; qrTtlSec: number | null; requireBridgeSig: boolean; requireStaffKey: boolean } }>>(`/merchants`);
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
  }));
}
export async function createMerchant(name: string, email: string, password: string, ownerName?: string): Promise<{ id: string; name: string; email: string }> {
  return http(`/merchants`, { method: 'POST', body: JSON.stringify({ name, email, password, ownerName }) });
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
  dto: { earnBps: number; redeemLimitBps: number; qrTtlSec?: number; requireBridgeSig?: boolean; requireStaffKey?: boolean },
): Promise<any> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/settings`, {
    method: 'PUT',
    body: JSON.stringify(dto),
  });
}
