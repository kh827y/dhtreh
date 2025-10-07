import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return portalFetch(req, '/portal/integrations/telegram-mini-app/setup-menu', {
    method: 'POST',
  });
}
