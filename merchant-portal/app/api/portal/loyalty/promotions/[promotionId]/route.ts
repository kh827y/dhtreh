import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

function pathFor(id: string, suffix = '') {
  const encoded = encodeURIComponent(id);
  return `/portal/loyalty/promotions/${encoded}${suffix}`;
}

export async function GET(req: NextRequest, { params }: { params: { promotionId: string } }) {
  return portalFetch(req, pathFor(params.promotionId), { method: 'GET' });
}

export async function PUT(req: NextRequest, { params }: { params: { promotionId: string } }) {
  const body = await req.text();
  const headers: Record<string, string> = {
    'content-type': req.headers.get('content-type') || 'application/json',
  };
  return portalFetch(req, pathFor(params.promotionId), {
    method: 'PUT',
    body,
    headers,
  });
}
