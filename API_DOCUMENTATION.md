# API Documentation - Loyalty Program

## Содержание
- [Аутентификация](#аутентификация)
- [Основные эндпоинты](#основные-эндпоинты)
- [Интеграции REST API](#интеграции-rest-api)
- [Программа лояльности](#программа-лояльности)
- [Управление мерчантами](#управление-мерчантами)
- [Вебхуки](#вебхуки)
- [Коды ошибок](#коды-ошибок)
- [Уровни и бонусы](#уровни-и-бонусы)
- [TTL/Сгорание баллов](#ttlsгорание-баллов)

## Базовый URL
Production: https://api.loyalty.example.com
Staging: https://api-staging.loyalty.example.com
Local: http://localhost:3000
```

> Поддержка внешних платежных провайдеров и кассовых интеграций (YooKassa/CloudPayments/Тинькофф, АТОЛ/Эвотор/Poster/МодульКасса/1С) отключена. Подписки ведутся без сторонних платежей, кассовые вебхуки больше не принимаются.

## Аутентификация

### Cashier Session Authentication
Фронтенд кассира проходит двухшаговую авторизацию:

1. **Активация устройства** — `POST /loyalty/cashier/activate`
   ```json
   {
     "merchantLogin": "market123",
     "activationCode": "123456789"
   }
   ```
   При успешной активации ставится HTTP-only кука `cashier_device`.

2. **Запуск сессии сотрудника** — `POST /loyalty/cashier/session`
   ```json
   {
     "merchantLogin": "market123",
     "pinCode": "0421",
     "rememberPin": true
   }
   ```
   Требует активную `cashier_device` cookie. При успешном запросе устанавливается HTTP-only кука `cashier_session`, а в ответе возвращаются данные сотрудника и торговой точки. Если пользователь выбрал `rememberPin=true`, фронт хранит PIN в своей cookie для автоподстановки.

3. **Проверка активной сессии** — `GET /loyalty/cashier/session`
   Возвращает `{ "active": true, ... }` и сведения о текущем сотруднике; при отсутствии сессии — `{ "active": false }`.

4. **Выход** — `DELETE /loyalty/cashier/session`
   Завершает серверную сессию и очищает cookie.

Все защищённые операции (`quote`, `commit`, `refund`, и т.д.) должны выполняться с `credentials: 'include'`, чтобы браузер отправлял `cashier_session`.

#### GET /loyalty/cashier/leaderboard
- Требует активную cookie-сессию кассира (`cashier_session`).
- Query-параметры:
  - `merchantId` — идентификатор мерчанта (обязателен, но при запросе из браузера подставляется из сессии).
  - `outletId` — опционально, чтобы ограничить рейтинг конкретной торговой точкой (не может отличаться от точки сессии кассира).
- Ответ:
  ```json
  {
    "enabled": true,
    "settings": {
      "pointsForNewCustomer": 30,
      "pointsForExistingCustomer": 10,
      "leaderboardPeriod": "month",
      "customDays": null,
      "updatedAt": "2025-11-05T10:15:00.123Z"
    },
    "period": {
      "kind": "month",
      "label": "Последние 30 дней",
      "days": 30,
      "customDays": null,
      "from": "2025-10-07T00:00:00.000Z",
      "to": "2025-11-05T23:59:59.999Z"
    },
    "items": [
      {
        "staffId": "S-123",
        "staffName": "Ирина М.",
        "staffDisplayName": "Ирина М.",
        "staffLogin": "irina",
        "outletId": "OUT-1",
        "outletName": "Кофейня на Тверской",
        "points": 320
      }
    ]
  }
  ```
- Начисление очков идёт только по покупкам с привязанным сотрудником; возвраты и отмены снижают рейтинг пропорционально доле возврата.

#### POST /loyalty/cashier/customer
- Требует активную cookie-сессию кассира.
- Позволяет термналу получить `customerId` и базовую информацию о клиенте по QR-токену.
- Тело запроса:
  ```json
  {
    "merchantId": "M-100",
    "userToken": "jwt_or_plain_token"
  }
  ```
- Ответ 200:
  ```json
  {
    "customerId": "mc_123",
    "customerId": "c_456",
    "name": "Иван Петров",
    "balance": 1800
  }
  ```
- Если QR выписан для другого мерчанта — 400 с текстом `QR выписан для другого мерчанта`.
- Поле `balance` может быть `null`, если кошелёк ещё не создан; фронтенд может вызвать `/loyalty/balance` с полученным `customerId`, чтобы пересчитать баланс.

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
- `POST /loyalty/commit` — проверяется до выполнения; если hold привязан к торговой точке, используется секрет точки (`Outlet.bridgeSecret` или `bridgeSecretNext`) вместо мерчантского.
- `POST /loyalty/refund` — аналогично `commit`; для новых интеграций требуется `outletId`.
- `POST /loyalty/qr` — если нет TeleAuth и Staff-Key, при включённой настройке требуется подпись.

Совместимость со Staff-Key: если для мерчанта вручную включено требование Staff-Key (`requireStaffKey`, настраивается только через backend/поддержку), допускается либо `X-Staff-Key`, либо `X-Bridge-Signature` (см. `loyalty.controller.ts: enforceRequireStaffKey`).

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

### PortalAuth JWT

Merchant Portal использует отдельный JWT, выдаваемый при логине по email.

- `POST /portal/auth/login`
  ```json
  {
    "email": "owner@example.com",
    "password": "secret123",
    "code": "123456" // требуется только если у мерчанта включён TOTP
  }
  ```
  Успешный ответ: `{ "token": "<jwt>", "refreshToken": "<jwt>" }`.
  
  Хранение на фронтенде (Next.js Merchant Portal):
  - `portal_jwt` — httpOnly cookie, `path=/`, `SameSite=Lax`, `Secure` в прод, `maxAge=24h`, опциональный `domain` из `PORTAL_COOKIE_DOMAIN`.
  - `portal_refresh` — httpOnly cookie, `path=/`, `SameSite=Lax`, `Secure` в прод, `maxAge=30d`, опциональный `domain`.
  - При получении `401` фронт вызывает `POST /portal/auth/refresh` и пересохраняет куки.

- `POST /portal/auth/refresh`
  ```json
  { "refreshToken": "<jwt>" }
  ```
  Ответ: `{ "token": "<jwt>", "refreshToken": "<jwt>" }` (refresh-токен ротируется).

- `GET /portal/auth/me`
  ```json
  {
    "merchantId": "M-123",
    "role": "MERCHANT",
    "actor": "MERCHANT",
    "staffId": null,
    "adminImpersonation": false,
    "permissions": {
      "__all__": ["*"]
    },
    "staff": null
  }
  ```
  Для сотрудников поле `actor` = `STAFF`, `staffId` содержит их идентификатор, а `permissions` включает разрешения, собранные из групп доступа (`resource` → список действий). Backend проверяет, что сотрудник активен и имеет `portalAccessEnabled/canAccessPortal`.

### Аналитика: распределение по времени

> Ноябрь 2025. Эндпоинты работают на живых чеках: отменённые (`canceledAt != null`) и возвратные операции (отрицательные/REFUND) исключаются автоматически.

#### `GET /analytics/time/recency/{merchantId}`

Распределение клиентов по давности последней покупки. Параметры:
- `group` — `day` | `week` | `month`, по умолчанию `day`;
- `limit` — количество интервалов (дни до 365, недели до 52, месяцы до 12).

```json
{
  "group": "day",
  "totalCustomers": 142,
  "buckets": [
    { "index": 0, "value": 0, "label": "0", "customers": 26 },
    { "index": 1, "value": 1, "label": "1", "customers": 18 },
    { "index": 2, "value": 2, "label": "2", "customers": 11 },
    { "index": 3, "value": 3, "label": "3", "customers": 9 }
  ]
}
```

#### `GET /analytics/time/activity/{merchantId}`

Активность по дням недели, часам и тепло-карта. Параметры: `period` (`day|week|month|quarter|year`), либо `from`/`to` (ISO). Ответ:

```json
{
  "dayOfWeek": [
    { "day": 1, "orders": 42, "customers": 38, "revenue": 128400, "averageCheck": 3057.14 },
    { "day": 2, "orders": 51, "customers": 44, "revenue": 156900, "averageCheck": 3076.47 }
  ],
  "hours": [
    { "hour": 9, "orders": 18, "customers": 17, "revenue": 61200, "averageCheck": 3400 },
    { "hour": 10, "orders": 22, "customers": 19, "revenue": 74800, "averageCheck": 3400 }
  ],
  "heatmap": [
    { "day": 1, "hour": 9, "orders": 5, "customers": 5, "revenue": 18200, "averageCheck": 3640 },
    { "day": 1, "hour": 10, "orders": 7, "customers": 6, "revenue": 24500, "averageCheck": 3500 }
  ]
}
```

#### Portal proxy

- `GET /portal/analytics/dashboard` — принимает `period=yesterday|day|week|month|quarter|year` либо пару `from` / `to` (ISO‑даты `YYYY-MM-DD`, границы нормализуются в таймзоне мерчанта). Возвращает:
  - `period` и `previousPeriod`: `{ from, to, type }` (ISO‑строки).
  - `metrics` и `previousMetrics`: `salesAmount`, `orders`, `averageCheck`, `newCustomers` (создано `Wallet`), `activeCustomers`, `averagePurchasesPerCustomer`, `visitFrequencyDays` (средний интервал между покупками в днях), `pointsBurned` (сумма `redeemApplied` по чекам без отмен/возврата).
  - `timeline`: `{ current[], previous[], grouping }` — оба ряда выравнены по количеству точек; каждая точка (`YYYY-MM-DD` в таймзоне мерчанта) содержит `registrations`, `salesCount`, `salesAmount`.
  - `composition`: `{ newChecks, repeatChecks }` — число чеков новых и вернувшихся клиентов в текущем периоде.
  - `retention`: `{ activeCurrent, activePrevious, retained, retentionRate, churnRate }` — сравнение активной базы прошлого периода с текущей.
  - Возвраты/отмены исключены: учитываются только чеки без `canceledAt`, по которым нет активных `Transaction` c `type=REFUND` и `canceledAt IS NULL`.
- `GET /portal/analytics/time/recency` — принимает те же query-параметры, что и основной эндпоинт, использует merchantId из сессии.
- `GET /portal/analytics/time/activity` — параметры `period` / `from` / `to`, выдаёт данные для дашборда `/analytics/time`.
- `GET /portal/analytics/portrait` — параметры `period` / `from` / `to` / `segmentId`, возвращает `gender[]`, `age[]`, `sexAge[]`, где `transactions` равны количеству чеков, а `revenue` и `averageCheck` строятся по `Receipt.total` (фактической сумме продажи).
- `GET /portal/analytics/revenue` — поддерживает `period=yesterday|day|week|month|quarter|year` либо пару `from`/`to` (ISO-даты, границы нормализуются к началу/концу суток). Дополнительно можно передать `group=day|week|month` для явной детализации рядов. В ответе:
  - `totalRevenue`, `averageCheck`, `transactionCount`, `revenueGrowth`;
  - `hourlyDistribution[]` — 24 элемента с фактической выручкой по часам;
  - `dailyRevenue[]` — временной ряд с полями `date` (`YYYY-MM-DD` начала бакета), `revenue`, `transactions`, `customers`, `averageCheck`;
  - `seriesGrouping` — фактическая группировка (`day | week | month`), может отличаться от запрошенной, если период слишком широкий.
  - Все агрегаты и ряды игнорируют чеки, по которым есть отмена или возврат (по `Receipt.canceledAt` либо наличию REFUND-транзакций на тот же `orderId`).
- `GET /portal/analytics/loyalty` — принимает тот же набор параметров (`period` / `from` / `to`, опционально `group=day|week|month`). Помимо агрегатов (`totalPointsIssued`, `totalPointsRedeemed`, `pointsRedemptionRate`, `averageBalance`, `activeWallets`, `programROI`, `conversionRate`) возвращает:
  - `pointsSeries[]` — динамика в разрезе бакетов: `date` (`YYYY-MM-DD`), `accrued`, `redeemed`, `burned`, `balance` (накопительный остаток);
  - `pointsGrouping` — реальная детализация (`day | week | month`), совпадает с запрошенной, если она допустима для выбранного периода.
  - Транзакции, привязанные к отменённым/возвращённым чекам (наличие REFUND по `orderId` либо `canceledAt`), исключаются, поэтому начисления/списания из таких чеков не попадают в статистику и графики.
- `GET /portal/analytics/referral` — параметры `period=yesterday|week|month|quarter|year` либо пара `from`/`to` (ISO‑даты, фронт передаёт `YYYY-MM-DD`, backend нормализует к началу/концу суток в таймзоне мерчанта). Ответ:
  - `registeredViaReferral` — сколько клиентов ввели реферальный код и завершили онбординг мини‑приложения в выбранном периоде (`Referral.activatedAt` попадает в диапазон).
  - `purchasedViaReferral` — сколько приглашённых клиентов, активировавших код в выбранном периоде, совершили первую покупку в этот же период.
  - `referralRevenue` — сумма чеков (`Receipt.total`) за выбранный период, сформированных новыми клиентами, которые зарегистрировались в этом же периоде через реферальный код. Отменённые/возвращённые чеки исключаются по `Receipt.canceledAt`.
  - `bonusesIssued` — сколько бонусов начислено за активации и завершения рефералок внутри периода (учитываются вознаграждения рефереру и бонус за регистрацию другу).
  - `timeline[]` — точки `{ date: 'YYYY-MM-DD', registrations, firstPurchases }` в таймзоне мерчанта.
  - `previous` — агрегаты за предыдущий период той же длины и сдвинутый назад (для сравнений): поля `registeredViaReferral`, `purchasedViaReferral`, `referralRevenue`, `bonusesIssued`.
  - `topReferrers[]` — до 20 записей `{ rank, customerId, name, invited, conversions, revenue }`, где `invited` — число клиентов, которые указали код конкретного пользователя в заданном периоде (по `Referral.activatedAt`), `conversions` — сколько из них совершили первую покупку в период, `revenue` — сумма чеков этих клиентов за выбранный период.
- `GET /portal/analytics/operations` — принимает `period=yesterday|day|week|month|quarter|year` либо пару `from`/`to` (ISO, границы нормализуются на backend). Возвращает:
  - `topOutlets[]` — топ‑5 точек продаж по выручке;
  - `outletMetrics[]` — полный список точек мерчанта. Для каждой точки: `id`, `name`, `revenue` (сумма чеков `Receipt.total` без отмен/возвратов), `transactions`, `averageCheck`, `pointsIssued`/`pointsRedeemed` (по `Receipt.earnApplied`/`redeemApplied`), `customers` (уникальные покупатели), `newCustomers` (первые покупки в выбранном диапазоне), `growth` (зарезервировано);
  - `topStaff[]` — топ‑5 сотрудников по выручке;
  - `staffMetrics[]` — строки по сотруднику и точке: `outletId`, `outletName`, `transactions`, `revenue`, `averageCheck`, `pointsIssued`, `pointsRedeemed`, `newCustomers` (число клиентов, совершивших свой первый чек в выбранный период с этим сотрудником), `performanceScore` (очки мотивации из виртуального терминала кассира), `averageRating` и `reviewsCount` (средняя оценка клиентов по отзывам, пятибалльная шкала, учитываются только непустые `Review.rating`);
  - `peakHours[]` — три самых загруженных часа в формате `HH:MM-HH:MM`;
  - `outletUsage[]` — активность POS по точкам (кол-во операций, последнее событие/heartbeat).
- `GET /portal/analytics/rfm` — отдаёт распределение клиентов по RFM-кодам и текущие границы сегментов. Ответ:
  - `settings`: `{ recencyDays, frequencyMode, frequencyThreshold, frequencySuggested, moneyMode, moneyThreshold, moneySuggested }`. Значения `frequencySuggested` и `moneySuggested` — автоподбор по актуальным данным, `frequencyMode|moneyMode` — `auto | manual`.
  - `groups[]`: всегда 5 строк (score 1→5) с полями `recency`, `frequency`, `monetary` (диапазоны значений), где `recency` — дни с последней покупки, `frequency` — количество покупок, `monetary` — суммарные покупки клиента.
  - `distribution[]`: `{ class: \"5-4-3\", customers: 128 }` — реальное количество клиентов в каждом классе.
  - `totals.customers` — общее число клиентов, для которых просчитан RFM.
- Нумерация R/F/M идёт по убыванию: `5` соответствует самым «тёплым» клиентам, `1` — наименее активным.
- `PUT /portal/analytics/rfm/settings` — обновляет пользовательские границы сегментов. Тело запроса:
  ```json
  {
    \"recencyDays\": 365,
    \"frequencyMode\": \"auto\", // либо \"manual\"
    \"frequencyThreshold\": 7,   // обязательно при manual
    \"moneyMode\": \"manual\",
    \"moneyThreshold\": 15000    // обязателен при manual
  }
  ```
  В ответ возвращается тот же объект, что и у `GET /portal/analytics/rfm` (настройки + распределение).
- `POST /portal/audiences` и `PUT /portal/audiences/{id}` — объект `filters` поддерживает дополнительные поля `rfmRecency`, `rfmFrequency`, `rfmMonetary` (число 1–5 или массив таких чисел). Фильтры сопоставляются с `CustomerStats.rfmR/rfmF/rfmM` и могут комбинироваться с прежним `rfmClasses`.

#### 7. Акции (мини‑аппа)

```http
GET /loyalty/promotions?merchantId={merchantId}&customerId={customerId}

Response 200:
[
  {
    "id": "prom_1",
    "name": "Бонус +50",
    "description": "Получите +50 баллов",
    "rewardType": "POINTS",
    "rewardValue": 50,
    "startAt": "2025-10-01T00:00:00Z",
    "endAt": "2025-10-31T23:59:59Z",
    "pointsExpireInDays": 30,
    "canClaim": true,
    "claimed": false
  }
]
```

```http
POST /loyalty/promotions/claim
Content-Type: application/json

{
  "merchantId": "M-1",
  "customerId": "C-1",
  "promotionId": "prom_1",
  "outletId": "OUT-1" // optional
}

Response 200:
{
  "ok": true,
  "promotionId": "prom_1",
  "pointsIssued": 50,
  "pointsExpireInDays": 30,
  "pointsExpireAt": "2025-11-30T00:00:00Z",
  "balance": 1150,
  "alreadyClaimed": false // true при повторном вызове
}
```

Примечания:
- Клиент видит только акции со статусами `ACTIVE`/`SCHEDULED`, соответствующие его аудитории (`segmentId`), и неистёкшим периодам (`startAt`/`endAt`).
- Claim доступен только для акций с типом награды `POINTS` и положительным значением `rewardValue`; повторный claim не допускается (идемпотентность по `promotionId+customerId`).

## Основные эндпоинты

### Интеграции REST API

Эндпоинты `/api/integrations/**` требуют заголовок `X-Api-Key` (интеграционный ключ); `merchantId` определяется по ключу. Throttling по `integrationId` с дефолтными лимитами: CODE — 60/мин, CALCULATE-ACTION/BONUS — 180/мин, BONUS — 60/мин, REFUND — 30/мин, OUTLETS/DEVICES — 60/мин, OPERATIONS — 30/мин (настраиваются в интеграции).

Идентификация клиента: во всех методах, требующих клиента, используется `id_client` (= customerId) или `user_token` (QR-код). Тип QR-кода задаётся в системных настройках мерчанта: цифровой 9-значный код или защищённый JWT-токен. В CALCULATE-BONUS/ACTION дополнительно поддерживается `phone`.

- `POST /api/integrations/code` — { `user_token` } → `{ type: "bonus", client: { id_client, id_ext, name?, phone?, email?, balance, earn_percent, redeem_limit_percent, birth_date?, avg_bill, visit_frequency?, visit_count, total_amount, accruals_blocked, redemptions_blocked } }`. Валидируется `merchantAud`, данные клиента резолвятся по `user_token`. `id_ext` — внешний ID клиента из вашей системы (`merchantCustomer.externalId`), при отсутствии будет `null`. `device_id/outlet_id` не требуются. Аналитика (`avg_bill`, `visit_count`, `total_amount`, `visit_frequency`) строится по чекам мерчанта; `visit_frequency` — средний интервал между визитами в днях.
- `POST /api/integrations/calculate/action` — промо-расчёт без побочных эффектов: `{ items[], id_client? | phone?, outlet_id? }` → `{ status: "ok", positions: [{ id_product, name?, qty, price, base_price?, actions, actions_names }], info: string[] }`. При акции "N-й бесплатно" позиции разбиваются: бесплатные (`price: 0`) и платные возвращаются отдельно (как в GMB API). `base_price` возвращается только если цена изменилась (иначе `null`). Не требует userToken/устройства/сотрудника, контекст — по точке и клиенту (stateless). `outlet_id` опционален, но рекомендуется для точного подбора локальных акций.
- `POST /api/integrations/calculate/bonus` — расчёт начисления/списания без hold: `{ user_token? | id_client? | phone?, items[]?, total?, paid_bonus?, outlet_id? }` → `{ status, items?: [{ id_product, name, price, quantity, max_pay_bonus, earn_bonus }], max_pay_bonus, bonus_value, final_payable }`. Можно передать `total` вместо `items[]` для упрощённого расчёта (без per-item детализации). `paid_bonus` — желаемое списание, ограничивает `max_pay_bonus` этим значением. Акции применяются **только** если переданы `items[].actions`/`items[].action_names`; при отсутствии — промо не учитываются.
- `POST /api/integrations/bonus` — фиксация операции по переданным значениям: `idempotency_key` (обязательный ключ идемпотентности), `invoice_num?` (кастомный номер чека), `paid_bonus?` (списывается с учётом лимитов), `bonus_value?` (если не передан — авторасчёт по правилам лояльности, `0` отключает начисление), `operation_date?` (ISO), `manager_id?`. Контекст `outlet_id`/`device_id`/`manager_id` обязателен (хотя бы один). Акции применяются **только** если переданы `items[].actions`/`items[].action_names`; при отсутствии — промо не учитываются. Идемпотентность по `merchantId+idempotency_key`. Ответ: `{ result, invoice_num, order_id (ID операции лояльности), redeem_applied, earn_applied, client }`.
- `POST /api/integrations/refund` — только полная отмена по `invoice_num` или `order_id` (`operation_date?`, `device_id?`, `outlet_id?` для контекста). Возвращает `{ invoice_num, order_id, points_restored, points_revoked, balance_after }`, без partial-share и без transactionIds.
- `GET /api/integrations/outlets` — справочник точек мерчанта (`id`, `name`, `address?`, `description?`) + `managers[]` (активные сотрудники с доступом к точке: `id`, `name`, `code?`), без чужих `merchantId`.
- `GET /api/integrations/devices` — опциональный `outlet_id`, возвращает устройства мерчанта (`id`, `code`, `outlet_id`) с валидацией кода/ID по Device.
- `GET /api/integrations/operations` — история покупок/возвратов: query `invoice_num?` (ищет и по `receipt_num`), `from?`/`to?` (ISO по `operation_date/createdAt`), `device_id?`, `outlet_id?`, `limit?` (<=500). Ответ `items[]`: `{ kind: purchase|refund, id_client, invoice_num, order_id, receipt_num?, total, redeem_applied?, earn_applied?, points_restored?, points_revoked?, operation_date, outlet_id?, device_id?, device_code?, canceled_at?, points_delta, balance_before?, balance_after? }`. История строится только из зафиксированных BONUS (hold→commit) и REFUND; CODE/CALCULATE не создают записей.

Item-level формат позиций: `items[]` с полями `id_product`, `name?`, `qty` (или `quantity`), `price`. Поля `categoryId/category_id` не поддерживаются ни в одном интеграционном методе. Для `calculate/bonus` не поддерживаются `base_price`, `allow_earn_and_pay`, `earn_multiplier`. Акции по товарам учитываются через `actions`/`action_names`.

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

#### 2. Отправка отзыва после покупки
```http
POST /loyalty/reviews
Content-Type: application/json

{
  "merchantId": "M-1",
  "customerId": "C-100",
  "rating": 5,
  "comment": "Очень вкусно",
  "transactionId": "txn_123",   // обязательный идентификатор транзакции
  "orderId": "ORD-77",          // опционально, если нужна связка с внешним заказом
  "outletId": "OUT-1",          // опционально: точка обслуживания
  "staffId": "ST-5"             // опционально: кассир/сотрудник
}

Response 200:
{
  "ok": true,
  "reviewId": "rev_abc123",
  "status": "APPROVED",
  "rewardPoints": 80,
  "message": "Спасибо за ваш отзыв! Он опубликован.",
  "share": {
    "enabled": true,
    "threshold": 4,
    "options": [
      { "id": "yandex", "url": "https://yandex.ru/maps/..." },
      { "id": "google", "url": "https://maps.google.com/..." }
    ]
  }
}
```

- `share` присутствует, если включена опция «Улучшать отзывы…» в настройках лояльности. В массив `options` попадают только те площадки, у которых есть валидная ссылка для конкретной торговой точки или общий fallback.
- Клиентские приложения должны использовать `enabled`, `threshold` и `options` из ответа для показа второго шага «Поделиться отзывом». При отсутствии данных поле `share` будет `null`, а фронту следует скрыть дополнительный шаг.

**Правила защиты от повторных отзывов**

- `transactionId` должен принадлежать тому же `merchantId` и `customerId`; иначе вернётся `400 Bad Request`.
- Один отзыв — одна транзакция: повторная отправка по тому же `transactionId` или `orderId` завершится ошибкой.
- При успешном отзыве бонусы начисляются ровно один раз (`loyaltyService.earn` с `orderId=review_<reviewId>`).
- Если в теле передан только `orderId`, сервис проверит, что у клиента есть операция `EARN/REDEEM` с таким заказом. Для отзывов без подтверждённой покупки начисление бонусов отключено.

> Miniapp всегда отправляет `transactionId`, поэтому для фронтенда поведение не изменилось. При интеграциях убедитесь, что сохраняете ID транзакции, полученный в ответах `commit/redeem`.

##### Фиксация закрытия окна отзыва без оценки
```http
POST /loyalty/reviews/dismiss
Content-Type: application/json

{
  "merchantId": "M-1",
  "customerId": "mc_123",
  "transactionId": "txn_123"
}

Response 200:
{
  "ok": true,
  "dismissedAt": "2024-01-01T12:00:00.000Z"
}
```

- Требует валидного `customerId` и транзакции этого клиента; при несоответствии вернётся `400`.
- Используется фронтом при закрытии модалки отзыва, чтобы она не открывалась на других устройствах или после повторного входа.
- Факт скрытия сохраняется в `LoyaltyRealtimeEvent` и отображается как `reviewDismissedAt` в ответе `/loyalty/transactions`.

**Ответ `/loyalty/transactions`**

- Каждый элемент массива `items[]` дополнен полями `reviewId`, `reviewRating`, `reviewCreatedAt` (если отзыв уже оставлен по транзакции).
- Если клиент закрыл окно оценки без отправки, в ответе будет `reviewDismissedAt` (ISO datetime). Фронту нужно не показывать повторную модалку для такой транзакции на любых устройствах.
- Эти данные позволяют фронтам скрывать повторные модалки и предлагать шаг «Поделиться отзывом» на любом устройстве клиента.
- Для отменённых операций (ручные начисления, списания, промо и т.п.) поле `canceledAt` содержит ISO-дatetime отмены; такие записи можно скрывать из интерфейсов.
- Для возвратов по покупкам поле `relatedOperationAt` возвращает дату и время исходной операции (по чеку), чтобы отображать подписи вида «Возврат от ДД.ММ.ГГГГ, ЧЧ:ММ».

### Конфигурация антифрода (админка и ENV)

Антифрод настраивается через UI админки (страница `Anti-Fraud`) и/или через ENV переменные по умолчанию. Приоритет у настроек мерчанта в админке.

rulesJson.af структура на мерчанте:

```json
{
  "merchant": { "limit": 200, "windowSec": 3600, "dailyCap": 0, "weeklyCap": 0 },
  "outlet":   { "limit": 20,  "windowSec": 600,  "dailyCap": 0, "weeklyCap": 0 },
  "device":   { "limit": 20,  "windowSec": 600,  "dailyCap": 0, "weeklyCap": 0 },
  "staff":    { "limit": 60,  "windowSec": 600,  "dailyCap": 0, "weeklyCap": 0 },
  "customer": { "limit": 5,   "windowSec": 120,  "dailyCap": 0, "weeklyCap": 0 },
  "blockFactors": ["blacklisted_customer", "balance_manipulation"]
}
```

- `limit` + `windowSec` — скользящее окно частоты операций
- `dailyCap` — суточный кап по операциям (0 = выключен)
- `weeklyCap` — кап за 7 суток (роллинг) (0 = выключен)
- scope `outlet` фактически ограничивает операции по торговой точке (включая все устройства и сотрудников внутри).
- scope `device` — лимит для конкретного устройства (код устройства передаётся в запросах), работает совместно с `outlet` как агрегирующий потолок.
- `blockFactors` — список факторов скоринга, которые приводят к жёсткой блокировке, даже если уровень риска < CRITICAL (доступны `no_outlet_id`, `no_device_id` и факторы из скоринга)

ENV переменные по умолчанию (используются, если per-merchant не задано):

```
ANTIFRAUD_GUARD=on
AF_LIMIT_MERCHANT=200
AF_WINDOW_MERCHANT_SEC=3600
AF_DAILY_CAP_MERCHANT=0
AF_WEEKLY_CAP_MERCHANT=0
AF_LIMIT_OUTLET=20
AF_WINDOW_OUTLET_SEC=600
AF_DAILY_CAP_OUTLET=0
AF_WEEKLY_CAP_OUTLET=0
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
AF_DAILY_CAP_CUSTOMER=5
AF_WEEKLY_CAP_CUSTOMER=0
AF_MONTHLY_CAP_CUSTOMER=40
AF_POINTS_CAP_CUSTOMER=3000
AF_BLOCK_DAILY_CUSTOMER=off
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

{
  "mode": "redeem" | "earn",
  "merchantId": "string",
  "userToken": "jwt_or_customer_id",
  "orderId": "string",
  "total": 1000,
  "outletId": "string", // обязательный для POS интеграций идентификатор торговой точки
  "staffId": "string",  // optional
  "positions": [ // optional, помогает учесть eligibility на уровне товаров
    { "id_product": "SKU-1", "qty": 2, "price": 500, "accruePoints": true }
  ]
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
- Дневной лимит: если настроен дневной кап в `rulesJson.af.customer.dailyCap` (или через ENV `AF_DAILY_CAP_CUSTOMER`), к расчёту применяется остаток за последние 24 часа — `dailyRedeemLeft = max(0, dailyCap - sum(recent REDEEM))`. Итоговое списание равно `min(wallet.balance, redeemCapByBps, dailyRedeemLeft)`.
- Лимит на заказ: если в прошлых операциях по `orderId` уже списано `receipt.redeemApplied`, то новый quote учитывает остаток по заказу: `remainingByOrder = max(0, redeemCapByBps - redeemApplied)`.

Response 200 (EARN):
{
  "canEarn": true,
  "pointsToEarn": 50,
  "holdId": "uuid",
  "message": "Начислим 50 баллов после оплаты"
}

Примечания к EARN:

- Дневной лимит: если настроен дневной кап в `rulesJson.af.customer.dailyCap` (или через ENV `AF_DAILY_CAP_CUSTOMER`), к расчёту применяется остаток за последние 24 часа — `dailyEarnLeft = max(0, dailyCap - sum(recent EARN))`. Итоговое начисление равно `min(pointsByBps, dailyEarnLeft)`.

## Уровни (Loyalty Tiers)

Уровни управляются через `LoyaltyTier` в портале (`/loyalty/mechanics/levels`). Настройки `levelsCfg/levelBenefits` более не используются.

- Расчёт прогресса: сумма чеков за 365 дней (`metric=earn`). Если уровни отсутствуют, автоматически создаётся `Base` (`earnRateBps=300`, `redeemRateBps=5000`, `minPaymentAmount=0`, `isInitial=true`).
- Скрытые уровни (`isHidden`) не участвуют в авто‑повышении и не отображаются в мини‑аппе до ручного назначения (админ/промокод).
- Каталог уровней для миниаппы: `GET /loyalty/mechanics/levels/:merchantId` — отдаёт только видимые уровни.
- Прогресс/текущий уровень: `GET /levels/:merchantId/:customerId`.
- Возвраты/отмены уменьшают прогресс: полный возврат помечает чек отменённым, частичный использует `TxnType.REFUND.share`/`refundTotal` для пропорционального вычитания; при падении ниже порога уровень понижается.

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
  "current": { "name": "Silver", "threshold": 500, "earnRateBps": 700, "redeemRateBps": 4000, "minPaymentAmount": 0 },
  "next": { "name": "Gold", "threshold": 1000, "earnRateBps": 900 },
  "progressToNext": 0.5
}
```

Примечание: ставки начисления/списания берутся из назначенного `LoyaltyTier` (или стартового).

### Состав уровня

```http
GET /portal/loyalty/tiers/{tierId}/customers?limit=100&cursor=...

Response 200:
{
  "tierId": "tier_vip",
  "total": 12,
  "items": [
    {
      "customerId": "mc_123",
      "customerId": "cust_1",
      "name": "Иван Иванов",
      "phone": "+79991112233",
      "assignedAt": "2025-11-14T08:35:00.000Z",
      "source": "auto"
    }
  ],
  "nextCursor": "cursor-id"
}
```

Список возвращает только активные назначения (без `expiresAt`). В портале используется в модальном окне «Состав».

### Примеры использования уровней

- Список уровней в портале: `GET /portal/loyalty/tiers` возвращает `thresholdAmount`, ставки `earnRateBps/redeemRateBps`, флаг `isHidden`, состав (`/portal/loyalty/tiers/{tierId}/customers`).
- Клиентский прогресс: `GET /levels/{merchantId}/{customerId}` — сумма чеков за 365 дней против `thresholdAmount`.

## TTL/Сгорание баллов

Система поддерживает превью сгорания и фактическое сгорание баллов по TTL.

- Настройка TTL на мерчанте: `MerchantSettings.pointsTtlDays` (0/empty — выключено).
- Фичефлаги/интервалы:
- `POINTS_TTL_FEATURE=1` — включает превью сгорания (worker `PointsTtlWorker`).
- `POINTS_TTL_BURN=1` — включает фактическое сгорание (worker `PointsBurnWorker`).
- `EARN_LOTS_FEATURE=1` — включает точный учёт по лотам (рекомендуется при TTL).
- `POINTS_TTL_REMINDER=1` — включает push-напоминания через Telegram Mini App (worker `PointsTtlReminderWorker`).
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

3) Напоминания о скором сгорании (`PointsTtlReminderWorker`)

- Использует `rulesJson.burnReminder` в `MerchantSettings` (`enabled`, `daysBefore`, `text`).
- Отправляет push-уведомления в Telegram Mini App без заголовка (`title=''`) с плейсхолдерами: `%username%` (имя клиента или «Уважаемый клиент»), `%amount%` (сумма сгорающих баллов с разделителями) и `%burn_date%` (`dd.MM.yyyy`).
- Повторные уведомления с тем же `burn_date` игнорируются (проверяется лог в `PushNotification`).

Админка:

- Поле `TTL баллов (дни)` на странице настроек мерчанта управляет `pointsTtlDays`.

Примечание:

- Для детерминированности в тестах установите `WORKERS_ENABLED=0` и `METRICS_DEFAULTS=0`, а сами воркеры покрыты unit-тестами.

## Порядок применения скидок и бонусов

Последовательность в расчёте `POST /loyalty/quote`:

1) Базовые правила начисления/лимитов (`rulesJson.rules` или базовые ставки мерчанта).
2) Бонусы уровня (Levels) — добавляются поверх базовых ставок: `earnBps += levelEarnBonus`, `redeemLimitBps += levelRedeemBonus`.

Итоговые формулы (упрощённо):

```text
eligible' = сумма eligible-позиций (рассчитывается на сервере)
earnPoints = floor( eligible' * (earnBps_base + earnBps_bonus(level)) / 10000 )
redeemCap  = floor( eligible' * (redeemBps_base + redeemBps_bonus(level)) / 10000 )
```

Числовой пример:

- База мерчанта: `earnBps=500` (5%), `redeemLimitBps=5000` (50%).
- Уровень клиента: Silver (`earnBpsBonus=+200`, `redeemLimitBpsBonus=+1000`).
- Промокод 10% на чек 1000.

Расчёт:

```
eligible: 1000
EARN: 1000 * (500+200)/10000 = floor(1000 * 0.07) = 70 баллов
REDEEM cap: 1000 * (5000+1000)/10000 = floor(1000 * 0.6) = 600
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
  "orderId": "string",        // опционально, если известен
  "receiptNumber": "string",  // опционально; при отсутствии orderId backend найдёт чек по номеру
  "refundTotal": 1000,
  "refundEligibleTotal": 1000 // optional
}

Response 200:
{
  "ok": true,
  "share": 0.5,
  "pointsRestored": 250,
  "pointsRevoked": 25,
  "customerId": "mc_123" // возвращается, если чек найден
}

> Примечание: передавайте либо `orderId`, либо `receiptNumber`. Если оба поля указаны, приоритет у `orderId`.
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
      "type": "EARN" | "REDEEM" | "REFUND" | "ADJUST" | "CAMPAIGN" | "REFERRAL" | "REGISTRATION",
      "amount": 100,
      "orderId": "string",
      "receiptNumber": "string | null",
      "createdAt": "2024-01-01T00:00:00Z",
      "outletId": "OUT-1",
      "outletPosType": "SMART",
      "outletLastSeenAt": "2024-01-01T12:34:56Z",
      "staffId": "STAFF-1",
      "pending": true,                 // для отложенных начислений (earnDelayDays>0)
      "maturesAt": "2024-01-03T10:00:00Z", // когда баллы будут зачислены
      "daysUntilMature": 2,            // сколько дней осталось (округлено вверх)
      "source": "MANUAL_ACCRUAL" | "COMPLIMENTARY" | null, // источник операции из metadata
      "comment": "Комментарий администратора" // если задан в metadata.comment
    }
  ],
  "nextBefore": "2024-01-01T00:00:00Z"
}
```

Примечания:

- При включённой задержке начисления (`earnDelayDays>0`) ответ дополнен «виртуальными» элементами истории для лотов `EarnLot` со статусом `PENDING`:
  - Поля `pending=true`, `maturesAt`, `daysUntilMature` сообщают о будущей активации баллов.
  - После наступления `maturesAt` воркер активации создаёт обычную транзакцию `EARN`, а «ожидающая» запись пропадает из ответа.
  - У создаваемой транзакции `EARN` поле `createdAt` равно исходному `EarnLot.createdAt` (сохранение порядка в истории).
  - Для «ожидающих» элементов поле `type` = `EARN` или `REGISTRATION` (для бонуса за регистрацию), а `id` имеет вид `lot:<earnLotId>`.
  - Тип `REGISTRATION` используется только для фронтенда (отображение «Бонус за регистрацию»); по сути это начисление баллов.
  - Поле `source` передаёт значение из metadata транзакции (например, `MANUAL_ACCRUAL` или `COMPLIMENTARY`). Мини-приложение отображает ручные начисления с `MANUAL_ACCRUAL` как обычные покупки, а `COMPLIMENTARY` — отдельным розовым блоком «Начислено администратором». `comment` содержит пользовательский комментарий администратора, если он был указан. Для отката реферальных наград `source = "REFERRAL_ROLLBACK"`; такие транзакции показываются как «Возврат реферала» и уменьшают баланс пригласившего клиента.
- Если по заказу создан чек (`Receipt`), в ответе появится `receiptNumber`. Этот идентификатор отображается во всех фронтах и используется кассиром для ручного возврата вместо публичного `orderId`.
- Параметр `customerId` обязателен; `customerId` поддерживается только для обратной совместимости и будет удалён после завершения миграции миниаппы.

#### 7. Realtime события для миниаппы
```http
GET /loyalty/events/poll?merchantId={merchantId}&customerId={customerId}
```

- Long-poll запрос (таймаут ~25 секунд). Возвращает первое непрочитанное событие или `{ "event": null }`, если изменений не было.
- Событие генерируется автоматически после каждой транзакции (покупка, возврат, промокод, ручное начисление/списание, реферальная награда и т.д.) и сохраняется в таблицу `LoyaltyRealtimeEvent`.
- Ответ 200:
  ```json
  {
    "event": {
      "id": "evt_...",
      "merchantId": "M-1",
      "customerId": "c_123",
      "customerId": "mc_123",
      "transactionId": "txn_123",
      "transactionType": "EARN",
      "amount": 150,
      "eventType": "loyalty.transaction",
      "emittedAt": "2025-11-25T12:00:00.000Z"
    }
  }
  ```
- После выдачи `deliveredAt` проставляется и запись больше не попадёт в следующие poll-запросы; на стороне клиента достаточно запустить локальное обновление (`balance`, `transactions`, `levels`).
- Реализация держит подписку на `pg_notify('loyalty_realtime_events')` и работает в нескольких инстансах без липких сессий; при сбоях каналов сервис деградирует в периодическую проверку таблицы, поэтому потерь событий нет.

### Публичные механики — Бонус за регистрацию

- `POST /loyalty/mechanics/registration-bonus` — начислить приветственный бонус за регистрацию.
  - Тело: `{ merchantId: string, customerId: string, outletId?: string|null }`
  - Ответ 200:
    ```json
    {
      "ok": true,
      "alreadyGranted": false,
      "pointsIssued": 150,
      "pending": true,
      "maturesAt": "2025-10-10T10:00:00.000Z",
      "pointsExpireInDays": 90,
      "pointsExpireAt": "2026-01-08T10:00:00.000Z",
      "balance": 1234
    }
    ```
  - Идемпотентность: повторный вызов вернёт `alreadyGranted: true` без дублей в истории.
  - Правила берутся из `MerchantSettings.rulesJson.registration`:
    - `enabled: boolean` — включена/выключена механика.
    - `points: number` — размер бонуса.
    - `ttlDays?: number` — срок жизни начисленных баллов (сгорание).
    - `delayDays?: number` — задержка начисления (удержание). При удержании создаётся `EarnLot(status=PENDING)`, а после активации — `Transaction EARN` с `createdAt` от исходного лота.

### Промокоды

Промокоды управляются через портал мерчанта. Основные операции:

> Legacy ваучеры больше не поддерживаются: таблицы `Voucher*` удалены, внешних интеграций и отчётов на них не осталось.

- `GET /portal/promocodes?status=ACTIVE|ARCHIVE` — список с метриками.
- `POST /portal/promocodes/issue` — создание промокода (см. `PortalPromoCodePayload`, поле `usageLimitValue` задаёт количество клиентов, которые смогут применить код при `usageLimit=once_total`, `levelExpireDays` — срок действия присвоенного уровня в днях, `0` — бессрочно).
- `PUT /portal/promocodes/:promoCodeId` — обновление.
- `POST /portal/promocodes/deactivate` / `POST /portal/promocodes/activate` — смена статуса.
- `POST /loyalty/promocodes/apply` — активация промокода клиентом (мини-аппа) с начислением баллов и TTL.

В API лояльности промокод применяется через отдельный эндпоинт `POST /loyalty/promocodes/apply` (мини‑аппа) и фиксируется как операция типа `PROMOCODE`/`CAMPAIGN` в журналах. Операции `quote/commit` больше не принимают поле `promoCode` в теле запроса.


## Referrals (beta/preview)

Модуль рефералов находится в статусе beta. Контракты могут меняться. Минимальный набор эндпоинтов:

- `POST /referral/program` — создать программу. Ошибка 400, если активная программа уже существует.
  - Тело: `{ merchantId, name, referrerReward, refereeReward, expiryDays? }`
  - Ответ 201: `{ id, merchantId, status: "ACTIVE" }`

  Реферальная ссылка/код теперь только персональные:
  - `GET /referral/link/{customerId}?merchantId=<id>` — получить (или сгенерировать) персональный код и ссылку
  - Ответ 200: `{ code, link, qrCode, program: { ... } }`

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
  "qrTtlSec": 300,
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
    "code": "PIZ",
    "externalProvider": "MOYSKLAD",
    "externalId": "grp-100",
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
GET /portal/catalog/products?points=with_points&categoryId=cat_1&search=маргарита
Authorization: Bearer <portal_jwt>

Response 200:
{
  "items": [
    {
      "id": "prd_1",
      "name": "Маргарита",
      "sku": "PZ-001",
      "code": "PIZ-001",
      "barcode": "4601234567890",
      "unit": "шт",
      "externalProvider": "IIKO",
      "externalId": "EXT-1",
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
  "code": "PIZ-001",
  "barcode": "4601234567890",
  "unit": "шт",
  "externalProvider": "IIKO",
  "externalId": "EXT-1",
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

#### Импорт каталога (CommerceML / МойСклад)

```http
POST /portal/catalog/import/commerce-ml
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "externalProvider": "COMMERCE_ML",
  "products": [
    { "externalId": "pr-1", "name": "Капучино", "barcode": "460...", "sku": "CAP-01", "unit": "шт", "price": 250, "code": "COF-1" }
  ]
}

Response 200: { "ok": true, "createdCategories": 0, "updatedCategories": 0, "createdProducts": 1, "updatedProducts": 0 }
```

```http
POST /portal/catalog/import/moysklad
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "products": [
    { "externalId": "ms-1", "name": "Латте", "barcode": "460...", "sku": "LAT-01", "unit": "шт", "price": 280 }
  ]
}
```

Поля позиций: `externalId`, `name`, опционально `barcode`, `sku`, `code`, `unit`, `price`. Импорт выполняется по `productId`/`externalId` и, при необходимости, по `barcode`/`sku`/`code`. Все операции импортов логируются в `SyncLog` с итогом `ok/error`.

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
- `trial.expired` - Истечение пробного периода

## Подписки и тарифы
В продакшене используется один тариф `Full` (`plan_full`) с полным доступом и без лимитов. Тариф выдаётся вручную через админку/админ‑API на фиксированное число дней. За 7 дней до даты окончания фронт портала показывает предупреждение, по истечении срока все операции (портал, касса, API) блокируются ответом 403 «Подписка закончилась».

### Получение доступных планов
```http
GET /subscription/plans

Response 200:
[
  {
    "id": "plan_full",
    "name": "full",
    "displayName": "Full",
    "price": 0,
    "currency": "RUB",
    "interval": "day",
    "features": { "all": true },
    "maxTransactions": null,
    "maxCustomers": null,
    "maxOutlets": null,
    "webhooksEnabled": true,
    "customBranding": true
  }
]
```

### Ручная выдача/сброс подписки (админ)
```http
POST /admin/merchants/{merchantId}/subscription
X-Admin-Key: required

Body:
{ "days": 30, "planId": "plan_full" }

Response: { "status": "active", "currentPeriodEnd": "2025-01-10T00:00:00.000Z", ... }

DELETE /admin/merchants/{merchantId}/subscription — сбросить подписку (после истечения/для блокировки).
```

### Проверка лимитов
```http
GET /subscription/{merchantId}/usage

Response 200:
{
  "plan": {
    "id": "plan_full",
    "name": "Full"
  },
  "usage": {
    "transactions": {
      "used": 5432,
      "limit": "unlimited",
      "percentage": null
    },
    "customers": {
      "used": 234,
      "limit": "unlimited",
      "percentage": null
    }
  },
  "status": "active",
  "currentPeriodEnd": "2025-01-01T00:00:00Z"
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
  "outletId": "string",
  "ipAddress": "192.168.1.1"
}

Response 200:
{
  "level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "score": 25,
  "factors": [
    "large_amount:10000",
    "new_outlet"
  ],
  "shouldBlock": false,
  "shouldReview": false
}

### Лимиты на начисления (rulesJson.af.customer)

В настройках мерчанта (`PUT /portal/settings`) блок `rulesJson.af.customer` принимает дополнительные параметры:

- `dailyCap` — сколько начислений одному клиенту допускается за сутки (0 — без ограничения).
- `blockDaily` — если `true`, операции начисления, превысившие дневной лимит, блокируются и получают 429; по умолчанию `false`, тогда система только уведомляет.
- `monthlyCap` — сколько начислений одному клиенту допускается за 30 дней (0 — без ограничения); при превышении операции не блокируются, мерчант получает уведомление.
- `pointsCap` — максимальное количество баллов для одной операции начисления (0 — без ограничения); при превышении операция не блокируется, но антифрод шлёт уведомление.

При отсутствии значений в базе портал подставляет дефолты: `dailyCap = 5`, `monthlyCap = 40`, `pointsCap = 3000`.
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
  -d '{"mode":"earn","merchantId":"M-1","userToken":"jwt","orderId":"123","total":1000,"positions":[{"id_product":"SKU-1","qty":1,"price":1000}]}'
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
  total: 1000
});

// Commit
const result = await client.commit({
  merchantId: 'M-1',
  holdId: quote.holdId,
  orderId: 'ORDER-123'
});
```

### Merchant Portal — Клиенты

#### GET /portal/customers
- Параметры: `search` (телефон, email или ФИО), `limit` (1–200, по умолчанию 50), `offset`, `segmentId`, `registeredOnly` (по умолчанию `true`). Чтобы увидеть «сырых» клиентов без телефона/пола/даты рождения, передайте `registeredOnly=0`.
- По умолчанию сервер возвращает только тех клиентов, у кого заполнены имя, пол (`male|female`), дата рождения и телефон (в `MerchantCustomer` или `Customer`).
- Ответ: массив объектов с полями `id`, `phone`, `email`, `firstName`, `lastName`, `gender`, `birthday`, `tags[]`, `balance`, `pendingBalance`, `visits`, `visitFrequencyDays`, `daysSinceLastVisit`, `averageCheck`, `spendPreviousMonth`, `spendCurrentMonth`, `spendTotal`, `registeredAt`, `comment`, `accrualsBlocked`, `redemptionsBlocked`, `levelId`, `levelName`.

#### GET /portal/customers/{customerId}
Возвращает все поля из списка плюс расширенные блоки:
- `invite` — `{ code, link }` либо `null`.
- `referrer` — `{ id, name, phone }`, если клиент был приглашён.
- `expiry` — массив `{ id, accrualDate, expiresAt, amount, status }` по активным/отложенным начислениям.
- `transactions` — операции с баллами (последние 200): `id`, `type`, `change`, `purchaseAmount`, `details`, `datetime`, `outlet`, `rating`, `receiptNumber`, `manager`, `carrier`, `carrierCode`, `toPay`, `paidByPoints`, `total`, `blockedAccrual`.
  - `details` отображает пользовательские подписи операций: «Начисление за покупку», «Списание за покупку», «Начислено администратором» (ручные начисления), «Подарочные баллы», «Списание администратором», «Реферальное начисление», «Баллы по промокоду», «Баллы по акции», «Баллы за день рождения», «Баллы за автовозврат», «Баллы за регистрацию», «Возврат покупки», «Сгорание баллов», «Корректировка баланса», «Начисление заблокировано администратором», а при отменах — «Операция отменена: …» (для исходных операций любого типа) и «Возврат покупки #N (ДД.ММ.ГГГГ, ЧЧ:ММ) - совершён администратором» (для фиксирующей записи отмены).
- `reviews` — отзывы `{ id, outlet, rating, comment, createdAt }`.
- `invited` — приглашённые `{ id, name, phone, joinedAt, purchases }`.

#### POST /portal/customers
```http
POST /portal/customers
Authorization: Bearer <portal_jwt>
Content-Type: application/json

{
  "phone": "+79991234567",
  "email": "user@example.com",
  "firstName": "Иван Петров",
  "name": "Иван Петров",
  "birthday": "1992-05-12",
  "gender": "male",
  "tags": ["vip", "кофе"],
  "comment": "Любит сезонные десерты",
  "accrualsBlocked": false,
  "redemptionsBlocked": false,
  "levelId": "tier_vip"
}

Response 200: объект клиента, как в GET /portal/customers/{id}
```

Если указать `levelId`, клиент сразу получает выбранный уровень (`loyaltyTier.id` из `/portal/loyalty/tiers`). Флаги `accrualsBlocked` и `redemptionsBlocked` управляют ручными начислениями/списаниями (miniapp отображает статус, портал запрещает действия и помечает операции как заблокированные).

#### PUT /portal/customers/{customerId}
Тот же payload, что и при создании. Поля, не переданные в теле — без изменений. Можно сменить уровень (`levelId`) или заблокировать начисления/списания, передав соответствующие флаги.

#### DELETE /portal/customers/{customerId}
Удаляет кошелёк мерчанта (если нет чеков/транзакций), возвращает `{ "ok": true }`.

### Merchant Portal API — рассылки, акции и мотивация

| Endpoint | Метод | Описание |
| --- | --- | --- |
| `/portal/push-campaigns?scope=ACTIVE\|ARCHIVED` | GET | Списки push-кампаний мерчанта. Требует подключённый Telegram Mini App (push доставляются через Telegram). |
| `/portal/push-campaigns` | POST | Создание push-рассылки. Поля: `text` (строка ≤300), `audienceId` (segmentId), `audienceName` (опционально), `scheduledAt` (ISO-дата или `null` для запуска сразу), `timezone` (опционально). |
| `/portal/push-campaigns/{id}/cancel` | POST | Отмена запланированной рассылки. |
| `/portal/push-campaigns/{id}/archive` | POST | Перенос кампании в архив. |
| `/portal/push-campaigns/{id}/duplicate` | POST | Копирование кампании с новым расписанием. |
| `/portal/integrations/telegram-mini-app` | GET | Состояние интеграции Telegram Mini App (статус, ссылка, токен). |
| `/portal/integrations/rest-api` | GET | Состояние REST API интеграции (статус, маска ключа, базовый URL, лимиты). |
| `/portal/integrations/telegram-mini-app/connect` | POST | Подключение Telegram Mini App по токену бота. |
| `/portal/integrations/telegram-mini-app/check` | POST | Проверка подключения и состояния Telegram-бота. |
| `/portal/integrations/telegram-mini-app` | DELETE | Отключение Telegram Mini App для мерчанта. |
| `/portal/integrations/rest-api/issue` | POST | Выпуск/перевыпуск API-ключа для REST API интеграции. |
| `/portal/integrations/rest-api` | DELETE | Деактивация REST API интеграции и отзыв ключа. |
| `/portal/telegram-campaigns?scope=ACTIVE\|ARCHIVED` | GET | Активные и архивные Telegram-рассылки. |
| `/portal/telegram-campaigns` | POST | Создание Telegram-рассылки (аудитория, текст, опционально изображение и дата старта). |
| `/portal/telegram-campaigns/{id}/cancel` | POST | Отмена Telegram-кампании до начала отправки. |
| `/portal/telegram-campaigns/{id}/archive` | POST | Архивирование Telegram-кампании. |
| `/portal/telegram-campaigns/{id}/duplicate` | POST | Создание копии Telegram-кампании. |
| `/portal/staff-motivation` | GET | Текущие настройки мотивации персонала. |
| `/portal/staff-motivation` | PUT | Обновление мотивации (включение/отключение, баллы, период рейтинга). |
| `/portal/loyalty/promotions?status=ALL\|ACTIVE\|PAUSED\|SCHEDULED\|COMPLETED\|ARCHIVED` | GET | Список `LoyaltyPromotion` с агрегатами и аудиторией. |

> Push-рассылки используют Telegram push-уведомления. Регистрация мобильных устройств и FCM-токенов не требуется — достаточно активировать Telegram Mini App.
| `/portal/loyalty/promotions` | POST | Создание новой акции (название, аудитория, награда, расписание, push-настройки). |
| `/portal/loyalty/promotions/{id}` | GET | Детальная карточка акции с участниками и статистикой применения. |
| `/portal/loyalty/promotions/{id}` | PUT | Редактирование акции и её метаданных. |
| `/portal/loyalty/promotions/{id}/status` | POST | Смена статуса (`DRAFT` → `ACTIVE`/`PAUSED`/`ARCHIVED`). |
| `/portal/loyalty/promotions/bulk/status` | POST | Массовое изменение статусов по списку `ids`. |
| `/portal/loyalty/promotions/{id}/duplicate` | POST | Создание черновика на основе существующей акции. |
| `/portal/operations/log` | GET | Журнал начислений и списаний с фильтрами (даты, сотрудник `staffId`, статус сотрудника `staffStatus=current\|former`, точка `outletId`, устройство `deviceId`, направление, тип операции `operationType`). |
| `/portal/operations/log/{receiptId}` | GET | Детали конкретной операции (для покупок и индивидуальных транзакций, информация об отмене). |
| `/portal/operations/log/{receiptId}/cancel` | POST | Отмена операции: для покупок — отмена чека с перерасчётом, для остальных транзакций — обратное начисление/списание. Возвратные операции (`TxnType.REFUND`) считаются финальными и вернут ошибку 400. |
| `/portal/referrals/program` | GET/PUT | Получение и сохранение настроек реферальной программы (триггеры, тип награды, уровни, `minPurchaseAmount`, тексты сообщений). |
| `/portal/customers/{customerId}/transactions/accrual` | POST | Ручное начисление баллов (сумма покупки, чек, авто- или ручной ввод баллов, торговая точка). |
| `/portal/customers/{customerId}/transactions/redeem` | POST | Ручное списание баллов (количество баллов, торговая точка, комментарий — опционально). |
| `/portal/customers/{customerId}/transactions/complimentary` | POST | Начисление комплиментарных баллов (количество, срок сгорания, торговая точка, комментарий ≤60 символов). |

Примечания по мотивации персонала:
- По умолчанию начисляется 30 очков за покупку нового клиента и 10 очков за обслуженного постоянного клиента (если мерчант не менял значения).
- Поддерживаемые периоды рейтинга: `week`, `month`, `quarter`, `year`, `custom`. Для `custom` задаётся целое количество дней от 1 до 365 (`customDays`).
- Возвраты и отмены покупок пересчитывают рейтинг: очки сотрудника списываются пропорционально доле возврата.

Каждый эндпоинт требует аутентифицированного вызова из Merchant Portal. Поля дат (`scheduledAt`, `startDate`, `endDate`) передаются в формате ISO 8601.

Экспорт кампаний через `GET /reports/export/{merchantId}?type=campaigns&format=excel` отключён. Для выгрузки воспользуйтесь API аудитории/промо (`/portal/loyalty/promotions`) или подключите BI-инструмент к базе данных.

## Telegram уведомления сотрудников (единый бот)

Единый Telegram-бот для уведомлений сотрудникам мерчанта. Отличается от бота Mini App и настраивается через переменные окружения.

- ENV:
  - TELEGRAM_NOTIFY_BOT_TOKEN — токен бота из BotFather.
  - TELEGRAM_NOTIFY_WEBHOOK_SECRET — секрет для проверки заголовка X-Telegram-Bot-Api-Secret-Token.

- Вебхук Telegram → API:
  - POST `/telegram/notify/webhook`
    - Headers: `X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_NOTIFY_WEBHOOK_SECRET>`
    - Body: стандартный объект Telegram Update.
    - Response: `{ ok: true }`.

- Admin API (через прокси админки `/api/admin/...`):
  - GET `/notifications/telegram-notify/state` → `{ ok: true, configured: boolean, botUsername: string|null, botLink: string|null, webhook?: { url?: string|null, hasError?: boolean, lastErrorDate?: number, lastErrorMessage?: string } }`
  - POST `/notifications/telegram-notify/set-webhook` → `{ ok: true, url: string }`
  - POST `/notifications/telegram-notify/delete-webhook` → `{ ok: true }`

- Portal API (Merchant Portal):
  - GET `/portal/settings/telegram-notify/state` → `{ configured, botUsername, botLink }`
  - POST `/portal/settings/telegram-notify/invite` → `{ ok: true, startUrl, startGroupUrl, token }`
- GET `/portal/settings/telegram-notify/subscribers` → `Array<{ id, chatId, chatType, username?, title?, addedAt?, lastSeenAt? }>`
- POST `/portal/settings/telegram-notify/subscribers/{id}/deactivate` → `{ ok: true }`
- GET `/portal/settings/telegram-notify/preferences` → `{ notifyOrders: boolean, notifyReviews: boolean, notifyDailyDigest: boolean, notifyFraud: boolean }`
- POST `/portal/settings/telegram-notify/preferences` → принимает частичное тело с любыми сочетаниями `notifyOrders`, `notifyReviews`, `notifyDailyDigest`, `notifyFraud` (boolean) и возвращает актуальные настройки.
- GET `/portal/settings/name` → `{ name, initialName }`, где `initialName` — исходное название из админки.
- PUT `/portal/settings/name` → тело `{ name: "Новая сеть кофеен" }`, ответ `{ ok: true, name, initialName }`. В админ-панели сохраняется исходное название с пометкой о переименовании.
- GET `/portal/settings/timezone` → `{ timezone, options[] }`, где `timezone` и каждый элемент `options` содержит поля `code` (`МСК±N`), `label`, `city`, `description`, `mskOffset`, `utcOffsetMinutes`, `iana`. Используется порталом и аналитикой как единый источник часового пояса.
- PUT `/portal/settings/timezone` → тело `{ code: "MSK+4" }`, ответ `{ ok: true, timezone, options[] }`.

Замечания:
- Подписка сотрудников/групп осуществляется по deep-link `t.me/<bot>?start=<token>` или `?startgroup=<token>`. Токены выпускаются на стороне портала и привязаны к мерчанту.
- База хранит инвайты и подписчиков в моделях `TelegramStaffInvite` и `TelegramStaffSubscriber`.

## Telegram Mini App (персональный бот на мерчанта)

Поддерживается подключение собственного бота Telegram для каждого мерчанта. Мини-приложение работает на общем домене, контекст мерчанта задаётся URL/токеном.

- ENV:
  - MINIAPP_BASE_URL — базовый URL Mini App (общий для всех мерчантов), например `https://miniapp.example.com`.
  - TMA_LINK_SECRET — секрет подписи startapp-токенов (HS256 для диплинков). Должен быть длинной случайной строкой.
  - API_BASE_URL — публичный URL API (для установки webhook бота).

- Portal API:
  - GET `/portal/integrations/telegram-mini-app` → состояние интеграции: `{ enabled, botUsername, botLink, miniappUrl, connectionHealthy, lastSyncAt, integrationId, tokenMask }`.
  - POST `/portal/integrations/telegram-mini-app/connect` body: `{ token }` → подключение бота мерчанта (проверка getMe, установка webhook, сохранение токена/username).
  - POST `/portal/integrations/telegram-mini-app/check` → проверка `getWebhookInfo` и состояния бота.
  - POST `/portal/integrations/telegram-mini-app/link` → генерация диплинка Mini App: `{ deepLink, startParam }`.
  - POST `/portal/integrations/telegram-mini-app/setup-menu` → установка Chat Menu Button с web_app URL мини-приложения для мерчанта: `{ ok: true }`.
  - DELETE `/portal/integrations/telegram-mini-app` → отключение интеграции.
  - GET `/portal/integrations/rest-api` → состояние REST API интеграции: `{ enabled, status, integrationId, apiKeyMask, baseUrl, requireBridgeSignature, rateLimits, issuedAt, availableEndpoints }`.
  - POST `/portal/integrations/rest-api/issue` → выпуск или перевыпуск ключа, возвращает состояние + одноразовый `apiKey` для копирования.
  - DELETE `/portal/integrations/rest-api` → отзыв ключа и деактивация интеграции (ключ стирается).

- Публичный API Mini App:
  - POST `/loyalty/teleauth` body: `{ merchantId, initData }`
    - Сервер валидирует `initData` по токену бота данного мерчанта (`MerchantSettings.telegramBotToken`).
    - При наличии `start_param`/`startapp` валидирует подпись по `TMA_LINK_SECRET` и сверяет `merchantId` (при расхождении — 400).
    - Для каждого мерчанта создаётся собственная связка `MerchantCustomer` → `Customer`, даже если Telegram аккаунт уже авторизован в другой сети.
    - Ответ: `{ ok: true, customerId, hasPhone: boolean, onboarded: boolean }`, где `hasPhone` и `onboarded` вычисляются **исключительно** по данным `MerchantCustomer` для текущего мерчанта. Даже если телефон/анкета уже заполнены у другого мерчанта, новый мерчант потребует пройти регистрацию заново (форма «Расскажите о себе» + привязка номера).
  - GET `/loyalty/bootstrap?merchantId=...&customerId=...&transactionsLimit=20`
    - Возвращает агрегированный ответ для стартового экрана: `{ profile, consent, balance, levels, transactions, promotions }`.
    - `transactionsLimit` (1–100, по умолчанию 20) задаёт количество операций в первой пачке истории. Остальные поля соответствуют отдельным эндпоинтам (`/loyalty/profile`, `/loyalty/consent`, `/loyalty/balance`, `/levels`, `/loyalty/transactions`, `/loyalty/promotions`).
  - Все последующие запросы мини‑аппы (профиль, согласия, промо, отзывы, регистрационный бонус и т.д.) должны содержать заголовок `Authorization: tma <initData>`. Сервер валидирует подпись Telegram для каждого запроса.
  - GET `/loyalty/profile?merchantId={merchantId}&customerId={customerId}` → `{ name: string|null, gender: 'male'|'female'|null, birthDate: 'YYYY-MM-DD'|null }`.
    - Профиль клиента хранится на стороне сервера и изолирован по паре `(merchantId, customerId)`. Данные другого мерчанта (даже если они уже сохранены в `Customer`) не подставляются и не считаются заполненными.
    - Используется для кросс-девайс синхронизации данных профиля Mini App.
  - GET `/loyalty/profile/phone-status?merchantId={merchantId}&customerId={customerId}` → `{ hasPhone: boolean }`.
    - Возвращает признак наличия номера телефона у клиента **для данного мерчанта** (`MerchantCustomer.phone`). Телефон, сохранённый у другого мерчанта, не влияет на флаг.
    - Mini App запрашивает эндпоинт после действия пользователя "Поделиться номером", чтобы подтвердить получение номера перед сохранением профиля.
  - POST `/loyalty/profile`
    ```json
    {
      "merchantId": "M-1",
      "customerId": "cust_123",
      "name": "Иван Иванов",
      "gender": "male",
      "birthDate": "1995-04-12",
      "phone": "+7 900 123-45-67"
    }
    ```
    - Обновляет поля `Customer.name`, `gender`, `birthday` (для портала/аналитики) и зеркалирует профиль в `MerchantCustomer` (`name`, `profileGender`, `profileBirthDate`, а также `phone` для конкретного мерчанта). Эти данные используются телеграм-миниаппой для определения статуса регистрации по мерчанту.
    - Требование: при первом сохранении профиля для клиента номер телефона обязателен. Если у клиента ещё не сохранён номер **для данного мерчанта** и поле `phone` не передано, сервер вернёт `400 Bad Request` с сообщением: "Без номера телефона мы не можем зарегистрировать вас в программе лояльности".
    - Ответ: сохранённые `{ name, gender, birthDate }`.
    - Первый вход (нет принадлежности клиента к мерчанту): сервер создаёт запись `Customer` (если отсутствует) и привязывает её к мерчанту через нулевой кошелёк `Wallet(POINTS)`, после чего сохраняет профиль.

- Генерация ссылок:
  - Диплинк: `https://t.me/<botUsername>?startapp=<SIGNED_TOKEN>`.
  - `<SIGNED_TOKEN>` — HS256 над полезной нагрузкой `{ merchantId, outletId?, scope:'miniapp', iat, exp, jti }`.
  - Кнопка меню (web_app) — URL: `MINIAPP_BASE_URL` или сохранённый `MerchantSettings.miniappBaseUrl`.

Замечания:
- Верификация `initData` и подписи диплинка выполняется строго на сервере; фронтенд не должен доверять содержимому `initDataUnsafe`.
- Для запуска через меню Telegram `startapp` может отсутствовать, поэтому Mini App также использует путь/контекст мерчанта в URL, а сервер определяет токен бота по `merchantId`.
- Изоляция по мерчанту: один бот = один мерчант. Идентификация клиента в Mini App выполняется по `(merchantId, tgId)` с маппингом `CustomerTelegram`. Баланс, история, уровни, акции и профиль — все операции используют `(merchantId, customerId)`.

### Автовозврат клиентов (Auto-Return)

- Настройки берутся из `MerchantSettings.rulesJson.autoReturn`:
  - `enabled` — глобальный флаг;
  - `days` — сколько дней после последней покупки ждать перед приглашением;
  - `text` — текст push-сообщения (до 300 символов);
  - `giftPoints` — сколько баллов подарить (0 — без подарка);
  - `giftTtlDays` — срок жизни подарка (0 — бессрочно);
  - `repeat.enabled` + `repeat.days` — включают повторные попытки.
- Поддерживаемые плейсхолдеры в тексте: `%username%` (имя клиента или «Уважаемый клиент») и `%bonus%` (количество подарочных баллов, пустая строка если подарков нет).
- Фоновый воркер `AutoReturnWorker` активен при `WORKERS_ENABLED=1`. Интервал и размер партии на тик настраиваются переменными `AUTO_RETURN_WORKER_INTERVAL_MS` (по умолчанию 6 ч) и `AUTO_RETURN_BATCH_SIZE` (по умолчанию 200).
- Отбор клиентов выполняется по последним покупкам (`Receipt`). В расчёт берутся только реальные чеки (начисление/списание за покупку); начисления по акциям, промокодам, рефералам и возвратные операции игнорируются.
- Каждая попытка фиксируется в таблице `AutoReturnAttempt` с полями `merchantId`, `customerId`, `attemptNumber`, `lastPurchaseAt`, `message`, `giftPoints`, `giftExpiresAt`, `status`, `repeatAfterDays`, `giftTransactionId`, `completedAt`, `completionReason`.
- При включённой опции «Подарить баллы» воркер начисляет транзакцию `TxnType.CAMPAIGN`, обновляет баланс кошелька и, если активирован `EARN_LOTS_FEATURE`, создаёт `EarnLot` c `expiresAt = invitedAt + giftTtlDays`.
- Повторная попытка запускается через `repeat.days`, если после предыдущей отправки не было чека. Каждая повторная отправка повторно начисляет подарочные баллы.
- Push-уведомления отправляются через `PushService` (Telegram Mini App). В статусы попыток входят `PENDING`, `SENT`, `RETURNED`, `EXPIRED`, `FAILED`, `CANCELED`. Их можно использовать для аналитики и построения отчётов.
- Аналитика портала `/portal/analytics/auto-return`: принимает `period` либо `from`+`to` и (опционально) `outletId`; отдаёт `summary{invitations,returned,conversion,pointsCost,firstPurchaseRevenue}`, `distance{customers,purchasesPerCustomer,purchasesCount,totalAmount,averageCheck}`, таблицу `rfm[]` (реальные группы из `CustomerStats.rfmClass`) и `trends{attempts[],revenue[],rfmReturns[]}`. Тренды содержат значения по датам приглашений/первых чеков/выручки, а группировку по дням/неделям/месяцам выполняет фронт.

### Поздравления с днём рождения (Birthday)

- Конфигурация хранится в `MerchantSettings.rulesJson.birthday`:
  - `enabled` — включает механику;
  - `daysBefore` — за сколько дней до даты рождения отправлять push (0 — в сам день);
  - `onlyBuyers` — если `true`, в выборку попадают только клиенты с покупками (`CustomerStats.visits > 0` или `totalSpent > 0`);
- `text` — текст push-уведомления (до 300 символов). Поддерживаются плейсхолдеры `%username%` и `%bonus%`;
  - `giftPoints` — размер подарочных баллов (0 — без подарка);
  - `giftTtlDays` — срок жизни подарочных баллов в днях (0 — бессрочно).
- Фоновый воркер `BirthdayWorker` активен при `WORKERS_ENABLED=1`. Настраивается переменными `BIRTHDAY_WORKER_INTERVAL_MS` (интервал тикера, по умолчанию 6 ч) и `BIRTHDAY_WORKER_BATCH_SIZE` (максимум обработок за тик, по умолчанию 200).
- Воркер подбирает клиентов с заполненной датой рождения и подключённым Telegram (`MerchantCustomer.tgId`), учитывает переход границ года (например, дни рождения в начале января) и единоразово создаёт запись в таблице `BirthdayGreeting` для каждой даты рождения (`@@unique(merchantId, customerId, birthdayDate)`).
- Подарочные баллы начисляются транзакцией `TxnType.CAMPAIGN` (orderId `birthday:<greetingId>`). При активных флагах:
  - `LEDGER_FEATURE=1` — создаётся `LedgerEntry` с `meta.mode = 'BIRTHDAY'`;
  - `EARN_LOTS_FEATURE=1` — создаётся `EarnLot` с `expiresAt = sendDate + giftTtlDays`.
- Push отправляется через `PushService.sendPush` без заголовка (`title` не передаётся для Telegram). Поля `data` содержат `{ type: 'BIRTHDAY', greetingId, birthdayDate, giftPoints }`.
- Повторные попытки:
  - незавершённые записи `BirthdayGreeting` со статусами `PENDING` и `FAILED` (кроме `error = 'no recipients'`) повторно отправляются на каждом тике;
  - при отсутствии получателей статус фиксируется как `FAILED` с `error = 'no recipients'` без перерасчёта подарка.
- Метрики:
  - `birthday_greetings_created_total{merchantId}` — созданные поздравления;
  - `birthday_points_issued_total{merchantId}` — сумма подаренных баллов;
  - `birthday_push_sent_total{merchantId}` / `birthday_push_failed_total{merchantId,reason}` — успешные и неуспешные рассылки.
- Аналитика портала `/portal/analytics/birthday-mechanic`: принимает `period` либо `from`+`to` и (опционально) `outletId`; отдаёт сводку `summary{greetings,giftPurchasers,revenueNet,averageCheck,giftPointsSpent,receiptsWithGifts}`, `timeline[]` (дата, greetings, purchases) и `revenue[]` (дата, revenue — выручка с вычетом потраченных подарочных баллов). Группировка по дням/неделям/месяцам выполняется на фронтенде.

## Админ: наблюдаемость и алерты

- `GET /observability/summary` — сводка (требует `x-admin-key`):
  - `metrics`: `outboxPending`, `outboxDead`, `http5xx`, `http4xx`, `circuitOpen`, `rateLimited`, `counters`, `outboxEvents`.
  - `workers`: `{ name, expected, alive, stale, intervalMs, lastTickAt, startedAt, reason? }`.
  - `alerts`: состояние Telegram-бота (`enabled`, `chatId`, `sampleRate`), `incidents` — последние зафиксированные события (успех/ошибка отправки).
  - `telemetry`: флаги Prometheus/Grafana/Sentry/OTel.
- `GET /alerts/state` — статус бота + последние инциденты.
- `POST /alerts/test` — отправка тестового сообщения (body `{ text?: string }`).

ENV:

- `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID`, `ALERTS_5XX_SAMPLE_RATE`.
- Пороги мониторинга: `ALERT_OUTBOX_PENDING_THRESHOLD`, `ALERT_OUTBOX_DEAD_THRESHOLD`, `ALERT_WORKER_STALE_MINUTES`, `ALERT_MONITOR_INTERVAL_MS`, `ALERT_REPEAT_MINUTES`.

## Поддержка

- Email: support@loyalty.com
- Telegram: @loyalty_support
- Документация: https://docs.loyalty.com
- Status Page: https://status.loyalty.com

### Портал-управляемые уровни (LoyaltyTier)

Если у клиента назначен уровень (`LoyaltyTierAssignment`) или действует стартовый уровень (`LoyaltyTier.isInitial`), в расчёте /loyalty/quote используются ставки уровня:
- earnRateBps — ставка начисления (bps)
- redeemRateBps — лимит списания от чека (bps)

Также учитывается минимальная сумма к оплате из `tier.metadata.minPaymentAmount` (или `minPayment`): списание ограничено так, чтобы итог к оплате не опускался ниже этой суммы, включая уже списанное по заказу.

Формула ограничения:
discountToApply <= total - minPayment - alreadyRedeemedForOrder
