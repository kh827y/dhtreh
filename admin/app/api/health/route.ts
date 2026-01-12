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
    const healthRes = await fetch(API_BASE + '/healthz', { redirect: 'manual' });
    const readyRes = await fetch(API_BASE + '/readyz', { redirect: 'manual' });
    const health = await healthRes.json().catch(() => null);
    const ready = await readyRes.json().catch(() => null);
    const status = healthRes.ok && readyRes.ok ? 200 : (healthRes.ok ? readyRes.status : healthRes.status);
    return NextResponse.json({ health, ready }, { status });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 502 });
  }
}
