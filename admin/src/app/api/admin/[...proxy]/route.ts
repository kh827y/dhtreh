import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

// Deprecated legacy proxy. Use /app/api/admin/[...path]/route.ts instead.
async function deprecated(_req: NextRequest): Promise<Response> {
  return new Response('Deprecated route. Use /api/admin/[...path] (server-side proxy with session).', { status: 410 });
}

export { deprecated as GET, deprecated as POST, deprecated as PUT, deprecated as DELETE, deprecated as PATCH };
