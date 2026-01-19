import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function GET(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  if (!staffId) {
    return new Response(JSON.stringify({ error: 'BadRequest', message: 'staffId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}/access`, { method: 'GET' });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  if (!staffId) {
    return new Response(JSON.stringify({ error: 'BadRequest', message: 'staffId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const body = await req.json().catch(() => ({} as any));
  const payload: Record<string, any> = {};
  if (body?.outletId !== undefined) payload.outletId = String(body.outletId || '').trim();
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
