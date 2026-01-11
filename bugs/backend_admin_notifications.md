# Аудит: Admin Notifications / Telegram notify webhook

Ниже — найденные проблемы, отсортированные по убыванию критичности.

## P1 — High

### 1) Публичный доступ к диагностике webhook
**Риск/эффект:** эндпоинт доступен без админ‑авторизации и раскрывает техническую информацию (URL вебхука, сведения об ошибках Telegram). Это облегчает разведку и повышает риск атак на интеграцию.
**Где:** `api/src/telegram/telegram-notify.controller.ts`, `GET /telegram/notify/webhook-info`.
**Почему важно:** диагностика интеграции должна быть доступна только админам/внутренним IP.

## P2 — Medium

### 4) Webhook “тихо” не работает при отсутствии `TELEGRAM_NOTIFY_WEBHOOK_SECRET`
**Риск/эффект:** `setWebhook()` регистрирует webhook без `secret_token`, а обработчик в `TelegramNotifyController` при пустом секрете делает `return { ok: true }` и **не** обрабатывает обновления. В результате интеграция выглядит включенной, но уведомления никогда не будут приняты/обработаны.
**Где:** `api/src/telegram/telegram-notify.service.ts` (`webhookSecret`, `setWebhook`), `api/src/telegram/telegram-notify.controller.ts` (`webhook`).
