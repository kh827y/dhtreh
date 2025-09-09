const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type Staff = { id: string; merchantId: string; login?: string | null; email?: string | null; role: string; status: string; allowedOutletId?: string | null; allowedDeviceId?: string | null; apiKeyHash?: string | null; createdAt: string };

export async function listStaff(merchantId: string): Promise<Staff[]> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff`);
}
export async function createStaff(merchantId: string, dto: { login?: string; email?: string; role?: string }): Promise<Staff> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff`, { method: 'POST', body: JSON.stringify(dto) });
}
export async function updateStaff(merchantId: string, staffId: string, dto: { login?: string; email?: string; role?: string; status?: string; allowedOutletId?: string; allowedDeviceId?: string }): Promise<Staff> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff/${encodeURIComponent(staffId)}`, { method: 'PUT', body: JSON.stringify(dto) });
}
export async function deleteStaff(merchantId: string, staffId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff/${encodeURIComponent(staffId)}`, { method: 'DELETE' });
}
export async function issueStaffToken(merchantId: string, staffId: string): Promise<{ token: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff/${encodeURIComponent(staffId)}/token`, { method: 'POST' });
}
export async function revokeStaffToken(merchantId: string, staffId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff/${encodeURIComponent(staffId)}/token`, { method: 'DELETE' });
}

