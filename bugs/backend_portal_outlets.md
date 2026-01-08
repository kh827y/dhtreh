# Аудит portal/outlets (backend + merchant-portal UI)

## Высокий приоритет

1. **Удаление торговой точки не работает (UI вызывает несуществующий backend-эндпоинт).**
   - В интерфейсе есть кнопка удаления, которая шлёт `DELETE /api/portal/outlets/:id`, а Next.js проксирует на `DELETE /portal/outlets/:id` в API. При этом в backend-контроллере `OutletsController` нет метода `@Delete(':id')`, есть только `GET/POST/PUT`. В результате UI всегда получает 404/ошибку, а пользователи не могут удалить точку.
   - Следствия: «кнопка есть — действия нет», а также риск неконсистентных данных (невозможно удалить тестовые/ошибочные точки).
   - Где видно:
     - UI удаление: `merchant-portal/app/outlets/page.tsx` (handleDeleteOutlet вызывает `DELETE /api/portal/outlets/:id`).
     - Прокси: `merchant-portal/app/api/portal/outlets/[id]/route.ts` (DELETE проксируется на backend).
     - Backend-эндпоинт отсутствует: `api/src/merchant-panel/controllers/outlets.controller.ts` (нет `@Delete`).

## Средний приоритет

2. **Список торговых точек без пагинации в UI → обрезание данных после 20 записей.**
   - Backend по умолчанию отдаёт максимум 20 точек (`pageSize` по умолчанию), а UI не передаёт `page`/`pageSize` и не реализует постраничную навигацию. Если у мерчанта >20 точек, часть пропадает из списка, счетчики в UI становятся неверными, а фильтры/выборы в других разделах (персонал, аудитории, аналитика) опираются на неполный список.
   - Где видно:
     - Backend пагинация по умолчанию: `api/src/merchant-panel/merchant-panel.service.ts` (`normalizePagination`, `listOutlets`).
     - UI запросы без пагинации: `merchant-portal/app/outlets/page.tsx`, `merchant-portal/app/staff/page.tsx`, `merchant-portal/app/staff/[staffId]/page.tsx`, `merchant-portal/app/api/portal/setup-status/route.ts` (и другие вызовы `/api/portal/outlets`).

## Низкий приоритет

3. **В UI отсутствует настройка значимых полей торговой точки, которые поддерживает backend.**
   - Backend принимает и хранит адрес, телефон, таймзону, расписание, скрытие из клиентского каталога, внешние интеграционные идентификаторы, координаты и e-mail администраторов. В merchant-portal формы создания/редактирования позволяют менять только название, статус, устройства и ссылки на отзывы. Это оставляет важные поля в `null`/default и делает невозможным их корректную поддержку без прямого доступа к API/БД.
   - Возможные последствия: некорректные данные в клиентских витринах/аналитике, невозможность скрыть точку от клиентов или управлять расписанием/таймзоной через UI.
   - Где видно:
     - Поля в backend DTO/сервисе: `api/src/merchant-panel/dto/outlet.dto.ts`, `api/src/merchant-panel/merchant-panel.service.ts` (create/update/mapOutlet).
     - UI формы ограничены: `merchant-portal/app/outlets/new/page.tsx`, `merchant-portal/app/outlets/[id]/page.tsx`.
