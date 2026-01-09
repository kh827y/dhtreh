import { NextRequest, NextResponse } from 'next/server';

const COOKIE = 'admin_session_v1';
const textEncoder = new TextEncoder();

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signPayload(payload: string, secret: string) {
  if (!globalThis.crypto?.subtle) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function verifySessionCookie(cookieVal: string | undefined) {
  try {
    if (!cookieVal) return false;
    const [payload, sig] = cookieVal.split('.');
    if (!payload || !sig) return false;
    const secret = process.env.ADMIN_SESSION_SECRET || '';
    if (!secret) return false;
    const expected = await signPayload(payload, secret);
    if (!expected || expected !== sig) return false;
    const json = new TextDecoder().decode(base64UrlToBytes(payload));
    const sess = JSON.parse(json) as { exp?: number } | null;
    if (!sess || typeof sess.exp !== 'number') return false;
    if (sess.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const noAdminPwd = !process.env.ADMIN_UI_ADMIN_PASSWORD && !process.env.ADMIN_UI_PASSWORD;
  const devBypass = process.env.NODE_ENV !== 'production' && noAdminPwd;
  if (devBypass) return NextResponse.next();
  const cookie = req.cookies.get(COOKIE)?.value;
  const valid = await verifySessionCookie(cookie);
  if (!valid) {
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
