import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const p: any = context.params as any;
  const { id } = typeof p?.then === 'function' ? await p : p;
  const body = await req.text();
  return portalFetch(req, `/portal/access-groups/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const p: any = context.params as any;
  const { id } = typeof p?.then === 'function' ? await p : p;
  return portalFetch(req, `/portal/access-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
