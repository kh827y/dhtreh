# API Documentation - Loyalty Program

## Содержание
- [Аутентификация](#аутентификация)
- [Основные эндпоинты](#основные-эндпоинты)
- [Программа лояльности](#программа-лояльности)
- [Управление мерчантами](#управление-мерчантами)
- [Интеграции](#интеграции)
- [Вебхуки](#вебхуки)
- [Коды ошибок](#коды-ошибок)

## Базовый URL
```
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
  "category": "string"  // optional
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

Response 200 (EARN):
{
  "canEarn": true,
  "pointsToEarn": 50,
  "holdId": "uuid",
  "message": "Начислим 50 баллов после оплаты"
}
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
  "requestId": "string"      // optional
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

## Поддержка

- Email: support@loyalty.com
- Telegram: @loyalty_support
- Документация: https://docs.loyalty.com
- Status Page: https://status.loyalty.com
