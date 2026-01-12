const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || 'GET').toUpperCase();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init?.headers as any || {}),
  };
  if (method !== 'GET' && method !== 'HEAD' && !('x-admin-action' in headers)) {
    (headers as Record<string, string>)['x-admin-action'] = 'ui';
  }
  const res = await fetch(BASE + path, { ...init, headers });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type OutboxEvent = {
  id: string;
  merchantId: string;
  eventType: string;
  payload: any;
  status: string;
  retries: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listOutbox(merchantId: string, params?: { status?: string; limit?: number; type?: string; since?: string }): Promise<OutboxEvent[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.type) q.set('type', params.type);
  if (params?.since) q.set('since', params.since);
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox${q.toString() ? `?${q.toString()}` : ''}`);
}

export async function retryOutbox(merchantId: string, eventId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/${encodeURIComponent(eventId)}/retry`, { method: 'POST' });
}

export async function deleteOutbox(merchantId: string, eventId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
}

export async function retryAll(merchantId: string, status?: string): Promise<{ ok: boolean; updated: number }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/retryAll${status ? `?status=${encodeURIComponent(status)}` : ''}`, { method: 'POST' });
}

export async function retrySince(merchantId: string, params: { status?: string; since?: string }): Promise<{ ok: boolean; updated: number }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/retrySince`, { method: 'POST', body: JSON.stringify(params || {}) });
}

export function outboxCsvUrl(merchantId: string, params?: { status?: string; since?: string; type?: string; limit?: number }): string {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.since) q.set('since', params.since);
  if (params?.type) q.set('type', params.type);
  if (params?.limit != null) q.set('limit', String(params.limit));
  return `/api/admin/merchants/${encodeURIComponent(merchantId)}/outbox.csv${q.toString() ? `?${q.toString()}` : ''}`;
}

export async function pauseOutbox(merchantId: string, params?: { minutes?: number; until?: string }): Promise<{ ok: boolean; until?: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/pause`, { method: 'POST', body: JSON.stringify(params || {}) });
}
export async function resumeOutbox(merchantId: string): Promise<{ ok: boolean }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/resume`, { method: 'POST' });
}

export async function outboxStats(merchantId: string, since?: string): Promise<{ merchantId: string; since: string|null; counts: Record<string, number>; typeCounts?: Record<string, number>; lastDeadAt: string|null }> {
  const q = since ? `?since=${encodeURIComponent(since)}` : '';
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/stats${q}`);
}

export async function getOutboxEvent(merchantId: string, eventId: string) {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/event/${encodeURIComponent(eventId)}`);
}

export async function listOutboxByOrder(merchantId: string, orderId: string, limit = 100): Promise<OutboxEvent[]> {
  const q = new URLSearchParams();
  q.set('orderId', orderId);
  q.set('limit', String(limit));
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/by-order?${q.toString()}`);
}
