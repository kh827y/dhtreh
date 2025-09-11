import { NextRequest, NextResponse } from 'next/server';
import { requireSession, getSession } from '../../_lib/session';
export const runtime = 'nodejs';

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const ADMIN_UI_PASSWORD = process.env.ADMIN_UI_ADMIN_PASSWORD || process.env.ADMIN_UI_PASSWORD || '';

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  if (!API_BASE) return new Response('API_BASE not configured', { status: 500 });
  if (!ADMIN_KEY) return new Response('ADMIN_KEY not configured', { status: 500 });
  if (process.env.NODE_ENV === 'production') {
    if (!ADMIN_SESSION_SECRET) return new Response('ADMIN_SESSION_SECRET not configured', { status: 500 });
    if (!ADMIN_UI_PASSWORD) return new Response('ADMIN_UI_PASSWORD not configured', { status: 500 });
  }
  {
    const unauth = requireSession(req);
    if (unauth) return unauth;
  }
  const method = req.method;
  const url = new URL(req.url);
  // В Next 15 params может быть Promise — поддержим оба варианта
  const p = (typeof (ctx.params as any)?.then === 'function') ? await (ctx.params as Promise<{ path: string[] }>) : (ctx.params as { path: string[] });
  const parts = (p?.path || []);
  const suffix = '/' + parts.join('/');
  const target = API_BASE + suffix + (url.search || '');

  const headers: Record<string, string> = {};
  req.headers.forEach((v: string, k: string) => { if (!/^host$/i.test(k)) headers[k] = v; });
  headers['x-admin-key'] = ADMIN_KEY;
  // RBAC: только ADMIN может выполнять изменяющие методы
  const sess = getSession(req);
  if (sess?.role === 'MANAGER' && !/^(GET|HEAD|OPTIONS)$/i.test(method)) {
    return new NextResponse('Forbidden for role MANAGER', { status: 403 });
  }
  // Audit hint via header (для логов API)
  try {
    const ip = (req.headers.get('x-forwarded-for') || req.ip || '').split(',')[0].trim();
    headers['x-admin-actor'] = `${sess?.role || 'UNKNOWN'}@${ip || 'unknown'}`;
    const mi = (() => { const i = parts.indexOf('merchants'); return i >= 0 ? parts[i+1] : undefined; })();
    if (mi) headers['x-merchant-id'] = mi;
  } catch {}

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
  // Прозрачно проксируем тело и заголовки для остальных запросов,
  // но убираем сжатие (content-encoding), чтобы избежать двойной декомпрессии в браузере.
  const out = new Headers();
  res.headers.forEach((v, k) => {
    if (/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) return;
    out.set(k, v);
  });
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
