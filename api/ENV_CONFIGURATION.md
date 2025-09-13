# 🔧 Конфигурация переменных окружения

## Основные настройки

```env
# База данных
DATABASE_URL="postgresql://user:password@localhost:5432/loyalty"

# JWT токены
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_REFRESH_SECRET="your-refresh-secret-key"
JWT_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"

# API ключи
API_KEY="your-api-key-for-internal-services"

# Порты
PORT=3001
```

## Платежные системы

### ЮKassa (YooMoney)
```env
PAYMENT_PROVIDER="yookassa"
YOOKASSA_SHOP_ID="your-shop-id"
YOOKASSA_SECRET_KEY="your-secret-key"
PAYMENT_RETURN_URL="https://yourdomain.com/payment/success"
```

### CloudPayments
```env
PAYMENT_PROVIDER="cloudpayments"
CLOUDPAYMENTS_PUBLIC_ID="your-public-id"
CLOUDPAYMENTS_API_SECRET="your-api-secret"
```

### Тинькофф Касса
```env
PAYMENT_PROVIDER="tinkoff"
TINKOFF_TERMINAL_KEY="your-terminal-key"
TINKOFF_SECRET_KEY="your-secret-key"
TINKOFF_API_URL="https://securepay.tinkoff.ru/v2"
TINKOFF_NOTIFICATION_URL="https://yourdomain.com/api/payment/webhook"
```

## Уведомления

### SMS (SMSC.RU)
```env
SMS_PROVIDER="smsc"
SMSC_LOGIN="your-login"
SMSC_PASSWORD="your-password"
SMSC_SENDER="LOYALTY" # Имя отправителя (до 11 символов)
SMS_TEST_MODE="false"  # true для тестового режима
```

### Push-уведомления (Firebase)
```env
PUSH_PROVIDER="fcm"
FIREBASE_SERVICE_ACCOUNT='{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk@your-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}'
```

## Интеграции с кассами

### АТОЛ
```env
ATOL_LOGIN="your-login"
ATOL_PASSWORD="your-password"
ATOL_GROUP_CODE="your-group"
ATOL_INN="7729633321"  # ИНН организации
ATOL_PAYMENT_ADDRESS="https://example.com"
ATOL_COMPANY_EMAIL="info@example.com"
ATOL_API_URL="https://online.atol.ru/possystem/v4"
```

### Эвотор
```env
EVOTOR_TOKEN="your-evotor-token"
EVOTOR_STORE_UUID="your-store-uuid"
EVOTOR_WEBHOOK_URL="https://yourdomain.com/api/integrations/evotor/webhook"
```

## Telegram
```env
TELEGRAM_BOT_TOKEN="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
TELEGRAM_BOT_USERNAME="YourLoyaltyBot"
TELEGRAM_WEBHOOK_URL="https://yourdomain.com/api/telegram/webhook"
TELEGRAM_MINIAPP_URL="https://yourdomain.com/miniapp"
```

## Redis (опционально)
```env
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""  # Если требуется
```

## Метрики и мониторинг
```env
METRICS_ENABLED="true"
OPENTELEMETRY_ENABLED="false"
OPENTELEMETRY_ENDPOINT="http://localhost:4317"
```

## Cron задачи
```env
CRON_ENABLED="true"  # Включить/выключить все cron задачи
SUBSCRIPTION_RENEWAL_ENABLED="true"
EXPIRATION_REMINDERS_ENABLED="true"
CLEANUP_OLD_DATA_ENABLED="true"
MONTHLY_REPORTS_ENABLED="true"
```

## Rate Limiting
```env
THROTTLE_TTL="60"     # Время жизни окна в секундах
THROTTLE_LIMIT="60"   # Максимум запросов за окно
```

## Настройки для разработки
```env
NODE_ENV="development"  # production | development | test
LOG_LEVEL="debug"      # error | warn | info | debug
SWAGGER_ENABLED="true"  # Включить Swagger UI на /api
```

## Настройки для production
```env
NODE_ENV="production"
LOG_LEVEL="info"
SWAGGER_ENABLED="false"

# SSL сертификаты (если не используется reverse proxy)
SSL_KEY_PATH="/path/to/privkey.pem"
SSL_CERT_PATH="/path/to/fullchain.pem"

# CORS
CORS_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"
CORS_CREDENTIALS="true"
```

## Дополнительные настройки

```env
# Временная зона
TZ="Europe/Moscow"

# Локализация
DEFAULT_LANGUAGE="ru"
SUPPORTED_LANGUAGES="ru,en"

# Лимиты
MAX_UPLOAD_SIZE="10mb"
MAX_TRANSACTION_AMOUNT="1000000"  # В копейках
MAX_POINTS_PER_TRANSACTION="10000"

# Безопасность
BCRYPT_ROUNDS="10"
SESSION_SECRET="your-session-secret"
COOKIE_SECURE="true"  # Только для HTTPS

# Email (для отчетов)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
SMTP_FROM="Loyalty System <noreply@yourdomain.com>"
```

## Пример .env файла для разработки

```env
# Минимальная конфигурация для запуска
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/loyalty_dev"
JWT_SECRET="dev-secret-change-in-production"
JWT_REFRESH_SECRET="dev-refresh-secret"
API_KEY="dev-api-key"
PORT=3001

# Платежи (тестовый режим)
PAYMENT_PROVIDER="yookassa"
YOOKASSA_SHOP_ID="test-shop-id"
YOOKASSA_SECRET_KEY="test-secret-key"
PAYMENT_RETURN_URL="http://localhost:3000/payment/success"

# SMS (тестовый режим)
SMS_PROVIDER="smsc"
SMSC_LOGIN="test"
SMSC_PASSWORD="test"
SMS_TEST_MODE="true"

# Разработка
NODE_ENV="development"
LOG_LEVEL="debug"
SWAGGER_ENABLED="true"
CRON_ENABLED="false"  # Выключаем cron в разработке
```

## Пример .env.production

```env
# Production конфигурация
DATABASE_URL="postgresql://prod_user:strong_password@db.internal:5432/loyalty_prod"
JWT_SECRET="production-secret-generated-with-openssl"
JWT_REFRESH_SECRET="production-refresh-secret-generated-with-openssl"
API_KEY="production-api-key-generated-uuid"
PORT=3001

# Реальные платежи
PAYMENT_PROVIDER="yookassa"
YOOKASSA_SHOP_ID="real-shop-id"
YOOKASSA_SECRET_KEY="real-secret-key"
PAYMENT_RETURN_URL="https://loyalty.yourdomain.com/payment/success"

# Реальные SMS
SMS_PROVIDER="smsc"
SMSC_LOGIN="real-login"
SMSC_PASSWORD="real-password"
SMSC_SENDER="YOURBRAND"
SMS_TEST_MODE="false"

# Push уведомления
PUSH_PROVIDER="fcm"
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# Redis для кеширования
REDIS_URL="redis://redis.internal:6379"

# Production настройки
NODE_ENV="production"
LOG_LEVEL="info"
SWAGGER_ENABLED="false"
CRON_ENABLED="true"
CORS_ORIGINS="https://loyalty.yourdomain.com"

# SSL и безопасность
COOKIE_SECURE="true"
BCRYPT_ROUNDS="12"
```

## Валидация конфигурации

При запуске система автоматически проверяет наличие обязательных переменных:
- DATABASE_URL
- JWT_SECRET
- JWT_REFRESH_SECRET

Для production также требуются:
- Настройки выбранного платежного провайдера
- Настройки SMS провайдера (если используются SMS)
- CORS_ORIGINS для безопасности

## Генерация секретных ключей

```bash
# Генерация JWT секретов
openssl rand -base64 64

# Генерация API ключа
uuidgen

# Генерация пароля для БД
openssl rand -base64 32
```
