import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../_lib';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ tierId: string }> | { tierId: string } },
) {
  const params = (ctx.params as any) ?? {};
  const resolved = typeof params.then === 'function' ? await params : params;
  const tierId = String(resolved?.tierId || '');
  const search = req.nextUrl.search;
  const suffix = search && search.length ? search : '';
  return portalFetch(
    req,
    `/portal/loyalty/tiers/${encodeURIComponent(tierId)}/customers${suffix}`,
    { method: 'GET' },
  );
}
