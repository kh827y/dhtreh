import test from 'node:test';
import assert from 'node:assert/strict';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

process.env.NEXT_PUBLIC_API_BASE = 'http://api.local';
process.env.NEXT_PUBLIC_API_TIMEOUT_MS = '3000';

const loadApi = async () => import('../src/lib/api');

test.after(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

test('transactions uses in-flight dedup for identical requests', async () => {
  const api = await loadApi();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        items: [],
        nextBefore: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const [a, b] = await Promise.all([
    api.transactions('m1', 'c1', 20),
    api.transactions('m1', 'c1', 20),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(a, b);
});

test('teleauth sends Authorization header from Telegram initData', async () => {
  const api = await loadApi();
  let auth = '';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers =
      init?.headers instanceof Headers
        ? init.headers
        : new Headers(init?.headers as HeadersInit | undefined);
    auth = headers.get('Authorization') || '';
    return new Response(
      JSON.stringify({
        ok: true,
        customerId: 'cust-1',
        hasPhone: true,
        onboarded: true,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  api.setTelegramAuthInitData('query_id=1&hash=test');
  const res = await api.teleauth('m1', 'query_id=1&hash=test');

  assert.equal(auth, 'tma query_id=1&hash=test');
  assert.equal(res.merchantCustomerId, 'cust-1');
});
