#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = (process.env.PORTAL_BASE_URL || "http://localhost:3004").replace(/\/$/, "");
const authHeaderRaw = process.env.PORTAL_AUTH_HEADER || "";
const authToken = process.env.PORTAL_AUTH_TOKEN || "";
const cookieHeader = process.env.PORTAL_COOKIE || "";
const concurrency = Math.max(1, Number.parseInt(process.env.LOAD_CONCURRENCY || "20", 10));
const totalRequests = Math.max(1, Number.parseInt(process.env.LOAD_TOTAL || "500", 10));
const timeoutMs = Math.max(250, Number.parseInt(process.env.LOAD_TIMEOUT_MS || "5000", 10));
const maxP95Ms = Math.max(1, Number.parseInt(process.env.LOAD_MAX_P95_MS || "1200", 10));
const maxErrorRate = Math.max(0, Number.parseFloat(process.env.LOAD_MAX_ERROR_RATE || "0.02"));

const defaultEndpoints = [
  "/api/portal/me",
  "/api/portal/settings/timezone",
  "/api/portal/setup-status",
  "/api/portal/outlets?status=active&page=1&pageSize=50",
  "/api/portal/staff?page=1&pageSize=50",
  "/api/portal/access-groups",
  "/api/portal/analytics/dashboard?period=month",
  "/api/portal/analytics/operations?period=month",
];

const configuredEndpoints = (process.env.LOAD_ENDPOINTS || "")
  .split(",")
  .map((part) => part.trim())
  .filter(Boolean);
const endpoints = configuredEndpoints.length ? configuredEndpoints : defaultEndpoints;

const authHeader = authHeaderRaw || (authToken ? `Bearer ${authToken}` : "");
if (!authHeader && !cookieHeader) {
  console.error("Missing auth: set PORTAL_AUTH_HEADER or PORTAL_AUTH_TOKEN (or PORTAL_COOKIE)");
  process.exit(2);
}

const latencies = [];
const byStatus = new Map();
const byEndpoint = new Map();
const byEndpointStatus = new Map();
let successCount = 0;
let failureCount = 0;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function requestEndpoint(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const headers = {
      accept: "application/json",
      "cache-control": "no-cache",
      pragma: "no-cache",
    };
    if (authHeader) headers.authorization = authHeader;
    if (cookieHeader) headers.cookie = cookieHeader;

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const elapsed = performance.now() - startedAt;
    latencies.push(elapsed);

    const statusKey = String(response.status);
    byStatus.set(statusKey, (byStatus.get(statusKey) || 0) + 1);
    byEndpoint.set(endpoint, (byEndpoint.get(endpoint) || 0) + 1);
    const endpointStatusKey = `${endpoint}::${statusKey}`;
    byEndpointStatus.set(endpointStatusKey, (byEndpointStatus.get(endpointStatusKey) || 0) + 1);
    if (response.ok) {
      successCount += 1;
    } else {
      failureCount += 1;
    }
  } catch {
    const elapsed = performance.now() - startedAt;
    latencies.push(elapsed);
    byStatus.set("network_error", (byStatus.get("network_error") || 0) + 1);
    byEndpoint.set(endpoint, (byEndpoint.get(endpoint) || 0) + 1);
    const endpointStatusKey = `${endpoint}::network_error`;
    byEndpointStatus.set(endpointStatusKey, (byEndpointStatus.get(endpointStatusKey) || 0) + 1);
    failureCount += 1;
  } finally {
    clearTimeout(timer);
  }
}

let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= totalRequests) return;
    const endpoint = endpoints[index % endpoints.length];
    await requestEndpoint(endpoint);
  }
}

const startedAll = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const totalDurationMs = performance.now() - startedAll;

const p50 = percentile(latencies, 50);
const p95 = percentile(latencies, 95);
const p99 = percentile(latencies, 99);
const errorRate = totalRequests > 0 ? failureCount / totalRequests : 0;
const rps = totalDurationMs > 0 ? (totalRequests * 1000) / totalDurationMs : 0;

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  totalRequests,
  concurrency,
  timeoutMs,
  maxP95Ms,
  maxErrorRate,
  durationMs: Number(totalDurationMs.toFixed(2)),
  throughputRps: Number(rps.toFixed(2)),
  successCount,
  failureCount,
  errorRate: Number(errorRate.toFixed(4)),
  latenciesMs: {
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
  },
  statuses: Object.fromEntries(byStatus.entries()),
  endpoints: Object.fromEntries(byEndpoint.entries()),
  endpointStatuses: Object.fromEntries(
    Array.from(byEndpointStatus.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => [key, count]),
  ),
};

const reportsDir = resolve(process.cwd(), "reports");
mkdirSync(reportsDir, { recursive: true });
writeFileSync(resolve(reportsDir, "load-test-portal.json"), `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  "# Portal Load Test Report",
  "",
  `- Generated at: ${report.generatedAt}`,
  `- Base URL: ${baseUrl}`,
  `- Requests: ${totalRequests}`,
  `- Concurrency: ${concurrency}`,
  `- Throughput: ${report.throughputRps} rps`,
  `- Success: ${successCount}`,
  `- Failures: ${failureCount}`,
  `- Error rate: ${(errorRate * 100).toFixed(2)}% (max ${(maxErrorRate * 100).toFixed(2)}%)`,
  `- p50/p95/p99: ${report.latenciesMs.p50} / ${report.latenciesMs.p95} / ${report.latenciesMs.p99} ms (max p95 ${maxP95Ms} ms)`,
  "",
  "## Status breakdown",
  "",
  ...Object.entries(report.statuses).map(([status, count]) => `- ${status}: ${count}`),
  "",
  "## Endpoint distribution",
  "",
  ...Object.entries(report.endpoints).map(([endpoint, count]) => `- ${endpoint}: ${count}`),
  "",
  "## Endpoint status breakdown",
  "",
  ...Object.entries(report.endpointStatuses).map(([key, count]) => `- ${key}: ${count}`),
  "",
].join("\n");
writeFileSync(resolve(reportsDir, "load-test-portal.md"), `${markdown}\n`);

console.log(JSON.stringify(report, null, 2));

if (report.latenciesMs.p95 > maxP95Ms || errorRate > maxErrorRate) {
  process.exit(1);
}
