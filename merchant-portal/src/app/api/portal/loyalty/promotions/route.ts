import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  const path = '/portal/loyalty/promotions' + (qs.toString() ? `?${qs.toString()}` : '');
  return portalFetch(req, path, { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headers: Record<string, string> = {
    'content-type': req.headers.get('content-type') || 'application/json',
  };
  return portalFetch(req, '/portal/loyalty/promotions', {
    method: 'POST',
    body,
    headers,
  });
}
