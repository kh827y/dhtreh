import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/staff-motivation', { method: 'GET' });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  return portalFetch(req, '/portal/staff-motivation', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}
