import { NextRequest, NextResponse } from 'next/server';
import {
  applyNoStoreHeaders,
  UpstreamTimeoutError,
  upstreamFetch,
  withRequestId,
} from '../../_shared/upstream';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

export async function POST(req: NextRequest) {
  try {
    if (!API_BASE) {
      return new NextResponse('Server misconfiguration: NEXT_PUBLIC_API_BASE is not set', {
        status: 500,
        headers: applyNoStoreHeaders(),
      });
    }
    const body = await req.json().catch(() => ({} as any));
    const r = await upstreamFetch(API_BASE + '/portal/auth/login', {
      req,
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json' }, req),
      body: JSON.stringify({
        email: String(body.email || '').toLowerCase(),
        password: String(body.password || ''),
        code: body.code ? String(body.code) : undefined,
        merchantId: body.merchantId ? String(body.merchantId) : undefined,
      }),
    });
    const txt = await r.text();
    if (!r.ok) {
      return new NextResponse(txt || 'Unauthorized', {
        status: r.status,
        headers: applyNoStoreHeaders(),
      });
    }
    let token = '';
    let refreshToken = '';
    try { const json = JSON.parse(txt); token = json?.token || ''; refreshToken = json?.refreshToken || ''; } catch {}
    if (!token) {
      return new NextResponse('Bad response', {
        status: 502,
        headers: applyNoStoreHeaders(),
      });
    }
    const res = NextResponse.json({ ok: true }, { headers: applyNoStoreHeaders() });
    const secure = process.env.NODE_ENV === 'production';
    res.cookies.set({ name: 'portal_jwt', value: token, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 24 * 60 * 60 });
    if (refreshToken) {
      res.cookies.set({ name: 'portal_refresh', value: refreshToken, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 24 * 60 * 60 });
    }
    return res;
  } catch (e: any) {
    if (e instanceof UpstreamTimeoutError) {
      return new NextResponse(
        JSON.stringify({
          error: 'UpstreamTimeout',
          message: 'Сервис авторизации не ответил вовремя',
        }),
        { status: 504, headers: applyNoStoreHeaders({ 'Content-Type': 'application/json' }) },
      );
    }
    return new NextResponse(String(e?.message || e), {
      status: 500,
      headers: applyNoStoreHeaders(),
    });
  }
}
