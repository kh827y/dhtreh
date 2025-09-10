import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../_lib/session';

export const runtime = 'nodejs';

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');

export async function GET(req: NextRequest) {
  if (!API_BASE) return new NextResponse('API_BASE not configured', { status: 500 });
  {
    const unauth = requireSession(req);
    if (unauth) return unauth;
  }
  try {
    const res = await fetch(API_BASE + '/healthz', { redirect: 'manual' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 502 });
  }
}

