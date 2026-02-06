import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

process.env.API_BASE = 'http://upstream.local';
process.env.ADMIN_KEY = 'test-admin-key';
process.env.ADMIN_PROXY_TIMEOUT_MS = '25';
delete process.env.ADMIN_UI_PASSWORD;
delete process.env.ADMIN_SESSION_SECRET;

const loadGet = async () => {
  const routeModule = await import('../src/app/api/admin/[...path]/route');
  return routeModule.GET as (
    req: NextRequest,
    ctx: { params: { path: string[] } },
  ) => Promise<Response>;
};

const makeRequest = (url: string) =>
  new NextRequest(url, {
    method: 'GET',
    headers: { 'x-forwarded-for': '127.0.0.1' },
  });

test.after(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

test('admin proxy returns 504 on upstream timeout', async () => {
  const GET = await loadGet();
  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
    return new Promise((_, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
    });
  }) as typeof fetch;

  const res = await GET(makeRequest('http://localhost/api/admin/healthz'), {
    params: { path: ['healthz'] },
  });
  const text = await res.text();

  assert.equal(res.status, 504);
  assert.match(text, /Upstream timeout/i);
});

test('admin proxy forwards request and injects x-admin-key header', async () => {
  const GET = await loadGet();
  let seenAdminKey = '';
  let seenTarget = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seenTarget = String(input);
    const headers =
      init?.headers instanceof Headers
        ? init.headers
        : new Headers(init?.headers as HeadersInit | undefined);
    seenAdminKey = headers.get('x-admin-key') || '';
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const res = await GET(makeRequest('http://localhost/api/admin/status'), {
    params: { path: ['status'] },
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(seenTarget, 'http://upstream.local/status');
  assert.equal(seenAdminKey, 'test-admin-key');
  assert.deepEqual(body, { ok: true });
});
