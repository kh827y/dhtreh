import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

function booleanParam(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (value === 'true' || value === '1') return 'true';
  if (value === 'false' || value === '0') return 'false';
  return undefined;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  const page = url.searchParams.get('page');
  const pageSize = url.searchParams.get('pageSize');
  const status = url.searchParams.get('status');
  const outletId = url.searchParams.get('outletId');
  const groupId = url.searchParams.get('groupId');
  const portalOnly = booleanParam(url.searchParams.get('portalOnly'));
  const search = url.searchParams.get('search');

  if (page) qs.set('page', String(parseInt(page, 10) || 1));
  if (pageSize) qs.set('pageSize', String(parseInt(pageSize, 10) || 20));
  if (status) qs.set('status', status);
  if (outletId) qs.set('outletId', outletId);
  if (groupId) qs.set('groupId', groupId);
  if (portalOnly !== undefined) qs.set('portalOnly', portalOnly);
  if (search) qs.set('search', search);

  const path = `/portal/staff${qs.toString() ? `?${qs.toString()}` : ''}`;
  return portalFetch(req, path, { method: 'GET' });
}

export function buildStaffPayload(body: any) {
  const payload: Record<string, any> = {};
  if (body?.login !== undefined) payload.login = body.login == null ? null : String(body.login);
  if (body?.email !== undefined) payload.email = body.email == null ? null : String(body.email);
  if (body?.phone !== undefined) payload.phone = body.phone == null ? null : String(body.phone);
  if (body?.firstName !== undefined) payload.firstName = body.firstName == null ? null : String(body.firstName);
  if (body?.lastName !== undefined) payload.lastName = body.lastName == null ? null : String(body.lastName);
  if (body?.position !== undefined) payload.position = body.position == null ? null : String(body.position);
  if (body?.comment !== undefined) payload.comment = body.comment == null ? null : String(body.comment);
  if (body?.role !== undefined) payload.role = body.role == null ? null : String(body.role);
  if (body?.status !== undefined) payload.status = body.status == null ? null : String(body.status);
  if (body?.canAccessPortal !== undefined) payload.canAccessPortal = !!body.canAccessPortal;
  if (body?.portalAccessEnabled !== undefined) payload.portalAccessEnabled = !!body.portalAccessEnabled;
  if (body?.pinStrategy !== undefined) payload.pinStrategy = body.pinStrategy == null ? undefined : String(body.pinStrategy);
  if (Array.isArray(body?.outletIds)) {
    payload.outletIds = body.outletIds.map((id: any) => String(id)).filter((id: string) => id.length > 0);
  }
  if (Array.isArray(body?.accessGroupIds)) {
    payload.accessGroupIds = body.accessGroupIds.map((id: any) => String(id)).filter((id: string) => id.length > 0);
  }
  return payload;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const payload = buildStaffPayload(body);
  return portalFetch(req, '/portal/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
