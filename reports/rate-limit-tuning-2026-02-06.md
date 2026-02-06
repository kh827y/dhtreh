# Rate Limit Tuning Report (2026-02-06)

## Цель
Снизить ложные `429` для типичного профиля 100-300 офлайн-мерчантов с пиковыми UI-бёрстами в merchant portal.

## Внесенные изменения
- `api/src/core/guards/custom-throttler.guard.ts`
  - добавлен отдельный профиль лимитов для `/portal/*`:
    - read: `RL_LIMIT_PORTAL_READ` (default `600`/мин)
    - write: `RL_LIMIT_PORTAL_WRITE` (default `180`/мин)
    - analytics read: `RL_LIMIT_PORTAL_ANALYTICS_READ` (default `900`/мин)
    - operations read: `RL_LIMIT_PORTAL_OPERATIONS_READ` (default `900`/мин)
  - для `RL_MERCHANT_MULTIPLIERS` теперь учитывается `portalMerchantId`.
- `api/src/app/app.module.ts`
  - базовый throttler (`default`) сделан конфигурируемым:
    - `THROTTLER_DEFAULT_TTL_MS` (default `60000`)
    - `THROTTLER_DEFAULT_LIMIT` (default `200`)
- env examples обновлены:
  - `.env.production.example`
  - `infra/env-examples/api.env.example`

## Нагрузочная проверка (API напрямую)
Endpoint profile:
`/portal/me`, `/portal/settings/timezone`, `/portal/outlets`, `/portal/staff`, `/portal/access-groups`, `/portal/analytics/dashboard`, `/portal/analytics/operations`

1. Moderate (`concurrency=20`, `total=700`)
- errorRate: `0`
- p95: `96.68ms`
- p99: `225.75ms`
- statuses: `200=700`

2. Stress (`concurrency=60`, `total=2400`)
- errorRate: `0`
- p95: `188.47ms`
- p99: `586.39ms`
- statuses: `200=2400`

Артефакты:
- `reports/load-test-portal-api-moderate-after-tune.json`
- `reports/load-test-portal-api-stress-after-tune.json`

## Вывод
Для целевого SMB-профиля (100-300 мерчантов) ложные `429` на portal read-path устранены при сохранении ограничений для write-path.
