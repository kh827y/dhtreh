# API Documentation - Subscription Management

## Overview
The subscription management system allows merchants to subscribe to different plans with various features and limits.

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
    "id": "plan_starter",
    "name": "starter", 
    "displayName": "Starter",
    "description": "Идеально для растущего бизнеса",
    "price": 2900,
    "currency": "RUB",
    "interval": "month",
    "trialDays": 14,
    "maxTransactions": 10000,
    "maxCustomers": 1000,
    "maxOutlets": 3,
    "webhooksEnabled": true,
    "customBranding": false,
    "prioritySupport": false,
    "apiAccess": true,
    "features": {
      "basicReports": true,
      "emailNotifications": true,
      "exportData": true
    }
  }
]
```

### 2. Create Subscription
**POST** `/subscription/create`

Creates a new subscription for a merchant.

**Request Body:**
```json
{
  "merchantId": "merchant_123",
  "planId": "plan_starter",
  "trialDays": 14,
  "metadata": {
    "source": "website",
    "campaign": "launch2024"
  }
}
```

**Response:**
```json
{
  "id": "sub_abc123",
  "merchantId": "merchant_123",
  "planId": "plan_starter",
  "status": "trialing",
  "currentPeriodStart": "2024-12-12T00:00:00Z",
  "currentPeriodEnd": "2025-01-12T00:00:00Z",
  "trialEnd": "2024-12-26T00:00:00Z",
  "metadata": {...}
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
      "transactions": 10000,
      "customers": 1000,
      "outlets": 3
    }
  },
  "usage": {
    "transactions": {
      "used": 3421,
      "limit": 10000,
      "percentage": 34
    },
    "customers": {
      "used": 245,
      "limit": 1000,
      "percentage": 25
    },
    "outlets": {
      "used": 2,
      "limit": 3,
      "percentage": 67
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
- `trialing` - In trial period
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
- `trial.expired`

Webhook payload example:
```json
{
  "merchantId": "merchant_123",
  "eventType": "subscription.created",
  "payload": {
    "subscriptionId": "sub_abc123",
    "planId": "plan_starter",
    "status": "trialing",
    "trialEnd": "2024-12-26T00:00:00Z"
  },
  "createdAt": "2024-12-12T00:00:00Z"
}
```
