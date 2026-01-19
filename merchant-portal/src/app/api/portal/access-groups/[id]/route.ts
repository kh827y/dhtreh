import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return portalFetch(req, `/portal/access-groups/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return portalFetch(req, `/portal/access-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
