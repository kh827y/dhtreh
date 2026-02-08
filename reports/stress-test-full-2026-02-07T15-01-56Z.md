# Full Project Stress Test Report

- Generated at: 2026-02-07T15:01:56.000Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 728329.83 ms
- Overall pass: NO
- Required failed phases: portal_proxy, admin_proxy
- Optional failed phases: admin_pages, portal_pages, cashier_pages, miniapp_pages

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
- Coverage: 100.0%
- Requests: 1400
- Concurrency: 40
- Throughput: 431.55 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 88.88 / 117.97 / 395.44 ms (max p95 500 ms)
- Preflight available: 12/12

Status breakdown:
- 200: 1400

### Merchant portal proxy routes (`portal_proxy`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 800
- Concurrency: 20
- Throughput: 19.12 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 990.04 / 1328.19 / 1459.16 ms (max p95 1300 ms)
- Preflight available: 10/10

Status breakdown:
- 200: 800

### Admin proxy routes (`admin_proxy`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 600
- Concurrency: 15
- Throughput: 8.17 rps
- Error rate: 10.17% (max 3.00%)
- p50/p95/p99: 651.73 / 8400.53 / 9662.57 ms (max p95 900 ms)
- Preflight available: 9/9

Status breakdown:
- 200: 539
- timeout: 61

### Cashier API session routes (`cashier_api`)

- Required: false
- Passed: true
- Skipped: false
- Coverage: 75.0%
- Requests: 280
- Concurrency: 12
- Throughput: 105.19 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 44.13 / 175.67 / 1553.51 ms (max p95 700 ms)
- Preflight available: 3/4

Status breakdown:
- 200: 280

### Admin UI pages (`admin_pages`)

- Required: false
- Passed: false
- Skipped: true
- Coverage: 0.0%
- Requests: 0
- Concurrency: 4
- Throughput: 0 rps
- Error rate: 100.00% (max 3.00%)
- p50/p95/p99: 0 / 0 / 0 ms (max p95 1300 ms)
- Preflight available: 0/8

Status breakdown:

### Merchant portal UI pages (`portal_pages`)

- Required: false
- Passed: false
- Skipped: true
- Coverage: 0.0%
- Requests: 0
- Concurrency: 6
- Throughput: 0 rps
- Error rate: 100.00% (max 3.00%)
- p50/p95/p99: 0 / 0 / 0 ms (max p95 2500 ms)
- Preflight available: 0/7

Status breakdown:

### Cashier UI pages (`cashier_pages`)

- Required: false
- Passed: false
- Skipped: true
- Coverage: 0.0%
- Requests: 0
- Concurrency: 8
- Throughput: 0 rps
- Error rate: 100.00% (max 3.00%)
- p50/p95/p99: 0 / 0 / 0 ms (max p95 2200 ms)
- Preflight available: 0/1

Status breakdown:

### Miniapp UI pages (`miniapp_pages`)

- Required: false
- Passed: false
- Skipped: true
- Coverage: 0.0%
- Requests: 0
- Concurrency: 8
- Throughput: 0 rps
- Error rate: 100.00% (max 3.00%)
- p50/p95/p99: 0 / 0 / 0 ms (max p95 2500 ms)
- Preflight available: 0/1

Status breakdown:

