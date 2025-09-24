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
  return portalFetch(req, path, { method: 'GET' });
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
  if (body?.showSchedule !== undefined) payload.showSchedule = !!body.showSchedule;
  if (body?.schedule !== undefined) payload.schedule = body.schedule;
  return portalFetch(req, '/portal/outlets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
