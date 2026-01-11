import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

function safeRedirectPath(input?: string | null): string {
  if (!input) return '/';
  try {
    const url = new URL(input, 'http://x');
    const path = url.pathname + (url.search || '');
    if (!path.startsWith('/')) return '/';
    if (path.startsWith('/_next') || path.startsWith('/api/session/accept-token'))
      return '/';
    return path;
  } catch {
    return '/';
  }
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

function verifyPortalJwtLocal(
  token: string,
): { adminImpersonation: boolean } | null {
  const secret = process.env.PORTAL_JWT_SECRET || '';
  if (!secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  try {
    const header = JSON.parse(decodeBase64Url(h)) as { alg?: string };
    if (header?.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret)
      .update(`${h}.${p}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    if (expected !== sig) return null;
    const payload = JSON.parse(decodeBase64Url(p)) as {
      exp?: number;
      adminImpersonation?: boolean;
    };
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      return null;
    }
    return { adminImpersonation: !!payload.adminImpersonation };
  } catch {
    return null;
  }
}

async function verifyPortalJwt(
  token: string,
): Promise<{ adminImpersonation: boolean } | null> {
  const local = verifyPortalJwtLocal(token);
  if (local) return local;
  if (!API_BASE) return null;
  try {
    const r = await fetch(API_BASE + '/portal/auth/me', {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => ({} as any));
    if (data?.adminImpersonation) {
      return { adminImpersonation: true };
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const redirect = url.searchParams.get('redirect');
  const redirectPath = safeRedirectPath(redirect);
  if (!token) return new NextResponse('Token required', { status: 400 });
  const verified = await verifyPortalJwt(token);
  if (!verified?.adminImpersonation)
    return new NextResponse('Invalid token', { status: 400 });
  const res = NextResponse.redirect(new URL(redirectPath, url.origin));
  const secure = process.env.NODE_ENV === 'production';
  const domain = (process.env.PORTAL_COOKIE_DOMAIN || '').trim() || undefined;
  res.cookies.set({ name: 'portal_jwt', value: token, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 24 * 60 * 60, domain });
  return res;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const token = String(body?.token || '');
  if (!token) return new NextResponse('Token required', { status: 400 });
  const verified = await verifyPortalJwt(token);
  if (!verified?.adminImpersonation)
    return new NextResponse('Invalid token', { status: 400 });
  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === 'production';
  const domain = (process.env.PORTAL_COOKIE_DOMAIN || '').trim() || undefined;
  res.cookies.set({ name: 'portal_jwt', value: token, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 24 * 60 * 60, domain });
  return res;
}
