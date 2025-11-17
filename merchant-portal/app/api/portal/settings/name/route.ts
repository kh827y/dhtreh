import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/settings/name');
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return portalFetch(req, '/portal/settings/name', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
