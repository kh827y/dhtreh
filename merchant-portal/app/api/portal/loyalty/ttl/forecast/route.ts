import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const daysBefore = url.searchParams.get('daysBefore') || undefined;
  const qs = new URLSearchParams();
  if (daysBefore) qs.set('daysBefore', daysBefore);
  const path = '/portal/loyalty/ttl/forecast' + (qs.toString() ? `?${qs.toString()}` : '');
  return portalFetch(req, path, { method: 'GET' });
}
