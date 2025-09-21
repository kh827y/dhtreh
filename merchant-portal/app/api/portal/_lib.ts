import { NextRequest } from 'next/server';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000').replace(/\/$/, '');

export async function portalFetch(req: NextRequest, path: string, init?: RequestInit) {
  const token = req.cookies.get('portal_jwt')?.value || '';
  if (!token) return new Response('Unauthorized', { status: 401 });
  const headers: Record<string, string> = {
    'authorization': `Bearer ${token}`,
    ...(init?.headers as Record<string, string> || {}),
  };
  const res = await fetch(API_BASE + path, { ...init, headers });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' } });
}
