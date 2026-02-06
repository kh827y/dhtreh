# Portal Load Test Report

- Generated at: 2026-02-06T12:33:38.489Z
- Base URL: http://localhost:3000
- Requests: 2400
- Concurrency: 60
- Throughput: 443.14 rps
- Success: 2400
- Failures: 0
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 126.96 / 188.47 / 586.39 ms (max p95 1300 ms)

## Status breakdown

- 200: 2400

## Endpoint distribution

- /portal/me: 343
- /portal/settings/timezone: 343
- /portal/outlets?status=active&page=1&pageSize=50: 343
- /portal/analytics/dashboard?period=month: 343
- /portal/analytics/operations?period=month: 342
- /portal/staff?page=1&pageSize=50: 343
- /portal/access-groups: 343

## Endpoint status breakdown

- /portal/me::200: 343
- /portal/settings/timezone::200: 343
- /portal/outlets?status=active&page=1&pageSize=50::200: 343
- /portal/analytics/dashboard?period=month::200: 343
- /portal/staff?page=1&pageSize=50::200: 343
- /portal/access-groups::200: 343
- /portal/analytics/operations?period=month::200: 342

