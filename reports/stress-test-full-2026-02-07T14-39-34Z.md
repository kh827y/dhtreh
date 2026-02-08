# Full Project Stress Test Report

- Generated at: 2026-02-07T14:39:34.547Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 163280.69 ms
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
- Requests: 1200
- Concurrency: 60
- Throughput: 330.93 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 165.09 / 295.4 / 790.07 ms (max p95 500 ms)
- Preflight available: 12/13

Status breakdown:
- 200: 1200

### Merchant portal proxy routes (`portal_proxy`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 90.9%
- Requests: 1000
- Concurrency: 50
- Throughput: 13.29 rps
- Error rate: 28.00% (max 2.00%)
- p50/p95/p99: 3466.56 / 5030.11 / 5431.55 ms (max p95 700 ms)
- Preflight available: 10/11

Status breakdown:
- 200: 720
- timeout: 280

### Admin proxy routes (`admin_proxy`)

- Required: true
- Passed: false
- Skipped: true
- Coverage: 0.0%
- Requests: 0
- Concurrency: 35
- Throughput: 0 rps
- Error rate: 100.00% (max 3.00%)
- p50/p95/p99: 0 / 0 / 0 ms (max p95 900 ms)
- Preflight available: 0/15

Status breakdown:

### Cashier API session routes (`cashier_api`)

- Required: false
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 400
- Concurrency: 25
- Throughput: 601.89 rps
- Error rate: 41.00% (max 4.00%)
- p50/p95/p99: 21.49 / 120.35 / 256.32 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 236
- 429: 164

### Admin UI pages (`admin_pages`)

- Required: true
- Passed: false
- Skipped: true
- Coverage: 0.0%
- Requests: 0
- Concurrency: 20
- Throughput: 0 rps
- Error rate: 100.00% (max 3.00%)
- p50/p95/p99: 0 / 0 / 0 ms (max p95 1300 ms)
- Preflight available: 0/7

Status breakdown:

### Merchant portal UI pages (`portal_pages`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 85.7%
- Requests: 300
- Concurrency: 25
- Throughput: 7.04 rps
- Error rate: 0.00% (max 3.00%)
- p50/p95/p99: 3344.59 / 4700.31 / 4787.89 ms (max p95 1300 ms)
- Preflight available: 6/7

Status breakdown:
- 200: 300

### Cashier UI pages (`cashier_pages`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 120
- Concurrency: 15
- Throughput: 15.26 rps
- Error rate: 0.00% (max 3.00%)
- p50/p95/p99: 913.85 / 1339.05 / 1384.28 ms (max p95 1300 ms)
- Preflight available: 1/1

Status breakdown:
- 200: 120

### Miniapp UI pages (`miniapp_pages`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 120
- Concurrency: 15
- Throughput: 6.62 rps
- Error rate: 4.17% (max 3.00%)
- p50/p95/p99: 892.6 / 11518.66 / 11543.06 ms (max p95 1300 ms)
- Preflight available: 1/1

Status breakdown:
- 200: 115
- timeout: 5

