import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';
import { buildStaffPayload } from '../_lib';

export async function GET(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}`, { method: 'GET' });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  const body = await req.json().catch(() => ({} as any));
  const payload = buildStaffPayload(body);
  return portalFetch(req, `/portal/staff/${encodeURIComponent(staffId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
