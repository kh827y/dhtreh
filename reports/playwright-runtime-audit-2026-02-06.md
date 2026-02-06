# Playwright Runtime Audit (2026-02-06)

## Scope
- admin: `20` routes
- merchant-portal: `54` routes
- cashier: `1` route
- miniapp: `1` route

## Dynamic route data used
- `merchantId`: `cmkgqtylm0000tawi21ts7099`
- `customerId`: `cmkn4ynzf0001tai6d5olbbm5`
- `outletId`: `cmkgqul1y003ytawiujfamh8j`
- `staffId`: `cmkgqtylt0002tawi985hic26`
- `outboxEventId`: `cmlatjpnq0000tasdndpp66rw`
- `auditId`: `csv`

## Results
1. Admin (`http://localhost:3001`)
- Checked: `20/20`
- Problematic routes: `0`
- Notes:
  - Dynamic route `/outbox/event/[id]` rechecked on real id -> OK.
  - In dev login page observed `401` on `/api/metrics` (expected for protected internal endpoint without metrics token).

2. Merchant Portal (`http://localhost:3004`)
- Checked: `54/54`
- Problematic routes: `0`
- Notes:
  - No runtime `5xx`, no page crashes.
  - Rare transient `ERR_ABORTED` for `/api/operations/log` followed by successful retry (`200`), no functional breakage.

3. Cashier (`http://localhost:3002`)
- Checked: `1/1`
- Result: `200`, no request failures, no page errors.

4. Miniapp (`http://localhost:3003`)
- Checked: `1/1`
- Result: `200`, no request failures, no page errors.

## Conclusion
Runtime route audit is green for all app surfaces in local integrated environment.
