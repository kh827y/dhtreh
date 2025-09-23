import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/staff', { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const payload: Record<string, any> = {};
  if (body?.login !== undefined) payload.login = body.login == null ? null : String(body.login);
  if (body?.email !== undefined) payload.email = body.email == null ? null : String(body.email);
  if (body?.role !== undefined) payload.role = body.role == null ? null : String(body.role);
  if (body?.firstName !== undefined) payload.firstName = body.firstName == null ? null : String(body.firstName);
  if (body?.lastName !== undefined) payload.lastName = body.lastName == null ? null : String(body.lastName);
  if (body?.position !== undefined) payload.position = body.position == null ? null : String(body.position);
  if (body?.phone !== undefined) payload.phone = body.phone == null ? null : String(body.phone);
  if (body?.comment !== undefined) payload.comment = body.comment == null ? null : String(body.comment);
  if (body?.avatarUrl !== undefined) payload.avatarUrl = body.avatarUrl == null ? null : String(body.avatarUrl);
  if (body?.canAccessPortal !== undefined) payload.canAccessPortal = !!body.canAccessPortal;
  if (body?.password !== undefined && body.password != null) payload.password = String(body.password);
  return portalFetch(req, '/portal/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
