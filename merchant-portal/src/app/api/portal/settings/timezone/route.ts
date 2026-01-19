import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/settings/timezone');
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  return portalFetch(req, '/portal/settings/timezone', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
