# Admin Telegram Notifications — аудит

Недоработки отсортированы по убыванию важности устранения.

## P1 — High

- **[SEC][Info Leak] Публичный эндпоинт `GET /telegram/notify/webhook-info` раскрывает URL вебхука и ошибки**
  - **Риск**: любой внешний пользователь может узнать фактический URL вебхука и состояние последней ошибки (рекон инфраструктуры, подготовка атак на webhook/DoS).
  - **Причина**: контроллер `TelegramNotifyController` не защищён guard'ами, хотя комментарий говорит “admin/diagnostics”.
  - **Где**: `api/src/telegram/telegram-notify.controller.ts` (`webhookInfo`).
  - **Что сделать**: перенести эндпоинт под админ‑контроллер или закрыть `AdminGuard`/`AdminIpGuard`.

- **[BUG][Config] При отсутствии `TELEGRAM_NOTIFY_WEBHOOK_SECRET` webhook принимает запросы, но обновления всегда игнорируются**
  - **Риск**: уведомления сотрудников фактически не подключаются, а диагностики нет — Telegram получает `200 OK`, но `processUpdate()` не вызывается.
  - **Причина**: в `webhook()` проверка `expected`/`secret` делает ранний `return { ok: true }` при пустом секрете или несовпадении; при этом `setWebhook()` отправляет `secret_token: undefined`, т.е. Telegram будет слать обновления без секрета.
  - **Где**: `api/src/telegram/telegram-notify.controller.ts` (`webhook`), `api/src/telegram/telegram-notify.service.ts` (`setWebhook`).
  - **Что сделать**: либо запретить включение webhook без секрета (fail‑fast), либо разрешить режим “без секрета” и обрабатывать апдейты без проверки; дополнительно логировать mismatch.

## P2 — Medium

- **[BUG][Admin UI] Установка webhook всегда возвращает `ok: true` даже при фактическом провале**
  - **Риск**: админ считает, что webhook настроен, хотя Telegram API мог вернуть ошибку (невалидный токен, недоступный URL, сетевые проблемы).
  - **Причина**: `AdminNotificationsController.setWebhook()` возвращает `{ ok: true }` даже когда `notify.setWebhook()` вернул `null`; UI не проверяет результат и не отображает ошибку.
  - **Где**: `api/src/admin-panel/admin-notifications.controller.ts` (`setWebhook`), `admin/app/telegram_notifications/page.tsx` (кнопка “Установить webhook”).
  - **Что сделать**: возвращать `ok: false` и ошибку при `null`, а в UI показывать её пользователю.

- **[SEC][Invite] Инвайт‑ссылки для сотрудников многократно переиспользуемы и не инвалидируются после первого подключения**
  - **Риск**: утечка ссылки даёт неограниченное подключение посторонних чатов/групп к уведомлениям мерчанта (потенциальная утечка операционных данных).
  - **Причина**: `issueInvite()` переиспользует токен до истечения срока, а `handleStartToken()` не помечает инвайт использованным и не ограничивает число подключений.
  - **Где**: `api/src/portal/services/telegram-notify.service.ts` (`issueInvite`), `api/src/telegram/telegram-notify.service.ts` (`handleStartToken`).
  - **Что сделать**: сделать инвайт одноразовым или лимитировать число подписчиков на токен; альтернативно — привязать к конкретному staffId и требовать подтверждение в портале.

## P3 — Low

- **[Perf][Telegram] На каждый апдейт вызывается `getMe`, что даёт лишние запросы к Telegram API**
  - **Риск**: при активных чатах растёт задержка обработки апдейтов и риск rate‑limit от Telegram; ухудшается стабильность уведомлений.
  - **Причина**: `processUpdate()` вызывает `getBotInfo()` для каждого апдейта, вместо кеша на несколько минут.
  - **Где**: `api/src/telegram/telegram-notify.service.ts` (`processUpdate`, `getBotInfo`).
  - **Что сделать**: кешировать `botInfo` на TTL (например 5–30 минут) или загружать один раз при старте.
