# Аудит backend communications (рассылки)

Ниже перечислены найденные проблемы в порядке убывания важности устранения.

## P1 — Высокая важность

Нет актуальных пунктов.

## P2 — Средняя важность

Нет актуальных пунктов.

## P3 — Низкая важность / легаси

### 5) Новый API `/portal/communications/*` не связан с текущим UI рассылок
**Риск:** бизнес‑функции «шаблоны/задачи» не доступны из портала, а сам API может оставаться «мертвым» (legacy), что повышает сложность поддержки и даёт лишнюю поверхность API.
**Причина:** UI рассылок использует старые маршруты `/portal/push-campaigns` и `/portal/telegram-campaigns` (через `/api/portal/communications/*` в Next), а контроллер `/portal/communications` с шаблонами/задачами не используется.
**Где:**
- UI: `merchant-portal/app/loyalty/push/page.tsx`, `merchant-portal/app/loyalty/telegram/page.tsx`, `merchant-portal/app/api/portal/communications/*`.
- Backend: `api/src/communications/communications.controller.ts`.
**Что проверить/сделать:** либо подключить UI к новому API (если планировался), либо удалить/скрыть контроллер `/portal/communications` как legacy.
