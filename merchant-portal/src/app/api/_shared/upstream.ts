import type { NextRequest } from 'next/server';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 1;

const parseTimeout = (value: string | undefined): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(parsed), 1_000), 120_000);
};

const UPSTREAM_TIMEOUT_MS = parseTimeout(
  process.env.PORTAL_UPSTREAM_TIMEOUT_MS,
);

export class UpstreamTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Upstream request timed out after ${timeoutMs}ms`);
    this.name = 'UpstreamTimeoutError';
  }
}

const attachAbortListener = (
  source: AbortSignal | null | undefined,
  onAbort: () => void,
) => {
  if (!source) return () => undefined;
  if (source.aborted) {
    onAbort();
    return () => undefined;
  }
  source.addEventListener('abort', onAbort, { once: true });
  return () => source.removeEventListener('abort', onAbort);
};

type UpstreamRequest = NextRequest | Request;

export function withRequestId(
  headers?: HeadersInit,
  req?: UpstreamRequest | null,
): Headers {
  const out = new Headers(headers ?? {});
  const requestId = req?.headers?.get('x-request-id');
  if (requestId && !out.has('x-request-id')) {
    out.set('x-request-id', requestId);
  }
  return out;
}

export function applyNoStoreHeaders(headers?: HeadersInit): Headers {
  const out = new Headers(headers ?? {});
  out.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  out.set('Pragma', 'no-cache');
  out.set('Expires', '0');
  return out;
}

type UpstreamFetchOptions = RequestInit & {
  req?: UpstreamRequest | null;
  timeoutMs?: number;
  retries?: number;
};

export async function upstreamFetch(
  input: string,
  options?: UpstreamFetchOptions,
): Promise<Response> {
  const init = { ...(options ?? {}) } as RequestInit & {
    req?: UpstreamRequest | null;
    timeoutMs?: number;
    retries?: number;
  };
  const timeoutMs =
    typeof init.timeoutMs === 'number'
      ? Math.min(Math.max(Math.floor(init.timeoutMs), 1_000), 120_000)
      : UPSTREAM_TIMEOUT_MS;
  const method = String(init.method ?? 'GET').toUpperCase();
  const isIdempotentMethod = method === 'GET' || method === 'HEAD';
  const retriesRaw =
    typeof init.retries === 'number' ? init.retries : DEFAULT_RETRIES;
  const retries = Math.max(0, Math.min(Math.floor(retriesRaw), 3));
  const maxAttempts = isIdempotentMethod ? retries + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;

    const onAbort = () => controller.abort();
    const detachInit = attachAbortListener(init.signal, onAbort);
    const detachReq = attachAbortListener(init.req?.signal, onAbort);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const requestInit = { ...init };
      delete (requestInit as UpstreamFetchOptions).req;
      delete (requestInit as UpstreamFetchOptions).timeoutMs;
      delete (requestInit as UpstreamFetchOptions).retries;
      const response = await fetch(input, {
        ...requestInit,
        cache: requestInit.cache ?? 'no-store',
        signal: controller.signal,
      });
      if (
        attempt + 1 < maxAttempts &&
        (response.status === 502 ||
          response.status === 503 ||
          response.status === 504)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      if (timedOut) {
        throw new UpstreamTimeoutError(timeoutMs);
      }
      const canRetry =
        attempt + 1 < maxAttempts &&
        !(error instanceof Error && error.name === 'AbortError');
      if (canRetry) {
        await new Promise((resolve) =>
          setTimeout(resolve, 75 * (attempt + 1)),
        );
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      detachInit();
      detachReq();
    }
  }

  throw new Error('unreachable upstream fetch state');
}
