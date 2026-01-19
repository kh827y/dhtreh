import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.search || '';
  return portalFetch(req, `/portal/analytics/time/activity${qs}`, {
    method: 'GET',
  });
}
