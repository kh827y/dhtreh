import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../_lib';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ staffId: string; outletId: string }> }) {
  const { staffId, outletId } = await params;
  if (!staffId || !outletId) {
    return new Response(JSON.stringify({ error: 'BadRequest', message: 'staffId and outletId are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}/access/${encodeURIComponent(outletId)}`, { method: 'DELETE' });
}
