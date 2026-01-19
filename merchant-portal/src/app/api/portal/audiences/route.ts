import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.toString();
  const path = `/portal/audiences${search ? `?${search}` : ''}`;
  return portalFetch(req, path, { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  return portalFetch(req, '/portal/audiences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}
