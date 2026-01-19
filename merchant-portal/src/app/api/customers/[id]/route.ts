import { NextRequest } from 'next/server';
import { portalFetch } from '../../portal/_lib';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return portalFetch(_req, `/portal/customers/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return portalFetch(req, `/portal/customers/${encodeURIComponent(id)}`, { method: 'PUT', body, headers: { 'content-type': 'application/json' } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return portalFetch(_req, `/portal/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
