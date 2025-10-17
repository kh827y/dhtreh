import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../portal/_lib';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const p: any = context.params as any;
  const { id } = typeof p?.then === 'function' ? await p : p;
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
