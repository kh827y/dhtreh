import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return portalFetch(
    req,
    `/portal/catalog/products/${encodeURIComponent(params.id)}`,
    { method: 'GET' },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.text();
  const headers: Record<string, string> = {
    'content-type': req.headers.get('content-type') || 'application/json',
  };
  return portalFetch(
    req,
    `/portal/catalog/products/${encodeURIComponent(params.id)}`,
    {
      method: 'PUT',
      body,
      headers,
    },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return portalFetch(
    req,
    `/portal/catalog/products/${encodeURIComponent(params.id)}`,
    { method: 'DELETE' },
  );
}
