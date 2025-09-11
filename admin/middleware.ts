import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const noAdminPwd = !process.env.ADMIN_UI_ADMIN_PASSWORD && !process.env.ADMIN_UI_PASSWORD;
  const devBypass = process.env.NODE_ENV !== 'production' && noAdminPwd;
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

