# Full Project Stress Test Report

- Generated at: 2026-02-07T15:11:24.814Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 82535.4 ms
- Overall pass: NO
- Required failed phases: portal_proxy
- Optional failed phases: none

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
- Throughput: 237.5 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 160.92 / 259.65 / 420.34 ms (max p95 500 ms)
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
- Throughput: 17.97 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 1025.42 / 1613.14 / 1961.25 ms (max p95 1500 ms)
- Preflight available: 10/10

Status breakdown:
- 200: 800

### Admin proxy routes (`admin_proxy`)

- Required: true
- Passed: true
- Skipped: false
- Coverage: 100.0%
- Requests: 300
- Concurrency: 6
- Throughput: 15.8 rps
- Error rate: 0.00% (max 5.00%)
- p50/p95/p99: 366.58 / 432.25 / 830.65 ms (max p95 2500 ms)
- Preflight available: 9/9

Status breakdown:
- 200: 300

### Cashier API session routes (`cashier_api`)

- Required: false
- Passed: true
- Skipped: false
- Coverage: 100.0%
- Requests: 280
- Concurrency: 12
- Throughput: 218.71 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 36.17 / 138.32 / 153.21 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 280

