import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../_lib';

export async function POST(req: NextRequest, { params }: { params: Promise<{ accessId: string }> }) {
  const { accessId } = await params;
  return portalFetch(req, `/portal/staff/access/${encodeURIComponent(accessId)}/revoke`, { method: 'POST' });
}
