import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, `/portal/analytics/rfm-heatmap`, { method: 'GET' });
}
