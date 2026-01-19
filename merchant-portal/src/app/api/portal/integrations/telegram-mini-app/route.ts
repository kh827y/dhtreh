import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/integrations/telegram-mini-app', { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  return portalFetch(req, '/portal/integrations/telegram-mini-app/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export async function DELETE(req: NextRequest) {
  return portalFetch(req, '/portal/integrations/telegram-mini-app', { method: 'DELETE' });
}
