import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return portalFetch(req, `/portal/campaigns${qs}`, { method: 'GET' });
}
