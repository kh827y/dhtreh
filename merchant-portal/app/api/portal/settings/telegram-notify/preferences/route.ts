import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/settings/telegram-notify/preferences');
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return portalFetch(req, '/portal/settings/telegram-notify/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}
