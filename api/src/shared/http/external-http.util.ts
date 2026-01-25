import { logIgnoredError } from '../logging/ignore-error.util';

type LoggerLike = {
  warn?: (message: string) => void;
  debug?: (message: string) => void;
  log?: (message: string) => void;
  error?: (message: string) => void;
};

type MetricsLike = {
  inc: (name: string, labels?: Record<string, string>, value?: number) => void;
};

export type ExternalHttpContext = {
  label: string;
  url?: string;
  method?: string;
  merchantId?: string;
  requestId?: string;
  provider?: string;
  endpoint?: string;
  [key: string]: unknown;
};

export type ExternalRequestResult =
  | 'ok'
  | 'http_error'
  | 'timeout'
  | 'rate_limited'
  | 'error';

export const resultFromStatus = (
  status: number,
  ok: boolean,
): ExternalRequestResult => {
  if (status === 429) return 'rate_limited';
  return ok ? 'ok' : 'http_error';
};

export const isAbortError = (error: unknown): boolean =>
  error instanceof Error &&
  typeof error.name === 'string' &&
  error.name === 'AbortError';

export const classifyExternalError = (error: unknown): ExternalRequestResult => {
  if (isAbortError(error)) return 'timeout';
  const msg =
    error instanceof Error && error.message ? error.message : String(error || '');
  if (msg.toLowerCase().includes('timeout')) return 'timeout';
  return 'error';
};

export const recordExternalRequest = (
  metrics: MetricsLike | undefined,
  context: ExternalHttpContext,
  result: ExternalRequestResult,
  status?: number | null,
) => {
  if (!metrics || !context.provider || !context.endpoint) return;
  metrics.inc('external_requests_total', {
    provider: context.provider,
    endpoint: context.endpoint,
    result,
    status: String(status ?? 0),
  });
};

export const fetchWithTimeout = async (
  url: string,
  init: RequestInit | undefined,
  options: {
    timeoutMs: number;
    context: ExternalHttpContext;
    logger?: LoggerLike;
    allowUnref?: boolean;
    metrics?: MetricsLike;
  },
): Promise<Response> => {
  const { timeoutMs, context, logger, allowUnref = true, metrics } = options;
  const Controller = globalThis.AbortController;
  if (!Controller) return fetch(url, init);
  const controller = new Controller();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (allowUnref && timeout && typeof timeout.unref === 'function') {
    timeout.unref();
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const result = classifyExternalError(error);
    recordExternalRequest(metrics, context, result, null);
    if (result === 'timeout') {
      throw new Error(
        `External request timeout after ${timeoutMs}ms (${context.label})`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const readResponseTextSafe = async (
  res: Response,
  options: {
    context: ExternalHttpContext;
    logger?: LoggerLike;
    fallback?: string;
  },
): Promise<string> => {
  const { context, logger, fallback = 'External API error' } = options;
  try {
    return await res.text();
  } catch (err) {
    logIgnoredError(
      err,
      'ExternalHttp read text',
      logger,
      'debug',
      { ...context, status: res.status },
    );
    return fallback;
  }
};

export const readResponseJsonSafe = async (
  res: Response,
  options: {
    context: ExternalHttpContext;
    logger?: LoggerLike;
  },
): Promise<unknown> => {
  const { context, logger } = options;
  try {
    return await res.json();
  } catch (err) {
    logIgnoredError(
      err,
      'ExternalHttp read json',
      logger,
      'debug',
      { ...context, status: res.status },
    );
    return null;
  }
};
