import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({} as any));
  return portalFetch(req, `/portal/promocodes/deactivate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      promoCodeId: body?.promoCodeId ? String(body.promoCodeId) : undefined,
      code: body?.code ? String(body.code) : undefined,
    })
  });
}
