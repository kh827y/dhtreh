import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../../_lib';

export async function POST(req: NextRequest, ctx: { params: { staffId: string; outletId: string } }) {
  const p = await Promise.resolve(ctx.params);
  return portalFetch(req, `/portal/staff/${encodeURIComponent(p.staffId)}/access/${encodeURIComponent(p.outletId)}/regenerate-pin`, { method: 'POST' });
}
