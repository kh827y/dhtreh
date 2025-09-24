import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../_lib';

export async function POST(req: NextRequest, ctx: { params: { accessId: string } }) {
  const { accessId } = await Promise.resolve(ctx.params);
  return portalFetch(req, `/portal/staff/access/${encodeURIComponent(accessId)}/rotate`, { method: 'POST' });
}
