import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === 'production';
  const domain = (process.env.PORTAL_COOKIE_DOMAIN || '').trim() || undefined;
  res.cookies.set({ name: 'portal_jwt', value: '', httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0, domain });
  res.cookies.set({ name: 'portal_refresh', value: '', httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0, domain });
  return res;
}
