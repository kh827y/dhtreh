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

export type Outlet = {
  id: string;
  merchantId: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | string;
  createdAt: string;
};

export async function listOutlets(merchantId: string): Promise<Outlet[]> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets`);
}
export async function createOutlet(merchantId: string, name: string): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets`, { method: 'POST', body: JSON.stringify({ name }) });
}
export async function updateOutlet(merchantId: string, outletId: string, dto: { name?: string }): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}`, { method: 'PUT', body: JSON.stringify(dto) });
}
export async function deleteOutlet(merchantId: string, outletId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}`, { method: 'DELETE' });
}

export async function updateOutletStatus(merchantId: string, outletId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}
