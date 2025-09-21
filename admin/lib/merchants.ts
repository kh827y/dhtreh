const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type MerchantRow = { id: string; name: string; createdAt: string; portalLoginEnabled?: boolean; portalTotpEnabled?: boolean; portalEmail?: string };

export async function listMerchants(): Promise<MerchantRow[]> {
  return http(`/merchants`);
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
