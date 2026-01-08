# Аудит backend merchants

Ниже перечислены найденные проблемы в порядке убывания критичности.

## P1 — высокая

- **[Data][Outbox] Экспорт `/merchants/:id/outbox.csv` может зациклиться и отдавать дубликаты**
  - **Симптом**: `outboxCsv()` использует постраничную выборку через `since`, но `listOutbox()` фильтрует `createdAt >= since` и сортирует по `createdAt DESC`. В результате следующая страница всегда включает предыдущие записи (и может застревать в бесконечном цикле).
  - **Риск**: зависание/вечная генерация CSV, рост нагрузки на БД/процесс.
  - **Где**: `api/src/merchants/merchants.controller.ts` (outboxCsv), `api/src/merchants/merchants.service.ts` (listOutbox).
  - **Как исправить**: перейти на пагинацию по `createdAt < cursor` (или курсорный `id+createdAt`), либо использовать `skip`/`cursor` с сортировкой.

## P2 — средняя

- **[Data][CRM] `GET /merchants/:id/customer/summary` возвращает транзакции всех клиентов**
  - **Симптом**: в `customerSummary()` вызывается `listTransactions()` без `customerId`, поэтому `recentTx` не соответствует выбранному клиенту.
  - **Риск**: искажённые данные CRM, админ может принять неверные решения/предоставить неверные данные поддержки.
  - **Где**: `api/src/merchants/merchants.controller.ts` (customerSummary).
  - **Как исправить**: передавать `customerId` в `listTransactions()`.

- **[Data][Outbox] `GET /merchants/:id/outbox/by-order` возвращает неполные данные**
  - **Симптом**: `listOutboxByOrder()` сначала берёт последние N событий по мерчанту, а затем фильтрует по `orderId` в памяти. Если нужные события старше лимита — они не попадут в ответ.
  - **Риск**: неполная история по заказу и ошибочные выводы при расследовании сбоев интеграций.
  - **Где**: `api/src/merchants/merchants.service.ts` (listOutboxByOrder).
  - **Как исправить**: фильтровать `orderId` на уровне БД (JSON path/индексация) либо хранить `orderId` как отдельное поле для быстрых запросов.

- **[Stability][Outbox] `pause/resume` падают для мерчантов без строки `merchantSettings`**
  - **Симптом**: `pauseOutbox()`/`resumeOutbox()` делают `merchantSettings.update`, но при создании мерчанта запись `merchantSettings` может не существовать (создаётся только при `maxOutlets` или явном `updateSettings`).
  - **Риск**: админ не сможет паузить/возобновлять outbox у новых мерчантов, возможны 500 ошибки.
  - **Где**: `api/src/merchants/merchants.service.ts` (pauseOutbox, resumeOutbox).
  - **Как исправить**: использовать `upsert` или предварительно гарантировать создание `merchantSettings`.

## P3 — низкая

- **[Data][Admin] `PUT /merchants/:id/settings` создаёт «призрачных» мерчантов**
  - **Симптом**: `updateSettings()` делает `upsert` и при отсутствии мерчанта создаёт запись с `id` и `name = merchantId`.
  - **Риск**: появляются мерчанты без портальных учёток/подписок и непредсказуемым состоянием, что усложняет поддержку.
  - **Где**: `api/src/merchants/merchants.service.ts` (updateSettings).
  - **Как исправить**: заменять на `findUnique` + 404, либо создавать мерчанта только через `createMerchant()`.
