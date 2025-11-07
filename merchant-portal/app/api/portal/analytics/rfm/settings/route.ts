import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function PUT(req: NextRequest) {
  const body = await req.text();
  return portalFetch(req, `/portal/analytics/rfm/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body,
  });
}
