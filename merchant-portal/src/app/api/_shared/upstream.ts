import type { NextRequest } from 'next/server';

const DEFAULT_TIMEOUT_MS = 15_000;

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
};

export async function upstreamFetch(
  input: string,
  options?: UpstreamFetchOptions,
): Promise<Response> {
  const timeoutMs =
    typeof options?.timeoutMs === 'number'
      ? Math.min(Math.max(Math.floor(options.timeoutMs), 1_000), 120_000)
      : UPSTREAM_TIMEOUT_MS;

  const controller = new AbortController();
  let timedOut = false;

  const onAbort = () => controller.abort();
  const detachInit = attachAbortListener(options?.signal, onAbort);
  const detachReq = attachAbortListener(options?.req?.signal, onAbort);
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const init = { ...(options ?? {}) } as RequestInit & {
      req?: UpstreamRequest | null;
      timeoutMs?: number;
    };
    delete init.req;
    delete init.timeoutMs;
    return await fetch(input, {
      ...init,
      cache: init.cache ?? 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new UpstreamTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    detachInit();
    detachReq();
  }
}
