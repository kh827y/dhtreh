# Full Project Stress Test Report

- Generated at: 2026-02-07T19:34:40.525Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 79417.59 ms
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
- Throughput: 221.73 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 170.75 / 284.62 / 470.69 ms (max p95 500 ms)
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
- Throughput: 14.48 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 947 / 1529.11 / 1923.56 ms (max p95 2000 ms)
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
- Throughput: 14.7 rps
- Error rate: 0.00% (max 5.00%)
- p50/p95/p99: 367.76 / 578.95 / 1266.52 ms (max p95 2500 ms)
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
- Throughput: 380.54 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 21.69 / 72.75 / 117.76 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 280

