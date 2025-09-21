import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/staff', { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  return portalFetch(req, '/portal/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: body?.login ? String(body.login) : undefined, email: body?.email ? String(body.email) : undefined, role: body?.role ? String(body.role) : undefined }),
  });
}
