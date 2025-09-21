import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/outlets', { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  return portalFetch(req, '/portal/outlets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: String(body?.name||''), address: body?.address ? String(body.address) : undefined }),
  });
}
