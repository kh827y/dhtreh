import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({} as any));
  return portalFetch(req, `/portal/promocodes/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: body?.name ? String(body.name) : undefined,
      code: String(body?.code || ''),
      points: Number(body?.points || 0),
      validFrom: body?.validFrom ? String(body.validFrom) : undefined,
      validUntil: body?.validUntil ? String(body.validUntil) : undefined,
    })
  });
}
