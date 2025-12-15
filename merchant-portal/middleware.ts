import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const pubPaths = [
    /^\/login(\/.*)?$/,
    /^\/api\/session\/login(\/.*)?$/,
    /^\/api\/session\/accept-token(\/.*)?$/,
    /^\/api\/session\/refresh(\/.*)?$/,
    /^\/_next\//,
    /^\/favicon\.ico$/,
    /^\/public\//,
  ];
  const { pathname } = req.nextUrl;
  for (const p of pubPaths) if (p.test(pathname)) return NextResponse.next();
  const token = req.cookies.get('portal_jwt')?.value || '';
  if (!token) {
    const redirect = req.nextUrl.pathname + (req.nextUrl.search || '');
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('redirect', redirect);
    return NextResponse.redirect(url);
  }
  const payloadPart = token.split('.')[1] || '';
  const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
  let expired = false;
  try {
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    const exp = Number(json?.exp || 0);
    const now = Math.floor(Date.now() / 1000);
    expired = !exp || exp <= now;
  } catch {
    expired = true;
  }
  if (expired) {
    const refresh = req.cookies.get('portal_refresh')?.value || '';
    const redirect = req.nextUrl.pathname + (req.nextUrl.search || '');
    const url = req.nextUrl.clone();
    if (refresh) {
      url.pathname = '/api/session/refresh';
      url.search = '';
      url.searchParams.set('redirect', redirect);
      return NextResponse.redirect(url);
    }
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('redirect', redirect);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|favicon.ico|public).*)',
  ],
};
