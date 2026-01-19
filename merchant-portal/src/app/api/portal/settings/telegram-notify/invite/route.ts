import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.text();
  return portalFetch(req, '/portal/settings/telegram-notify/invite', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
}
