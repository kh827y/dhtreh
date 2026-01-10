# Аудит: merchant-portal / Товары + /portal/catalog/products

Ниже проблемы отсортированы по убыванию критичности.

## P1 — Critical

### 1) Подмена смысла `externalId`: UI может переписать провайдерский `externalId` в основной `Product.externalId`
**Риск:** при редактировании товара, у которого `externalId` приходит из `externalMappings` (iiko/r_keeper/и т.п.), портал записывает это значение в `Product.externalId` (без контекста провайдера). Это может сломать связку с интеграцией и привести к некорректному сопоставлению товаров при начислениях/списаниях (в `loyalty.service` сначала ищется по `Product.externalId`, а уже потом по `externalMappings`). Возможны ситуации, когда один и тот же `externalId` у разных провайдеров станет «общим», что приведёт к выбору неправильного товара.
**Где:**
- `merchant-portal/app/products/page.tsx`: `mapPortalProduct` берет `externalId` из списка и подставляет в форму, а `handleSave` всегда пишет `externalId` обратно в API.【F:merchant-portal/app/products/page.tsx†L35-L214】
- `api/src/portal/catalog.service.ts`: `mapProductPreview` возвращает `externalId` из `Product.externalId` **или** из `externalMappings[0]`, а `updateProduct` пишет `externalId` в основной продукт без учёта провайдера.【F:api/src/portal/catalog.service.ts†L163-L183】【F:api/src/portal/catalog.service.ts†L1086-L1174】
- В обработке чеков и начислениях `externalId` используется как первичный ключ для поиска товара — риск неправильного сопоставления при совпадениях между провайдерами.【F:api/src/loyalty/loyalty.service.ts†L360-L450】
**Что сделать:**
- В UI явно показывать источник `externalId` (основной vs провайдерский) и **не** писать в `Product.externalId`, если он был получен из `externalMappings`.
- В API разнести поля: оставить `Product.externalId` как «универсальный» ID, а провайдерские значения редактировать через отдельный экран/endpoint (или запретить их редактирование в портале).

## P2 — High

### 2) Каталог грузится целиком без пагинации/серверного поиска
**Риск:** при каталоге в тысячи позиций портал загружает **весь** список за один запрос и фильтрует на клиенте — это медленно, бьёт по памяти браузера и API/DB, повышает риск таймаутов. Для продакшена это станет узким местом.
**Где:**
- UI всегда делает `GET /api/portal/catalog/products` и фильтрует через `useMemo`, без `search`/`categoryId`/пагинации на сервере.【F:merchant-portal/app/products/page.tsx†L98-L176】
- Backend `listProducts` возвращает весь список (нет `take/skip`, нет `limit/offset`).【F:api/src/portal/catalog.service.ts†L809-L880】
**Что сделать:**
- Добавить в API пагинацию (`limit/offset` или `cursor`) и серверный поиск/фильтры.
- В UI заменить локальную фильтрацию на запросы с параметрами и «ленивую» загрузку страниц.

## P3 — Low

Нет актуальных пунктов.
