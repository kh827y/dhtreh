import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest, ctx: { params: { campaignId: string } }) {
  const { campaignId } = await Promise.resolve(ctx.params);
  return portalFetch(req, `/portal/campaigns/${encodeURIComponent(String(campaignId||''))}` as const, { method: 'GET' });
}

export async function PUT(req: NextRequest, ctx: { params: { campaignId: string } }) {
  const { campaignId } = await Promise.resolve(ctx.params);
  const body = await req.json().catch(() => ({} as any));
  return portalFetch(req, `/portal/campaigns/${encodeURIComponent(String(campaignId||''))}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}
