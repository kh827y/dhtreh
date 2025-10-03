import { NextRequest } from 'next/server';
import { portalFetch } from '../../../_lib';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  return portalFetch(req, `/portal/audiences/${encodeURIComponent(id)}/refresh`, { method: 'POST' });
}
