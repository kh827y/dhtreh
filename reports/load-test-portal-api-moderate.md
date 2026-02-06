# Portal Load Test Report

- Generated at: 2026-02-06T11:22:37.856Z
- Base URL: http://localhost:3000
- Requests: 700
- Concurrency: 20
- Throughput: 315.8 rps
- Success: 700
- Failures: 0
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 56.42 / 95.02 / 227.59 ms (max p95 1300 ms)

## Status breakdown

- 200: 700

## Endpoint distribution

- /portal/me: 100
- /portal/settings/timezone: 100
- /portal/outlets?status=active&page=1&pageSize=50: 100
- /portal/staff?page=1&pageSize=50: 100
- /portal/access-groups: 100
- /portal/analytics/dashboard?period=month: 100
- /portal/analytics/operations?period=month: 100

## Endpoint status breakdown

- /portal/me::200: 100
- /portal/settings/timezone::200: 100
- /portal/outlets?status=active&page=1&pageSize=50::200: 100
- /portal/staff?page=1&pageSize=50::200: 100
- /portal/access-groups::200: 100
- /portal/analytics/dashboard?period=month::200: 100
- /portal/analytics/operations?period=month::200: 100

