import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.NEXT_PUBLIC_ADMIN_KEY || '';

async function proxy(req: NextRequest, ctx: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await ctx.params;
  const path = Array.isArray(proxy) ? proxy.join('/') : '';
  const search = req.nextUrl.search || '';
  const targetUrl = `${API_BASE}/${path}${search}`;

  const headers = new Headers(req.headers as any);
  headers.set('x-admin-key', ADMIN_KEY);
  headers.delete('host');
  headers.delete('connection');

  const method = req.method || 'GET';
  const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase());
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const res = await fetch(targetUrl, {
    method,
    headers,
    body: body as any,
    redirect: 'manual',
    cache: 'no-store',
  });

  const resBody = await res.arrayBuffer();
  const outHeaders = new Headers();
  res.headers.forEach((v, k) => outHeaders.set(k, v));
  return new Response(resBody, { status: res.status, statusText: res.statusText, headers: outHeaders });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
