# Аудит: карточка клиента (merchant-portal) и связанные эндпоинты

Ниже проблемы отсортированы по убыванию критичности.

## P1 — Высокий риск

### 1) [SEC][TENANT] CRM-карточка клиента не проверяет принадлежность мерчанту
**Где:** `api/src/crm/crm.service.ts`, метод `getCustomerCard()`.

**Что не так:**
- Клиент грузится через `customer.findUnique({ where: { id: customerId } })` без проверки `merchantId`.
- Сегменты грузятся через `segmentCustomer.findMany({ where: { customerId } })` без фильтра по мерчанту.

**Риски:**
- При запросе `/crm/:merchantId/customer/:customerId/card` можно получить ПДн клиента другого мерчанта (телефон/email/имя/теги), если известен его `customerId`.
- В карточке могут отображаться сегменты из других компаний → путаница и утечка внутренней информации.

**Как исправить (без overengineering):**
- Жёстко фильтровать клиента по `{ id, merchantId }` (или после выборки проверять `customer.merchantId === merchantId` и отдавать 404).
- Фильтровать сегменты по `segment.merchantId`.


## P3 — Низкий риск

### 3) [STABILITY] `/portal/transactions` не валидирует параметры дат и тип транзакций
**Где:**
- `api/src/portal/portal.controller.ts`, `listTransactions()`.
- `api/src/merchants/merchants.service.ts`, `listTransactions()`.

**Что не так:**
- `new Date(beforeStr/fromStr/toStr)` принимает любые строки; при `Invalid Date` Prisma может выбрасывать 500.
- `type` передаётся в `where.type` без проверки значения enum → невалидный тип может вызвать 500.

**Риски:**
- Потенциальные 500-ошибки от некорректных запросов (даже случайных из UI/аналитики).

**Как исправить (без overengineering):**
- Проверять валидность дат (`Number.isFinite(date.getTime())`) и игнорировать некорректные значения.
- Разрешать только допустимые enum-значения, остальные — игнорировать или возвращать 400.
