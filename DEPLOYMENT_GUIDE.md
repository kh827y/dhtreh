# 📦 Руководство по развертыванию программы лояльности

## Требования к системе

### Минимальные требования
- **CPU**: 2 vCPU
- **RAM**: 4 GB
- **Диск**: 20 GB SSD
- **ОС**: Ubuntu 20.04+ / Debian 11+
- **Docker**: 20.10+
- **Docker Compose**: 2.0+

### Рекомендуемые требования для продакшна
- **CPU**: 4+ vCPU
- **RAM**: 8+ GB
- **Диск**: 100 GB SSD
- **Сеть**: 100 Mbps
- **Резервирование**: 2+ сервера для HA

## 🚀 Быстрый старт (Development)

### 1. Клонирование репозитория
```bash
git clone https://github.com/your-org/loyalty.git
cd loyalty
```

### 2. Настройка окружения
```bash
# Копируем примеры конфигураций
cp .env.example .env.development
cp api/.env.example api/.env
cp admin/.env.example admin/.env.local
cp cashier/.env.example cashier/.env.local
cp miniapp/.env.example miniapp/.env.local

# Редактируем конфигурации
nano .env.development
```

### 3. Запуск через Docker Compose
```bash
# Запуск всех сервисов
docker-compose -f docker-compose.dev.yml up -d

# Проверка статуса
docker-compose -f docker-compose.dev.yml ps

# Применение миграций БД
docker-compose -f docker-compose.dev.yml exec api pnpm prisma migrate dev

# Заполнение тестовыми данными
docker-compose -f docker-compose.dev.yml exec api pnpm seed
```

### 4. Доступ к сервисам
- API: http://localhost:3000
- Admin: http://localhost:3001
- Cashier: http://localhost:3002
- Miniapp: http://localhost:3003
- Bridge: http://localhost:18080

## 🏭 Развертывание в Production

### 1. Подготовка сервера

#### Установка Docker
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
```

#### Настройка файрвола
```bash
# Открываем необходимые порты
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 18080/tcp # Bridge (только если нужен внешний доступ)
sudo ufw enable
```

### 2. Настройка SSL сертификатов

#### Вариант A: Let's Encrypt (автоматически через Traefik)
```bash
# Traefik автоматически получит сертификаты
# Убедитесь, что в .env.production указаны:
DOMAIN=loyalty.example.com
ADMIN_EMAIL=admin@example.com
```

#### Вариант B: Свои сертификаты
```bash
# Копируем сертификаты
sudo mkdir -p /etc/ssl/loyalty
sudo cp fullchain.pem /etc/ssl/loyalty/
sudo cp privkey.pem /etc/ssl/loyalty/
```

### 3. Конфигурация Production

```bash
# Создаем директорию проекта
sudo mkdir -p /opt/loyalty
cd /opt/loyalty

# Клонируем репозиторий
git clone https://github.com/your-org/loyalty.git .

# Настраиваем production окружение
cp .env.production.example .env.production

# ВАЖНО: Генерируем безопасные ключи
openssl rand -base64 32  # для ADMIN_KEY
openssl rand -base64 32  # для QR_JWT_SECRET
openssl rand -base64 32  # для ADMIN_SESSION_SECRET

# Редактируем конфигурацию
nano .env.production
```

### 4. Запуск Production

```bash
# Сборка и запуск
docker-compose -f docker-compose.production.yml up -d

# Применение миграций
docker-compose -f docker-compose.production.yml exec api pnpm prisma migrate deploy

# Проверка логов
docker-compose -f docker-compose.production.yml logs -f

# Проверка здоровья сервисов
curl http://localhost:3000/health
```

## ✉️ Уведомления (Email/SMS/Push)

### Переменные окружения (API/worker)

Добавьте в `.env.production` (и/или секцию `environment` сервиса `worker`/`api` в `docker-compose.production.yml`):

```env
# SMTP (Email)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASSWORD=***
SMTP_FROM="Loyalty <noreply@example.com>"

# SMS
SMS_PROVIDER=smsc
SMS_TEST_MODE=true  # включайте false в проде после проверки

# Push (FCM)
# Вставьте JSON service account в одну строку (экранируйте кавычки)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Воркер уведомлений
WORKERS_ENABLED=1
NO_HTTP=1
# Интервалы/батчи и бэкофф
NOTIFY_WORKER_INTERVAL_MS=15000
NOTIFY_WORKER_BATCH=10
NOTIFY_BACKOFF_BASE_MS=60000
NOTIFY_BACKOFF_CAP_MS=3600000
# Троттлинг RPS по мерчанту (0 — без ограничений)
NOTIFY_RPS_DEFAULT=0
NOTIFY_RPS_BY_MERCHANT="M-1=5,M-2=3"
```

В `docker-compose.production.yml` сервис `worker` уже запускается с `NO_HTTP=1` и `WORKERS_ENABLED=1`. При необходимости добавьте переменные `SMTP_*`, `SMS_*`, `FIREBASE_SERVICE_ACCOUNT`, `NOTIFY_*` в секцию `environment` сервиса `worker` (и `api`, если хотите отправку из API‑контекста).

### Доступ из Admin UI

- Страница: `admin/app/notifications` — рассылки по каналам `ALL/EMAIL/SMS/PUSH`, поддержан `dry‑run` (предварительная оценка получателей).
- Для вызова API используется заголовок `X-Admin-Key` (см. `ADMIN_KEY`).
- Рекомендуется ограничить доступ по IP для административных эндпоинтов (переменная `ADMIN_IP_WHITELIST`, если используется `AdminIpGuard`).

### Метрики уведомлений

- `notifications_enqueued_total{type}` — поставлено задач в outbox (`broadcast`/`test`).
- `notifications_processed_total{type,result}` — обработка воркером (`sent`/`dry`/`retry`/`dead`/`throttled`).
- `notifications_channel_attempts_total{channel}` / `..._sent_total{channel}` / `..._failed_total{channel}` — попытки/успехи/ошибки по каналам.

### Миграция legacy push/telegram

- До применения миграции `communication_tasks_unified` прогоните перенос исторических кампаний:
  - `pnpm -C api ts-node ../scripts/migrate-communications.ts`
- Скрипт копирует записи из `PushCampaign`/`TelegramCampaign` в `CommunicationTask` (поля текста, аудитории, статистики, изображения) и поддерживает повторный запуск.


## 🔄 CI/CD Pipeline

### GitHub Actions
Проект настроен для автоматического деплоя через GitHub Actions:

1. **Push в develop** → Деплой на staging
2. **Push в main** → Деплой на production
3. **Pull Request** → Запуск тестов

### Настройка секретов GitHub
```
Settings → Secrets → Actions:

PRODUCTION_HOST=your.server.ip
PRODUCTION_USER=deploy
PRODUCTION_SSH_KEY=-----BEGIN RSA PRIVATE KEY-----...
PRODUCTION_DOMAIN=loyalty.example.com
TELEGRAM_BOT_TOKEN=123456789:ABC...
TELEGRAM_CHAT_ID=-1001234567890
```

### Ручной деплой
```bash
# Использование скрипта деплоя
./scripts/deploy.sh production deploy

# Откат к предыдущей версии
./scripts/deploy.sh production rollback

# Проверка статуса
./scripts/deploy.sh production status
```

## 🔐 Безопасность

### 1. Настройка базы данных
```sql
-- Создание отдельного пользователя для приложения
CREATE USER loyalty_app WITH PASSWORD 'strong_password';
GRANT ALL PRIVILEGES ON DATABASE loyalty TO loyalty_app;

-- Ограничение подключений
ALTER DATABASE loyalty SET connection_limit = 100;
```

### 2. Настройка Redis
```bash
# redis.conf
requirepass your_redis_password
maxmemory 512mb
maxmemory-policy allkeys-lru
```

### 3. Настройка Nginx (если не используется Traefik)
```nginx
server {
    listen 443 ssl http2;
    server_name api.loyalty.example.com;

    ssl_certificate /etc/ssl/loyalty/fullchain.pem;
    ssl_certificate_key /etc/ssl/loyalty/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📊 Мониторинг

### Prometheus & Grafana
```bash
# Доступ к метрикам
http://metrics.loyalty.example.com  # Prometheus
http://grafana.loyalty.example.com  # Grafana

# Дефолтные креды Grafana
Username: admin
Password: (из GRAFANA_PASSWORD в .env)
```

### Настройка алертов
```yaml
# infra/alertmanager/alertmanager.yml
global:
  telegram_api_url: 'https://api.telegram.org'

receivers:
  - name: 'telegram'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: ${TELEGRAM_CHAT_ID}
        parse_mode: 'HTML'
```

## 💾 Резервное копирование

### Автоматические бэкапы
```bash
# Настройка cron для ежедневных бэкапов
0 3 * * * /opt/loyalty/scripts/backup.sh

# Ручной бэкап
docker exec postgres pg_dump -U loyalty loyalty | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Восстановление из бэкапа
```bash
# Остановка приложения
docker-compose -f docker-compose.production.yml stop api worker

# Восстановление БД
gunzip < backup_20240101.sql.gz | docker exec -i postgres psql -U loyalty loyalty

# Запуск приложения
docker-compose -f docker-compose.production.yml start api worker
```

## 🔧 Обслуживание

### Обновление приложения
```bash
# Pull последних изменений
git pull origin main

# Пересборка и перезапуск
docker-compose -f docker-compose.production.yml up -d --build

# Применение новых миграций
docker-compose -f docker-compose.production.yml exec api pnpm prisma migrate deploy
```

### Очистка Docker
```bash
# Удаление неиспользуемых образов
docker image prune -a -f

# Очистка логов
docker-compose -f docker-compose.production.yml logs --tail=0 -f

# Полная очистка (ОСТОРОЖНО!)
docker system prune -a --volumes
```

## 🆘 Troubleshooting

### Проблема: Контейнеры не запускаются
```bash
# Проверка логов
docker-compose -f docker-compose.production.yml logs api

# Проверка конфигурации
docker-compose -f docker-compose.production.yml config

# Перезапуск с пересборкой
docker-compose -f docker-compose.production.yml up -d --force-recreate --build
```

### Проблема: База данных недоступна
```bash
# Проверка состояния PostgreSQL
docker exec postgres pg_isready

# Проверка подключения
docker exec postgres psql -U loyalty -c "SELECT 1"

# Просмотр логов БД
docker logs postgres
```

### Проблема: Недостаточно памяти
```bash
# Проверка использования памяти
docker stats

# Настройка лимитов в docker-compose.yml
services:
  api:
    deploy:
      resources:
        limits:
          memory: 512M
```

## 📝 Чеклист запуска

### Pre-Production
- [ ] Все переменные окружения настроены
- [ ] SSL сертификаты установлены
- [ ] Бэкапы настроены
- [ ] Мониторинг работает
- [ ] Файрвол настроен
- [ ] Логирование настроено

### Production
- [ ] Домены настроены (DNS)
- [ ] Email для Let's Encrypt указан
- [ ] Telegram бот создан и настроен
- [ ] Платежная система подключена
- [ ] Webhook URLs настроены
- [ ] Rate limiting включен
- [ ] Антифрод активирован

### Post-Production
- [ ] Smoke тесты пройдены
- [ ] Метрики собираются
- [ ] Алерты работают
- [ ] Документация обновлена
- [ ] Команда обучена

## 📞 Поддержка

### Логи для диагностики
```bash
# Сбор всех логов
docker-compose -f docker-compose.production.yml logs > logs_$(date +%Y%m%d_%H%M%S).txt

# Логи конкретного сервиса
docker-compose -f docker-compose.production.yml logs api --tail=1000

# Real-time логи
docker-compose -f docker-compose.production.yml logs -f
```

### Контакты
- **Email**: devops@loyalty.com
- **Telegram**: @loyalty_devops
- **Emergency**: +7 (XXX) XXX-XX-XX

## 📚 Дополнительные ресурсы

- [API Documentation](./API_DOCUMENTATION.md)
- [Development Plan](./DEVELOPMENT_PLAN.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Security Guidelines](./docs/SECURITY.md)
- [Performance Tuning](./docs/PERFORMANCE.md)
