import { NextRequest } from 'next/server';
import { portalFetch } from '../_lib';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.search || '';
  // Проксируем на реальный API /customers и пробрасываем заголовки пагинации
  return portalFetch(req, '/customers' + qs, { method: 'GET' });
}
