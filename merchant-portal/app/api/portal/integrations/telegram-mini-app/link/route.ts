import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.text();
  return portalFetch(req, '/portal/integrations/telegram-mini-app/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
