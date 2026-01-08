# Аудит CRM backend (api/src/crm/crm.controller.ts)

Ниже перечислены проблемы и недоработки, отсортированные по убыванию критичности.

## P1 — Высокая важность

1. **`GET /crm/:merchantId/customer/search` фактически сломан из-за несуществующей связи `merchantProfiles`.**
   - В `CrmService.searchCustomer()` в фильтре используется `merchantProfiles`, но такой связи нет в Prisma-схеме `Customer`. В рантайме Prisma вернёт ошибку валидации запроса (эндпоинт отвечает 500), а в типизированной сборке это должно ломать компиляцию.
   - Риск: поиск клиента в CRM не работает, админы/поддержка не могут найти клиента по телефону/email/id.
   - Источник: `api/src/crm/crm.service.ts` (условие `merchantProfiles`) и `api/prisma/schema.prisma` (модель `Customer` без `merchantProfiles`).

2. **Кросс-мерчантная утечка ПДн/данных сегментов в `GET /crm/:merchantId/customer/:customerId/card`.**
   - `getCustomerCard()` ищет `Customer` только по `id`, без проверки `merchantId`. Это позволяет запросить карточку чужого клиента, подставив произвольный `customerId` при любом `merchantId`.
   - Дополнительно, сегменты подгружаются через `segmentCustomer.findMany({ where: { customerId } })` без фильтра `segment.merchantId` → в ответ могут попасть сегменты других мерчантов.
   - Риск: смешение данных между мерчантами, утечка ПДн в админ‑CRM и ошибки при разборе обращений.
   - Источник: `api/src/crm/crm.service.ts` (запросы `customer.findUnique` и `segmentCustomer.findMany`).

## P2 — Средняя важность

3. **Системная аудитория «Все клиенты» и выгрузка CSV могут недосчитывать клиентов.**
   - В `listSegmentCustomers()` и `exportSegmentCustomersCsv()` для системного сегмента «all customers» выборка идёт через наличие `CustomerStats` (`where: { customerStats: { some: { merchantId } } }`).
   - Если `CustomerStats` не создана (новый клиент, импорт без статистики, сбой в агрегаторе), такой клиент выпадает из списка/CSV. Это расходится с данными портала и аналитики, которые ориентируются на `Customer.merchantId`.
   - Риск: админ‑CRM показывает неполные сегменты/выгрузки, несостыковки с аналитикой/порталом при проверке клиентов.
   - Источник: `api/src/crm/crm.service.ts` (ветки `isSystemAllAudience`), `api/prisma/schema.prisma` (у `Customer` есть `merchantId`, что позволяет строить «все клиенты» без `CustomerStats`).

4. **Нет гарантии целостности связки `SegmentCustomer` ⇄ `Customer.merchantId`.**
   - `SegmentCustomer` не содержит `merchantId` и не проверяет, что клиент принадлежит тому же мерчанту, что и сегмент. В CRM это приводит к тому, что `listSegmentCustomers()` и CSV могут показывать клиентов «из другой компании», если в таблице появились неверные связи (импорт, ручные операции, баги сегментации).
   - Риск: утечки ПДн и искажение сегментов/аналитики на уровне админ‑CRM.
   - Источник: `api/prisma/schema.prisma` (модель `SegmentCustomer` без `merchantId`), `api/src/crm/crm.service.ts` (выборка клиентов сегмента).
