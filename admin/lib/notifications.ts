const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const API_KEY_HEADER = (typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_KEY || '') : '') || 'test-key';
  const mergedHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY_HEADER,
    ...(init?.headers as any || {}),
  };
  const res = await fetch(BASE + path, { ...(init || {}), headers: mergedHeaders });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type BroadcastArgs = {
  merchantId: string;
  channel: 'EMAIL'|'PUSH'|'ALL';
  segmentId?: string;
  template?: { subject?: string; text?: string; html?: string };
  variables?: any;
  dryRun?: boolean;
};

export async function broadcast(args: BroadcastArgs): Promise<{ ok: true; dryRun?: boolean; estimated?: number | null }>{
  return http(`/notifications/broadcast`, { method: 'POST', body: JSON.stringify(args) });
}

export async function testNotification(args: { merchantId: string; channel: 'EMAIL'|'PUSH'; to: string; template?: { subject?: string; text?: string; html?: string } }): Promise<{ ok: true }>{
  return http(`/notifications/test`, { method: 'POST', body: JSON.stringify(args) });
}
