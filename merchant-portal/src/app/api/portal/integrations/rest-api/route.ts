import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function GET(req: NextRequest) {
  return portalFetch(req, '/portal/integrations/rest-api', { method: 'GET' });
}

export async function DELETE(req: NextRequest) {
  return portalFetch(req, '/portal/integrations/rest-api', { method: 'DELETE' });
}
