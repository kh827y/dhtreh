import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function GET(req: NextRequest, { params }: { params: Promise<{ tierId: string }> }) {
  const { tierId } = await params;
  return portalFetch(req, `/portal/loyalty/tiers/${encodeURIComponent(tierId)}`, { method: 'GET' });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ tierId: string }> }) {
  const { tierId } = await params;
  const body = await req.text();
  return portalFetch(req, `/portal/loyalty/tiers/${encodeURIComponent(tierId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tierId: string }> }) {
  const { tierId } = await params;
  return portalFetch(req, `/portal/loyalty/tiers/${encodeURIComponent(tierId)}`, { method: 'DELETE' });
}
