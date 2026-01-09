import { authenticator } from 'otplib';
import { NextRequest, NextResponse } from 'next/server';
import { makeSessionCookie, setSessionCookie } from '../../_lib/session';

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || 'unknown';
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const existing = rateLimitStore.get(key);
  if (!existing || now > existing.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfter: null as number | null };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(0, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, retryAfter };
  }
  existing.count += 1;
  rateLimitStore.set(key, existing);
  return { allowed: true, retryAfter: null as number | null };
}

function resetRateLimit(key: string) {
  rateLimitStore.delete(key);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pass = String(body?.password || '');
  const code = (body?.code != null) ? String(body.code) : '';
  const adminPass = process.env.ADMIN_UI_PASSWORD || process.env.ADMIN_UI_ADMIN_PASSWORD || '';

  // In production, disallow dev defaults
  if (process.env.NODE_ENV === 'production') {
    if (!adminPass || adminPass === 'admin' || adminPass === 'dev_change_me') {
      console.error('Admin password not properly configured for production');
      return new NextResponse('Auth unavailable', { status: 500 });
    }
  }

  if (!adminPass) {
    console.error('Admin UI password not configured');
    return new NextResponse('Auth unavailable', { status: 500 });
  }

  const clientKey = getClientKey(req);
  const limit = checkRateLimit(clientKey);
  if (!limit.allowed) {
    const res = new NextResponse('Too many attempts', { status: 429 });
    if (limit.retryAfter != null) res.headers.set('Retry-After', String(limit.retryAfter));
    return res;
  }

  let role: 'ADMIN' | null = null;
  if (adminPass && pass === adminPass) role = 'ADMIN';
  if (!role) return new NextResponse('Invalid credentials', { status: 401 });
  // Optional TOTP for ADMIN role
  if (role === 'ADMIN' && process.env.ADMIN_UI_TOTP_SECRET) {
    const secret = process.env.ADMIN_UI_TOTP_SECRET as string;
    if (!code) return new NextResponse('Invalid credentials', { status: 401 });
    const ok = (() => { try { return authenticator.verify({ token: code, secret }); } catch { return false; } })();
    if (!ok) return new NextResponse('Invalid credentials', { status: 401 });
  }
  try {
    const token = makeSessionCookie(7, role);
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, token);
    resetRateLimit(clientKey);
    return res;
  } catch (e: any) {
    console.error('Failed to create session cookie', e);
    return new NextResponse('Auth unavailable', { status: 500 });
  }
}
export const runtime = 'nodejs';
