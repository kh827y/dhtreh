import { NextRequest, NextResponse } from 'next/server';
import { getSession, requireSession } from '../../_lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const unauth = requireSession(req);
  if (unauth) return unauth;
  const sess = getSession(req);
  return NextResponse.json({ role: sess?.role || 'UNKNOWN' });
}

