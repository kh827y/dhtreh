import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/devices', { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  return portalFetch(req, '/portal/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: String(body?.type||'SMART'), outletId: body?.outletId ? String(body.outletId) : undefined, label: body?.label ? String(body.label) : undefined }),
  });
}
