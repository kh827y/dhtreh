# Аудит backend-уведомлений (notifications/push/email)

Ниже — найденные проблемы по убыванию критичности.

## P1 — High

Нет актуальных пунктов.

## P2 — Medium

Нет актуальных пунктов.

## P3 — Low

- **[FUNC][LEGACY] `POST /push/device/register` всегда возвращает 400, `DELETE /push/device/:outletId` — no-op**
  - **Риск**: интерфейс/интеграторы считают, что есть полноценная регистрация устройств, но функционал фактически отключён (push через Telegram Mini App). Это вводит в заблуждение и создает “мертвые” API.
  - **Где**:
    - `api/src/notifications/push/push.service.ts`: `registerDevice()` выбрасывает `BadRequestException`.
    - `api/src/notifications/push/push.service.ts`: `deactivateDevice()` ничего не делает.
  - **Что сделать**: либо убрать/закрыть эти эндпоинты как legacy, либо реализовать реальную регистрацию устройств, если она требуется.
