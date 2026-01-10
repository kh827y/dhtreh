# Аудит backend-уведомлений (notifications/push/email)

Ниже — найденные проблемы по убыванию критичности.

## P1 — High

Нет актуальных пунктов.

## P2 — Medium

- **[SEC][CONSENT] Маркетинговые email-рассылки игнорируют согласия клиента**
  - **Риск**: отправка рекламных/кампанийных писем без согласия (GDPR/локальные нормы), рост жалоб и блокировок SMTP.
  - **Где**:
    - `api/src/notifications/email/email.service.ts`: `sendCampaignEmail()` выбирает всех клиентов с email без учёта `customerConsents`.
    - `api/src/notification-dispatcher.worker.ts`: `notify.broadcast` для EMAIL отправляет всем клиентам из сегмента без проверки согласий.
  - **Что сделать**: фильтровать получателей по согласиям на канал `EMAIL` (если модель согласий используется), аналогично push-рассылкам.

- **[FUNC] `POST /notifications/test` с `channel=PUSH` не отправляет push вообще**
  - **Риск**: ложные успешные результаты тестирования (endpoint возвращает `ok: true`, но реальной отправки нет) → вводит в заблуждение админа/поддержку.
  - **Где**: `api/src/notification-dispatcher.worker.ts` — ветка `notify.test` для PUSH ничего не делает.
  - **Что сделать**: либо реализовать реальную отправку тестового push (на конкретного получателя), либо явно возвращать ошибку/сообщение, что PUSH-тест не поддерживается.

- **[RELIABILITY] `/notifications/broadcast` и `/notifications/test` всегда отвечают `ok: true`, даже если enqueue не произошёл**
  - **Риск**: внешний админ/API считает рассылку созданной, но событие может не попасть в outbox (ошибка БД, проблемы с транзакцией) — без сигнала о сбое.
  - **Где**: `api/src/notifications/notifications.service.ts` — операции `eventOutbox.create` обёрнуты в `try { ... } catch {}` без возврата ошибки.
  - **Что сделать**: возвращать 5xx/ошибку при сбое записи в outbox, либо хотя бы отдавать `ok:false` и логировать ошибку.

## P3 — Low

- **[FUNC][LEGACY] `POST /push/device/register` всегда возвращает 400, `DELETE /push/device/:outletId` — no-op**
  - **Риск**: интерфейс/интеграторы считают, что есть полноценная регистрация устройств, но функционал фактически отключён (push через Telegram Mini App). Это вводит в заблуждение и создает “мертвые” API.
  - **Где**:
    - `api/src/notifications/push/push.service.ts`: `registerDevice()` выбрасывает `BadRequestException`.
    - `api/src/notifications/push/push.service.ts`: `deactivateDevice()` ничего не делает.
  - **Что сделать**: либо убрать/закрыть эти эндпоинты как legacy, либо реализовать реальную регистрацию устройств, если она требуется.
