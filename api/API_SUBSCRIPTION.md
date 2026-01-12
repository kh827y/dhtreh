# API Documentation - Subscription Management

## Overview
Доступен один тариф `plan_full` (Full) без лимитов и с включёнными всеми функциями. Подписка выдаётся вручную через админ‑API `/admin/merchants/{merchantId}/subscription` на заданное число дней; по истечении доступа все операции портала/касы/API блокируются ответом 403 «Подписка закончилась».

## Base URL
```
/subscription
```

## Authentication
All endpoints require API key authentication via `x-api-key` header.

## Endpoints

### 1. Get Available Plans
**GET** `/subscription/plans`

Returns list of all available subscription plans.

**Response:**
```json
[
  {
    "id": "plan_full",
    "name": "full",
    "displayName": "Full",
    "price": 0,
    "currency": "RUB",
    "interval": "day",
    "maxTransactions": null,
    "maxCustomers": null,
    "maxOutlets": null,
    "webhooksEnabled": true,
    "customBranding": true,
    "prioritySupport": true,
    "apiAccess": true,
    "features": { "all": true }
  }
]
```

### 2. Create Subscription (manual grant)
**POST** `/admin/merchants/{merchantId}/subscription`

Создаёт/перезаписывает подписку мерчанта.

**Request Body:**
```json
{ "days": 30, "planId": "plan_full" }
```

**Response (упрощённо):**
```json
{
  "status": "active",
  "planName": "Full",
  "currentPeriodEnd": "2025-01-12T00:00:00Z",
  "daysLeft": 30,
  "expiresSoon": false,
  "expired": false
}
```

### 3. Get Subscription
**GET** `/subscription/{merchantId}`

Returns current subscription details for a merchant.

**Response:**
```json
{
  "id": "sub_abc123",
  "merchantId": "merchant_123",
  "planId": "plan_starter",
  "status": "active",
  "currentPeriodStart": "2024-12-12T00:00:00Z",
  "currentPeriodEnd": "2025-01-12T00:00:00Z",
  "plan": {
    "id": "plan_starter",
    "displayName": "Starter",
    "price": 2900,
    "maxTransactions": 10000,
    "maxCustomers": 1000
  }
}
```

### 4. Update Subscription
**PUT** `/subscription/{merchantId}`

Updates subscription (change plan, cancel at period end, update metadata).

**Request Body:**
```json
{
  "planId": "plan_business",
  "cancelAtPeriodEnd": false,
  "metadata": {
    "notes": "Upgraded due to growth"
  }
}
```

### 5. Cancel Subscription
**DELETE** `/subscription/{merchantId}?immediately=false`

Cancels subscription either immediately or at period end.

**Query Parameters:**
- `immediately` (boolean): If true, cancels immediately. If false, cancels at period end.

**Response:**
```json
{
  "id": "sub_abc123",
  "status": "active",
  "cancelAt": "2025-01-12T00:00:00Z",
  "canceledAt": "2024-12-15T10:30:00Z"
}
```

### 6. Check Feature Access
**GET** `/subscription/{merchantId}/feature/{feature}`

Checks if a specific feature is available for merchant's current plan.

**Features:**
- `webhooks`
- `custom_branding`
- `priority_support`
- `api_access`
- Custom feature names from plan features object

**Response:**
```json
{
  "feature": "webhooks",
  "hasAccess": true
}
```

### 7. Get Usage Statistics
**GET** `/subscription/{merchantId}/usage`

Returns current usage statistics against plan limits.

**Response:**
```json
{
  "plan": {
    "id": "plan_starter",
    "name": "Starter",
    "limits": {
      "outlets": null
    }
  },
  "usage": {
    "outlets": {
      "used": 2,
      "limit": "unlimited",
      "percentage": null
    }
  },
  "status": "active",
  "currentPeriodEnd": "2025-01-12T00:00:00Z"
}
```

### 8. Payment Webhook
**POST** `/subscription/payment/webhook`

Webhook endpoint for payment system integration.

**Request Body:**
```json
{
  "subscriptionId": "sub_abc123",
  "status": "succeeded",
  "method": "card",
  "invoiceId": "inv_xyz789",
  "receiptUrl": "https://payments.example.com/receipt/xyz789",
  "failureReason": null
}
```

### 9. Payment History
**GET** `/subscription/{merchantId}/payments?limit=20`

Returns payment history for subscription.

**Response:**
```json
[
  {
    "id": "pay_123",
    "subscriptionId": "sub_abc123",
    "amount": 2900,
    "currency": "RUB",
    "status": "succeeded",
    "paymentMethod": "card",
    "invoiceId": "inv_xyz789",
    "receiptUrl": "https://...",
    "paidAt": "2024-12-12T10:00:00Z",
    "createdAt": "2024-12-12T09:55:00Z"
  }
]
```

### 10. Validate Plan Limits
**POST** `/subscription/{merchantId}/validate-limits`

Validates if current usage fits within plan limits.

**Request Body (optional):**
```json
{
  "id": "plan_business",
  "maxTransactions": 100000,
  "maxCustomers": 10000,
  "maxOutlets": 10
}
```

**Response:**
```json
{
  "valid": true,
  "merchantId": "merchant_123",
  "planId": "plan_business"
}
```

## Subscription Status Values
- `active` - Active subscription
- `canceled` - Canceled (may still be active until period end)
- `expired` - Expired subscription
- `past_due` - Payment failed but grace period active

## Plan Intervals
- `month` - Monthly billing
- `year` - Annual billing
- `week` - Weekly billing (rare)

## Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "У мерчанта уже есть активная подписка",
  "error": "Bad Request"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Подписка не найдена",
  "error": "Not Found"
}
```

## Rate Limits
- Default: 200 requests per minute per IP
- With API key: 1000 requests per minute

## Webhooks
When webhooks are enabled for a plan, the following events are sent:
- `subscription.created`
- `subscription.updated`
- `subscription.canceled`
- `payment.succeeded`
- `payment.failed`

Webhook payload example:
```json
{
  "merchantId": "merchant_123",
  "eventType": "subscription.created",
  "payload": {
    "subscriptionId": "sub_abc123",
    "planId": "plan_starter",
    "status": "active"
  },
  "createdAt": "2024-12-12T00:00:00Z"
}
```
