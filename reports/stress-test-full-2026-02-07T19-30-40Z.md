# Full Project Stress Test Report

- Generated at: 2026-02-07T19:30:40.036Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 77671.1 ms
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
- Throughput: 368.91 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 104.83 / 146.67 / 371.38 ms (max p95 500 ms)
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
- Throughput: 13.1 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 1078.9 / 1860.66 / 2026.89 ms (max p95 1700 ms)
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
- Throughput: 15.87 rps
- Error rate: 0.00% (max 5.00%)
- p50/p95/p99: 366.13 / 467.73 / 482.7 ms (max p95 2500 ms)
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
- Throughput: 100.36 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 82.09 / 298.22 / 409.6 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 280

