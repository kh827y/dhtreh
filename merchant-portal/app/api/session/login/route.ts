import { NextRequest, NextResponse } from 'next/server';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000').replace(/\/$/, '');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const r = await fetch(API_BASE + '/portal/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(body.email||'').toLowerCase(), password: String(body.password||''), code: body.code ? String(body.code) : undefined }),
    });
    const txt = await r.text();
    if (!r.ok) return new NextResponse(txt || 'Unauthorized', { status: r.status });
    let token = '';
    try { token = JSON.parse(txt)?.token || ''; } catch {}
    if (!token) return new NextResponse('Bad response', { status: 502 });
    const res = NextResponse.json({ ok: true });
    const secure = process.env.NODE_ENV === 'production';
    res.cookies.set({ name: 'portal_jwt', value: token, httpOnly: true, sameSite: 'lax', secure, path: '/' });
    return res;
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
