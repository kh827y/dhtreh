import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { upstreamFetch } from "../src/app/api/_shared/upstream";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("upstreamFetch retries idempotent GET on transient network error", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      throw new TypeError("socket hang up");
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const response = await upstreamFetch("http://localhost:3000/portal/me");
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("upstreamFetch does not retry non-idempotent POST", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError("connection reset");
  }) as typeof fetch;

  await assert.rejects(
    () =>
      upstreamFetch("http://localhost:3000/portal/me", {
        method: "POST",
        body: JSON.stringify({ test: true }),
      }),
    /connection reset/,
  );
  assert.equal(calls, 1);
});

test("upstreamFetch retries GET on upstream 502/503/504 statuses", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("bad gateway", { status: 502 });
    }
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  const response = await upstreamFetch("http://localhost:3000/portal/me");
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});
