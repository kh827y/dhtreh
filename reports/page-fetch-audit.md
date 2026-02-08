# Page Fetch Audit

Generated: 2026-02-07T17:35:49.064Z

## Overall

- Total pages: 76
- Total page-level fetch calls: 161
- High risk entries: 17
- Medium risk entries: 11
- Low risk entries: 52
- Potential waterfall entries: 19
- Entries with duplicate literal endpoints: 20

## admin

- Pages: 20
- Page-level fetch calls: 9
- Shared layout fetch calls: 0
- High risk entries: 0
- Potential waterfalls: 1

| Route | File | Fetch | Await Fetch | Promise.all | Risk | Notes |
|---|---|---:|---:|---:|---|---|
| /outbox/event/[id] | admin/src/app/outbox/event/[id]/page.tsx | 3 | 3 | 0 | medium | potential-waterfall |
| /login | admin/src/app/login/page.tsx | 1 | 1 | 0 | low | - |
| /outbox/monitor | admin/src/app/outbox/monitor/page.tsx | 1 | 0 | 1 | low | - |
| /antifraud | admin/src/app/antifraud/page.tsx | 1 | 1 | 0 | low | - |
| /status | admin/src/app/status/page.tsx | 1 | 1 | 0 | low | - |
| /audit/[id] | admin/src/app/audit/[id]/page.tsx | 1 | 1 | 0 | low | - |
| /logout | admin/src/app/logout/page.tsx | 1 | 1 | 0 | low | - |
| /outbox | admin/src/app/outbox/page.tsx | 0 | 0 | 1 | low | - |
| / | admin/src/app/page.tsx | 0 | 0 | 0 | low | - |
| /docs/deployment | admin/src/app/docs/deployment/page.tsx | 0 | 0 | 0 | low | - |
| /exports | admin/src/app/exports/page.tsx | 0 | 0 | 0 | low | - |
| /docs/webhooks | admin/src/app/docs/webhooks/page.tsx | 0 | 0 | 0 | low | - |
| /docs/integration | admin/src/app/docs/integration/page.tsx | 0 | 0 | 0 | low | - |
| /audit | admin/src/app/audit/page.tsx | 0 | 0 | 0 | low | - |
| /settings | admin/src/app/settings/page.tsx | 0 | 0 | 0 | low | - |
| /merchants | admin/src/app/merchants/page.tsx | 0 | 0 | 0 | low | - |
| /docs/miniapp | admin/src/app/docs/miniapp/page.tsx | 0 | 0 | 0 | low | - |
| /observability | admin/src/app/observability/page.tsx | 0 | 0 | 0 | low | - |
| /ttl | admin/src/app/ttl/page.tsx | 0 | 0 | 0 | low | - |
| /docs/observability | admin/src/app/docs/observability/page.tsx | 0 | 0 | 0 | low | - |
| (shared-layout) | admin/src/app/layout.tsx | 0 | 0 | 0 | low | - |

## merchant-portal

- Pages: 54
- Page-level fetch calls: 151
- Shared layout fetch calls: 3
- High risk entries: 17
- Potential waterfalls: 18

| Route | File | Fetch | Await Fetch | Promise.all | Risk | Notes |
|---|---|---:|---:|---:|---|---|
| /reviews | merchant-portal/src/app/reviews/page.tsx | 4 | 4 | 0 | high | potential-waterfall, duplicates:1 |
| /integrations/telegram-mini-app | merchant-portal/src/app/integrations/telegram-mini-app/page.tsx | 4 | 4 | 0 | high | potential-waterfall, duplicates:1 |
| /staff/[staffId] | merchant-portal/src/app/staff/[staffId]/page.tsx | 14 | 12 | 2 | high | duplicates:2 |
| /settings/system | merchant-portal/src/app/settings/system/page.tsx | 10 | 6 | 3 | high | duplicates:4 |
| /loyalty/actions | merchant-portal/src/app/loyalty/actions/page.tsx | 8 | 6 | 2 | high | duplicates:1 |
| /settings/access | merchant-portal/src/app/settings/access/page.tsx | 8 | 5 | 2 | high | duplicates:1 |
| /loyalty/cashier | merchant-portal/src/app/loyalty/cashier/page.tsx | 7 | 7 | 1 | high | duplicates:1 |
| /settings/telegram | merchant-portal/src/app/settings/telegram/page.tsx | 7 | 4 | 1 | high | duplicates:2 |
| /integrations/rest-api | merchant-portal/src/app/integrations/rest-api/page.tsx | 3 | 3 | 0 | high | potential-waterfall, duplicates:1 |
| /loyalty/mechanics/ttl | merchant-portal/src/app/loyalty/mechanics/ttl/page.tsx | 3 | 3 | 0 | high | potential-waterfall, duplicates:1 |
| /outlets/[id] | merchant-portal/src/app/outlets/[id]/page.tsx | 3 | 3 | 0 | high | potential-waterfall, duplicates:1 |
| /loyalty/staff-motivation | merchant-portal/src/app/loyalty/staff-motivation/page.tsx | 2 | 2 | 0 | high | potential-waterfall, duplicates:1 |
| /loyalty/mechanics/bonus-settings | merchant-portal/src/app/loyalty/mechanics/bonus-settings/page.tsx | 2 | 2 | 0 | high | potential-waterfall, duplicates:1 |
| /loyalty/mechanics/auto-return | merchant-portal/src/app/loyalty/mechanics/auto-return/page.tsx | 2 | 2 | 0 | high | potential-waterfall, duplicates:1 |
| /loyalty/mechanics/registration-bonus | merchant-portal/src/app/loyalty/mechanics/registration-bonus/page.tsx | 2 | 2 | 0 | high | potential-waterfall, duplicates:1 |
| /loyalty/antifraud | merchant-portal/src/app/loyalty/antifraud/page.tsx | 2 | 2 | 0 | high | potential-waterfall, duplicates:1 |
| /loyalty/mechanics/birthday | merchant-portal/src/app/loyalty/mechanics/birthday/page.tsx | 2 | 2 | 0 | high | potential-waterfall, duplicates:1 |
| /promocodes | merchant-portal/src/app/promocodes/page.tsx | 5 | 5 | 0 | medium | potential-waterfall |
| /loyalty/actions-earn | merchant-portal/src/app/loyalty/actions-earn/page.tsx | 5 | 5 | 0 | medium | potential-waterfall |
| /staff | merchant-portal/src/app/staff/page.tsx | 5 | 5 | 0 | medium | potential-waterfall |
| /products | merchant-portal/src/app/products/page.tsx | 4 | 4 | 0 | medium | potential-waterfall |
| /categories | merchant-portal/src/app/categories/page.tsx | 5 | 3 | 1 | medium | duplicates:1 |
| /loyalty/mechanics/levels | merchant-portal/src/app/loyalty/mechanics/levels/page.tsx | 5 | 3 | 1 | medium | duplicates:1 |
| /referrals/program | merchant-portal/src/app/referrals/program/page.tsx | 3 | 1 | 1 | medium | duplicates:1 |
| /analytics/referrals | merchant-portal/src/app/analytics/referrals/page.tsx | 3 | 3 | 0 | medium | potential-waterfall |
| /analytics/rfm | merchant-portal/src/app/analytics/rfm/page.tsx | 2 | 2 | 0 | medium | potential-waterfall |
| /customers/import | merchant-portal/src/app/customers/import/page.tsx | 2 | 2 | 0 | medium | potential-waterfall |
| /operations | merchant-portal/src/app/operations/page.tsx | 4 | 4 | 1 | low | - |
| /loyalty/mechanics | merchant-portal/src/app/loyalty/mechanics/page.tsx | 3 | 3 | 1 | low | - |
| (shared-layout) | merchant-portal/src/app/layout.tsx | 3 | 3 | 1 | low | - |
| /analytics/time | merchant-portal/src/app/analytics/time/page.tsx | 2 | 0 | 0 | low | - |
| /analytics/dynamics | merchant-portal/src/app/analytics/dynamics/page.tsx | 2 | 0 | 2 | low | - |
| /analytics/portrait | merchant-portal/src/app/analytics/portrait/page.tsx | 2 | 1 | 0 | low | - |
| /analytics/repeat | merchant-portal/src/app/analytics/repeat/page.tsx | 2 | 0 | 0 | low | - |
| /analytics/staff | merchant-portal/src/app/analytics/staff/page.tsx | 2 | 0 | 0 | low | - |
| /outlets | merchant-portal/src/app/outlets/page.tsx | 2 | 2 | 1 | low | - |
| /login | merchant-portal/src/app/login/page.tsx | 1 | 1 | 0 | low | - |
| /integrations | merchant-portal/src/app/integrations/page.tsx | 1 | 1 | 0 | low | - |
| / | merchant-portal/src/app/page.tsx | 1 | 1 | 0 | low | - |
| /loyalty/telegram | merchant-portal/src/app/loyalty/telegram/page.tsx | 1 | 1 | 1 | low | - |
| /loyalty/push | merchant-portal/src/app/loyalty/push/page.tsx | 1 | 1 | 1 | low | - |
| /analytics | merchant-portal/src/app/analytics/page.tsx | 1 | 1 | 0 | low | - |
| /analytics/outlets | merchant-portal/src/app/analytics/outlets/page.tsx | 1 | 0 | 0 | low | - |
| /audiences | merchant-portal/src/app/audiences/page.tsx | 1 | 1 | 1 | low | - |
| /customers | merchant-portal/src/app/customers/page.tsx | 1 | 1 | 0 | low | - |
| /outlets/new | merchant-portal/src/app/outlets/new/page.tsx | 1 | 1 | 0 | low | - |
| /analytics/birthdays | merchant-portal/src/app/analytics/birthdays/page.tsx | 0 | 0 | 0 | low | - |
| /loyalty | merchant-portal/src/app/loyalty/page.tsx | 0 | 0 | 0 | low | - |
| /settings/staff | merchant-portal/src/app/settings/staff/page.tsx | 0 | 0 | 0 | low | - |
| /settings/integrations | merchant-portal/src/app/settings/integrations/page.tsx | 0 | 0 | 0 | low | - |
| /settings/outlets/new | merchant-portal/src/app/settings/outlets/new/page.tsx | 0 | 0 | 0 | low | - |
| /settings/outlets | merchant-portal/src/app/settings/outlets/page.tsx | 0 | 0 | 0 | low | - |
| /settings/outlets/[id] | merchant-portal/src/app/settings/outlets/[id]/page.tsx | 0 | 0 | 0 | low | - |
| /settings | merchant-portal/src/app/settings/page.tsx | 0 | 0 | 0 | low | - |
| /customers/[customerId] | merchant-portal/src/app/customers/[customerId]/page.tsx | 0 | 0 | 0 | low | - |

## cashier

- Pages: 1
- Page-level fetch calls: 1
- Shared layout fetch calls: 0
- High risk entries: 0
- Potential waterfalls: 0

| Route | File | Fetch | Await Fetch | Promise.all | Risk | Notes |
|---|---|---:|---:|---:|---|---|
| / | cashier/src/app/page.tsx | 1 | 0 | 1 | low | - |
| (shared-layout) | cashier/src/app/layout.tsx | 0 | 0 | 0 | low | - |

## miniapp

- Pages: 1
- Page-level fetch calls: 0
- Shared layout fetch calls: 0
- High risk entries: 0
- Potential waterfalls: 0

| Route | File | Fetch | Await Fetch | Promise.all | Risk | Notes |
|---|---|---:|---:|---:|---|---|
| / | miniapp/src/app/page.tsx | 0 | 0 | 2 | low | - |
| (shared-layout) | miniapp/src/app/layout.tsx | 0 | 0 | 0 | low | - |

