import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const devBypass = process.env.NODE_ENV !== 'production' && !process.env.ADMIN_UI_PASSWORD;
  if (devBypass) return NextResponse.next();
  const cookie = req.cookies.get('admin_session_v1')?.value;
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // всё, кроме /api/*, /_next/*, /login, /favicon
    '/((?!api|_next|login|favicon.ico|public).*)',
  ],
};

