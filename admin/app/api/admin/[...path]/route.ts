import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../../_lib/session';

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY || '';

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  if (!API_BASE) return new Response('API_BASE not configured', { status: 500 });
  if (!ADMIN_KEY) return new Response('ADMIN_KEY not configured', { status: 500 });
  {
    const auth = requireSession(req);
    if (auth) return auth;
  }
  const method = req.method;
  const url = new URL(req.url);
  // В Next 15 params может быть Promise — поддержим оба варианта
  const p = (typeof (ctx.params as any)?.then === 'function') ? await (ctx.params as Promise<{ path: string[] }>) : (ctx.params as { path: string[] });
  const suffix = '/' + ((p?.path || []).join('/'));
  const target = API_BASE + suffix + (url.search || '');

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { if (!/^host$/i.test(k)) headers[k] = v; });
  headers['x-admin-key'] = ADMIN_KEY;

  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.text();
  if (body != null) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(target, { method, headers, body, redirect: 'manual' });
  } catch (e: any) {
    const msg = `Upstream fetch failed to ${target}: ${String(e?.message || e)}`;
    return new NextResponse(msg, { status: 502 });
  }
  const isCsv = /\.csv(\?|$)/i.test(suffix);
  if (isCsv) {
    const out = new Headers();
    out.set('Content-Type', 'text/csv; charset=utf-8');
    const fname = suffix.split('/').pop() || 'export.csv';
    out.set('Content-Disposition', `attachment; filename="${fname}"`);
    out.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  }
  // Прозрачно проксируем тело и заголовки для остальных запросов
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
