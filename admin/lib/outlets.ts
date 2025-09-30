const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type Outlet = {
  id: string;
  merchantId: string;
  name: string;
  address?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | string;
  hidden: boolean;
  posType?: 'VIRTUAL' | 'PC_POS' | 'SMART' | null;
  posLastSeenAt?: string | null;
  bridgeSecretIssued: boolean;
  bridgeSecretNextIssued: boolean;
  bridgeSecretUpdatedAt?: string | null;
  createdAt: string;
};

export async function listOutlets(merchantId: string): Promise<Outlet[]> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets`);
}
export async function createOutlet(merchantId: string, name: string, address?: string): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets`, { method: 'POST', body: JSON.stringify({ name, address }) });
}
export async function updateOutlet(merchantId: string, outletId: string, dto: { name?: string; address?: string }): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}`, { method: 'PUT', body: JSON.stringify(dto) });
}
export async function deleteOutlet(merchantId: string, outletId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}`, { method: 'DELETE' });
}

export async function issueOutletBridgeSecret(merchantId: string, outletId: string): Promise<{ secret: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/bridge-secret`, { method: 'POST' });
}

export async function revokeOutletBridgeSecret(merchantId: string, outletId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/bridge-secret`, { method: 'DELETE' });
}

export async function issueOutletBridgeSecretNext(merchantId: string, outletId: string): Promise<{ secret: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/bridge-secret/next`, { method: 'POST' });
}

export async function revokeOutletBridgeSecretNext(merchantId: string, outletId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/bridge-secret/next`, { method: 'DELETE' });
}

export async function updateOutletPos(merchantId: string, outletId: string, dto: { posType?: string | null; posLastSeenAt?: string | null }): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/pos`, { method: 'PUT', body: JSON.stringify(dto) });
}

export async function updateOutletStatus(merchantId: string, outletId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}

