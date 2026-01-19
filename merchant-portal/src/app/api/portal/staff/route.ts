import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';
import { booleanParam, buildStaffPayload } from './_lib';

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const payload = buildStaffPayload(body);
  return portalFetch(req, '/portal/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
