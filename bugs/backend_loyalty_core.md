# Аудит backend лояльности (loyalty core)

Ниже — найденные проблемы по убыванию критичности. Дубликаты из `FIX.md` не включал.

## P1 — High

### 1) `GET /loyalty/bootstrap` доступен без Telegram-аутентификации
**Риск:** любой, кто знает `merchantId` и `customerId`, может получить профиль, историю транзакций, баланс и промоакции без подтверждения личности в Telegram (утечка ПДн и финансовых данных). Роут не входит в список `telegramProtectedPaths`, а `CashierGuard` при отсутствии сессии/подписи пропускает запросы только по наличию `merchantId`.

**Где видно:**
- `/loyalty/bootstrap` отдаёт профиль/consent/balance/transactions/promotions.【F:api/src/loyalty/loyalty.controller.ts†L3075-L3145】
- `CashierGuard.telegramProtectedPaths` не включает `/loyalty/bootstrap`, а fallback допускает запросы с `merchantId` без auth.【F:api/src/guards/cashier.guard.ts†L14-L28】【F:api/src/guards/cashier.guard.ts†L520-L532】

**Что сделать:** добавить `/loyalty/bootstrap` в `telegramProtectedPaths` (и/или требовать Telegram initData через `TelegramMiniappGuard`), чтобы доступ был только у реального клиента.

---

### 2) `POST /loyalty/reviews/dismiss` не защищён Telegram-авторизацией
**Риск:** внешний клиент может посылать “dismiss” события по любым транзакциям (заглушая окно отзыва, искажая аналитику). Если знать `transactionId`, можно массово гасить сбор отзывов. Дополнительный риск усиливается из-за публичности `/loyalty/bootstrap` (см. пункт выше), где можно получить `transactionId`.

**Где видно:**
- В `CashierGuard` защищается `/loyalty/reviews`, но нет `/loyalty/reviews/dismiss` в списке защищённых путей; fallback снова допускает запросы с `merchantId`.【F:api/src/guards/cashier.guard.ts†L14-L28】【F:api/src/guards/cashier.guard.ts†L520-L532】
- Сам эндпоинт принимает `merchantId/customerId/transactionId` и публикует событие без дополнительной авторизации.【F:api/src/loyalty/loyalty.controller.ts†L1314-L1378】

**Что сделать:** добавить `/loyalty/reviews/dismiss` в `telegramProtectedPaths` (или обернуть отдельным miniapp guard), чтобы запрос мог сделать только авторизованный клиент.

---

### 3) Потеря данных/баланса при мердже профиля по телефону
**Риск:** когда клиент с Telegram-аккаунтом вводит телефон, который уже есть у другого `Customer`, код переключает `targetCustomer` на найденную запись, но **не мигрирует** старые данные (кошелёк/транзакции/consent/промо-участия) из “временного” пользователя. Это может привести к «потере» баллов и истории, а также рассинхрону профиля/кошелька.

**Где видно:**
- В `saveProfile()` при совпадении телефона выбирается `existingByPhone` как `targetCustomer`, `tgId` переносится, но нет переноса баланса/транзакций/consent (обновляется только `targetCustomer`).【F:api/src/loyalty/loyalty.controller.ts†L2895-L2988】

**Что сделать:** при совпадении телефона переносить связанные сущности (wallet, transactions, consent, promotions/segments) на `targetCustomer` или жёстко запрещать мердж, если у текущего клиента уже есть начисления/история.

## P2 — Medium

### 4) Потенциальная потеря баланса при конкурентных начислениях (race condition)
**Риск:** в `promotions/claim` баланс кошелька обновляется через чтение текущего значения и последующий `update` с новым `balance`. При параллельных начислениях (например, commit/refund + claim) возможна потеря инкремента и некорректный баланс.

**Где видно:**
- В `claimPromotion()` баланс считается как `currentBalance + points` и записывается без атомарного инкремента/блокировки строки.【F:api/src/loyalty/loyalty.controller.ts†L654-L664】

**Что сделать:** использовать атомарный `increment` в Prisma либо блокировку `SELECT ... FOR UPDATE` в транзакции для кошелька, чтобы исключить гонки.

---

### 5) Некорректные даты `before` могут приводить к 500
**Риск:** в `transactions` и `cashier/outlet-transactions` `before` парсится через `new Date(...)` без валидации. При некорректном формате формируется `Invalid Date`, который затем используется в Prisma-фильтре и может привести к ошибке/500.

**Где видно:**
- Парсинг `before` в контроллере без проверки валидности даты.【F:api/src/loyalty/loyalty.controller.ts†L1878-L1892】【F:api/src/loyalty/loyalty.controller.ts†L3016-L3047】
- `before` используется напрямую в Prisma фильтре `createdAt < before` в сервисе.【F:api/src/loyalty/loyalty.service.ts†L5636-L5648】【F:api/src/loyalty/loyalty.service.ts†L5908-L5917】

**Что сделать:** валидировать `before` (например, `Number.isNaN(date.getTime())`) и возвращать 400 при ошибке.

