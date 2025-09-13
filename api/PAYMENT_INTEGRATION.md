# Документация по интеграции с платежными системами

## Обзор

Система поддерживает интеграцию с различными платежными провайдерами для обработки платежей за подписки. По умолчанию настроена интеграция с ЮKassa.

## Поддерживаемые провайдеры

### ЮKassa (YooMoney)
- Статус: ✅ Полностью реализован
- Поддержка рекуррентных платежей: Через сохраненные методы оплаты
- Методы оплаты: Банковские карты, ЮMoney, SberPay, QIWI

### Планируемые провайдеры
- Stripe
- CloudPayments
- Тинькофф Касса
- PayKeeper

## Конфигурация

### Переменные окружения

```env
# Выбор провайдера
PAYMENT_PROVIDER=yookassa

# ЮKassa
YOOKASSA_SHOP_ID=your_shop_id
YOOKASSA_SECRET_KEY=your_secret_key

# URL для возврата после оплаты
PAYMENT_RETURN_URL=https://yourdomain.com/payment/success

# Webhook URL (настраивается в личном кабинете провайдера)
PAYMENT_WEBHOOK_URL=https://yourdomain.com/payment/webhook/yookassa
```

## API Endpoints

### 1. Создание платежа для подписки
**POST** `/payment/subscription/{merchantId}/{subscriptionId}`

Создает платеж для оплаты подписки.

**Headers:**
```
x-api-key: your-api-key
```

**Response:**
```json
{
  "paymentId": "payment_abc123",
  "confirmationUrl": "https://yookassa.ru/checkout/...",
  "amount": 2900,
  "currency": "RUB"
}
```

### 2. Webhook для обработки событий
**POST** `/payment/webhook/{provider}`

Endpoint для получения уведомлений от платежной системы.

**Параметры:**
- `provider` - название провайдера (yookassa, stripe, etc.)

**Body:** Зависит от провайдера

**Response:**
```json
{
  "ok": true
}
```

### 3. Проверка статуса платежа
**GET** `/payment/status/{paymentId}`

Получает актуальный статус платежа.

**Response:**
```json
{
  "id": "payment_abc123",
  "status": "succeeded",
  "paid": true,
  "amount": 2900,
  "currency": "RUB",
  "paymentMethod": {
    "type": "bank_card",
    "card": {
      "last4": "4242",
      "expiryMonth": "12",
      "expiryYear": "2024",
      "cardType": "Visa"
    }
  },
  "capturedAt": "2024-12-12T10:00:00Z",
  "createdAt": "2024-12-12T09:55:00Z"
}
```

### 4. Создание возврата
**POST** `/payment/refund/{paymentId}`

Создает полный или частичный возврат платежа.

**Body:**
```json
{
  "amount": 1000  // Опционально, в копейках. Если не указано - полный возврат
}
```

**Response:**
```json
{
  "id": "refund_xyz789",
  "status": "succeeded",
  "amount": 1000,
  "currency": "RUB",
  "createdAt": "2024-12-12T11:00:00Z"
}
```

### 5. Получить методы оплаты
**GET** `/payment/methods`

Возвращает список доступных методов оплаты.

**Response:**
```json
[
  {
    "type": "bank_card",
    "title": "Банковская карта",
    "icon": "💳"
  },
  {
    "type": "yoo_money",
    "title": "ЮMoney",
    "icon": "💰"
  },
  {
    "type": "sberbank",
    "title": "SberPay",
    "icon": "🏦"
  }
]
```

## Настройка ЮKassa

### 1. Регистрация и получение ключей

1. Зарегистрируйтесь на [yookassa.ru](https://yookassa.ru)
2. Создайте магазин
3. Получите Shop ID и Secret Key в настройках

### 2. Настройка вебхуков

В личном кабинете ЮKassa:
1. Перейдите в Настройки → HTTP-уведомления
2. Добавьте URL: `https://yourdomain.com/payment/webhook/yookassa`
3. Выберите события:
   - payment.succeeded
   - payment.canceled
   - refund.succeeded

### 3. Настройка методов оплаты

Включите нужные методы оплаты в личном кабинете:
- Банковские карты
- ЮMoney
- SberPay
- QIWI
- Другие методы по необходимости

## Обработка событий

### События платежей

Система автоматически обрабатывает следующие события:

#### payment.succeeded
- Обновляет статус платежа в БД
- Продлевает подписку на следующий период
- Отправляет уведомление через EventOutbox
- Обновляет метрики

#### payment.failed
- Обновляет статус платежа
- Переводит подписку в статус `past_due`
- Отправляет уведомление об ошибке

#### payment.canceled
- Обновляет статус платежа на `canceled`

#### refund.succeeded
- Обновляет статус платежа на `refunded`
- Отправляет уведомление о возврате

## Рекуррентные платежи

Для автоматического списания платежей:

1. При первом платеже установите `savePaymentMethod: true`
2. Сохраните `payment_method_id` из ответа
3. Используйте сохраненный метод для последующих платежей

```javascript
// Первый платеж
const firstPayment = await createPayment({
  amount: 2900,
  savePaymentMethod: true,
  // ...
});

// Последующие платежи
const recurringPayment = await createPayment({
  amount: 2900,
  paymentMethodId: firstPayment.paymentMethod.id,
  // ...
});
```

## Безопасность

### Проверка подписи вебхуков

Для ЮKassa используется HTTPS, что обеспечивает базовую безопасность. Дополнительно можно:

1. Проверять IP-адреса ЮKassa (185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25)
2. Использовать секретный токен в URL вебхука
3. Проверять идемпотентность обработки событий

### Хранение учетных данных

- Никогда не храните ключи в коде
- Используйте переменные окружения
- Ротируйте ключи регулярно
- Логируйте все операции с платежами

## Тестирование

### Тестовые карты ЮKassa

Для тестирования используйте:
- Успешный платеж: 5555 5555 5555 4444
- Недостаточно средств: 5555 5555 5555 4477
- Платеж с 3DS: 5555 5555 5555 4592

CVV: любые 3 цифры
Срок действия: любая дата в будущем

### Тестовый режим

В тестовом режиме:
1. Используйте тестовые ключи из личного кабинета
2. Все платежи будут тестовыми
3. Реальные деньги не списываются

## Метрики и мониторинг

Система собирает следующие метрики:

- `payment_succeeded_total` - Количество успешных платежей
- `payment_failed_total` - Количество неудачных платежей
- `subscriptions_revenue_monthly` - Месячный доход (MRR)
- `subscriptions_active_total` - Активные подписки

Метрики доступны по адресу `/metrics` в формате Prometheus.

## Добавление нового провайдера

Для добавления нового платежного провайдера:

1. Создайте класс провайдера в `src/payments/providers/`:
```typescript
export class StripeProvider implements PaymentProvider {
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    // Реализация
  }
  
  async checkPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    // Реализация
  }
  
  // Другие методы интерфейса
}
```

2. Добавьте провайдера в `PaymentService`:
```typescript
switch (providerName) {
  case 'stripe':
    this.provider = new StripeProvider(configService);
    break;
  // ...
}
```

3. Добавьте необходимые переменные окружения:
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Troubleshooting

### Платеж зависает в статусе pending
- Проверьте настройки вебхуков
- Убедитесь, что вебхук доступен извне
- Проверьте логи на наличие ошибок

### Ошибка "Invalid shop id or secret key"
- Проверьте правильность YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY
- Убедитесь, что используете правильные ключи (тестовые/боевые)

### Вебхуки не приходят
- Проверьте URL вебхука в личном кабинете
- Убедитесь, что сервер доступен из интернета
- Проверьте файрвол и настройки безопасности

## Поддержка

При возникновении проблем:
1. Проверьте логи приложения
2. Проверьте логи в личном кабинете платежной системы
3. Обратитесь в поддержку провайдера
4. Создайте issue в репозитории проекта
