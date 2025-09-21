import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const pubPaths = [
    /^\/login(\/.*)?$/,
    /^\/api\/session\/login(\/.*)?$/,
    /^\/api\/session\/accept-token(\/.*)?$/,
    /^\/_next\//,
    /^\/favicon\.ico$/,
    /^\/public\//,
  ];
  const { pathname } = req.nextUrl;
  for (const p of pubPaths) if (p.test(pathname)) return NextResponse.next();
  const token = req.cookies.get('portal_jwt')?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|favicon.ico|public).*)',
  ],
};
