import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/reviews/settings', { method: 'GET' });
}

export async function PUT(req: NextRequest) {
  const body = await req.text();
  return portalFetch(req, '/portal/reviews/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
