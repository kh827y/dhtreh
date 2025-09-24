import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';
import { buildStaffPayload } from '../route';

export async function PUT(req: NextRequest, ctx: { params: { staffId: string } }) {
  const { staffId } = await Promise.resolve(ctx.params);
  const body = await req.json().catch(() => ({} as any));
  const payload = buildStaffPayload(body);
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
