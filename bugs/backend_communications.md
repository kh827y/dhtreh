# Аудит backend communications (рассылки)

Ниже перечислены найденные проблемы в порядке убывания важности устранения.

## P1 — Высокая важность

### 1) Отменённые/архивированные рассылки «теряются» в UI
**Риск:** пользователи не видят отменённые кампании (они пропадают из обоих табов), что ломает контроль/аудит рассылок и вводит в заблуждение по аналитике (кажется, что рассылки «исчезли»).
**Причина:** backend возвращает задачи со статусами `CANCELED`/`ARCHIVED` в архивной выборке, но UI фильтрует архив только по `COMPLETED`/`FAILED` и отбрасывает всё остальное.
**Где:**
- API возвращает архивные задачи через `listChannelTasks`/`listTasks` (`api/src/communications/communications.service.ts`).
- UI фильтрует архив: `ARCHIVED_STATUSES = ["COMPLETED", "FAILED"]` (`merchant-portal/app/loyalty/push/page.tsx`, `merchant-portal/app/loyalty/telegram/page.tsx`).
**Что проверить/сделать:** согласовать статусы между UI и backend: либо добавить `CANCELED`/`ARCHIVED` в UI, либо не возвращать их в архивной выборке (если это legacy).

## P2 — Средняя важность

### 2) `/portal/communications/tasks/:id/status` принимает произвольный статус
**Риск:** портал-юзер может записать любой статус (в т.ч. невалидный), что ломает консистентность задач, скрывает рассылки из UI и искажает аналитику. Также можно руками «завершить» рассылку без фактической отправки.
**Причина:** статус — строка без enum‑валидации на уровне БД и сервиса, а эндпоинт принимает любой `body.status`.
**Где:** `api/src/communications/communications.controller.ts`, `api/src/communications/communications.service.ts`, модель `CommunicationTask.status` (`api/prisma/schema.prisma`).
**Что проверить/сделать:** в сервисе разрешить только whitelist статусов (например, `SCHEDULED/RUNNING/PAUSED/CANCELED/COMPLETED/FAILED/ARCHIVED`) и отклонять остальные.

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
