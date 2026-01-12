# FIX.md

Этот файл заполняется по мере аудита проекта. Недоработки отсортированы по убыванию важности устранения (сверху — самое критичное для продакшена).

## P0 — Critical (блокеры продакшена)

## P1 — High (высокий риск потерь/абуза/падений)

## P2 — Medium (важно, но не блокирует работу)

## P3 — Low (улучшения/гигиена)

## Карта проекта (что где находится)

- **`api/`** — NestJS API (основная бизнес‑логика, Prisma/PostgreSQL)
  - Entry: `api/src/main.ts`, DI/root: `api/src/app.module.ts`
  - Ключевой контур лояльности: `api/src/loyalty/*` (`quote/commit/refund`, QR, holds, wallets, earn lots, ledger)
  - Админ‑API мерчанта: `api/src/merchants/*` (настройки, staff/outlets, outbox monitor)
  - Портал мерчанта: `api/src/portal/*` (PortalGuard, управление настройками/CRM/каталогом)
  - Интеграции: `api/src/integrations/*` (`IntegrationApiKeyGuard`)
  - БД: `api/prisma/schema.prisma`
  - Воркеры (запускаются в режиме `WORKERS_ENABLED=1`, часто вместе с `NO_HTTP=1`):
    - `api/src/outbox-dispatcher.worker.ts` — доставка вебхуков
    - `api/src/notification-dispatcher.worker.ts` — доставка `notify.*`
    - `api/src/idempotency-gc.worker.ts` — GC идемпотентности
    - прочие воркеры: TTL/burn/earn‑activation и т.д.

- **`admin/`** — Next.js админка (управление мерчантами/мониторинг), проксирование в API через `X-Admin-Key`.

- **`merchant-portal/`** — Next.js портал мерчанта (работает через `PortalGuard`).

- **`cashier/`** — Next.js кассовый интерфейс (работает через `cashier_session`).

- **`miniapp/`** — Telegram mini‑app.

- **`infra/` + compose файлы** — деплой/Traefik/Prometheus/Grafana/бэкапы.
