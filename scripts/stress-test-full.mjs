#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

class TimeoutError extends Error {
  constructor(timeoutMs) {
    super(`request timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

function parseIntEnv(name, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(raw, min), max);
}

function parseFloatEnv(name, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const raw = Number.parseFloat(process.env[name] || "");
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(raw, min), max);
}

function normalizeBaseUrl(input, fallback) {
  const value = (input || fallback || "").trim();
  return value.replace(/\/$/, "");
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function shouldCountSuccess(status) {
  return status >= 200 && status < 400;
}

function appendCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function cookieHeader(cookieJar) {
  if (!cookieJar || cookieJar.size === 0) return "";
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function applySetCookie(cookieJar, response) {
  if (!cookieJar) return;
  let items = [];
  if (typeof response.headers.getSetCookie === "function") {
    items = response.headers.getSetCookie();
  } else {
    const raw = response.headers.get("set-cookie");
    if (raw) items = [raw];
  }
  for (const item of items) {
    const firstPart = item.split(";", 1)[0] || "";
    const eq = firstPart.indexOf("=");
    if (eq <= 0) continue;
    const name = firstPart.slice(0, eq).trim();
    const value = firstPart.slice(eq + 1).trim();
    if (!name) continue;
    if (!value) {
      cookieJar.delete(name);
    } else {
      cookieJar.set(name, value);
    }
  }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sendRequest({
  baseUrl,
  endpoint,
  method = "GET",
  headers = {},
  body,
  timeoutMs,
  cookieJar,
}) {
  const url = `${baseUrl}${endpoint}`;
  const requestHeaders = new Headers(headers);
  if (cookieJar && cookieJar.size > 0) {
    requestHeaders.set("cookie", cookieHeader(cookieJar));
  }
  if (!requestHeaders.has("accept")) {
    requestHeaders.set("accept", "application/json, text/plain, */*");
  }
  if (body != null && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }

  const startedAt = performance.now();
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method,
        headers: requestHeaders,
        body,
        redirect: "follow",
      },
      timeoutMs,
    );
    applySetCookie(cookieJar, response);
    await response.arrayBuffer().catch(() => undefined);
    const elapsed = performance.now() - startedAt;
    return {
      ok: shouldCountSuccess(response.status),
      statusKey: String(response.status),
      statusCode: response.status,
      elapsedMs: elapsed,
      error: null,
    };
  } catch (error) {
    const elapsed = performance.now() - startedAt;
    const statusKey =
      error instanceof TimeoutError ? "timeout" : "network_error";
    return {
      ok: false,
      statusKey,
      statusCode: null,
      elapsedMs: elapsed,
      error:
        error instanceof Error ? error.message : String(error ?? "unknown"),
    };
  }
}

async function requestJson({
  baseUrl,
  endpoint,
  method = "GET",
  headers = {},
  body,
  timeoutMs,
  cookieJar,
}) {
  const url = `${baseUrl}${endpoint}`;
  const requestHeaders = new Headers(headers);
  if (cookieJar && cookieJar.size > 0) {
    requestHeaders.set("cookie", cookieHeader(cookieJar));
  }
  if (!requestHeaders.has("accept")) {
    requestHeaders.set("accept", "application/json");
  }
  if (body != null && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }
  const response = await fetchWithTimeout(
    url,
    { method, headers: requestHeaders, body, redirect: "follow" },
    timeoutMs,
  );
  applySetCookie(cookieJar, response);
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { response, text, json: parsed };
}

async function preflightPhase(phase) {
  const availableEndpoints = [];
  const skippedEndpoints = [];
  for (const endpoint of phase.endpoints) {
    const result = await sendRequest({
      baseUrl: phase.baseUrl,
      endpoint,
      method: "GET",
      headers: phase.headers,
      timeoutMs: phase.timeoutMs,
      cookieJar: phase.cookieJar,
    });
    if (result.ok) {
      availableEndpoints.push(endpoint);
    } else {
      skippedEndpoints.push({
        endpoint,
        status: result.statusKey,
        error: result.error,
      });
    }
  }
  return { availableEndpoints, skippedEndpoints };
}

async function runPhase(phase) {
  const preflight = await preflightPhase(phase);
  const totalEndpoints = phase.endpoints.length;
  const availableEndpoints = preflight.availableEndpoints;
  const coverage =
    totalEndpoints > 0 ? availableEndpoints.length / totalEndpoints : 0;

  if (!availableEndpoints.length) {
    return {
      name: phase.name,
      label: phase.label,
      required: phase.required !== false,
      skipped: true,
      reason: "no_available_endpoints_after_preflight",
      coverage: Number(coverage.toFixed(4)),
      preflight,
      totalRequests: 0,
      concurrency: phase.concurrency,
      durationMs: 0,
      throughputRps: 0,
      successCount: 0,
      failureCount: 0,
      errorRate: 1,
      latenciesMs: { p50: 0, p95: 0, p99: 0 },
      statuses: {},
      endpointStatuses: {},
      passed: false,
      thresholds: {
        maxP95Ms: phase.maxP95Ms,
        maxErrorRate: phase.maxErrorRate,
        minCoverage: phase.minCoverage,
      },
    };
  }

  const latencies = [];
  const byStatus = new Map();
  const byEndpointStatus = new Map();
  let successCount = 0;
  let failureCount = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= phase.totalRequests) return;
      const endpoint = availableEndpoints[index % availableEndpoints.length];
      const result = await sendRequest({
        baseUrl: phase.baseUrl,
        endpoint,
        method: "GET",
        headers: phase.headers,
        timeoutMs: phase.timeoutMs,
        cookieJar: phase.cookieJar,
      });
      latencies.push(result.elapsedMs);
      appendCount(byStatus, result.statusKey);
      appendCount(byEndpointStatus, `${endpoint}::${result.statusKey}`);
      if (result.ok) successCount += 1;
      else failureCount += 1;
    }
  }

  const startedAt = performance.now();
  await Promise.all(
    Array.from({ length: phase.concurrency }, () => worker()),
  );
  const durationMs = performance.now() - startedAt;
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const errorRate =
    phase.totalRequests > 0 ? failureCount / phase.totalRequests : 0;
  const throughputRps =
    durationMs > 0 ? (phase.totalRequests * 1000) / durationMs : 0;

  const passed =
    coverage >= phase.minCoverage &&
    p95 <= phase.maxP95Ms &&
    errorRate <= phase.maxErrorRate;

  return {
    name: phase.name,
    label: phase.label,
    required: phase.required !== false,
    skipped: false,
    coverage: Number(coverage.toFixed(4)),
    preflight,
    totalRequests: phase.totalRequests,
    concurrency: phase.concurrency,
    durationMs: Number(durationMs.toFixed(2)),
    throughputRps: Number(throughputRps.toFixed(2)),
    successCount,
    failureCount,
    errorRate: Number(errorRate.toFixed(4)),
    latenciesMs: {
      p50: Number(p50.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      p99: Number(p99.toFixed(2)),
    },
    statuses: Object.fromEntries(byStatus.entries()),
    endpointStatuses: Object.fromEntries(
      Array.from(byEndpointStatus.entries()).sort((a, b) => b[1] - a[1]),
    ),
    passed,
    thresholds: {
      maxP95Ms: phase.maxP95Ms,
      maxErrorRate: phase.maxErrorRate,
      minCoverage: phase.minCoverage,
    },
  };
}

const API_BASE = normalizeBaseUrl(
  process.env.STRESS_API_BASE_URL,
  "http://localhost:3000",
);
const ADMIN_BASE = normalizeBaseUrl(
  process.env.STRESS_ADMIN_BASE_URL,
  "http://localhost:3001",
);
const CASHIER_BASE = normalizeBaseUrl(
  process.env.STRESS_CASHIER_BASE_URL,
  "http://localhost:3002",
);
const MINIAPP_BASE = normalizeBaseUrl(
  process.env.STRESS_MINIAPP_BASE_URL,
  "http://localhost:3003",
);
const PORTAL_BASE = normalizeBaseUrl(
  process.env.STRESS_PORTAL_BASE_URL,
  "http://localhost:3004",
);

let merchantId = (process.env.STRESS_MERCHANT_ID || "").trim();
const adminPassword = process.env.STRESS_ADMIN_PASSWORD || "admin";
const adminKey = process.env.STRESS_ADMIN_KEY || process.env.ADMIN_KEY || "admin123";
const requestTimeoutMs = parseIntEnv(
  "STRESS_REQUEST_TIMEOUT_MS",
  10_000,
  500,
  120_000,
);
const includeUiPhases = String(
  process.env.STRESS_INCLUDE_UI_PHASES || "0",
).toLowerCase() === "1";
const apiPhaseTimeoutMs = parseIntEnv(
  "STRESS_API_TIMEOUT_MS",
  Math.min(requestTimeoutMs, 8_000),
  500,
  120_000,
);
const portalProxyTimeoutMs = parseIntEnv(
  "STRESS_PORTAL_TIMEOUT_MS",
  Math.max(requestTimeoutMs, 12_000),
  500,
  120_000,
);
const adminProxyTimeoutMs = parseIntEnv(
  "STRESS_ADMIN_TIMEOUT_MS",
  Math.max(requestTimeoutMs, 15_000),
  500,
  120_000,
);
const cashierApiTimeoutMs = parseIntEnv(
  "STRESS_CASHIER_TIMEOUT_MS",
  Math.max(requestTimeoutMs, 10_000),
  500,
  120_000,
);

const adminCookies = new Map();
const portalCookies = new Map();
const cashierCookies = new Map();
const warnings = [];
const setup = {
  adminAuth: false,
  portalTokenIssued: false,
  portalSession: false,
  cashierSession: false,
};

const startedAll = performance.now();

const adminLogin = await requestJson({
  baseUrl: ADMIN_BASE,
  endpoint: "/api/auth/login",
  method: "POST",
  body: JSON.stringify({ password: adminPassword }),
  timeoutMs: requestTimeoutMs,
  cookieJar: adminCookies,
});
if (!adminLogin.response.ok) {
  throw new Error(
    `admin login failed: ${adminLogin.response.status} ${adminLogin.text || ""}`.trim(),
  );
}
setup.adminAuth = true;

const merchantsList = await requestJson({
  baseUrl: ADMIN_BASE,
  endpoint: "/api/admin/merchants",
  timeoutMs: requestTimeoutMs,
  cookieJar: adminCookies,
});
if (!merchantsList.response.ok || !Array.isArray(merchantsList.json)) {
  throw new Error(
    `unable to resolve merchant for stress test: ${merchantsList.response.status}`,
  );
}
if (!merchantsList.json.length) {
  throw new Error("no merchants found: cannot run full stress test");
}
if (!merchantId) {
  merchantId = String(merchantsList.json[0]?.id || "").trim();
}
const hasRequestedMerchant = merchantsList.json.some(
  (item) => String(item?.id || "") === merchantId,
);
if (!hasRequestedMerchant) {
  const fallbackMerchantId = String(merchantsList.json[0]?.id || "").trim();
  warnings.push(
    `merchant '${merchantId}' not found, using '${fallbackMerchantId}'`,
  );
  merchantId = fallbackMerchantId;
}

const enablePortalLogin = await requestJson({
  baseUrl: API_BASE,
  endpoint: `/merchants/${encodeURIComponent(merchantId)}/portal/login-enabled`,
  method: "POST",
  headers: {
    "x-admin-key": adminKey,
    "x-admin-action": "ui",
  },
  body: JSON.stringify({ enabled: true }),
  timeoutMs: requestTimeoutMs,
});
if (!enablePortalLogin.response.ok) {
  warnings.push(
    `unable to enforce portal login enabled: ${enablePortalLogin.response.status}`,
  );
}

let portalToken = "";
const impersonateDirect = await requestJson({
  baseUrl: API_BASE,
  endpoint: `/merchants/${encodeURIComponent(merchantId)}/portal/impersonate`,
  method: "POST",
  headers: {
    "x-admin-key": adminKey,
    "x-admin-action": "ui",
  },
  timeoutMs: requestTimeoutMs,
});
if (impersonateDirect.response.ok && impersonateDirect.json?.token) {
  setup.portalTokenIssued = true;
  portalToken = String(impersonateDirect.json.token);
} else {
  const impersonateProxy = await requestJson({
    baseUrl: ADMIN_BASE,
    endpoint: `/api/admin/merchants/${encodeURIComponent(merchantId)}/portal/impersonate`,
    method: "POST",
    headers: { "x-admin-action": "ui" },
    timeoutMs: requestTimeoutMs,
    cookieJar: adminCookies,
  });
  if (!impersonateProxy.response.ok || !impersonateProxy.json?.token) {
    throw new Error(
      `portal impersonate failed: direct=${impersonateDirect.response.status} proxy=${impersonateProxy.response.status}`,
    );
  }
  setup.portalTokenIssued = true;
  portalToken = String(impersonateProxy.json.token);
}

const portalAccept = await requestJson({
  baseUrl: PORTAL_BASE,
  endpoint: "/api/session/accept-token",
  method: "POST",
  body: JSON.stringify({ token: portalToken }),
  timeoutMs: requestTimeoutMs,
  cookieJar: portalCookies,
});
if (!portalAccept.response.ok) {
  throw new Error(
    `portal session accept failed: ${portalAccept.response.status} ${portalAccept.text || ""}`.trim(),
  );
}
setup.portalSession = true;

let cashierOutletId = null;
try {
  const cashierCreds = await requestJson({
    baseUrl: API_BASE,
    endpoint: "/portal/cashier/credentials",
    headers: { authorization: `Bearer ${portalToken}` },
    timeoutMs: requestTimeoutMs,
  });
  const merchantLogin = String(cashierCreds.json?.login || "").trim();
  if (!cashierCreds.response.ok || !merchantLogin) {
    warnings.push("cashier setup skipped: merchant cashier login not configured");
  } else {
    let pinsRes = await requestJson({
      baseUrl: API_BASE,
      endpoint: "/portal/cashier/pins",
      headers: { authorization: `Bearer ${portalToken}` },
      timeoutMs: requestTimeoutMs,
    });
    let pins = Array.isArray(pinsRes.json) ? pinsRes.json : [];

    if (!pins.length) {
      const [staffRes, outletsRes] = await Promise.all([
        requestJson({
          baseUrl: API_BASE,
          endpoint: "/portal/staff?page=1&pageSize=1",
          headers: { authorization: `Bearer ${portalToken}` },
          timeoutMs: requestTimeoutMs,
        }),
        requestJson({
          baseUrl: API_BASE,
          endpoint: "/portal/outlets?status=active&page=1&pageSize=1",
          headers: { authorization: `Bearer ${portalToken}` },
          timeoutMs: requestTimeoutMs,
        }),
      ]);
      const staffItems = Array.isArray(staffRes.json?.items)
        ? staffRes.json.items
        : [];
      const outletItems = Array.isArray(outletsRes.json?.items)
        ? outletsRes.json.items
        : [];
      const staffId = staffItems[0]?.id ? String(staffItems[0].id) : "";
      const outletId = outletItems[0]?.id ? String(outletItems[0].id) : "";
      if (staffId && outletId) {
        await requestJson({
          baseUrl: API_BASE,
          endpoint: `/portal/staff/${encodeURIComponent(staffId)}/access`,
          method: "POST",
          headers: { authorization: `Bearer ${portalToken}` },
          body: JSON.stringify({ outletId }),
          timeoutMs: requestTimeoutMs,
        });
        pinsRes = await requestJson({
          baseUrl: API_BASE,
          endpoint: "/portal/cashier/pins",
          headers: { authorization: `Bearer ${portalToken}` },
          timeoutMs: requestTimeoutMs,
        });
        pins = Array.isArray(pinsRes.json) ? pinsRes.json : [];
      }
    }

    const pinCode = pins[0]?.pinCode ? String(pins[0].pinCode) : "";
    if (!pinCode) {
      warnings.push("cashier setup skipped: no active cashier pin found");
    } else {
      const activation = await requestJson({
        baseUrl: API_BASE,
        endpoint: "/portal/cashier/activation-codes",
        method: "POST",
        headers: { authorization: `Bearer ${portalToken}` },
        body: JSON.stringify({ count: 1 }),
        timeoutMs: requestTimeoutMs,
      });
      const activationCode = Array.isArray(activation.json?.codes)
        ? String(activation.json.codes[0] || "")
        : "";
      if (!activation.response.ok || !activationCode) {
        warnings.push("cashier setup skipped: failed to issue activation code");
      } else {
        const activate = await requestJson({
          baseUrl: API_BASE,
          endpoint: "/loyalty/cashier/activate",
          method: "POST",
          body: JSON.stringify({ merchantLogin, activationCode }),
          timeoutMs: requestTimeoutMs,
          cookieJar: cashierCookies,
        });
        if (!activate.response.ok) {
          warnings.push(
            `cashier setup skipped: activate failed (${activate.response.status})`,
          );
        } else {
          const staffAccess = await requestJson({
            baseUrl: API_BASE,
            endpoint: "/loyalty/cashier/staff-access",
            method: "POST",
            body: JSON.stringify({ merchantLogin, pinCode }),
            timeoutMs: requestTimeoutMs,
            cookieJar: cashierCookies,
          });
          if (!staffAccess.response.ok) {
            warnings.push(
              `cashier setup skipped: staff-access failed (${staffAccess.response.status})`,
            );
          } else {
            const session = await requestJson({
              baseUrl: API_BASE,
              endpoint: "/loyalty/cashier/session",
              method: "POST",
              body: JSON.stringify({ merchantLogin, pinCode }),
              timeoutMs: requestTimeoutMs,
              cookieJar: cashierCookies,
            });
            if (!session.response.ok) {
              warnings.push(
                `cashier setup skipped: session failed (${session.response.status})`,
              );
            } else {
              setup.cashierSession = true;
              cashierOutletId = session.json?.outlet?.id
                ? String(session.json.outlet.id)
                : null;
            }
          }
        }
      }
    }
  }
} catch (error) {
  warnings.push(
    `cashier setup skipped: ${error instanceof Error ? error.message : String(error)}`,
  );
}

const phases = [
  {
    name: "api_portal_direct",
    label: "API direct (portal endpoints)",
    required: true,
    baseUrl: API_BASE,
    headers: { authorization: `Bearer ${portalToken}` },
    cookieJar: null,
    endpoints: [
      "/portal/me",
      "/portal/settings/timezone",
      "/portal/settings/support",
      "/portal/outlets?status=active&page=1&pageSize=50",
      "/portal/staff?page=1&pageSize=50",
      "/portal/access-groups",
      "/portal/analytics/dashboard?period=month",
      "/portal/analytics/operations?period=month",
      "/portal/cashier/credentials",
      "/portal/cashier/pins",
      "/portal/cashier/activation-codes",
      "/portal/cashier/device-sessions",
    ],
    concurrency: parseIntEnv("STRESS_API_CONCURRENCY", 40, 1, 400),
    totalRequests: parseIntEnv("STRESS_API_TOTAL", 1400, 1, 100000),
    timeoutMs: apiPhaseTimeoutMs,
    maxP95Ms: parseIntEnv("STRESS_API_MAX_P95_MS", 500, 1, 120000),
    maxErrorRate: parseFloatEnv("STRESS_API_MAX_ERROR_RATE", 0.02, 0, 1),
    minCoverage: parseFloatEnv("STRESS_API_MIN_COVERAGE", 0.8, 0, 1),
  },
  {
    name: "portal_proxy",
    label: "Merchant portal proxy routes",
    required: true,
    baseUrl: PORTAL_BASE,
    headers: {},
    cookieJar: portalCookies,
    endpoints: [
      "/api/portal/me",
      "/api/portal/setup-status",
      "/api/portal/settings/timezone",
      "/api/portal/settings/support",
      "/api/portal/outlets?status=active&page=1&pageSize=50",
      "/api/portal/staff?page=1&pageSize=50",
      "/api/portal/access-groups",
      "/api/portal/analytics/dashboard?period=month",
      "/api/portal/analytics/operations?period=month",
      "/api/portal/cashier/pins",
    ],
    concurrency: parseIntEnv("STRESS_PORTAL_CONCURRENCY", 15, 1, 400),
    totalRequests: parseIntEnv("STRESS_PORTAL_TOTAL", 600, 1, 100000),
    timeoutMs: portalProxyTimeoutMs,
    maxP95Ms: parseIntEnv("STRESS_PORTAL_MAX_P95_MS", 2000, 1, 120000),
    maxErrorRate: parseFloatEnv("STRESS_PORTAL_MAX_ERROR_RATE", 0.02, 0, 1),
    minCoverage: parseFloatEnv("STRESS_PORTAL_MIN_COVERAGE", 0.8, 0, 1),
  },
  {
    name: "admin_proxy",
    label: "Admin proxy routes",
    required: true,
    baseUrl: ADMIN_BASE,
    headers: {},
    cookieJar: adminCookies,
    endpoints: [
      "/api/admin/observability/summary",
      "/api/admin/merchants",
      `/api/admin/merchants/${encodeURIComponent(merchantId)}/settings`,
      `/api/admin/merchants/${encodeURIComponent(merchantId)}/outlets`,
      `/api/admin/merchants/${encodeURIComponent(merchantId)}/staff?limit=50`,
      `/api/admin/merchants/${encodeURIComponent(merchantId)}/transactions?limit=50`,
      `/api/admin/merchants/${encodeURIComponent(merchantId)}/receipts?limit=50`,
      `/api/admin/merchants/${encodeURIComponent(merchantId)}/outbox?limit=50&status=PENDING`,
      `/api/admin/merchants/${encodeURIComponent(merchantId)}/outbox/stats`,
    ],
    concurrency: parseIntEnv("STRESS_ADMIN_CONCURRENCY", 6, 1, 400),
    totalRequests: parseIntEnv("STRESS_ADMIN_TOTAL", 300, 1, 100000),
    timeoutMs: adminProxyTimeoutMs,
    maxP95Ms: parseIntEnv("STRESS_ADMIN_MAX_P95_MS", 2500, 1, 120000),
    maxErrorRate: parseFloatEnv("STRESS_ADMIN_MAX_ERROR_RATE", 0.05, 0, 1),
    minCoverage: parseFloatEnv("STRESS_ADMIN_MIN_COVERAGE", 0.65, 0, 1),
  },
  {
    name: "cashier_api",
    label: "Cashier API session routes",
    required: false,
    baseUrl: API_BASE,
    headers: {},
    cookieJar: cashierCookies,
    endpoints: [
      "/loyalty/cashier/device",
      "/loyalty/cashier/session",
      `/loyalty/cashier/leaderboard?merchantId=${encodeURIComponent(merchantId)}&limit=20`,
      ...(cashierOutletId
        ? [
            `/loyalty/cashier/outlet-transactions?merchantId=${encodeURIComponent(merchantId)}&outletId=${encodeURIComponent(cashierOutletId)}&limit=20`,
          ]
        : []),
    ],
    concurrency: parseIntEnv("STRESS_CASHIER_CONCURRENCY", 12, 1, 400),
    totalRequests: parseIntEnv("STRESS_CASHIER_TOTAL", 280, 1, 100000),
    timeoutMs: cashierApiTimeoutMs,
    maxP95Ms: parseIntEnv("STRESS_CASHIER_MAX_P95_MS", 700, 1, 120000),
    maxErrorRate: parseFloatEnv("STRESS_CASHIER_MAX_ERROR_RATE", 0.04, 0, 1),
    minCoverage: parseFloatEnv("STRESS_CASHIER_MIN_COVERAGE", 0.5, 0, 1),
  },
  {
    name: "admin_pages",
    label: "Admin UI pages",
    required: false,
    baseUrl: ADMIN_BASE,
    headers: {},
    cookieJar: adminCookies,
    endpoints: [
      "/",
      "/merchants",
      "/outbox",
      "/audit",
      "/observability",
      "/settings",
      "/status",
      "/ttl",
    ],
    concurrency: parseIntEnv("STRESS_ADMIN_PAGES_CONCURRENCY", 4, 1, 400),
    totalRequests: parseIntEnv("STRESS_ADMIN_PAGES_TOTAL", 80, 1, 100000),
    timeoutMs: requestTimeoutMs,
    maxP95Ms: parseIntEnv("STRESS_ADMIN_PAGES_MAX_P95_MS", 1300, 1, 120000),
    maxErrorRate: parseFloatEnv("STRESS_ADMIN_PAGES_MAX_ERROR_RATE", 0.03, 0, 1),
    minCoverage: parseFloatEnv("STRESS_ADMIN_PAGES_MIN_COVERAGE", 0.8, 0, 1),
  },
  {
    name: "portal_pages",
    label: "Merchant portal UI pages",
    required: false,
    baseUrl: PORTAL_BASE,
    headers: {},
    cookieJar: portalCookies,
    endpoints: [
      "/",
      "/operations",
      "/customers",
      "/loyalty/mechanics",
      "/settings/system",
      "/staff",
      "/analytics/time",
    ],
    concurrency: parseIntEnv("STRESS_PORTAL_PAGES_CONCURRENCY", 6, 1, 400),
    totalRequests: parseIntEnv("STRESS_PORTAL_PAGES_TOTAL", 120, 1, 100000),
    timeoutMs: requestTimeoutMs,
    maxP95Ms: parseIntEnv("STRESS_PORTAL_PAGES_MAX_P95_MS", 2500, 1, 120000),
    maxErrorRate: parseFloatEnv("STRESS_PORTAL_PAGES_MAX_ERROR_RATE", 0.03, 0, 1),
    minCoverage: parseFloatEnv("STRESS_PORTAL_PAGES_MIN_COVERAGE", 0.8, 0, 1),
  },
  {
    name: "cashier_pages",
    label: "Cashier UI pages",
    required: false,
    baseUrl: CASHIER_BASE,
    headers: {},
    cookieJar: null,
    endpoints: ["/"],
    concurrency: parseIntEnv("STRESS_CASHIER_PAGES_CONCURRENCY", 8, 1, 400),
    totalRequests: parseIntEnv("STRESS_CASHIER_PAGES_TOTAL", 100, 1, 100000),
    timeoutMs: requestTimeoutMs,
    maxP95Ms: parseIntEnv("STRESS_CASHIER_PAGES_MAX_P95_MS", 2200, 1, 120000),
    maxErrorRate: parseFloatEnv("STRESS_CASHIER_PAGES_MAX_ERROR_RATE", 0.03, 0, 1),
    minCoverage: parseFloatEnv("STRESS_CASHIER_PAGES_MIN_COVERAGE", 1, 0, 1),
  },
  {
    name: "miniapp_pages",
    label: "Miniapp UI pages",
    required: false,
    baseUrl: MINIAPP_BASE,
    headers: {},
    cookieJar: null,
    endpoints: ["/"],
    concurrency: parseIntEnv("STRESS_MINIAPP_PAGES_CONCURRENCY", 8, 1, 400),
    totalRequests: parseIntEnv("STRESS_MINIAPP_PAGES_TOTAL", 100, 1, 100000),
    timeoutMs: requestTimeoutMs,
    maxP95Ms: parseIntEnv("STRESS_MINIAPP_PAGES_MAX_P95_MS", 2500, 1, 120000),
    maxErrorRate: parseFloatEnv("STRESS_MINIAPP_PAGES_MAX_ERROR_RATE", 0.03, 0, 1),
    minCoverage: parseFloatEnv("STRESS_MINIAPP_PAGES_MIN_COVERAGE", 1, 0, 1),
  },
];

if (!setup.cashierSession) {
  phases.find((phase) => phase.name === "cashier_api").required = false;
}

const effectivePhases = includeUiPhases
  ? phases
  : phases.filter((phase) => !phase.name.endsWith("_pages"));

const phaseReports = [];
for (const phase of effectivePhases) {
  const report = await runPhase(phase);
  phaseReports.push(report);
}

const durationMs = performance.now() - startedAll;
const requiredFailed = phaseReports.filter(
  (phase) => phase.required && !phase.passed,
);
const optionalFailed = phaseReports.filter(
  (phase) => !phase.required && !phase.passed,
);

const finalReport = {
  generatedAt: new Date().toISOString(),
  merchantId,
  environment: {
    apiBase: API_BASE,
    adminBase: ADMIN_BASE,
    portalBase: PORTAL_BASE,
    cashierBase: CASHIER_BASE,
    miniappBase: MINIAPP_BASE,
  },
  setup,
  warnings,
  durationMs: Number(durationMs.toFixed(2)),
  passed: requiredFailed.length === 0,
  requiredFailedPhases: requiredFailed.map((phase) => phase.name),
  optionalFailedPhases: optionalFailed.map((phase) => phase.name),
  phases: phaseReports,
};

const reportsDir = resolve(process.cwd(), "reports");
mkdirSync(reportsDir, { recursive: true });
const timestamp = finalReport.generatedAt
  .replace(/[:]/g, "-")
  .replace(/\.\d+Z$/, "Z");
const jsonLatest = resolve(reportsDir, "stress-test-full.json");
const mdLatest = resolve(reportsDir, "stress-test-full.md");
const jsonStamped = resolve(reportsDir, `stress-test-full-${timestamp}.json`);
const mdStamped = resolve(reportsDir, `stress-test-full-${timestamp}.md`);

writeFileSync(jsonLatest, `${JSON.stringify(finalReport, null, 2)}\n`);
writeFileSync(jsonStamped, `${JSON.stringify(finalReport, null, 2)}\n`);

const markdown = [
  "# Full Project Stress Test Report",
  "",
  `- Generated at: ${finalReport.generatedAt}`,
  `- Merchant: ${merchantId}`,
  `- Total duration: ${finalReport.durationMs} ms`,
  `- Overall pass: ${finalReport.passed ? "YES" : "NO"}`,
  `- Required failed phases: ${finalReport.requiredFailedPhases.join(", ") || "none"}`,
  `- Optional failed phases: ${finalReport.optionalFailedPhases.join(", ") || "none"}`,
  "",
  "## Setup",
  "",
  `- Admin auth: ${setup.adminAuth}`,
  `- Portal token issued: ${setup.portalTokenIssued}`,
  `- Portal session accepted: ${setup.portalSession}`,
  `- Cashier session prepared: ${setup.cashierSession}`,
  "",
  "## Warnings",
  "",
  ...(warnings.length ? warnings.map((item) => `- ${item}`) : ["- none"]),
  "",
  "## Phases",
  "",
  ...phaseReports.flatMap((phase) => [
    `### ${phase.label} (\`${phase.name}\`)`,
    "",
    `- Required: ${phase.required}`,
    `- Passed: ${phase.passed}`,
    `- Skipped: ${phase.skipped}`,
    `- Coverage: ${(phase.coverage * 100).toFixed(1)}%`,
    `- Requests: ${phase.totalRequests}`,
    `- Concurrency: ${phase.concurrency}`,
    `- Throughput: ${phase.throughputRps} rps`,
    `- Error rate: ${(phase.errorRate * 100).toFixed(2)}% (max ${(phase.thresholds.maxErrorRate * 100).toFixed(2)}%)`,
    `- p50/p95/p99: ${phase.latenciesMs.p50} / ${phase.latenciesMs.p95} / ${phase.latenciesMs.p99} ms (max p95 ${phase.thresholds.maxP95Ms} ms)`,
    `- Preflight available: ${phase.preflight.availableEndpoints.length}/${phase.preflight.availableEndpoints.length + phase.preflight.skippedEndpoints.length}`,
    "",
    "Status breakdown:",
    ...Object.entries(phase.statuses).map(([status, count]) => `- ${status}: ${count}`),
    "",
  ]),
].join("\n");

writeFileSync(mdLatest, `${markdown}\n`);
writeFileSync(mdStamped, `${markdown}\n`);

console.log(JSON.stringify(finalReport, null, 2));
if (!finalReport.passed) process.exit(1);
