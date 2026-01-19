import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const limit = url.searchParams.get('limit') || undefined;
  const offset = url.searchParams.get('offset') || undefined;
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (limit) qs.set('limit', limit);
  if (offset) qs.set('offset', offset);
  const path = '/portal/promocodes' + (qs.toString() ? ('?' + qs.toString()) : '');
  return portalFetch(req, path, { method: 'GET' });
}
