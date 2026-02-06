# Portal Load Test Report

- Generated at: 2026-02-06T11:23:07.219Z
- Base URL: http://localhost:3000
- Requests: 1400
- Concurrency: 30
- Throughput: 964.26 rps
- Success: 0
- Failures: 1400
- Error rate: 100.00% (max 2.00%)
- p50/p95/p99: 24.39 / 51.56 / 222.28 ms (max p95 1300 ms)

## Status breakdown

- 429: 1400

## Endpoint distribution

- /portal/me: 200
- /portal/settings/timezone: 200
- /portal/staff?page=1&pageSize=50: 200
- /portal/access-groups: 200
- /portal/outlets?status=active&page=1&pageSize=50: 200
- /portal/analytics/dashboard?period=month: 200
- /portal/analytics/operations?period=month: 200

## Endpoint status breakdown

- /portal/me::429: 200
- /portal/settings/timezone::429: 200
- /portal/staff?page=1&pageSize=50::429: 200
- /portal/access-groups::429: 200
- /portal/outlets?status=active&page=1&pageSize=50::429: 200
- /portal/analytics/dashboard?period=month::429: 200
- /portal/analytics/operations?period=month::429: 200

