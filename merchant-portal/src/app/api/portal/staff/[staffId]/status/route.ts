import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function POST(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  const body = await req.json().catch(() => ({} as any));
  const payload: Record<string, any> = {};
  if (body?.status !== undefined && body.status !== null) {
    payload.status = String(body.status);
  }
  if (!payload.status) {
    return new Response(
      JSON.stringify({ message: 'status is required' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
