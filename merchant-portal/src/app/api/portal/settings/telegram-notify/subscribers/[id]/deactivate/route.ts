import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../../_lib';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return portalFetch(req, `/portal/settings/telegram-notify/subscribers/${encodeURIComponent(id)}/deactivate`, { method: 'POST' });
}
