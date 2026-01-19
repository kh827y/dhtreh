import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  const res = await portalFetch(req, '/portal/loyalty/redeem-limits', {
    method: 'GET',
  });
  const raw = await res.text();
  return new Response(raw, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/json',
    },
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'BadRequest', message: 'Invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const update = await portalFetch(req, '/portal/loyalty/redeem-limits', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const updateText = await update.text();
  return new Response(updateText, { status: update.status, headers: { 'Content-Type': update.headers.get('content-type') ?? 'application/json' } });
}
