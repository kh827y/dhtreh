# API Documentation - Loyalty Program

## Содержание
- [Аутентификация](#аутентификация)
- [Основные эндпоинты](#основные-эндпоинты)
- [Программа лояльности](#программа-лояльности)
- [Управление мерчантами](#управление-мерчантами)
- [Интеграции](#интеграции)
- [Вебхуки](#вебхуки)
- [Коды ошибок](#коды-ошибок)
- [Уровни и бонусы](#уровни-и-бонусы)
- [TTL/Сгорание баллов](#ttlsгорание-баллов)

## Базовый URL
Production: https://api.loyalty.example.com
Staging: https://api-staging.loyalty.example.com
Local: http://localhost:3000
```

## Аутентификация

### Staff Key Authentication
Для операций кассира используется ключ сотрудника:
```http
X-Staff-Key: sk_live_xxxxxxxxxxxxxx
```

### Admin Key Authentication
Для административных операций:
```http
X-Admin-Key: ak_live_xxxxxxxxxxxxxx
```

### Bridge Signature
Для запросов от POS Bridge:
```http
X-Bridge-Signature: v1,ts=1234567890,sig=base64signature
```

Формирование подписи:
- Алгоритм: HMAC-SHA256
- Строка для подписи: `${ts}.${body}` (где `ts` — UNIX seconds, `body` — точный JSON тела запроса без изменений)
- Формат заголовка: `v1,ts=<unix_seconds>,sig=<base64(HMAC_SHA256(ts + '.' + body))>`

Проверка на стороне API:
1) распарсить `ts` и `sig` из заголовка; убедиться, что `ts` в разумном окне времени (рекомендуется ±300 секунд);
2) вычислить ожидаемую подпись `base64(HMAC_SHA256(ts + '.' + body, secret))` и сравнить с присланной `sig`;
3) разрешить временную ротацию секрета: если проверка не прошла основным `bridgeSecret`, попробовать `bridgeSecretNext`.

Где применяется (включается per-merchant настройкой `requireBridgeSig`):
- `POST /loyalty/quote` — при включённой настройке, сигнатура обязательна.
- `POST /loyalty/commit` — проверяется до выполнения; если hold привязан к устройству, используется секрет устройства (`Device.bridgeSecret`) вместо мерчантского.
- `POST /loyalty/refund` — аналогично `commit`, с учётом `deviceId` из тела.
- `POST /loyalty/qr` — если нет TeleAuth и Staff-Key, при включённой настройке требуется подпись.

Совместимость со Staff-Key: если у мерчанта включено требование Staff-Key (`requireStaffKey`), допускается либо `X-Staff-Key`, либо `X-Bridge-Signature` (см. `loyalty.controller.ts: enforceRequireStaffKey`).

Пример валидации:
```ts
import { createHmac } from 'crypto';

function verifyBridgeSignature(sigHeader: string, rawBody: string, secret: string, nowSec = Math.floor(Date.now()/1000)) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')) as any);
  const ts = Number(parts['ts']);
  const sig = parts['sig'];
  if (!ts || !sig) return false;
  if (Math.abs(nowSec - ts) > 300) return false; // окно ±5 минут
  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('base64');
  return expected === sig;
}
```

## Основные эндпоинты

### Программа лояльности

#### 1. Генерация QR-кода
```http
POST /loyalty/qr
Content-Type: application/json
X-Staff-Key: optional

{
  "customerId": "string",
  "merchantId": "string",
  "ttlSec": 60,
  "initData": "telegram_init_data" // optional
}

Response 200:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "ttl": 60
}
```

### Конфигурация антифрода (админка и ENV)

Антифрод настраивается через UI админки (страница `Anti-Fraud`) и/или через ENV переменные по умолчанию. Приоритет у настроек мерчанта в админке.

rulesJson.af структура на мерчанте:

```json
{
  "merchant": { "limit": 200, "windowSec": 3600, "dailyCap": 0, "weeklyCap": 0 },
  "device":   { "limit": 20,  "windowSec": 600,  "dailyCap": 0, "weeklyCap": 0 },
  "staff":    { "limit": 60,  "windowSec": 600,  "dailyCap": 0, "weeklyCap": 0 },
  "customer": { "limit": 5,   "windowSec": 120,  "dailyCap": 0, "weeklyCap": 0 },
  "blockFactors": ["blacklisted_customer", "balance_manipulation"]
}
```

- `limit` + `windowSec` — скользящее окно частоты операций
- `dailyCap` — суточный кап по операциям (0 = выключен)
- `weeklyCap` — кап за 7 суток (роллинг) (0 = выключен)
- `blockFactors` — список факторов скоринга, которые приводят к жёсткой блокировке, даже если уровень риска < CRITICAL

ENV переменные по умолчанию (используются, если per-merchant не задано):

```
ANTIFRAUD_GUARD=on
AF_LIMIT_MERCHANT=200
AF_WINDOW_MERCHANT_SEC=3600
AF_DAILY_CAP_MERCHANT=0
AF_WEEKLY_CAP_MERCHANT=0
AF_LIMIT_DEVICE=20
AF_WINDOW_DEVICE_SEC=600
AF_DAILY_CAP_DEVICE=0
AF_WEEKLY_CAP_DEVICE=0
AF_LIMIT_STAFF=60
AF_WINDOW_STAFF_SEC=600
AF_DAILY_CAP_STAFF=0
AF_WEEKLY_CAP_STAFF=0
AF_LIMIT_CUSTOMER=5
AF_WINDOW_CUSTOMER_SEC=120
AF_DAILY_CAP_CUSTOMER=0
AF_WEEKLY_CAP_CUSTOMER=0
```

### Блокировки

- Превышение лимитов/кап — 429 Too Many Requests, сообщение: `Антифрод: превышен лимит операций (...)`
- CRITICAL риск от скоринга — 429, сообщение: `Антифрод: высокий риск (CRITICAL)`
- Совпадение фактора из `blockFactors` — 429 с сообщением о факторе.

### Метрики и алерты

Публикуются Prometheus-метрики (см. `/metrics`):

- `antifraud_check_total{operation}` — количество проверок (commit/refund)
- `antifraud_risk_level_total{level}` — распределение уровней риска
- `antifraud_velocity_block_total{scope,operation}` — блокировки по лимитам/капам
- `antifraud_blocked_total{level,reason}` — блокировки по риску
- `antifraud_block_factor_total{factor}` — блокировки по фактору
- `antifraud_reviewed_total` — вручную рассмотренные проверки

В `infra/prometheus/alerts.yml` добавлены правила:

- `AntifraudCriticalBlocks` — CRITICAL блокировки за 5м
- `AntifraudVelocityBlocksHigh` — повышенная частота блокировок по velocity
- `AntifraudFactorBlocks` — срабатывания факторных блокировок
- `AntifraudHighRiskRatio` — доля HIGH среди проверок > 20% 10м

Telegram-алерты приложения (опционально) настраиваются через ENV:

```
ALERT_TELEGRAM_BOT_TOKEN=
ALERT_TELEGRAM_CHAT_ID=
```

При наличии токена/чата AntiFraudGuard отправляет уведомления при блокировках (velocity, CRITICAL, factor). Для Alertmanager Telegram-нотификаций настройте соответствующий receiver в `infra/alertmanager/alertmanager.yml`.

#### 2. Расчет операции (Quote)
```http
POST /loyalty/quote
Content-Type: application/json
X-Staff-Key: required_if_enabled

{
  "mode": "redeem" | "earn",
  "merchantId": "string",
  "userToken": "jwt_or_customer_id",
  "orderId": "string",
  "total": 1000,
  "eligibleTotal": 1000,
  "outletId": "string", // optional
  "deviceId": "string", // optional
  "staffId": "string",  // optional
  "category": "string",  // optional (для правил промо)
  "voucherCode": "string" // optional (применить ваучер перед расчётом)
}

Response 200 (REDEEM):
{
  "canRedeem": true,
  "discountToApply": 500,
  "pointsToBurn": 500,
  "finalPayable": 500,
  "holdId": "uuid",
  "message": "Списываем 500 ₽, к оплате 500 ₽"
}

Примечания к REDEEM:
- Дневной лимит: если у мерчанта задан `redeemDailyCap`, то к расчёту применяется остаток за последние 24 часа — `dailyRedeemLeft = max(0, redeemDailyCap - sum(recent REDEEM))`. Итоговое списание равно `min(wallet.balance, redeemCapByBps, dailyRedeemLeft)`.
- Лимит на заказ: если в прошлых операциях по `orderId` уже списано `receipt.redeemApplied`, то новый quote учитывает остаток по заказу: `remainingByOrder = max(0, redeemCapByBps - redeemApplied)`.

Response 200 (EARN):
{
  "canEarn": true,
  "pointsToEarn": 50,
  "holdId": "uuid",
  "message": "Начислим 50 баллов после оплаты"
}

Примечания к EARN:

- Дневной лимит: если у мерчанта задан `earnDailyCap`, к расчёту применяется остаток за последние 24 часа — `dailyEarnLeft = max(0, earnDailyCap - sum(recent EARN))`. Итоговое начисление равно `min(pointsByBps, dailyEarnLeft)`.

## Уровни и бонусы

Поддерживаются уровни клиента (levels) с бонусами к базовым ставкам начисления/списания.

- Конфигурация хранится в `MerchantSettings.rulesJson` в виде объекта со следующей структурой:

```json
{
  "rules": [
    { "if": { "channelIn": ["VIRTUAL"], "weekdayIn": [1,2,3,4,5] }, "then": { "earnBps": 600 } }
  ],
  "levelsCfg": {
    "periodDays": 365,
    "metric": "earn",        // earn | redeem | transactions
    "levels": [
      { "name": "Base",   "threshold": 0 },
      { "name": "Silver", "threshold": 500 },
      { "name": "Gold",   "threshold": 1000 }
    ]
  },
  "levelBenefits": {
    "earnBpsBonusByLevel": { "Base": 0, "Silver": 200, "Gold": 400 },
    "redeemLimitBpsBonusByLevel": { "Base": 0, "Silver": 1000, "Gold": 2000 }
  }
}
```

Пояснения:

- `levelsCfg.metric` и `periodDays` определяют, как считается текущий уровень:
  - `earn` — сумма начислений за период.
  - `redeem` — сумма списаний за период (по модулю).
  - `transactions` — количество операций за период.
- Текущий уровень определяется максимальным `threshold`, не превышающим накопленное значение.
- Бонусы уровня добавляются к базовым ставкам мерчанта/правил: `earnBps += earnBpsBonusByLevel[current]`, `redeemLimitBps += redeemLimitBpsBonusByLevel[current]`.

Конфигурацию можно редактировать в админке на странице настроек мерчанта (редакторы `Levels config` и `Level benefits`).

### Получение текущего уровня клиента

```http
GET /levels/{merchantId}/{customerId}

Response 200:
{
  "merchantId": "M-1",
  "customerId": "C-1",
  "metric": "earn",
  "periodDays": 365,
  "value": 750,
  "current": { "name": "Silver", "threshold": 500 },
  "next": { "name": "Gold", "threshold": 1000 },
  "progressToNext": 0.5
}
```

Примечание: бонусы уровня автоматически применяются при расчёте `POST /loyalty/quote`.

### Примеры конфигурации уровней

1) Базовая трёхуровневая схема

```json
{
  "levelsCfg": {
    "periodDays": 365,
    "metric": "earn",
    "levels": [
      { "name": "Base",   "threshold": 0 },
      { "name": "Silver", "threshold": 500 },
      { "name": "Gold",   "threshold": 1000 }
    ]
  },
  "levelBenefits": {
    "earnBpsBonusByLevel": { "Base": 0, "Silver": 200, "Gold": 400 },
    "redeemLimitBpsBonusByLevel": { "Base": 0, "Silver": 1000, "Gold": 2000 }
  }
}
```

2) По количеству транзакций за 90 дней

```json
{
  "levelsCfg": {
    "periodDays": 90,
    "metric": "transactions",
    "levels": [
      { "name": "New",     "threshold": 0 },
      { "name": "Regular", "threshold": 5 },
      { "name": "VIP",     "threshold": 15 }
    ]
  },
  "levelBenefits": {
    "earnBpsBonusByLevel": { "New": 0, "Regular": 100, "VIP": 300 },
    "redeemLimitBpsBonusByLevel": { "New": 0, "Regular": 500, "VIP": 2000 }
  }
}
```

## TTL/Сгорание баллов

Система поддерживает превью сгорания и фактическое сгорание баллов по TTL.

- Настройка TTL на мерчанте: `MerchantSettings.pointsTtlDays` (0/empty — выключено).
- Фичефлаги/интервалы:
  - `POINTS_TTL_FEATURE=1` — включает превью сгорания (worker `PointsTtlWorker`).
  - `POINTS_TTL_BURN=1` — включает фактическое сгорание (worker `PointsBurnWorker`).
  - `EARN_LOTS_FEATURE=1` — включает точный учёт по лотам (рекомендуется при TTL).
  - `POINTS_TTL_INTERVAL_MS` — период превью (default 6h).
  - `POINTS_TTL_BURN_INTERVAL_MS` — период сжигания (default 6h).

Поведение:

1) Превью (`PointsTtlWorker`)

- При `EARN_LOTS_FEATURE=1`: ищутся активные лоты с `earnedAt < now - ttlDays`, агрегируются остатки; для каждого клиента создаётся outbox-событие
  `eventType = loyalty.points_ttl.preview` с payload `{ merchantId, customerId, expiringPoints, computedAt, mode: 'lots' }`.
- Иначе: используется приближённая оценка `tentativeExpire = wallet.balance - recentEarn(ttlDays)` и пишется событие `{ tentativeExpire, mode: 'approx' }`.

2) Сгорание (`PointsBurnWorker`)

- По каждому клиенту с просроченными лотами рассчитывается объём списания `burnAmount = min(wallet.balance, sum(remainingLots))`.
- Списываются лоты (увеличение `consumedPoints`), уменьшается баланс кошелька, создаётся транзакция `ADJUST` и событие
  `eventType = loyalty.points_ttl.burned` с `{ merchantId, customerId, amount, cutoff }`. При включённом `LEDGER_FEATURE` создаётся зеркальная проводка.

Админка:

- Поле `TTL баллов (дни)` на странице настроек мерчанта управляет `pointsTtlDays`.

Примечание:

- Для детерминированности в тестах установите `WORKERS_ENABLED=0` и `METRICS_DEFAULTS=0`, а сами воркеры покрыты unit-тестами.

## Порядок применения скидок и бонусов

Последовательность в расчёте `POST /loyalty/quote`:

1) Ваучер (если указан `voucherCode`) — уменьшает `eligibleTotal` и `total`.
2) Промо‑правила (`rulesJson.promos`) — применяются к уменьшенному `eligibleTotal`.
3) Базовые правила начисления/лимитов (`rulesJson.rules` или базовые ставки мерчанта).
4) Бонусы уровня (Levels) — добавляются поверх базовых ставок: `earnBps += levelEarnBonus`, `redeemLimitBps += levelRedeemBonus`.

Итоговые формулы (упрощённо):

```text
eligible' = eligibleTotal - voucherDiscount(eligibleTotal) - promoDiscount(eligibleTotal)
earnPoints = floor( eligible' * (earnBps_base + earnBps_bonus(level)) / 10000 )
redeemCap  = floor( eligible' * (redeemBps_base + redeemBps_bonus(level)) / 10000 )
```

Числовой пример:

- База мерчанта: `earnBps=500` (5%), `redeemLimitBps=5000` (50%).
- Уровень клиента: Silver (`earnBpsBonus=+200`, `redeemLimitBpsBonus=+1000`).
- Ваучер 10% и промо −50 на чек 1000.

Расчёт:

```
eligible: 1000 → voucher -10% = 900 → promo -50 = 850
EARN: 850 * (500+200)/10000 = floor(850 * 0.07) = 59 баллов
REDEEM cap: 850 * (5000+1000)/10000 = floor(850 * 0.6) = 510
```

#### 3. Подтверждение операции (Commit)
```http
POST /loyalty/commit
Content-Type: application/json
Idempotency-Key: unique_key
X-Staff-Key: required_if_enabled

{
  "merchantId": "string",
  "holdId": "uuid",
  "orderId": "string",
  "receiptNumber": "string", // optional
  "requestId": "string",      // optional
  "voucherCode": "string"     // optional (идемпотентная фиксация использования ваучера)
}

Response 200:
{
  "ok": true,
  "receiptId": "uuid",
  "redeemApplied": 500,
  "earnApplied": 0,
  "alreadyCommitted": false
}
```

#### 4. Возврат
```http
POST /loyalty/refund
Content-Type: application/json
Idempotency-Key: unique_key
X-Staff-Key: required_if_enabled

{
  "merchantId": "string",
  "orderId": "string",
  "refundTotal": 1000,
  "refundEligibleTotal": 1000, // optional
  "deviceId": "string"          // optional
}

Response 200:
{
  "ok": true,
  "share": 0.5,
  "pointsRestored": 250,
  "pointsRevoked": 25
}
```

#### 5. Баланс
```http
GET /loyalty/balance/{merchantId}/{customerId}

Response 200:
{
  "merchantId": "string",
  "customerId": "string",
  "balance": 1500
}
```

#### 6. История транзакций
```http
GET /loyalty/transactions?merchantId={merchantId}&customerId={customerId}&limit=20&before={date}

Response 200:
{
  "items": [
    {
      "id": "uuid",
      "type": "EARN" | "REDEEM" | "REFUND" | "ADJUST",
      "amount": 100,
      "orderId": "string",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "nextBefore": "2024-01-01T00:00:00Z"
}
```

### Ваучеры

#### 1. Предпросмотр скидки по ваучеру
```http
POST /vouchers/preview
Content-Type: application/json

{
  "merchantId": "M1",
  "code": "TENOFF",
  "eligibleTotal": 1000,
  "customerId": "optional"
}

Response 200:
{
  "canApply": true,
  "discount": 100,
  "voucherId": "V1",
  "codeId": "C1",
  "reason": null
}
```

#### 2. Выпуск ваучера/кода
```http
POST /vouchers/issue
Content-Type: application/json

{
  "merchantId": "M1",
  "valueType": "PERCENTAGE", // или FIXED_AMOUNT
  "value": 10,
  "code": "TENOFF",
  "validFrom": "2025-01-01T00:00:00Z",
  "validUntil": "2025-12-31T23:59:59Z",
  "minPurchaseAmount": 500
}

Response 200:
{ "ok": true, "voucherId": "V1" }
```

#### 3. Фиксация использования ваучера (идемпотентно по orderId)
```http
POST /vouchers/redeem
Content-Type: application/json

{
  "merchantId": "M1",
  "code": "TENOFF",
  "customerId": "C1",
  "eligibleTotal": 1000,
  "orderId": "ORDER-1"
}

Response 200:
{ "ok": true, "discount": 100 }
```

#### 4. Статус ваучера/кода
```http
POST /vouchers/status
Content-Type: application/json

{ "merchantId": "M1", "code": "TENOFF" }

Response 200:
{
  "voucherId": "V1",
  "codeId": "C1",
  "code": "TENOFF",
  "voucherStatus": "ACTIVE",
  "voucherActive": true,
  "codeStatus": "ACTIVE",
  "codeUsedCount": 0,
  "codeMaxUses": 1,
  "validFrom": "2025-01-01T00:00:00Z",
  "validUntil": "2025-12-31T23:59:59Z"
}
```

#### 5. Деактивация ваучера/кода
```http
POST /vouchers/deactivate
Content-Type: application/json

{ "merchantId": "M1", "code": "TENOFF" }

Response 200:
{ "ok": true }
```

## Referrals (beta/preview)

Модуль рефералов находится в статусе beta. Контракты могут меняться. Минимальный набор эндпоинтов:

- `POST /referral/program` — создать программу. Ошибка 400, если активная программа уже существует.
  - Тело: `{ merchantId, name, referrerReward, refereeReward, expiryDays? }`
  - Ответ 201: `{ id, merchantId, status: "ACTIVE" }`

- `POST /referral/create` — создать реферальную ссылку/код для реферера.
  - Тело: `{ merchantId, referrerId, channel: "LINK"|"CODE" }`
  - Ответ 201: `{ id, code, link }`

- `POST /referral/activate` — активировать код реферала (реферал стал клиентом; может быть начислен приветственный бонус).
  - Тело: `{ code, refereeId }`
  - Ответ 201: `{ success: true, message }`

- `POST /referral/complete` — завершить реферал после первой покупки (начисление бонуса рефереру).
  - Тело: `{ refereeId, merchantId, purchaseAmount }`
  - Ответ 201: `{ success: true, referralId, rewardIssued }`

Примечания:

- Для начислений/списаний в рамках активации используются общие сервисы лояльности (`LoyaltyService`), включая транзакционную запись Wallet/Transaction и события Outbox.
- Рекомендуется проверка самореферала и повторов (идемпотентность по связке `programId+referrerId+refereeId`).

## Управление мерчантами

### Настройки мерчанта
```http
GET /admin/merchant/{merchantId}/settings
X-Admin-Key: required

Response 200:
{
  "merchantId": "string",
  "earnBps": 500,
  "redeemLimitBps": 5000,
  "qrTtlSec": 120,
  "webhookUrl": "https://merchant.com/webhook",
  "requireStaffKey": true,
  "requireBridgeSig": false,
  "telegramBotToken": "encrypted",
  "miniappBaseUrl": "https://app.loyalty.com"
}
```

### Обновление настроек
```http
PUT /admin/merchant/{merchantId}/settings
X-Admin-Key: required
Content-Type: application/json

{
  "earnBps": 500,
  "redeemLimitBps": 5000,
  "webhookUrl": "https://merchant.com/webhook",
  "webhookSecret": "new_secret"
}
```

### Управление сотрудниками
```http
POST /admin/merchant/{merchantId}/staff
X-Admin-Key: required

{
  "login": "cashier01",
  "email": "cashier@example.com",
  "role": "CASHIER" | "MANAGER" | "ADMIN",
  "allowedOutletId": "uuid" // optional
}

Response 200:
{
  "id": "uuid",
  "apiKey": "sk_live_xxxxx" // показывается только один раз
}
```

### Merchant Portal — Каталог и торговые точки

Все эндпоинты ниже требуют JWT портала (заголовок `Authorization: Bearer <token>`). Ответы содержат только данные текущего мерчанта.

#### Категории товаров

```http
GET /portal/catalog/categories
Authorization: Bearer <portal_jwt>

Response 200:
[
  {
    "id": "cat_1",
    "name": "Пицца",
    "slug": "pizza",
    "description": "string | null",
    "imageUrl": "https://... | null",
    "parentId": "cat_parent | null",
    "order": 1010
  }
]
```

```http
POST /portal/catalog/categories
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "name": "Десерты",
  "slug": "desserts",            // optional, генерируется автоматически
  "description": "Раздел сладкого",
  "imageUrl": "https://cdn/...",
  "parentId": "cat_parent"       // optional
}

Response 200: объект категории
```

```http
PUT /portal/catalog/categories/{categoryId}
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "name": "Салаты",
  "slug": "salads"
}

Response 200: объект категории
```

```http
POST /portal/catalog/categories/reorder
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "items": [
    { "id": "cat_1", "order": 1000 },
    { "id": "cat_2", "order": 1010 }
  ]
}

Response 200: { "ok": true, "updated": 2 }
```

```http
DELETE /portal/catalog/categories/{categoryId}
Authorization: Bearer <portal_jwt>

Response 200: { "ok": true }
```

#### Товары

```http
GET /portal/catalog/products?status=visible&points=with_points&categoryId=cat_1&search=маргарита
Authorization: Bearer <portal_jwt>

Response 200:
{
  "items": [
    {
      "id": "prd_1",
      "name": "Маргарита",
      "sku": "PZ-001",
      "categoryId": "cat_1",
      "categoryName": "Пицца",
      "previewImage": "https://cdn/...",
      "visible": true,
      "accruePoints": true,
      "allowRedeem": true,
      "purchasesMonth": 120,
      "purchasesTotal": 1450
    }
  ],
  "total": 1
}
```

```http
GET /portal/catalog/products/{productId}
Authorization: Bearer <portal_jwt>

Response 200:
{
  "id": "prd_1",
  "name": "Маргарита",
  "sku": "PZ-001",
  "order": 1000,
  "description": "Тонкое тесто, моцарелла",
  "categoryId": "cat_1",
  "categoryName": "Пицца",
  "iikoProductId": "ext-100",
  "hasVariants": false,
  "priceEnabled": true,
  "price": 890,
  "disableCart": false,
  "redeemPercent": 100,
  "tags": ["Популярный"],
  "images": [{ "url": "https://cdn/...", "alt": "main", "position": 0 }],
  "variants": [],
  "stocks": [
    { "label": "Основной склад", "outletId": "out-1", "price": 890, "balance": 25, "currency": "RUB" }
  ],
  "visible": true,
  "accruePoints": true,
  "allowRedeem": true,
  "purchasesMonth": 120,
  "purchasesTotal": 1450
}
```

```http
POST /portal/catalog/products
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "name": "Филадельфия",
  "sku": "SU-101",
  "categoryId": "cat_2",
  "priceEnabled": true,
  "price": 520,
  "visible": true,
  "accruePoints": true,
  "allowRedeem": true,
  "redeemPercent": 100,
  "tags": ["Новинка"],
  "images": [{ "url": "https://cdn/sushi.jpg" }],
  "stocks": [{ "label": "Центральный склад", "balance": 10 }]
}

Response 200: объект товара
```

```http
PUT /portal/catalog/products/{productId}
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "price": 540,
  "allowRedeem": false,
  "tags": ["Популярный", "Для вегетарианцев"]
}

Response 200: объект товара
```

```http
DELETE /portal/catalog/products/{productId}
Authorization: Bearer <portal_jwt>

Response 200: { "ok": true }
```

```http
POST /portal/catalog/products/bulk
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "action": "show" | "hide" | "allow_redeem" | "forbid_redeem" | "delete",
  "ids": ["prd_1", "prd_2"]
}

Response 200: { "ok": true, "updated": 2 }
```

#### Торговые точки портала

```http
GET /portal/outlets?status=active&search=московской
Authorization: Bearer <portal_jwt>

Response 200:
{
  "items": [
    {
      "id": "out-1",
      "name": "Тили-Тесто, Московской 56",
      "address": "Новосибирск, Московская, 56",
      "works": true,
      "hidden": false,
      "description": "Вход со двора",
      "phone": "+7 (913) 000-00-00",
      "adminEmails": ["manager@example.com"],
      "timezone": "UTC+07",
      "showSchedule": true,
      "schedule": { "mode": "CUSTOM", "days": [...] },
      "latitude": 55.0286,
      "longitude": 82.9284,
      "manualLocation": true,
      "externalId": "BR-0001",
      "createdAt": "2024-02-01T09:00:00.000Z",
      "updatedAt": "2024-02-05T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

```http
GET /portal/outlets/{outletId}
Authorization: Bearer <portal_jwt>

Response 200: объект торговой точки
```

```http
POST /portal/outlets
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "works": true,
  "hidden": false,
  "name": "Тили-Тесто, Московской 56",
  "description": "Вход со двора",
  "phone": "+7 (913) 000-00-00",
  "address": "Новосибирск, Московская, 56",
  "manualLocation": true,
  "latitude": 55.0286,
  "longitude": 82.9284,
  "adminEmails": ["manager@example.com"],
  "timezone": "UTC+07",
  "showSchedule": true,
  "schedule": { "mode": "CUSTOM", "days": [{ "day": "mon", "enabled": true, "from": "10:00", "to": "22:00" }] },
  "externalId": "BR-0001"
}

Response 200: объект торговой точки
```

```http
PUT /portal/outlets/{outletId}
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "works": false,
  "hidden": true,
  "showSchedule": false,
  "externalId": "BR-0001"
}

Response 200: объект торговой точки
```

```http
DELETE /portal/outlets/{outletId}
Authorization: Bearer <portal_jwt>

Response 200: { "ok": true }
```

## Telegram Bot Integration

### Регистрация бота
```http
POST /admin/merchant/{merchantId}/telegram-bot
X-Admin-Key: required

{
  "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
}

Response 200:
{
  "success": true,
  "username": "@merchant_loyalty_bot",
  "webhookUrl": "https://api.loyalty.com/telegram/webhook/{merchantId}"
}
```

### Обработка webhook
```http
POST /telegram/webhook/{merchantId}
Content-Type: application/json

{
  "update_id": 123456789,
  "message": {
    "message_id": 1,
    "from": {...},
    "chat": {...},
    "text": "/start"
  }
}
```

## Интеграции с кассами

### АТОЛ
```http
POST /integrations/atol/register
X-Admin-Key: required

{
  "merchantId": "string",
  "login": "atol_login",
  "password": "atol_password",
  "groupCode": "group_code",
  "inn": "1234567890"
}
```

### Эвотор
```http
POST /integrations/evotor/register
X-Admin-Key: required

{
  "merchantId": "string",
  "evotorToken": "evotor_api_token"
}

POST /integrations/evotor/webhook/{integrationId}
Content-Type: application/json
X-Evotor-Signature: signature

{
  "id": "uuid",
  "timestamp": "2024-01-01T00:00:00Z",
  "type": "receipt.sell",
  "data": {...}
}
```

## POS Bridge

### Quote через Bridge
```http
POST http://localhost:18080/quote
Content-Type: application/json

{
  "mode": "redeem",
  "orderId": "POS-123",
  "total": 1000,
  "userToken": "jwt_or_qr"
}
```

### Commit через Bridge
```http
POST http://localhost:18080/commit
Content-Type: application/json

{
  "holdId": "uuid",
  "orderId": "POS-123",
  "idempotencyKey": "unique_key"
}
```

## Вебхуки

### Формат вебхука
```http
POST https://merchant.com/webhook
Content-Type: application/json
X-Loyalty-Signature: v1,ts=1234567890,sig=base64signature
X-Merchant-Id: M-1

{
  "event": "loyalty.commit",
  "data": {
    "holdId": "uuid",
    "orderId": "string",
    "customerId": "string",
    "merchantId": "string",
    "redeemApplied": 500,
    "earnApplied": 50,
    "receiptId": "uuid",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Проверка подписи
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(signature, body, secret) {
  const [version, ts, sig] = signature.split(',').map(p => p.split('=')[1]);
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${body}`)
    .digest('base64');
  
  return sig === expectedSig;
}
```

### События
- `loyalty.commit` - Подтверждение транзакции
- `loyalty.refund` - Возврат
- `subscription.created` - Создание подписки
- `subscription.updated` - Обновление подписки
- `subscription.canceled` - Отмена подписки
- `payment.succeeded` - Успешный платеж
- `payment.failed` - Неудачный платеж
- `trial.expired` - Истечение пробного периода

## Подписки и тарифы

### Получение доступных планов
```http
GET /subscription/plans

Response 200:
{
  "plans": [
    {
      "id": "plan_starter",
      "name": "Стартовый",
      "price": 1990,
      "currency": "RUB",
      "interval": "month",
      "features": {
        "maxTransactions": 10000,
        "maxCustomers": 1000,
        "maxOutlets": 3,
        "webhooksEnabled": true,
        "customBranding": false
      }
    }
  ]
}
```

### Создание подписки
```http
POST /subscription/create
X-Admin-Key: required

{
  "merchantId": "string",
  "planId": "plan_starter",
  "trialDays": 14
}
```

### Проверка лимитов
```http
GET /subscription/{merchantId}/usage

Response 200:
{
  "plan": {
    "id": "plan_starter",
    "name": "Стартовый"
  },
  "usage": {
    "transactions": {
      "used": 5432,
      "limit": 10000,
      "percentage": 54
    },
    "customers": {
      "used": 234,
      "limit": 1000,
      "percentage": 23
    }
  },
  "status": "active",
  "currentPeriodEnd": "2024-02-01T00:00:00Z"
}
```

## Антифрод

### Проверка транзакции
```http
POST /antifraud/check
Content-Type: application/json

{
  "merchantId": "string",
  "customerId": "string",
  "amount": 10000,
  "type": "REDEEM",
  "deviceId": "string",
  "ipAddress": "192.168.1.1"
}

Response 200:
{
  "level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "score": 25,
  "factors": [
    "large_amount:10000",
    "new_device"
  ],
  "shouldBlock": false,
  "shouldReview": false
}
```

## Коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Bad Request - Неверные параметры запроса |
| 401 | Unauthorized - Требуется аутентификация |
| 403 | Forbidden - Недостаточно прав |
| 404 | Not Found - Ресурс не найден |
| 409 | Conflict - Конфликт (например, hold уже использован) |
| 429 | Too Many Requests - Превышен лимит запросов |
| 500 | Internal Server Error - Внутренняя ошибка сервера |

### Формат ошибки
```json
{
  "statusCode": 400,
  "message": "QR токен уже использован",
  "error": "Bad Request"
}
```

## Rate Limiting

Лимиты по умолчанию:
- `/loyalty/quote`: 120 запросов в минуту
- `/loyalty/commit`: 30 запросов в минуту
- `/loyalty/qr`: 10 запросов в минуту
- `/loyalty/refund`: 10 запросов в минуту

Заголовки ответа:
```http
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 119
X-RateLimit-Reset: 1234567890
```

## Идемпотентность

Для обеспечения идемпотентности используйте заголовок:
```http
Idempotency-Key: unique-key-for-this-request
```

Ключи хранятся 72 часа. При повторном запросе с тем же ключом вернется кешированный ответ.

## Примеры использования

### CURL
```bash
# Генерация QR
curl -X POST https://api.loyalty.com/loyalty/qr \
  -H "Content-Type: application/json" \
  -d '{"customerId":"user-1","merchantId":"M-1"}'

# Quote
curl -X POST https://api.loyalty.com/loyalty/quote \
  -H "Content-Type: application/json" \
  -H "X-Staff-Key: sk_live_xxxxx" \
  -d '{"mode":"earn","merchantId":"M-1","userToken":"jwt","orderId":"123","total":1000,"eligibleTotal":1000}'
```

### JavaScript/TypeScript
```typescript
// SDK пример
import { LoyaltyClient } from '@loyalty/sdk';

const client = new LoyaltyClient({
  apiKey: 'sk_live_xxxxx',
  baseUrl: 'https://api.loyalty.com'
});

// Quote
const quote = await client.quote({
  mode: 'earn',
  merchantId: 'M-1',
  userToken: qrToken,
  orderId: 'ORDER-123',
  total: 1000,
  eligibleTotal: 1000
});

// Commit
const result = await client.commit({
  merchantId: 'M-1',
  holdId: quote.holdId,
  orderId: 'ORDER-123'
});
```

### Merchant Portal API — рассылки, акции и мотивация

| Endpoint | Метод | Описание |
| --- | --- | --- |
| `/portal/push-campaigns?scope=ACTIVE\|ARCHIVED` | GET | Списки push-кампаний мерчанта (активные или архивные). |
| `/portal/push-campaigns` | POST | Создание новой push-рассылки. Требует `text`, `audience`, `scheduledAt`. |
| `/portal/push-campaigns/{id}/cancel` | POST | Отмена запланированной рассылки. |
| `/portal/push-campaigns/{id}/archive` | POST | Перенос кампании в архив. |
| `/portal/push-campaigns/{id}/duplicate` | POST | Копирование кампании с новым расписанием. |
| `/portal/telegram-campaigns?scope=ACTIVE\|ARCHIVED` | GET | Активные и архивные Telegram-рассылки. |
| `/portal/telegram-campaigns` | POST | Создание Telegram-рассылки (аудитория, текст, опционально изображение и дата старта). |
| `/portal/telegram-campaigns/{id}/cancel` | POST | Отмена Telegram-кампании до начала отправки. |
| `/portal/telegram-campaigns/{id}/archive` | POST | Архивирование Telegram-кампании. |
| `/portal/telegram-campaigns/{id}/duplicate` | POST | Создание копии Telegram-кампании. |
| `/portal/staff-motivation` | GET | Текущие настройки мотивации персонала. |
| `/portal/staff-motivation` | PUT | Обновление мотивации (включение/отключение, баллы, период рейтинга). |
| `/portal/actions?tab=UPCOMING\|CURRENT\|PAST` | GET | Табличный список акций по вкладкам. |
| `/portal/actions/{id}` | GET | Детальная информация по акции. |
| `/portal/actions/product-bonus` | POST | Создание акции типа «акционные баллы на товары». |
| `/portal/actions/{id}/status` | POST | Пауза или возобновление акции (`action=PAUSE|RESUME`). |
| `/portal/actions/{id}/archive` | POST | Перенос акции в архив. |
| `/portal/actions/{id}/duplicate` | POST | Создание черновика на основе существующей акции. |
| `/portal/operations/log` | GET | Журнал начислений и списаний с фильтрами (даты, сотрудник, точка, направление). |
| `/portal/operations/log/{receiptId}` | GET | Детали конкретной операции (состав транзакций, возможность отмены). |

Каждый эндпоинт требует аутентифицированного вызова из Merchant Portal. Поля дат (`scheduledAt`, `startDate`, `endDate`) передаются в формате ISO 8601.

## Поддержка

- Email: support@loyalty.com
- Telegram: @loyalty_support
- Документация: https://docs.loyalty.com
- Status Page: https://status.loyalty.com
