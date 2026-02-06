import test from 'node:test';
import assert from 'node:assert/strict';
import { LoyaltyApi } from '../src/index';

test('commit forwards idempotency key header', async () => {
  let seenHeader = '';
  const api = new LoyaltyApi({
    baseUrl: 'http://api.local',
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers =
        init?.headers instanceof Headers
          ? init.headers
          : new Headers(init?.headers as HeadersInit | undefined);
      seenHeader = headers.get('Idempotency-Key') || '';
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch,
  });

  await api.commit(
    { merchantId: 'm1', holdId: 'h1', orderId: 'o1' },
    { idempotencyKey: 'idem-1' },
  );

  assert.equal(seenHeader, 'idem-1');
});

test('teleauth normalizes merchantCustomerId', async () => {
  const api = new LoyaltyApi({
    baseUrl: 'http://api.local',
    fetch: (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          customerId: 'c-1',
          hasPhone: true,
          onboarded: true,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )) as typeof fetch,
  });

  const res = await api.teleauth('m1', 'query_id=1&hash=ok');
  assert.equal(res.merchantCustomerId, 'c-1');
});

test('http throws response body on non-ok response', async () => {
  const api = new LoyaltyApi({
    baseUrl: 'http://api.local',
    fetch: (async () =>
      new Response('bad request', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      })) as typeof fetch,
  });

  await assert.rejects(
    () => api.balance('m1', 'c1'),
    /bad request/,
  );
});
