import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return portalFetch(req, `/portal/access-groups/${encodeURIComponent(id)}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}
