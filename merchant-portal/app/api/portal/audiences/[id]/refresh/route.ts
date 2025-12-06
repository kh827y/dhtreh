import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return portalFetch(req, `/portal/audiences/${encodeURIComponent(id)}/refresh`, { method: 'POST' });
}
