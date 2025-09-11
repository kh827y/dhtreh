import { authenticator } from 'otplib';
import { NextRequest, NextResponse } from 'next/server';
import { makeSessionCookie, setSessionCookie } from '../../_lib/session';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pass = String(body?.password || '');
  const code = (body?.code != null) ? String(body.code) : '';
  const adminPass = process.env.ADMIN_UI_ADMIN_PASSWORD || process.env.ADMIN_UI_PASSWORD || process.env.ADMIN_KEY || '';
  const managerPass = process.env.ADMIN_UI_MANAGER_PASSWORD || '';
  
  // In production, disallow dev defaults
  if (process.env.NODE_ENV === 'production') {
    if (!adminPass || adminPass === 'admin' || adminPass === 'dev_change_me') {
      return new NextResponse('Admin password not properly configured for production', { status: 500 });
    }
    if (managerPass && (managerPass === 'manager' || managerPass === 'dev_change_me')) {
      return new NextResponse('Manager password not properly configured for production', { status: 500 });
    }
  }
  
  if (!adminPass && !managerPass) return new NextResponse('Admin UI password not configured', { status: 500 });
  let role: 'ADMIN'|'MANAGER' | null = null;
  if (adminPass && pass === adminPass) role = 'ADMIN';
  if (!role && managerPass && pass === managerPass) role = 'MANAGER';
  if (!role) return new NextResponse('Invalid credentials', { status: 401 });
  // Optional TOTP for ADMIN role
  if (role === 'ADMIN' && process.env.ADMIN_UI_TOTP_SECRET) {
    const secret = process.env.ADMIN_UI_TOTP_SECRET as string;
    if (!code) return new NextResponse('OTP code required', { status: 401 });
    const ok = (() => { try { return authenticator.verify({ token: code, secret }); } catch { return false; } })();
    if (!ok) return new NextResponse('Invalid OTP code', { status: 401 });
  }
  try {
    const token = makeSessionCookie(7, role);
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, token);
    return res;
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
export const runtime = 'nodejs';
