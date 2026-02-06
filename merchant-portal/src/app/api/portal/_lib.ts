import { NextRequest, NextResponse } from 'next/server';
import {
  applyNoStoreHeaders,
  UpstreamTimeoutError,
  upstreamFetch,
  withRequestId,
} from '../_shared/upstream';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

export async function portalFetch(req: NextRequest, path: string, init?: RequestInit) {
  const access = req.cookies.get('portal_jwt')?.value || '';
  const refresh = req.cookies.get('portal_refresh')?.value || '';
  if (!access) {
    return new Response('Unauthorized', {
      status: 401,
      headers: applyNoStoreHeaders(),
    });
  }
  if (!API_BASE) {
    return new Response('Server misconfiguration: NEXT_PUBLIC_API_BASE is not set', {
      status: 500,
      headers: applyNoStoreHeaders(),
    });
  }
  const doFetch = async (bearer: string) => {
    const headers = withRequestId(
      {
        ...((init?.headers as Record<string, string>) || {}),
        authorization: `Bearer ${bearer}`,
      },
      req,
    );
    return upstreamFetch(API_BASE + path, {
      ...init,
      req,
      headers,
    });
  };

  const buildResponse = async (res: Response) => {
    const text = await res.text();
    const outHeaders = applyNoStoreHeaders({
      'Content-Type': res.headers.get('content-type') || 'application/json',
    });
    const requestId = req.headers.get('x-request-id');
    if (requestId) outHeaders.set('X-Request-Id', requestId);
    const hTotal = res.headers.get('x-total-count');
    if (hTotal) outHeaders.set('X-Total-Count', hTotal);
    const contentRange = res.headers.get('content-range');
    if (contentRange) outHeaders.set('Content-Range', contentRange);
    return { text, outHeaders };
  };

  try {
    let res = await doFetch(access);
    // Try refresh on 401
    if (res.status === 401 && refresh) {
      try {
        const r = await upstreamFetch(API_BASE + '/portal/auth/refresh', {
          method: 'POST',
          req,
          headers: withRequestId({ 'Content-Type': 'application/json' }, req),
          body: JSON.stringify({ refreshToken: refresh }),
        });
        if (r.ok) {
          const data = await r.json().catch(() => ({} as any));
          const nextAccess = String(data?.token || '');
          const nextRefresh = String(data?.refreshToken || '');
          if (nextAccess) {
            res = await doFetch(nextAccess);
            // Build response and set cookies
            const { text, outHeaders } = await buildResponse(res);
            const final = new NextResponse(text, {
              status: res.status,
              headers: outHeaders,
            });
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
    const { text, outHeaders } = await buildResponse(res);
    return new Response(text, { status: res.status, headers: outHeaders });
  } catch (error) {
    if (error instanceof UpstreamTimeoutError) {
      const requestId = req.headers.get('x-request-id') || '';
      const headers = applyNoStoreHeaders({ 'Content-Type': 'application/json' });
      if (requestId) headers.set('X-Request-Id', requestId);
      return new Response(
        JSON.stringify({
          error: 'UpstreamTimeout',
          message: 'Сервис временно не отвечает. Повторите попытку.',
        }),
        { status: 504, headers },
      );
    }
    throw error;
  }
}
