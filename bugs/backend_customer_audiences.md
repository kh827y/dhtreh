# Аудит: Customer Audiences (backend + связка UI/рассылки)

## Высокий приоритет

- **Конфликт маршрутов `/portal/customers` и `/portal/customers/:id` между двумя контроллерами.**
  - В `CustomerAudiencesController` определены `GET /portal/customers` и `GET /portal/customers/:id`, но эти же пути уже есть в `PortalController`. В NestJS это приводит к неоднозначной маршрутизации и «плавающему» поведению (какой контроллер обработает запрос зависит от порядка регистрации модулей). В результате один и тот же URL может возвращать **разные форматы данных и разные фильтры** (например, без `registeredOnly/excludeMiniapp`), что ломает UI и делает API непредсказуемым для клиентов интеграций.
  - Где: `api/src/customer-audiences/customer-audiences.controller.ts`, `api/src/portal/portal.controller.ts`.

- **Отсутствие валидации числовых query‑параметров в `GET /portal/customers` (customer‑audiences).**
  - `limit/offset/minVisits/maxVisits` и прочие параметры приводятся через `Number()`, но значение `NaN` не отфильтровывается. Это приводит к `take/skip = NaN` или фильтрам Prisma с `NaN`, что даёт 500 вместо понятной ошибки запроса. Достаточно передать `limit=abc` или `minVisits=abc`.
  - Где: `api/src/customer-audiences/customer-audiences.controller.ts`, `api/src/customer-audiences/customer-audiences.service.ts`.

## Средний приоритет

- **Список участников аудитории в UI ограничен 200 записями без серверной пагинации.**
  - В модальном окне «Участники аудитории» делается запрос `/api/customers?segmentId=...&limit=200`, а дальше пагинация выполняется только на клиенте. Для сегментов >200 человек интерфейс показывает только первые 200 и скрывает остальных, что искажает аудит сегмента и проверку данных.
  - Где: `merchant-portal/app/audiences/page.tsx`.

- **Несоответствие состава аудитории в UI из‑за `registeredOnly=true` по умолчанию.**
  - UI для аудитории берёт участников через `/api/customers` без явного `registeredOnly=false`. В `PortalCustomersService.list()` по умолчанию включён фильтр `registeredOnly`, поэтому из выборки исчезают клиенты без полной анкеты. Это даёт расхождение между **реальным составом сегмента** (рассчитывается без такого фильтра) и тем, что видит пользователь в списке участников.
  - Где: `merchant-portal/app/audiences/page.tsx`, `api/src/portal/customers.service.ts`.

## Низкий приоритет

- **Архивированные/выключенные сегменты всё ещё могут использоваться для рассылок.**
  - Архивирование сегмента проставляет `archivedAt` и `isActive=false`, но при формировании получателей рассылок статус сегмента не проверяется — используется только `segmentId`. Если сегмент архивирован после создания рассылки, отправка всё равно произойдёт.
  - Где: `api/src/customer-audiences/customer-audiences.service.ts`, `api/src/communications/communications-dispatcher.worker.ts`.
