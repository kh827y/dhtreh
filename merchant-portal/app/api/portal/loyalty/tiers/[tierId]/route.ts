import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function GET(req: NextRequest, ctx: { params: Promise<{ tierId: string }> | { tierId: string } }) {
  const { tierId } = await Promise.resolve(ctx.params as any);
  return portalFetch(req, `/portal/loyalty/tiers/${encodeURIComponent(tierId)}`, { method: 'GET' });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ tierId: string }> | { tierId: string } }) {
  const { tierId } = await Promise.resolve(ctx.params as any);
  const body = await req.text();
  return portalFetch(req, `/portal/loyalty/tiers/${encodeURIComponent(tierId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ tierId: string }> | { tierId: string } }) {
  const { tierId } = await Promise.resolve(ctx.params as any);
  return portalFetch(req, `/portal/loyalty/tiers/${encodeURIComponent(tierId)}`, { method: 'DELETE' });
}
