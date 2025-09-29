import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function POST(req: NextRequest) {
  return portalFetch(req, '/portal/integrations/telegram-mini-app/check', { method: 'POST' });
}
