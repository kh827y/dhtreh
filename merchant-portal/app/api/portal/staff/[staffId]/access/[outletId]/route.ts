import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../_lib';

export async function DELETE(req: NextRequest, ctx: { params: { staffId: string; outletId: string } }) {
  const p = await Promise.resolve(ctx.params);
  return portalFetch(req, `/portal/staff/${encodeURIComponent(p.staffId)}/access/${encodeURIComponent(p.outletId)}`, { method: 'DELETE' });
}
