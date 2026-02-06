# Portal Load Test Report

- Generated at: 2026-02-06T12:33:20.297Z
- Base URL: http://localhost:3000
- Requests: 700
- Concurrency: 20
- Throughput: 307.99 rps
- Success: 700
- Failures: 0
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 57.16 / 96.68 / 225.75 ms (max p95 1300 ms)

## Status breakdown

- 200: 700

## Endpoint distribution

- /portal/me: 100
- /portal/settings/timezone: 100
- /portal/outlets?status=active&page=1&pageSize=50: 100
- /portal/access-groups: 100
- /portal/staff?page=1&pageSize=50: 100
- /portal/analytics/dashboard?period=month: 100
- /portal/analytics/operations?period=month: 100

## Endpoint status breakdown

- /portal/me::200: 100
- /portal/settings/timezone::200: 100
- /portal/outlets?status=active&page=1&pageSize=50::200: 100
- /portal/access-groups::200: 100
- /portal/staff?page=1&pageSize=50::200: 100
- /portal/analytics/dashboard?period=month::200: 100
- /portal/analytics/operations?period=month::200: 100

