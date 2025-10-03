import { NextRequest } from 'next/server';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

export async function portalFetch(req: NextRequest, path: string, init?: RequestInit) {
  const token = req.cookies.get('portal_jwt')?.value || '';
  if (!token) return new Response('Unauthorized', { status: 401 });
  if (!API_BASE) {
    return new Response('Server misconfiguration: NEXT_PUBLIC_API_BASE is not set', { status: 500 });
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    ...((init?.headers as Record<string, string>) || {}),
  };
  const res = await fetch(API_BASE + path, { ...init, headers });
  const text = await res.text();
  const outHeaders: Record<string, string> = {
    'Content-Type': res.headers.get('content-type') || 'application/json',
  };
  const hTotal = res.headers.get('x-total-count');
  if (hTotal) outHeaders['X-Total-Count'] = hTotal;
  const contentRange = res.headers.get('content-range');
  if (contentRange) outHeaders['Content-Range'] = contentRange;
  return new Response(text, { status: res.status, headers: outHeaders });
}
