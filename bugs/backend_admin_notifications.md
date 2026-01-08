# Аудит: Admin Notifications / Telegram notify webhook

Ниже — найденные проблемы, отсортированные по убыванию критичности.

## P1 — High

### 1) Публичный доступ к диагностике webhook
**Риск/эффект:** эндпоинт доступен без админ‑авторизации и раскрывает техническую информацию (URL вебхука, сведения об ошибках Telegram). Это облегчает разведку и повышает риск атак на интеграцию.
**Где:** `api/src/telegram/telegram-notify.controller.ts`, `GET /telegram/notify/webhook-info`.
**Почему важно:** диагностика интеграции должна быть доступна только админам/внутренним IP.

## P2 — Medium

### 2) `POST /notifications/telegram-notify/set-webhook` падает при ошибке/отсутствии токена
**Риск/эффект:** если `TELEGRAM_NOTIFY_BOT_TOKEN` не задан или Telegram API вернул ошибку, `setWebhook()` возвращает `null`, а контроллер делает spread `...r`, что приводит к 500 (TypeError). Админ получает ошибку вместо понятного ответа и не понимает, что именно не так.
**Где:** `api/src/admin-panel/admin-notifications.controller.ts` (`setWebhook`), `api/src/telegram/telegram-notify.service.ts` (`setWebhook`).

### 3) Ложноположительный ответ при сбоях установки webhook
**Риск/эффект:** `TelegramNotifyService.setWebhook()` проглатывает исключения и возвращает `null`, но контроллер все равно возвращает `{ ok: true }` (если бы не падал на spread). В итоге админ может считать, что вебхук установлен, хотя это не так.
**Где:** `api/src/admin-panel/admin-notifications.controller.ts` (`setWebhook`), `api/src/telegram/telegram-notify.service.ts` (`setWebhook`).

### 4) Webhook “тихо” не работает при отсутствии `TELEGRAM_NOTIFY_WEBHOOK_SECRET`
**Риск/эффект:** `setWebhook()` регистрирует webhook без `secret_token`, а обработчик в `TelegramNotifyController` при пустом секрете делает `return { ok: true }` и **не** обрабатывает обновления. В результате интеграция выглядит включенной, но уведомления никогда не будут приняты/обработаны.
**Где:** `api/src/telegram/telegram-notify.service.ts` (`webhookSecret`, `setWebhook`), `api/src/telegram/telegram-notify.controller.ts` (`webhook`).

### 5) `POST /notifications/telegram-notify/delete-webhook` всегда возвращает `ok: true`
**Риск/эффект:** ошибки Telegram API скрываются, админ видит успешный ответ даже если удаление не произошло. Это усложняет диагностику и может привести к неверным ожиданиям (вебхук продолжает работать).
**Где:** `api/src/admin-panel/admin-notifications.controller.ts` (`deleteWebhook`), `api/src/telegram/telegram-notify.service.ts` (`deleteWebhook`).
