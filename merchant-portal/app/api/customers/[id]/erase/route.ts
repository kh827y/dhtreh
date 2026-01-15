import { NextRequest } from 'next/server';
import { portalFetch } from '../../../portal/_lib';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return portalFetch(req, `/portal/customers/${encodeURIComponent(id)}/erase`, {
    method: 'POST',
  });
}
