import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

const ALLOWED_QUERY_PARAMS = new Set(['withCommentOnly', 'outletId', 'staffId', 'limit', 'offset']);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (!ALLOWED_QUERY_PARAMS.has(key)) return;
    if (!value || value.trim().length === 0) return;
    params.append(key, value);
  });
  const search = params.toString();
  const path = search ? `/portal/reviews?${search}` : '/portal/reviews';
  return portalFetch(req, path, { method: 'GET' });
}

