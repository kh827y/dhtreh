import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/settings/support');
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return portalFetch(req, '/portal/settings/support', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
