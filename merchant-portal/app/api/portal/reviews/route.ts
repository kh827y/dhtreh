import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.search ? url.search : '';
  return portalFetch(req, `/portal/reviews${search}`, { method: 'GET' });
}
