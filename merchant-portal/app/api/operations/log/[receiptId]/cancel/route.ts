import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../portal/_lib';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ receiptId: string }> | { receiptId: string } },
) {
  const p: any = context.params as any;
  const { receiptId } = typeof p?.then === 'function' ? await p : p;
  return portalFetch(
    req,
    `/portal/operations/log/${encodeURIComponent(receiptId)}/cancel`,
    { method: 'POST' },
  );
}
