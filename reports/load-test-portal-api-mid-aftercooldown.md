# Portal Load Test Report

- Generated at: 2026-02-06T11:24:45.933Z
- Base URL: http://localhost:3000
- Requests: 1400
- Concurrency: 30
- Throughput: 402.27 rps
- Success: 1400
- Failures: 0
- Error rate: 0.00% (max 2.00%)
- p50/p95/p99: 69.77 / 107.67 / 254.12 ms (max p95 1300 ms)

## Status breakdown

- 200: 1400

## Endpoint distribution

- /portal/me: 200
- /portal/settings/timezone: 200
- /portal/access-groups: 200
- /portal/outlets?status=active&page=1&pageSize=50: 200
- /portal/staff?page=1&pageSize=50: 200
- /portal/analytics/dashboard?period=month: 200
- /portal/analytics/operations?period=month: 200

## Endpoint status breakdown

- /portal/me::200: 200
- /portal/settings/timezone::200: 200
- /portal/access-groups::200: 200
- /portal/outlets?status=active&page=1&pageSize=50::200: 200
- /portal/staff?page=1&pageSize=50::200: 200
- /portal/analytics/dashboard?period=month::200: 200
- /portal/analytics/operations?period=month::200: 200

