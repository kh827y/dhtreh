# Full Project Stress Test Report

- Generated at: 2026-02-07T19:25:35.496Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 145759.27 ms
- Overall pass: NO
- Required failed phases: api_portal_direct, portal_proxy
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
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 1400
- Concurrency: 40
- Throughput: 99.85 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 364.36 / 771.21 / 1007.44 ms (max p95 500 ms)
- Preflight available: 12/12

Status breakdown:
- 200: 1400

### Merchant portal proxy routes (`portal_proxy`)

- Required: true
- Passed: false
- Skipped: false
- Coverage: 100.0%
- Requests: 600
- Concurrency: 15
- Throughput: 6.97 rps
- Error rate: 1.00% (max 2.00%)
- p50/p95/p99: 1132.49 / 5985.67 / 11284.33 ms (max p95 1700 ms)
- Preflight available: 10/10

Status breakdown:
- 200: 594
- 500: 5
- 502: 1

### Admin proxy routes (`admin_proxy`)

- Required: true
- Passed: true
- Skipped: false
- Coverage: 100.0%
- Requests: 300
- Concurrency: 6
- Throughput: 16.45 rps
- Error rate: 0.00% (max 5.00%)
- p50/p95/p99: 358.4 / 396.74 / 508.38 ms (max p95 2500 ms)
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
- Throughput: 367.42 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 20.92 / 75.58 / 118.24 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 280

