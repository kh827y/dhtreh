# Аудит: portal staff (backend + merchant-portal)

Ниже — найденные проблемы, отсортированные по убыванию критичности.

## P1 — Security / критично для продакшена

Нет актуальных пунктов.

## P2 — Функциональные несоответствия UI ↔ backend

1) **Отозванный доступ к точке невозможно повторно выдать через UI**
   - **Риск**: после `revoke` точка остаётся в списке доступов (статус REVOKED), но UI не показывает статус и исключает эту точку из «доступных для добавления». Пользователь не может вернуть доступ стандартным способом.
   - **Факт**: UI фильтрует доступные точки по наличию любого access (без учёта статуса) и не отображает статус в карточке.
   - **Где смотреть**: `merchant-portal/app/staff/[staffId]/page.tsx` (availableOutlets + список accesses), `api/src/merchant-panel/merchant-panel.service.ts` (removeStaffAccess не удаляет запись, меняет статус на REVOKED).

2) **Backend допускает включить доступ в портал без пароля**
   - **Риск**: создаётся «мертвый» доступ: `portalAccessEnabled=true`, но без `hash` сотрудник не сможет войти; UI при этом показывает «доступ в панель».
   - **Факт**: в `createStaff/updateStaff` нет обязательного требования пароля при `portalAccessEnabled=true`, а логин требует `hash`.
   - **Где смотреть**: `api/src/merchant-panel/merchant-panel.service.ts` (createStaff/updateStaff), `api/src/portal-auth/portal-auth.controller.ts` (проверка `hash`).
