const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type Device = { id: string; merchantId: string; outletId?: string | null; type: string; label?: string | null; lastSeenAt?: string | null; createdAt: string };

export async function listDevices(merchantId: string): Promise<Device[]> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices`);
}
export async function createDevice(merchantId: string, dto: { type: string; outletId?: string; label?: string }): Promise<Device> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices`, { method: 'POST', body: JSON.stringify(dto) });
}
export async function updateDevice(merchantId: string, deviceId: string, dto: { outletId?: string; label?: string }): Promise<Device> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices/${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify(dto) });
}
export async function deleteDevice(merchantId: string, deviceId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
}
export async function issueDeviceSecret(merchantId: string, deviceId: string): Promise<{ secret: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices/${encodeURIComponent(deviceId)}/secret`, { method: 'POST' });
}
export async function revokeDeviceSecret(merchantId: string, deviceId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices/${encodeURIComponent(deviceId)}/secret`, { method: 'DELETE' });
}

