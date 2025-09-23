import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function POST(req: NextRequest, { params }: { params: { staffId: string } }) {
  const staffId = String(params?.staffId || '');
  if (!staffId) {
    return new Response('staffId required', { status: 400 });
  }
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}/pin/regenerate`, { method: 'POST' });
}
