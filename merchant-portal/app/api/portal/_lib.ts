import { NextRequest, NextResponse } from 'next/server';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

export async function portalFetch(req: NextRequest, path: string, init?: RequestInit) {
  const access = req.cookies.get('portal_jwt')?.value || '';
  const refresh = req.cookies.get('portal_refresh')?.value || '';
  if (!access) return new Response('Unauthorized', { status: 401 });
  if (!API_BASE) {
    return new Response('Server misconfiguration: NEXT_PUBLIC_API_BASE is not set', { status: 500 });
  }
  const doFetch = async (bearer: string) => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${bearer}`,
      ...((init?.headers as Record<string, string>) || {}),
    };
    return fetch(API_BASE + path, { ...init, headers });
  };

  let res = await doFetch(access);
  // Try refresh on 401
  if (res.status === 401 && refresh) {
    try {
      const r = await fetch(API_BASE + '/portal/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (r.ok) {
        const data = await r.json().catch(() => ({} as any));
        const nextAccess = String(data?.token || '');
        const nextRefresh = String(data?.refreshToken || '');
        if (nextAccess) {
          res = await doFetch(nextAccess);
          // Build response and set cookies
          const text = await res.text();
          const outHeaders: Record<string, string> = {
            'Content-Type': res.headers.get('content-type') || 'application/json',
          };
          const hTotal = res.headers.get('x-total-count');
          if (hTotal) outHeaders['X-Total-Count'] = hTotal;
          const contentRange = res.headers.get('content-range');
          if (contentRange) outHeaders['Content-Range'] = contentRange;
          const final = new NextResponse(text, { status: res.status, headers: outHeaders });
          const secure = process.env.NODE_ENV === 'production';
          final.cookies.set({ name: 'portal_jwt', value: nextAccess, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 24 * 60 * 60 });
          if (nextRefresh) {
            final.cookies.set({ name: 'portal_refresh', value: nextRefresh, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 24 * 60 * 60 });
          }
          return final;
        }
      }
    } catch {}
  }

  // Default pass-through
  const text = await res.text();
  const outHeaders: Record<string, string> = {
    'Content-Type': res.headers.get('content-type') || 'application/json',
  };
  const hTotal = res.headers.get('x-total-count');
  if (hTotal) outHeaders['X-Total-Count'] = hTotal;
  const contentRange = res.headers.get('content-range');
  if (contentRange) outHeaders['Content-Range'] = contentRange;
  return new Response(text, { status: res.status, headers: outHeaders });
}
