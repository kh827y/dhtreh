import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function GET(req: NextRequest, ctx: { params: { staffId: string } }) {
  const staffId = (await Promise.resolve(ctx.params)).staffId;
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}/access`, { method: 'GET' });
}

export async function POST(req: NextRequest, ctx: { params: { staffId: string } }) {
  const staffId = (await Promise.resolve(ctx.params)).staffId;
  const body = await req.json().catch(()=>({} as any));
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outletId: body?.outletId ? String(body.outletId) : '' }),
  });
}
