# Full Project Stress Test Report

- Generated at: 2026-02-07T15:12:56.908Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 67085.98 ms
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
- Throughput: 416.19 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 91.58 / 133.56 / 344.26 ms (max p95 500 ms)
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
- Throughput: 17.14 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 835.3 / 1239.91 / 1513.32 ms (max p95 1700 ms)
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
- Throughput: 14.63 rps
- Error rate: 0.00% (max 5.00%)
- p50/p95/p99: 390.81 / 529.25 / 699.05 ms (max p95 2500 ms)
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
- Throughput: 161.07 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 61.26 / 158.62 / 194.96 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 280

