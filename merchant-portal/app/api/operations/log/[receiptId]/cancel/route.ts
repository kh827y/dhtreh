import { NextRequest } from 'next/server';
import { portalFetch } from '../../../../portal/_lib';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await params;
  return portalFetch(
    req,
    `/portal/operations/log/${encodeURIComponent(receiptId)}/cancel`,
    { method: 'POST' },
  );
}
