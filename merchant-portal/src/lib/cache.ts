const DEFAULT_TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = {
  ts: number;
  value: T;
};

const isBrowser = () => typeof window !== "undefined";

export const cacheKey = (...parts: Array<string | number | null | undefined>) =>
  ["mp-cache", ...parts.filter((part) => part !== null && part !== undefined)].join(":");

function normalizeApiSearch(search: string): string {
  if (!search) return "";
  return search.startsWith("?") ? search : `?${search}`;
}

export function portalApiCacheKey(pathname: string, search = ""): string | null {
  if (!isBrowser()) return null;
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const normalizedSearch = normalizeApiSearch(search);
  const absolute = `${window.location.origin}${normalizedPath}${normalizedSearch}`;
  return cacheKey("GET", absolute);
}

export function readPortalApiCache<T>(
  pathname: string,
  options?: { search?: string; ttlMs?: number },
): T | null {
  const key = portalApiCacheKey(pathname, options?.search || "");
  if (!key) return null;
  const ttlMs = options?.ttlMs ?? 0;
  return readCache<T>(key, ttlMs);
}

export function readCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.ts !== "number") return null;
    if (ttlMs > 0 && Date.now() - parsed.ts > ttlMs) return null;
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    const entry: CacheEntry<T> = { ts: Date.now(), value };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore storage errors (quota / private mode)
  }
}

export function removeCache(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const CacheTtl = {
  persistent: 0,
  short: 60 * 1000,
  medium: 5 * 60 * 1000,
  long: 30 * 60 * 1000,
} as const;
