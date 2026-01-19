import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/settings/telegram-notify/subscribers');
}
