# Аудит: admin outbox

Ниже проблемы отсортированы по убыванию критичности.

## P1 — Критичные для стабильности/продакшена

1. **Экспорт CSV по outbox может уйти в бесконечный цикл/дублировать страницы.**
   - `outbox.csv` делает постраничный обход по `createdAt`, но использует `createdAt >= since` и сортировку `desc`. После первой страницы `cursorSince` = `createdAt` последнего элемента и следующий запрос снова возвращает самые свежие записи (условие `>=`), что приводит к повторению одних и тех же страниц, а при количестве > batch — к бесконечному циклу/нагрузке.
   - Затрагиваемые части: `api/src/merchants/merchants.controller.ts` (`outboxCsv`), `api/src/merchants/merchants.service.ts` (`listOutbox`).

2. **Ограничение `limit` из админки не применяется к CSV‑экспорту.**
   - UI формирует `outbox.csv` c параметром `limit`, но API его не читает (ожидает только `batch`). В результате админ может невольно выгрузить весь outbox за период (или зависнуть на большом объёме).
   - Затрагиваемые части: `admin/app/outbox/page.tsx` (формирует ссылку с `limit`), `admin/lib/outbox.ts` (добавляет `limit` в query), `api/src/merchants/merchants.controller.ts` (`outboxCsv` не читает `limit`).

## P2 — Существенные проблемы качества/корректности

3. **Поиск по `orderId` в outbox не гарантирует корректный результат.**
   - `/merchants/:id/outbox/by-order` сначала читает последние `N` событий, а затем фильтрует их в памяти. Если нужный `orderId` старее последних `N` записей — эндпоинт вернёт пусто (ложный отрицательный результат). Также это лишняя нагрузка на БД/память, т.к. тянутся все события без фильтра по `orderId`.
   - Затрагиваемые части: `api/src/merchants/merchants.service.ts` (`listOutboxByOrder`), `api/src/merchants/merchants.controller.ts` (`outboxByOrder`), `admin/app/outbox/page.tsx` (кнопка Find by Order).

## P3 — Потенциальные операционные риски

4. **`Retry All` может переотправить уже `SENT` события и создать дубликаты вебхуков.**
   - В сервисе `retryAll` при отсутствии `status` переводятся в `PENDING` все события, включая `SENT`. В UI можно выбрать «любой» статус (пустой фильтр) и нажать `Retry All`, что приведёт к повторной доставке уже отправленных webhook‑событий.
   - Затрагиваемые части: `api/src/merchants/merchants.service.ts` (`retryAll`), `admin/app/outbox/page.tsx` (кнопка Retry All и выбор статуса).
