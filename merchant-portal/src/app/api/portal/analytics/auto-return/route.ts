import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.searchParams;
  const params = new URLSearchParams();
  if (qs.has('period')) params.set('period', String(qs.get('period')));
  if (qs.has('from')) params.set('from', String(qs.get('from')));
  if (qs.has('to')) params.set('to', String(qs.get('to')));
  if (qs.has('outletId')) params.set('outletId', String(qs.get('outletId')));
  const path = `/portal/analytics/auto-return${params.toString() ? `?${params.toString()}` : ''}`;
  return portalFetch(req, path, { method: 'GET' });
}
