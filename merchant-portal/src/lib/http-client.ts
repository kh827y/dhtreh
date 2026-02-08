import { readApiError } from "lib/portal-errors";

const DEFAULT_TIMEOUT_MS = 15_000;

export type FetchJsonOptions = RequestInit & {
  timeoutMs?: number;
  withJsonContentType?: boolean;
};

const buildJsonHeaders = (initHeaders?: HeadersInit): HeadersInit => ({
  "content-type": "application/json",
  ...(initHeaders || {}),
});

export async function fetchJson<T = unknown>(
  url: string,
  init?: FetchJsonOptions,
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, Number(init?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  let externalAbort: (() => void) | null = null;
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      externalAbort = () => controller.abort();
      init.signal.addEventListener("abort", externalAbort, { once: true });
    }
  }

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: init?.cache ?? "no-store",
      headers:
        init?.withJsonContentType === false
          ? init?.headers
          : buildJsonHeaders(init?.headers),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(readApiError(text) || text || res.statusText);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json") || ct.includes("+json")) {
      return text ? (JSON.parse(text) as T) : (undefined as T);
    }

    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(trimmed) as T;
    }
    return undefined as T;
  } finally {
    window.clearTimeout(timeoutId);
    if (externalAbort && init?.signal) {
      init.signal.removeEventListener("abort", externalAbort);
    }
  }
}
