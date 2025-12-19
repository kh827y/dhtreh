import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';
import { normalizeReviewsShareLinks, normalizeDevices } from '../_lib';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const proxied = await portalFetch(req, `/portal/outlets/${encodeURIComponent(id)}`, { method: 'GET' });
  const raw = await proxied.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    return new Response(raw, { status: proxied.status, headers: { 'Content-Type': proxied.headers.get('content-type') || 'text/plain' } });
  }
  if (!proxied.ok) {
    return new Response(JSON.stringify(data), { status: proxied.status, headers: { 'Content-Type': 'application/json' } });
  }
  // add convenient boolean works derived from status
  const works = typeof data?.works === 'boolean' ? !!data.works : String(data?.status || '').toUpperCase() === 'ACTIVE';
  const devices = Array.isArray(data?.devices)
    ? data.devices
        .filter((d: any) => d && typeof d === 'object')
        .map((d: any) => ({
          id: String(d.id || ''),
          code: String(d.code || ''),
        }))
        .filter((d: any) => d.id && d.code)
    : [];
  return new Response(
    JSON.stringify({ ...data, works, devices, staffCount: typeof data?.staffCount === 'number' ? data.staffCount : 0 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({} as any));
  const payload: Record<string, any> = {};
  if (body?.name !== undefined) payload.name = String(body.name || '').trim();
  if (body?.works !== undefined) payload.works = !!body.works;
  const reviewsShareLinks = normalizeReviewsShareLinks(body?.reviewsShareLinks);
  if (reviewsShareLinks !== undefined) payload.reviewsShareLinks = reviewsShareLinks;
  const devices = normalizeDevices(body?.devices);
  if (devices !== undefined) payload.devices = devices;
  return portalFetch(req, `/portal/outlets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return portalFetch(req, `/portal/outlets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
