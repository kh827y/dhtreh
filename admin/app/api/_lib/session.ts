import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

const COOKIE = 'admin_session_v1';

export type Sess = { sub: string; role: 'ADMIN'|'MANAGER'; iat: number; exp: number };

function b64(s: string) { return Buffer.from(s, 'utf8').toString('base64url'); }
function ub64(s: string) { return Buffer.from(s, 'base64url').toString('utf8'); }

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}

export function makeSessionCookie(days = 7, role: 'ADMIN'|'MANAGER' = 'ADMIN') {
  const now = Math.floor(Date.now()/1000);
  const payload: Sess = { sub: 'admin', role, iat: now, exp: now + days*24*60*60 };
  const secret = getSecret();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET not configured');
  const p = b64(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(p).digest('base64url');
  return `${p}.${sig}`;
}

export function verifySessionCookie(cookieVal: string | undefined): Sess | null {
  try {
    if (!cookieVal) return null;
    const [p, sig] = cookieVal.split('.') as [string, string];
    if (!p || !sig) return null;
    const secret = getSecret();
    if (!secret) return null;
    const calc = createHmac('sha256', secret).update(p).digest('base64url');
    if (calc !== sig) return null;
    const sess = JSON.parse(ub64(p)) as Sess;
    if (!sess?.exp || sess.exp < Math.floor(Date.now()/1000)) return null;
    return sess;
  } catch { return null; }
}

export function getSession(req: NextRequest): Sess | null {
  try {
    const val = req.cookies.get(COOKIE)?.value;
    return verifySessionCookie(val);
  } catch { return null; }
}

export function requireSession(req: NextRequest): NextResponse | null {
  // allow in dev if no password configured (developer convenience)
  const noAdminPwd = !process.env.ADMIN_UI_ADMIN_PASSWORD && !process.env.ADMIN_UI_PASSWORD;
  const devBypass = process.env.NODE_ENV !== 'production' && noAdminPwd;
  if (devBypass) return null;
  const val = req.cookies.get(COOKIE)?.value;
  const sess = verifySessionCookie(val);
  if (!sess) return new NextResponse('Unauthorized', { status: 401 });
  return null;
}

export function setSessionCookie(res: NextResponse, cookieVal: string) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set({ name: COOKIE, value: cookieVal, httpOnly: true, sameSite: 'lax', secure, path: '/' });
}

export function clearSessionCookie(res: NextResponse) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set({ name: COOKIE, value: '', httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
}
