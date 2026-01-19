import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../_lib';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tierId: string }> },
) {
  const { tierId } = await params;
  const search = req.nextUrl.search;
  const suffix = search && search.length ? search : '';
  return portalFetch(
    req,
    `/portal/loyalty/tiers/${encodeURIComponent(tierId)}/customers${suffix}`,
    { method: 'GET' },
  );
}
