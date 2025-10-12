import { NextRequest, NextResponse } from 'next/server';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

function safeRedirectPath(input?: string | null): string {
  if (!input) return '/';
  try {
    const url = new URL(input, 'http://x');
    const path = url.pathname + (url.search || '');
    if (!path.startsWith('/')) return '/';
    // Block attempts to access Next internals
    if (path.startsWith('/_next') || path.startsWith('/api/session/refresh')) return '/';
    return path;
  } catch {
    return '/';
  }
}

export async function GET(req: NextRequest) {
  const redirectParam = new URL(req.url).searchParams.get('redirect');
  const redirectPath = safeRedirectPath(redirectParam);

  const resLogin = () => {
    const r = NextResponse.redirect(new URL('/login', new URL(req.url).origin));
    const secure = process.env.NODE_ENV === 'production';
    const domain = (process.env.PORTAL_COOKIE_DOMAIN || '').trim() || undefined;
    r.cookies.set({ name: 'portal_jwt', value: '', httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0, domain });
    r.cookies.set({ name: 'portal_refresh', value: '', httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0, domain });
    return r;
  };

  try {
    if (!API_BASE) return resLogin();
    const refresh = req.cookies.get('portal_refresh')?.value || '';
    if (!refresh) return resLogin();

    const r = await fetch(API_BASE + '/portal/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: 'no-store',
    });
    if (!r.ok) return resLogin();
    const data = await r.json().catch(() => ({} as any));
    const token = String(data?.token || '');
    const nextRefresh = String(data?.refreshToken || '');
    if (!token) return resLogin();

    const out = NextResponse.redirect(new URL(redirectPath, new URL(req.url).origin));
    const secure = process.env.NODE_ENV === 'production';
    const domain = (process.env.PORTAL_COOKIE_DOMAIN || '').trim() || undefined;
    out.cookies.set({ name: 'portal_jwt', value: token, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 24 * 60 * 60, domain });
    if (nextRefresh) {
      out.cookies.set({ name: 'portal_refresh', value: nextRefresh, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 24 * 60 * 60, domain });
    }
    return out;
  } catch {
    return resLogin();
  }
}
