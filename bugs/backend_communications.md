# Аудит backend communications (рассылки)

Ниже перечислены найденные проблемы в порядке убывания важности устранения.

## P1 — Высокая важность

Нет актуальных пунктов.

## P2 — Средняя важность

### 3) Можно подделывать аналитику через `stats` при создании задач
**Риск:** отправитель может записать произвольные значения `totalRecipients/sent/failed` и подделать аналитику рассылки.
**Причина:** `createTask` принимает `stats` из payload и пишет в БД без валидации/пересчёта.
**Где:** `api/src/communications/communications.service.ts` (`createTask` → `normalizeStats` → `buildCreateData`).
**Что проверить/сделать:** игнорировать `stats` на входе и вычислять их только в воркере отправки.

### 4) Нет пагинации на выдаче получателей рассылки
**Риск:** для больших рассылок эндпоинт вернёт тысячи/десятки тысяч записей за раз → нагрузка на БД/сервис и потенциальные таймауты.
**Причина:** `GET /portal/communications/tasks/:id/recipients` возвращает весь список без `limit/offset`.
**Где:** `api/src/communications/communications.controller.ts`, `api/src/communications/communications.service.ts`.
**Что проверить/сделать:** добавить пагинацию (limit/offset) и использовать её в UI/аналитике.

## P3 — Низкая важность / легаси

### 5) Новый API `/portal/communications/*` не связан с текущим UI рассылок
**Риск:** бизнес‑функции «шаблоны/задачи» не доступны из портала, а сам API может оставаться «мертвым» (legacy), что повышает сложность поддержки и даёт лишнюю поверхность API.
**Причина:** UI рассылок использует старые маршруты `/portal/push-campaigns` и `/portal/telegram-campaigns` (через `/api/portal/communications/*` в Next), а контроллер `/portal/communications` с шаблонами/задачами не используется.
**Где:**
- UI: `merchant-portal/app/loyalty/push/page.tsx`, `merchant-portal/app/loyalty/telegram/page.tsx`, `merchant-portal/app/api/portal/communications/*`.
- Backend: `api/src/communications/communications.controller.ts`.
**Что проверить/сделать:** либо подключить UI к новому API (если планировался), либо удалить/скрыть контроллер `/portal/communications` как legacy.
