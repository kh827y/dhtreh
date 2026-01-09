const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type AuditItem = { id: string; createdAt: string; actor: string; method: string; path: string; merchantId?: string|null; action?: string|null };

export async function listAudit(params: { merchantId?: string; limit?: number; before?: string }) {
  const q = new URLSearchParams();
  if (params.merchantId) q.set('merchantId', params.merchantId);
  if (params.limit) q.set('limit', String(params.limit));
  if (params.before) q.set('before', params.before);
  const qs = q.toString();
  return http<AuditItem[]>(`/admin/audit${qs ? ('?' + qs) : ''}`);
}

export async function getAudit(id: string) {
  return http(`/admin/audit/${encodeURIComponent(id)}`);
}
