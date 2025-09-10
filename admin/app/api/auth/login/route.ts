import { NextRequest, NextResponse } from 'next/server';
import { makeSessionCookie, setSessionCookie } from '../../_lib/session';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pass = String(body?.password || '');
  const adminPass = process.env.ADMIN_UI_ADMIN_PASSWORD || process.env.ADMIN_UI_PASSWORD || process.env.ADMIN_KEY || '';
  const managerPass = process.env.ADMIN_UI_MANAGER_PASSWORD || '';
  if (!adminPass && !managerPass) return new NextResponse('Admin UI password not configured', { status: 500 });
  let role: 'ADMIN'|'MANAGER' | null = null;
  if (adminPass && pass === adminPass) role = 'ADMIN';
  if (!role && managerPass && pass === managerPass) role = 'MANAGER';
  if (!role) return new NextResponse('Invalid credentials', { status: 401 });
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
