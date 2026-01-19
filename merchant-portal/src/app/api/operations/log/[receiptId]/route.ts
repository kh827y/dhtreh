import { NextRequest } from 'next/server';
import { portalFetch } from '../../../portal/_lib';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  return portalFetch(_req, `/portal/operations/log/${encodeURIComponent(receiptId)}`, { method: 'GET' });
}
