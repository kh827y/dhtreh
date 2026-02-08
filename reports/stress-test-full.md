# Full Project Stress Test Report

- Generated at: 2026-02-07T19:43:50.621Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 80311.49 ms
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
- Throughput: 346.22 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 109.75 / 159.44 / 435.26 ms (max p95 500 ms)
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
- Throughput: 14.12 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 1012.77 / 1503.97 / 1727.97 ms (max p95 2000 ms)
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
- Throughput: 14.75 rps
- Error rate: 0.00% (max 5.00%)
- p50/p95/p99: 385.9 / 561.67 / 682.41 ms (max p95 2500 ms)
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
- Throughput: 167.53 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 45.41 / 172.42 / 239.72 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 280

