import { NextRequest, NextResponse } from 'next/server';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

export async function POST(req: NextRequest) {
  try {
    if (!API_BASE) {
      return new NextResponse('Server misconfiguration: NEXT_PUBLIC_API_BASE is not set', { status: 500 });
    }
    const body = await req.json().catch(() => ({} as any));
    const r = await fetch(API_BASE + '/portal/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(body.email || '').toLowerCase(),
        password: String(body.password || ''),
        code: body.code ? String(body.code) : undefined,
        merchantId: body.merchantId ? String(body.merchantId) : undefined,
      }),
    });
    const txt = await r.text();
    if (!r.ok) return new NextResponse(txt || 'Unauthorized', { status: r.status });
    let token = '';
    let refreshToken = '';
    try { const json = JSON.parse(txt); token = json?.token || ''; refreshToken = json?.refreshToken || ''; } catch {}
    if (!token) return new NextResponse('Bad response', { status: 502 });
    const res = NextResponse.json({ ok: true });
    const secure = process.env.NODE_ENV === 'production';
    const domain = (process.env.PORTAL_COOKIE_DOMAIN || '').trim() || undefined;
    res.cookies.set({ name: 'portal_jwt', value: token, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 24 * 60 * 60, domain });
    if (refreshToken) {
      res.cookies.set({ name: 'portal_refresh', value: refreshToken, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 24 * 60 * 60, domain });
    }
    return res;
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
