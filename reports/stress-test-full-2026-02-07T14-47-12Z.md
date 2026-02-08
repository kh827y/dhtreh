# Full Project Stress Test Report

- Generated at: 2026-02-07T14:47:12.277Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 220371.32 ms
- Overall pass: NO
- Required failed phases: portal_proxy, admin_proxy, admin_pages, portal_pages, cashier_pages, miniapp_pages
- Optional failed phases: cashier_api

## Setup

- Admin auth: true
- Portal token issued: true
- Portal session accepted: true
- Cashier session prepared: true

## Warnings

- none

## Phases

### API direct (portal endpoints) (`api_portal_direct`)

- Required: true
- Passed: true
- Skipped: false
- Coverage: 92.3%
- Requests: 1400
- Concurrency: 40
- Throughput: 447.24 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 85.7 / 114.11 / 358.22 ms (max p95 500 ms)
- Preflight available: 12/13

Status breakdown:
- 200: 1400

### Merchant portal proxy routes (`portal_proxy`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 90.9%
- Requests: 800
- Concurrency: 20
- Throughput: 19.71 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 962.78 / 1201.15 / 2267.92 ms (max p95 700 ms)
- Preflight available: 10/11

Status breakdown:
- 200: 800

### Admin proxy routes (`admin_proxy`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 60.0%
- Requests: 600
- Concurrency: 15
- Throughput: 19.13 rps
- Error rate: 2.50% (max 3.00%)
- p50/p95/p99: 566.47 / 1146.74 / 6086.33 ms (max p95 900 ms)
- Preflight available: 9/15

Status breakdown:
- 200: 585
- 504: 15

### Cashier API session routes (`cashier_api`)

- Required: false
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 280
- Concurrency: 12
- Throughput: 386.54 rps
- Error rate: 15.71% (max 4.00%)
- p50/p95/p99: 20.63 / 81.52 / 120 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 236
- 429: 44

### Admin UI pages (`admin_pages`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 71.4%
- Requests: 160
- Concurrency: 8
- Throughput: 2.22 rps
- Error rate: 33.12% (max 3.00%)
- p50/p95/p99: 573.9 / 8600.28 / 12460.26 ms (max p95 1300 ms)
- Preflight available: 5/7

Status breakdown:
- 200: 107
- timeout: 48
- network_error: 5

### Merchant portal UI pages (`portal_pages`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 85.7%
- Requests: 200
- Concurrency: 10
- Throughput: 6.25 rps
- Error rate: 0.00% (max 3.00%)
- p50/p95/p99: 1568.26 / 2011.32 / 2368.38 ms (max p95 1300 ms)
- Preflight available: 6/7

Status breakdown:
- 200: 200

### Cashier UI pages (`cashier_pages`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 100
- Concurrency: 8
- Throughput: 14.38 rps
- Error rate: 0.00% (max 3.00%)
- p50/p95/p99: 435.06 / 1731.07 / 1763.74 ms (max p95 1300 ms)
- Preflight available: 1/1

Status breakdown:
- 200: 100

### Miniapp UI pages (`miniapp_pages`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 100
- Concurrency: 8
- Throughput: 13.83 rps
- Error rate: 0.00% (max 3.00%)
- p50/p95/p99: 405.31 / 2180.79 / 2192.64 ms (max p95 1300 ms)
- Preflight available: 1/1

Status breakdown:
- 200: 100

