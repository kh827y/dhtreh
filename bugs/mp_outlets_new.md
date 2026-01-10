# Аудит merchant-portal: /outlets/new и /portal/outlets

## P1 — Высокая критичность

1. **Удаление торговой точки не работает (UI есть, API нет).**
   - **Симптом**: на странице списка есть кнопка удаления, но запрос уходит на `DELETE /api/portal/outlets/:id` и проксируется в `DELETE /portal/outlets/:id`.
   - **Причина**: в backend отсутствует обработчик `DELETE` для `portal/outlets`.
   - **Риск/влияние**: удалить точку из портала невозможно → мусорные/ошибочные точки остаются в системе, бизнес-процессы ломаются.
   - **Где смотреть**: `merchant-portal/app/outlets/page.tsx`, `merchant-portal/app/api/portal/outlets/[id]/route.ts`, `api/src/merchant-panel/controllers/outlets.controller.ts`.

## P2 — Средняя критичность

Нет актуальных пунктов.
