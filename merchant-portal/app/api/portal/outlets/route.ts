import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';
import { normalizeReviewsShareLinks, normalizeDevices } from './_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  if (status) {
    const normalized = status.trim().toLowerCase();
    if (['active', 'inactive', 'all'].includes(normalized)) {
      qs.set('status', normalized);
    } else if (['ACTIVE', 'INACTIVE', 'ALL'].includes(status.trim().toUpperCase())) {
      qs.set('status', status.trim().toLowerCase());
    } else {
      qs.set('status', status);
    }
  }
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
  const items = sourceItems.map((o: any) => {
    const outletId = String(o.id || '');
    const outletName = String(o.name || '');
    const devices = Array.isArray(o?.devices)
      ? o.devices
          .filter((d: any) => d && typeof d === 'object')
          .map((d: any) => ({
            id: String(d.id || ''),
            code: String(d.code || ''),
            outletId,
            outletName,
          }))
          .filter((d: any) => d.id && d.code)
      : [];
    return {
      id: outletId,
      name: outletName,
      works: typeof o.works === 'boolean' ? !!o.works : String(o.status || '').toUpperCase() === 'ACTIVE',
      staffCount: typeof o.staffCount === 'number' ? o.staffCount : 0,
      devices,
      reviewsShareLinks: o?.reviewsShareLinks ?? null,
    };
  });
  const total = Number(data?.total ?? data?.meta?.total ?? items.length) || items.length;
  return new Response(JSON.stringify({ items, total }), { status: proxied.status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const payload: Record<string, any> = {};
  if (body?.name !== undefined) payload.name = String(body.name || '').trim();
  if (body?.works !== undefined) payload.works = !!body.works;
  const reviewsShareLinks = normalizeReviewsShareLinks(body?.reviewsShareLinks);
  if (reviewsShareLinks !== undefined) payload.reviewsShareLinks = reviewsShareLinks;
  const devices = normalizeDevices(body?.devices);
  if (devices !== undefined) payload.devices = devices;
  return portalFetch(req, '/portal/outlets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
