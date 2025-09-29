import { NextRequest } from 'next/server';
import { portalFetch } from '../../portal/_lib';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const p = (context.params as any);
  const { id } = typeof p?.then === 'function' ? await p : p;
  return portalFetch(_req, `/portal/customers/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const p = (context.params as any);
  const { id } = typeof p?.then === 'function' ? await p : p;
  const body = await req.text();
  return portalFetch(req, `/portal/customers/${encodeURIComponent(id)}`, { method: 'PUT', body, headers: { 'content-type': 'application/json' } });
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const p = (context.params as any);
  const { id } = typeof p?.then === 'function' ? await p : p;
  return portalFetch(_req, `/portal/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
