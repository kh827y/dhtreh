import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const redirect = url.searchParams.get('redirect') || '/';
  if (!token) return new NextResponse('Token required', { status: 400 });
  const res = NextResponse.redirect(new URL(redirect, url.origin));
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set({ name: 'portal_jwt', value: token, httpOnly: true, sameSite: 'lax', secure, path: '/' });
  return res;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const token = String(body?.token || '');
  if (!token) return new NextResponse('Token required', { status: 400 });
  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set({ name: 'portal_jwt', value: token, httpOnly: true, sameSite: 'lax', secure, path: '/' });
  return res;
}
