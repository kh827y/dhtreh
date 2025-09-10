import { NextRequest, NextResponse } from 'next/server';
import { makeSessionCookie, setSessionCookie } from '../../_lib/session';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pass = String(body?.password || '');
  const want = process.env.ADMIN_UI_PASSWORD || process.env.ADMIN_KEY || '';
  if (!want) return new NextResponse('Admin UI password not configured', { status: 500 });
  if (pass !== want) return new NextResponse('Invalid credentials', { status: 401 });
  try {
    const token = makeSessionCookie(7);
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, token);
    return res;
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}

