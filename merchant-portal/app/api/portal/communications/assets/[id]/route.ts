import { NextRequest } from 'next/server';
import { Buffer } from 'node:buffer';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get('portal_jwt')?.value;
  if (!token) return new Response('Unauthorized', { status: 401 });
  if (!API_BASE) {
    return new Response('Server misconfiguration', { status: 500 });
  }
  const res = await fetch(`${API_BASE}/portal/communications/assets/${encodeURIComponent(params.id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const arrayBuffer = await res.arrayBuffer();
  const headers = new Headers();
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  headers.set('Content-Type', contentType);
  const fileName = res.headers.get('x-filename');
  if (fileName) headers.set('X-Filename', fileName);
  return new Response(Buffer.from(arrayBuffer), {
    status: res.status,
    headers,
  });
}
