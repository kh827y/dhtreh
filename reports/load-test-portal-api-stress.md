# Portal Load Test Report

- Generated at: 2026-02-06T11:22:55.709Z
- Base URL: http://localhost:3000
- Requests: 2400
- Concurrency: 60
- Throughput: 632.43 rps
- Success: 700
- Failures: 1700
- Error rate: 70.83% (max 2.00%)
- p50/p95/p99: 65.6 / 181.54 / 650.15 ms (max p95 1300 ms)

## Status breakdown

- 200: 700
- 429: 1700

## Endpoint distribution

- /portal/me: 343
- /portal/settings/timezone: 343
- /portal/analytics/dashboard?period=month: 343
- /portal/outlets?status=active&page=1&pageSize=50: 343
- /portal/analytics/operations?period=month: 342
- /portal/staff?page=1&pageSize=50: 343
- /portal/access-groups: 343

## Endpoint status breakdown

- /portal/me::429: 243
- /portal/settings/timezone::429: 243
- /portal/outlets?status=active&page=1&pageSize=50::429: 243
- /portal/staff?page=1&pageSize=50::429: 243
- /portal/access-groups::429: 243
- /portal/analytics/dashboard?period=month::429: 243
- /portal/analytics/operations?period=month::429: 242
- /portal/me::200: 100
- /portal/settings/timezone::200: 100
- /portal/analytics/dashboard?period=month::200: 100
- /portal/outlets?status=active&page=1&pageSize=50::200: 100
- /portal/analytics/operations?period=month::200: 100
- /portal/staff?page=1&pageSize=50::200: 100
- /portal/access-groups::200: 100

