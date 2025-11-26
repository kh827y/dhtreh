import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';
import { normalizeReviewsShareLinks, normalizeDevices } from '../route';

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
  const devices = Array.isArray(data?.devices) ? data.devices : [];
  return new Response(JSON.stringify({ ...data, works, devices }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({} as any));
  const payload: Record<string, any> = {};
  if (body?.name !== undefined) payload.name = String(body.name || '').trim();
  if (body?.address !== undefined) payload.address = String(body.address || '').trim();
  if (body?.description !== undefined) payload.description = body.description == null ? null : String(body.description);
  if (body?.phone !== undefined) payload.phone = body.phone == null ? null : String(body.phone);
  if (Array.isArray(body?.adminEmails)) {
    payload.adminEmails = body.adminEmails.map((email: any) => String(email)).filter((email: string) => email.length > 0);
  }
  if (body?.works !== undefined) payload.works = !!body.works;
  if (body?.hidden !== undefined) payload.hidden = !!body.hidden;
  if (body?.timezone !== undefined) payload.timezone = body.timezone == null ? null : String(body.timezone);
  if (body?.manualLocation !== undefined) payload.manualLocation = !!body.manualLocation;
  if (body?.latitude !== undefined) payload.latitude = body.latitude == null ? null : Number(body.latitude);
  if (body?.longitude !== undefined) payload.longitude = body.longitude == null ? null : Number(body.longitude);
  if (body?.externalId !== undefined) payload.externalId = body.externalId == null ? null : String(body.externalId);
  if (body?.schedule !== undefined) payload.schedule = body.schedule;
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
