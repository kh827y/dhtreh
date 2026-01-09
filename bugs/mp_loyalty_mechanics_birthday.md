# Аудит: механика «Поздравление с днём рождения» и /portal/loyalty/mechanics

Ниже проблемы отсортированы по убыванию критичности.

## P1 — критичные для продакшена

Нет актуальных пунктов.

## P2 — высокие (ошибки данных/логики)

### 1) `/portal/loyalty/mechanics` не синхронизирован с фактическими настройками механики ДР
**Риск:** сторонние клиенты/внутренние страницы, использующие `/portal/loyalty/mechanics`, будут видеть пустые/устаревшие данные о механике ДР. При этом реальная работа механики определяется `rulesJson` и воркером, так что статус в `/portal/loyalty/mechanics` не отражает реальное состояние.

**Почему так:** таблица `loyaltyMechanic` и её CRUD не связаны с `rulesJson` и воркером ДР.

**Где:**
- `api/src/loyalty-program/controllers/mechanics.controller.ts`
- `api/src/loyalty-program/loyalty-program.service.ts`
- `merchant-portal/app/api/portal/loyalty/birthday/route.ts` (работает только с `rulesJson`).

**Что сделать:** либо синхронизировать механики с `rulesJson` (миграция на новый источник), либо пометить `/portal/loyalty/mechanics` как legacy и убрать из прод‑контуров.

## P3 — низкие (UX/ошибки использования)

Нет актуальных пунктов.
