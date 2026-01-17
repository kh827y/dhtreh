# Конфигурация переменных окружения (API)

Этот файл описывает переменные для сервиса `api`.
Примеры:
- `api/.env.example` — локальная разработка
- `infra/env-examples/api.env.example` — база для продакшна
- `.env.production.example` — общая конфигурация compose

## Обязательные

- `DATABASE_URL` — строка подключения Postgres.
- `ADMIN_KEY` — ключ админских API.
- `API_KEY` — ключ для интеграций/служебных эндпоинтов.
- `QR_JWT_SECRET` — секрет для QR токенов (в проде обязателен).
- `ADMIN_SESSION_SECRET` — секрет для сессии админки (в проде обязателен).
- `PORTAL_JWT_SECRET` — секрет access токена портала.
- `PORTAL_REFRESH_SECRET` — секрет refresh токена портала.
- `CORS_ORIGINS` — список origin (в проде обязателен).

## URL/домены

- `API_BASE_URL` — публичный URL API (нужен для Telegram webhooks/интеграций).
- `MINIAPP_BASE_URL` — публичный URL Mini App.

## Безопасность и прокси

- `ADMIN_2FA_SECRET` — TOTP для админских операций (опционально).
- `ADMIN_IP_WHITELIST` — список IP через запятую (опционально).
- `COOKIE_SECURE` — принудительный режим secure cookies (`true/false`).
- `TRUST_PROXY` — если API за reverse proxy (`true/false` или число).

## Redis (опционально)

- `REDIS_URL` — Redis для очередей/лимитов/кеша.

## Workers и фичефлаги

- `WORKERS_ENABLED` — включает фоновые воркеры.
- `NO_HTTP` — запуск только воркеров без HTTP.
- `EARN_LOTS_FEATURE`, `LEDGER_FEATURE`.
- `POINTS_TTL_FEATURE`, `POINTS_TTL_BURN`, `POINTS_TTL_REMINDER`.

Интервалы/батчи:
- `EARN_ACTIVATION_INTERVAL_MS`, `EARN_ACTIVATION_BATCH`.
- `HOLD_GC_INTERVAL_MS`.
- `OUTBOX_WORKER_INTERVAL_MS`, `OUTBOX_WORKER_CONCURRENCY`, `OUTBOX_WORKER_BATCH`, `OUTBOX_MAX_RETRIES`, `OUTBOX_RPS_DEFAULT`, `OUTBOX_RPS_BY_MERCHANT`.
- `NOTIFY_WORKER_INTERVAL_MS`, `NOTIFY_WORKER_BATCH`, `NOTIFY_MAX_RETRIES`, `NOTIFY_RPS_DEFAULT`, `NOTIFY_RPS_BY_MERCHANT`.
- `AUTO_RETURN_WORKER_INTERVAL_MS`, `AUTO_RETURN_BATCH_SIZE`.
- `BIRTHDAY_WORKER_INTERVAL_MS`, `BIRTHDAY_WORKER_BATCH_SIZE`.
- `POINTS_TTL_BURN_INTERVAL_MS`, `POINTS_TTL_REMINDER_INTERVAL_MS`.

## Уведомления

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — email.
- `TELEGRAM_NOTIFY_BOT_TOKEN`, `TELEGRAM_NOTIFY_WEBHOOK_SECRET` — бот для уведомлений сотрудников.
- Push клиентам доставляется через Telegram Mini App (настраивается в портале).

## Алерты и мониторинг

- `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID`.
- `ALERTS_5XX_SAMPLE_RATE`, `ALERT_OUTBOX_PENDING_THRESHOLD`, `ALERT_OUTBOX_DEAD_THRESHOLD`, `ALERT_WORKER_STALE_MINUTES`, `ALERT_MONITOR_INTERVAL_MS`, `ALERT_REPEAT_MINUTES`.
- `SENTRY_DSN`, `METRICS_TOKEN`.
- OpenTelemetry (опционально): `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`.
- Версия приложения для логов/алертов: `APP_VERSION` (опционально).

## Антифрод

- `ANTIFRAUD_GUARD=on|off`.
- `AF_LIMIT_*` / `AF_WINDOW_*` / `AF_DAILY_CAP_*` / `AF_WEEKLY_CAP_*` — лимиты по scope (merchant/outlet/device/staff/customer).

## OAuth (опционально)

- `OAUTH_GUARD=on|off`.
- `OAUTH_JWKS_URL` или `OAUTH_HS_SECRET`.
- `OAUTH_AUDIENCE`, `OAUTH_ISSUER`, `OAUTH_REQUIRED_SCOPE`.

## Минимальный пример (локально)

```env
DATABASE_URL=postgresql://loyalty:loyalty@localhost:5432/loyalty
ADMIN_KEY=admin123
API_KEY=test-key
QR_JWT_SECRET=dev_change_me
ADMIN_SESSION_SECRET=dev_change_me_session
PORTAL_JWT_SECRET=dev_change_me_portal
PORTAL_REFRESH_SECRET=dev_change_me_portal_refresh
CORS_ORIGINS=http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004
API_BASE_URL=http://localhost:3000
MINIAPP_BASE_URL=http://localhost:3003
WORKERS_ENABLED=1
```
