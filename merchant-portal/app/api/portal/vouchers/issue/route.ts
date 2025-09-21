import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  return portalFetch(req, `/portal/vouchers/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: body?.name ? String(body.name) : undefined,
      valueType: String(body?.valueType || 'PERCENTAGE'),
      value: Number(body?.value || 0),
      code: String(body?.code || ''),
      validFrom: body?.validFrom ? String(body.validFrom) : undefined,
      validUntil: body?.validUntil ? String(body.validUntil) : undefined,
      minPurchaseAmount: body?.minPurchaseAmount != null ? Number(body.minPurchaseAmount) : undefined,
    }),
  });
}
