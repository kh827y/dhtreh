import { NextRequest } from 'next/server';
import { portalFetch } from '../portal/_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.search || '';
  return portalFetch(req, '/portal/customers' + qs, { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  return portalFetch(req, '/portal/customers', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
}
