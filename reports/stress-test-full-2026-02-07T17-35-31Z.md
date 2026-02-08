# Full Project Stress Test Report

- Generated at: 2026-02-07T17:35:31.621Z
- Merchant: cmkgqtylm0000tawi21ts7099
- Total duration: 90300.96 ms
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
- Throughput: 286.04 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 124.6 / 236.68 / 410.78 ms (max p95 500 ms)
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
- Throughput: 12.79 rps
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 1101.01 / 1659.24 / 2888.89 ms (max p95 1700 ms)
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
- Throughput: 11.95 rps
- Error rate: 0.00% (max 5.00%)
- p50/p95/p99: 480.32 / 742.92 / 846.74 ms (max p95 2500 ms)
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
- Throughput: 168.9 rps
- Error rate: 0.00% (max 4.00%)
- p50/p95/p99: 47.3 / 158.02 / 194.29 ms (max p95 700 ms)
- Preflight available: 4/4

Status breakdown:
- 200: 280

