import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const path = '/portal/catalog/products' + (qs ? `?${qs}` : '');
  return portalFetch(req, path, { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headers: Record<string, string> = {
    'content-type': req.headers.get('content-type') || 'application/json',
  };
  return portalFetch(req, '/portal/catalog/products', {
    method: 'POST',
    body,
    headers,
  });
}
