import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  if (status) qs.set('status', status);
  if (search) qs.set('search', search);
  const path = `/portal/outlets${qs.toString() ? `?${qs.toString()}` : ''}`;
  const proxied = await portalFetch(req, path, { method: 'GET' });
  const raw = await proxied.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // not json, return as-is
    return new Response(raw, { status: proxied.status, headers: { 'Content-Type': proxied.headers.get('content-type') || 'text/plain' } });
  }
  if (!proxied.ok) {
    return new Response(JSON.stringify(data), { status: proxied.status, headers: { 'Content-Type': 'application/json' } });
  }
  const sourceItems: any[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  const items = sourceItems.map((o: any) => ({
    id: String(o.id),
    name: String(o.name || ''),
    address: o.address ?? null,
    description: o.description ?? null,
    phone: o.phone ?? null,
    works: typeof o.works === 'boolean' ? !!o.works : String(o.status || '').toUpperCase() === 'ACTIVE',
    hidden: !!o.hidden,
  }));
  const total = Number(data?.meta?.total ?? items.length) || items.length;
  return new Response(JSON.stringify({ items, total }), { status: proxied.status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: NextRequest) {
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
  return portalFetch(req, '/portal/outlets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
