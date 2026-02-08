# Full Project Stress Test Report

- Generated at: 2026-02-07T16:27:13.525Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 78050.19 ms
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
- Throughput: 388.53 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 97.52 / 150.42 / 394.13 ms (max p95 500 ms)
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
- Throughput: 14.73 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 896.54 / 1770.41 / 2577.93 ms (max p95 1700 ms)
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
- Throughput: 13.18 rps
- Error rate: 0.00% (max 5.00%)
- p50/p95/p99: 402.94 / 713.6 / 867.21 ms (max p95 2500 ms)
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
- Throughput: 274.56 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 29.98 / 115.79 / 139.11 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 280

