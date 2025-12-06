import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return portalFetch(req, `/portal/loyalty/promotions/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  const headers: Record<string, string> = {
    'content-type': req.headers.get('content-type') || 'application/json',
  };
  return portalFetch(req, `/portal/loyalty/promotions/${encodeURIComponent(id)}` , {
    method: 'PUT',
    body,
    headers,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // status change: forward to /status
  const { id } = await params;
  const body = await req.text();
  const headers: Record<string, string> = {
    'content-type': req.headers.get('content-type') || 'application/json',
  };
  return portalFetch(req, `/portal/loyalty/promotions/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body,
    headers,
  });
}
