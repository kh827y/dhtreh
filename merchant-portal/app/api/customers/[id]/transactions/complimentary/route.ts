import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../portal/_lib';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.text();
  return portalFetch(
    req,
    `/portal/customers/${encodeURIComponent(id)}/transactions/complimentary`,
    {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    },
  );
}
