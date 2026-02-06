"use client";

import React from "react";
import { CacheTtl, cacheKey, readCache, removeCache, writeCache } from "lib/cache";

const BLOCKED_PREFIXES = [
  "/api/portal/analytics",
  "/api/portal/operations",
  "/api/operations",
  "/api/portal/customers",
  "/api/portal/reviews",
  "/api/portal/cashier",
  "/api/portal/loyalty/ttl/forecast",
];

const TTL_RULES: Array<{ prefix: string; ttl: number }> = [
  // Sticky configuration pages should render last known state instantly.
  { prefix: "/api/portal/settings", ttl: CacheTtl.persistent },
  { prefix: "/api/portal/integrations", ttl: CacheTtl.persistent },
  { prefix: "/api/portal/loyalty/auto-return", ttl: CacheTtl.persistent },
  { prefix: "/api/portal/loyalty/birthday", ttl: CacheTtl.persistent },
  { prefix: "/api/portal/loyalty/registration-bonus", ttl: CacheTtl.persistent },
  { prefix: "/api/portal/loyalty/ttl", ttl: CacheTtl.persistent },
  { prefix: "/api/portal/loyalty/redeem-limits", ttl: CacheTtl.persistent },
  { prefix: "/api/portal/referrals/program", ttl: CacheTtl.persistent },
  { prefix: "/api/portal/catalog", ttl: CacheTtl.medium },
  { prefix: "/api/portal/staff", ttl: CacheTtl.medium },
  { prefix: "/api/portal/outlets", ttl: CacheTtl.medium },
  { prefix: "/api/portal/access-groups", ttl: CacheTtl.medium },
  { prefix: "/api/portal/loyalty", ttl: CacheTtl.medium },
  { prefix: "/api/portal/promocodes", ttl: CacheTtl.medium },
  { prefix: "/api/portal/referrals", ttl: CacheTtl.medium },
  { prefix: "/api/portal/audiences", ttl: CacheTtl.medium },
];

const invalidatePrefixes = [
  "/api/portal/settings",
  "/api/portal/integrations",
  "/api/portal/catalog",
  "/api/portal/staff",
  "/api/portal/outlets",
  "/api/portal/access-groups",
  "/api/portal/loyalty",
  "/api/portal/promocodes",
  "/api/portal/referrals",
  "/api/portal/audiences",
];

const shouldCachePath = (pathname: string) => {
  if (!pathname.startsWith("/api/portal/")) return false;
  return !BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
};

const ttlForPath = (pathname: string) => {
  for (const rule of TTL_RULES) {
    if (pathname.startsWith(rule.prefix)) return rule.ttl;
  }
  return CacheTtl.medium;
};

const toUrl = (input: RequestInfo | URL) => {
  if (typeof input === "string") return new URL(input, window.location.origin);
  if (input instanceof URL) return new URL(input.toString());
  return new URL(input.url, window.location.origin);
};

const cacheKeyForUrl = (url: URL) =>
  cacheKey("GET", `${url.origin}${url.pathname}${url.search}`);

const invalidateByPath = (origin: string, pathname: string) => {
  if (!pathname.startsWith("/api/portal/")) return;
  const prefix = invalidatePrefixes.find((p) => pathname.startsWith(p));
  if (!prefix) return;
  const keyPrefix = cacheKey("GET", `${origin}${prefix}`);
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(keyPrefix)) {
        removeCache(key);
      }
    }
  } catch {
    // ignore
  }
};

export function PortalFetchCacheProvider() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).__portalFetchCacheInstalled) return;
    (window as any).__portalFetchCacheInstalled = true;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      const url = toUrl(input);

      if (method === "GET" && shouldCachePath(url.pathname)) {
        const key = cacheKeyForUrl(url);
        const ttl = ttlForPath(url.pathname);
        const cached = readCache<unknown>(key, ttl);
        if (cached !== null) {
          // background refresh
          void originalFetch(input, init)
            .then(async (res) => {
              if (!res.ok) return;
              const contentType = res.headers.get("content-type") || "";
              if (!contentType.includes("application/json")) return;
              const data = await res.clone().json().catch(() => null);
              if (data !== null) writeCache(key, data);
            })
            .catch(() => undefined);
          return new Response(JSON.stringify(cached), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const res = await originalFetch(input, init);
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await res.clone().json().catch(() => null);
            if (data !== null) writeCache(key, data);
          }
        }
        return res;
      }

      const res = await originalFetch(input, init);
      if (method !== "GET" && res.ok && url.pathname.startsWith("/api/portal/")) {
        invalidateByPath(url.origin, url.pathname);
      }
      return res;
    };
  }, []);

  return null;
}
