# Аудит workers: hold/idempotency gc + outbox/notification dispatcher

Ниже — найденные проблемы и недоработки, отсортированные по убыванию критичности.

## P1 — High

### 1) NotificationDispatcherWorker теряет уведомления при ошибках отправки
- **Риск:** если `push.sendPush/sendToTopic` или `email.sendEmail` падают (исключение, сетевой сбой, некорректный шаблон), событие всё равно помечается как `SENT`, ретраи не выполняются, а аудит/метрики выглядят как успешные. Это приводит к тихой потере рассылок и ложной картине доставок.
- **Причина:** ошибки отправки внутри `handle()` подавляются `try { ... } catch {}` и не влияют на итоговый статус outbox-события.
- **Где смотреть:** `api/src/notification-dispatcher.worker.ts` (блок `notify.broadcast`, отправка push/email и финальный `status: 'SENT'`).
- **Что сделать:** при ошибке отправки помечать событие как `FAILED/PENDING` (с backoff) или хотя бы сохранять `lastError` и не ставить `SENT` до успешной доставки.

### 2) NotificationDispatcherWorker не восстанавливает записи в статусе `SENDING`
- **Риск:** если воркер упадёт/перезапустится после `claim()` и до `update`, запись останется в `SENDING` навсегда и больше не будет обработана (в `tick()` выбираются только `PENDING`). Потеря уведомлений без возможности повторной доставки.
- **Причина:** нет reaper-логики/TTL для `SENDING` записей.
- **Где смотреть:** `api/src/notification-dispatcher.worker.ts` (`claim()` ставит `SENDING`, `tick()` выбирает только `PENDING`).
- **Что сделать:** добавить переоткрытие «зависших» `SENDING` (например, если `updatedAt` старше N минут — переводить обратно в `PENDING`).

### 3) OutboxDispatcherWorker допускает SSRF/утечку данных через `webhookUrl`
- **Риск:** `webhookUrl` хранится без валидации. Достаточно указать `http://localhost`, `http://169.254.169.254`, внутренние IP/хосты — и воркер будет слать туда payload+подпись. Это позволяет SSRF и утечки/сканирование внутренней сети, а также передачу данных по незащищённому HTTP.
- **Причина:** в `updateSettings` нет проверки схемы/доменов, а `outbox-dispatcher.worker.ts` безусловно делает `fetch(url)`.
- **Где смотреть:** `api/src/merchants/merchants.service.ts` (`updateSettings`), `api/src/outbox-dispatcher.worker.ts` (`send()` — `fetch(url)` без проверки).
- **Что сделать:** минимально ограничить `webhookUrl` HTTPS‑схемой и запретить приватные IP/localhost; при необходимости — allowlist доменов.

## P2 — Medium

Нет актуальных пунктов.
