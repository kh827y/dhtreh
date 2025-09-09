import { NextRequest } from 'next/server';

const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.NEXT_PUBLIC_ADMIN_KEY || '';

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  if (!API_BASE) return new Response('API_BASE not configured', { status: 500 });
  if (!ADMIN_KEY) return new Response('ADMIN_KEY not configured', { status: 500 });
  const method = req.method;
  const url = new URL(req.url);
  const suffix = '/' + (params.path?.join('/') || '');
  const target = API_BASE + suffix + (url.search || '');

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { if (!/^host$/i.test(k)) headers[k] = v; });
  headers['x-admin-key'] = ADMIN_KEY;
  headers['content-type'] = 'application/json';

  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.text();
  const res = await fetch(target, { method, headers, body, redirect: 'manual' });
  const outHeaders = new Headers();
  res.headers.forEach((v, k) => outHeaders.set(k, v));
  return new Response(await res.text(), { status: res.status, statusText: res.statusText, headers: outHeaders });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
