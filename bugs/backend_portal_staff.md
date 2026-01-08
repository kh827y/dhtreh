# Аудит: portal staff (backend + merchant-portal)

Ниже — найденные проблемы, отсортированные по убыванию критичности.

## P1 — Security / критично для продакшена

1) **PIN-коды кассиров доступны любому пользователю с `staff:read`**
   - **Риск**: сотрудник с доступом только к разделу «Сотрудники» может увидеть PIN других сотрудников и авторизоваться в кассовом интерфейсе (абуз операций/баллов).
   - **Факт**:
     - `GET /portal/staff` и `GET /portal/staff/:id/access` возвращают `pinCode` в каждом доступе к точке.
     - Эти эндпоинты защищены только ресурсом `staff` (read), а не `cashier_panel`.
   - **Ожидание**: PIN-коды либо скрывать по умолчанию и требовать отдельного права, либо выдавать только при `staff:manage`/`cashier_panel`.
   - **Где смотреть**: `api/src/merchant-panel/merchant-panel.service.ts` (mapStaff/buildAccessViews), `api/src/portal-auth/portal.guard.ts` (маршрутизация `/portal/staff` → `staff`), `merchant-portal/app/staff/[staffId]/page.tsx` (вывод PIN в UI).

## P2 — Функциональные несоответствия UI ↔ backend

2) **После увольнения сотрудника его `portalAccessEnabled` остаётся `true`**
   - **Риск**: фильтр «С доступом в панель» и счётчики начинают показывать уволенных как «имеющих доступ», хотя фактически вход запрещён (`canAccessPortal=false`). В аналитике и UI это выглядит как ошибка.
   - **Факт**: UI увольнения отправляет `status: "FIRED"` и `canAccessPortal: false`, но не сбрасывает `portalAccessEnabled`.
   - **Где смотреть**: `merchant-portal/app/staff/[staffId]/page.tsx` (handleFire), `api/src/merchant-panel/merchant-panel.service.ts` (updateStaff), `api/src/portal-auth/portal.guard.ts` (логика доступа).

3) **Список сотрудников обрезается и фильтруется только на клиенте**
   - **Риск**: при количестве сотрудников > 100 вкладка «Уволены» и фильтры (группы/точки) показывают неполные данные. Счётчики берутся с бэка и не совпадают с видимым списком.
   - **Факт**: UI всегда запрашивает `pageSize=100`, не передаёт `status`, а фильтрацию выполняет на клиенте.
   - **Где смотреть**: `merchant-portal/app/staff/page.tsx` (load → `pageSize=100` + клиентская фильтрация), `api/src/merchant-panel/merchant-panel.service.ts` (pagination в listStaff).

4) **Отозванный доступ к точке невозможно повторно выдать через UI**
   - **Риск**: после `revoke` точка остаётся в списке доступов (статус REVOKED), но UI не показывает статус и исключает эту точку из «доступных для добавления». Пользователь не может вернуть доступ стандартным способом.
   - **Факт**: UI фильтрует доступные точки по наличию любого access (без учёта статуса) и не отображает статус в карточке.
   - **Где смотреть**: `merchant-portal/app/staff/[staffId]/page.tsx` (availableOutlets + список accesses), `api/src/merchant-panel/merchant-panel.service.ts` (removeStaffAccess не удаляет запись, меняет статус на REVOKED).

5) **Backend допускает включить доступ в портал без пароля**
   - **Риск**: создаётся «мертвый» доступ: `portalAccessEnabled=true`, но без `hash` сотрудник не сможет войти; UI при этом показывает «доступ в панель».
   - **Факт**: в `createStaff/updateStaff` нет обязательного требования пароля при `portalAccessEnabled=true`, а логин требует `hash`.
   - **Где смотреть**: `api/src/merchant-panel/merchant-panel.service.ts` (createStaff/updateStaff), `api/src/portal-auth/portal-auth.controller.ts` (проверка `hash`).
