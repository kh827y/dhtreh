# Full Project Stress Test Report

- Generated at: 2026-02-07T16:48:12.414Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 78561.78 ms
- Overall pass: YES
- Required failed phases: none
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
- Throughput: 351.21 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 107.84 / 159.86 / 398.29 ms (max p95 500 ms)
- Preflight available: 12/12

Status breakdown:
- 200: 1400

### Merchant portal proxy routes (`portal_proxy`)

- Required: true
- Passed: true
- Skipped: false
- Coverage: 100.0%
- Requests: 600
- Concurrency: 15
- Throughput: 15.01 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 909.42 / 1376.28 / 2381.65 ms (max p95 1700 ms)
- Preflight available: 10/10

Status breakdown:
- 200: 600

### Admin proxy routes (`admin_proxy`)

- Required: true
- Passed: true
- Skipped: false
- Coverage: 100.0%
- Requests: 300
- Concurrency: 6
- Throughput: 12.47 rps
- Error rate: 0.00% (max 5.00%)
- p50/p95/p99: 437.3 / 685.96 / 1196.31 ms (max p95 2500 ms)
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
- Throughput: 381.81 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 24.13 / 66.82 / 113.39 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 280

