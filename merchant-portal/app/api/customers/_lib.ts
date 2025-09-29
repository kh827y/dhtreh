import { NextRequest } from 'next/server';

const CUSTOMERS_API_BASE = (process.env.CUSTOMERS_API_BASE || 'http://localhost:3004').replace(/\/$/, '');

export async function customersFetch(path: string, init?: RequestInit) {
  const res = await fetch(CUSTOMERS_API_BASE + path, {
    ...init,
    headers: {
      'accept': 'application/json, text/plain;q=0.9, */*;q=0.8',
      'content-type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
    // next: { revalidate: 0 }, // always fresh
  });
  const text = await res.text();
  const ct = res.headers.get('content-type') || 'text/plain; charset=utf-8';
  return new Response(text, {
    status: res.status,
    headers: { 'content-type': ct },
  });
}

export async function readJson<T = any>(req: NextRequest): Promise<T> {
  const text = await req.text();
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {} as T;
  }
}
