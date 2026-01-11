# Admin Telegram Notifications — аудит

Недоработки отсортированы по убыванию важности устранения.

## P1 — High

- **[BUG][Config] При отсутствии `TELEGRAM_NOTIFY_WEBHOOK_SECRET` webhook принимает запросы, но обновления всегда игнорируются**
  - **Риск**: уведомления сотрудников фактически не подключаются, а диагностики нет — Telegram получает `200 OK`, но `processUpdate()` не вызывается.
  - **Причина**: в `webhook()` проверка `expected`/`secret` делает ранний `return { ok: true }` при пустом секрете или несовпадении; при этом `setWebhook()` отправляет `secret_token: undefined`, т.е. Telegram будет слать обновления без секрета.
  - **Где**: `api/src/telegram/telegram-notify.controller.ts` (`webhook`), `api/src/telegram/telegram-notify.service.ts` (`setWebhook`).
  - **Что сделать**: либо запретить включение webhook без секрета (fail‑fast), либо разрешить режим “без секрета” и обрабатывать апдейты без проверки; дополнительно логировать mismatch.

## P3 — Low

- **[Perf][Telegram] На каждый апдейт вызывается `getMe`, что даёт лишние запросы к Telegram API**
  - **Риск**: при активных чатах растёт задержка обработки апдейтов и риск rate‑limit от Telegram; ухудшается стабильность уведомлений.
  - **Причина**: `processUpdate()` вызывает `getBotInfo()` для каждого апдейта, вместо кеша на несколько минут.
  - **Где**: `api/src/telegram/telegram-notify.service.ts` (`processUpdate`, `getBotInfo`).
  - **Что сделать**: кешировать `botInfo` на TTL (например 5–30 минут) или загружать один раз при старте.
