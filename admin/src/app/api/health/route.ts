import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../_lib/session';

export const runtime = 'nodejs';

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const HEALTH_TIMEOUT_MS = (() => {
  const raw = Number(process.env.ADMIN_HEALTH_TIMEOUT_MS || '');
  if (!Number.isFinite(raw)) return 10_000;
  return Math.min(Math.max(Math.trunc(raw), 1_000), 120_000);
})();

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  if (!API_BASE) return new NextResponse('API_BASE not configured', { status: 500 });
  {
    const unauth = requireSession(req);
    if (unauth) return unauth;
  }
  try {
    const [healthRes, readyRes] = await Promise.all([
      fetchWithTimeout(API_BASE + '/healthz'),
      fetchWithTimeout(API_BASE + '/readyz'),
    ]);
    const health = await healthRes.json().catch(() => null);
    const ready = await readyRes.json().catch(() => null);
    const status = healthRes.ok && readyRes.ok ? 200 : (healthRes.ok ? readyRes.status : healthRes.status);
    return NextResponse.json({ health, ready }, { status });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      return new NextResponse(
        `Health upstream timeout after ${HEALTH_TIMEOUT_MS}ms`,
        { status: 504 },
      );
    }
    return new NextResponse(String(e instanceof Error ? e.message : e), { status: 502 });
  }
}
