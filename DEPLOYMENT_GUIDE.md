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

## 🚀 Быстрый старт (локально)

### 1. Клонирование репозитория
```bash
git clone https://github.com/your-org/loyalty.git
cd loyalty
```

### 2. Настройка окружения
```bash
# API
cp api/.env.example api/.env

# Фронты (примеры в infra/env-examples)
cp infra/env-examples/admin.env.example admin/.env.local
cp infra/env-examples/merchant-portal.env.example merchant-portal/.env.local
cp infra/env-examples/cashier.env.example cashier/.env.local
cp infra/env-examples/miniapp.env.example miniapp/.env.local
```

### 3. Запуск инфраструктуры (БД/Redis)
```bash
docker compose -f infra/docker-compose.yml up -d
```

Опционально: полный локальный стек (API + фронты + мониторинг):
```bash
docker compose -f infra/docker-compose.full.yml up -d
```

### 4. Миграции и демо‑данные (если запускаете API локально)
```bash
cd api
pnpm i
pnpm prisma migrate dev
pnpm seed
pnpm start:dev
```

### 5. Запуск фронтов (если не используете full compose)
```bash
cd admin && pnpm i && pnpm dev
cd merchant-portal && pnpm i && pnpm dev
cd cashier && pnpm i && pnpm dev
cd miniapp && pnpm i && pnpm dev
```

### 6. Доступ к сервисам
- API: http://localhost:3000
- Admin: http://localhost:3001
- Cashier: http://localhost:3002
- Miniapp: http://localhost:3003
- Merchant Portal: http://localhost:3004

## 🏭 Развертывание в Production

### 1. Подготовка сервера

#### Установка Docker
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
```

#### Настройка файрвола
```bash
# Открываем необходимые порты
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
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
openssl rand -base64 32  # для API_KEY
openssl rand -base64 32  # для QR_JWT_SECRET
openssl rand -base64 32  # для ADMIN_SESSION_SECRET
openssl rand -base64 32  # для PORTAL_JWT_SECRET
openssl rand -base64 32  # для PORTAL_REFRESH_SECRET

# Редактируем конфигурацию
nano .env.production
```

### 4. Запуск Production

```bash
# Сборка и запуск
docker compose --env-file .env.production -f docker-compose.production.yml up -d

# Применение миграций
docker compose --env-file .env.production -f docker-compose.production.yml exec -T api pnpm prisma migrate deploy

# Проверка логов
docker compose --env-file .env.production -f docker-compose.production.yml logs -f

# Проверка здоровья сервисов
curl http://localhost:3000/healthz
```

## ✉️ Уведомления (Email/Push)

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


# Push (Telegram Mini App)
# Убедитесь, что задано API_BASE_URL и MINIAPP_BASE_URL.
# Бот подключается через портал: /portal/integrations/telegram-mini-app

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

В `docker-compose.production.yml` сервис `worker` уже запускается с `NO_HTTP=1` и `WORKERS_ENABLED=1`. При необходимости добавьте переменные `SMTP_*` и `NOTIFY_*` в секцию `environment` сервиса `worker` (и `api`, если хотите отправку из API‑контекста).

### Telegram уведомления для сотрудников (единый бот)

Если используете уведомления для сотрудников (не для клиентов), задайте:

```env
TELEGRAM_NOTIFY_BOT_TOKEN=...
TELEGRAM_NOTIFY_WEBHOOK_SECRET=...
```

### Доступ из Admin UI

- Для вызова API используется заголовок `X-Admin-Key` (см. `ADMIN_KEY`).
- Рекомендуется ограничить доступ по IP для административных эндпоинтов (переменная `ADMIN_IP_WHITELIST`, если используется `AdminIpGuard`).

### Метрики уведомлений

- `notifications_enqueued_total{type}` — поставлено задач в outbox (`broadcast`/`test`).
- `notifications_processed_total{type,result}` — обработка воркером (`sent`/`dry`/`retry`/`dead`/`throttled`).
- `notifications_channel_attempts_total{channel}` / `..._sent_total{channel}` / `..._failed_total{channel}` — попытки/успехи/ошибки по каналам.

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
# Проверка окружения перед деплоем
./scripts/preflight.sh

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
Встроенные алерты API отправляются в Telegram, если заданы переменные:

```env
ALERT_TELEGRAM_BOT_TOKEN=...
ALERT_TELEGRAM_CHAT_ID=...
ALERTS_5XX_SAMPLE_RATE=0.05
ALERT_OUTBOX_PENDING_THRESHOLD=200
ALERT_OUTBOX_DEAD_THRESHOLD=5
ALERT_WORKER_STALE_MINUTES=5
```

## 💾 Резервное копирование

### Автоматические бэкапы
```bash
# Ручной бэкап (сервис backup)
docker compose --env-file .env.production -f docker-compose.production.yml run --rm backup

# Или через скрипт
./scripts/backup.sh .env.production docker-compose.production.yml

# Либо прямой pg_dump
docker exec postgres pg_dump -U loyalty loyalty | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Верификация бэкапа
```bash
# Проверка целостности файла бэкапа
./scripts/backup-verify.sh backup_20240101.sql.gz
```

### Планировщик (cron/systemd)

Cron (пример, ежедневный бэкап в 03:00):
```bash
0 3 * * * /opt/loyalty/scripts/backup.sh /opt/loyalty/.env.production /opt/loyalty/docker-compose.production.yml >> /var/log/loyalty-backup.log 2>&1
```

Systemd (пример):
```bash
sudo cp /opt/loyalty/infra/backup/backup.service /etc/systemd/system/
sudo cp /opt/loyalty/infra/backup/backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
```

### Восстановление из бэкапа
```bash
# Остановка приложения
docker compose --env-file .env.production -f docker-compose.production.yml stop api worker

# Восстановление БД
gunzip < backup_20240101.sql.gz | docker exec -i postgres psql -U loyalty loyalty

# Или через скрипт
./scripts/restore.sh backup_20240101.sql.gz

# Запуск приложения
docker compose --env-file .env.production -f docker-compose.production.yml start api worker
```

## 🔧 Обслуживание

### Smoke-check после деплоя
```bash
# Проверка /healthz, /readyz, /live и /metrics (если задан METRICS_TOKEN)
BASE_URL=https://api.example.com METRICS_TOKEN=... ./scripts/smoke-check.sh
```

### Обновление приложения
```bash
# Pull последних изменений
git pull origin main

# Пересборка и перезапуск
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build

# Применение новых миграций
docker compose --env-file .env.production -f docker-compose.production.yml exec api pnpm prisma migrate deploy
```

### Релиз и откат (через deploy-скрипт)
```bash
# Релиз с preflight, backup, миграциями и smoke-check
./scripts/deploy.sh production deploy

# Откат на предыдущий коммит
./scripts/deploy.sh production rollback
```

### Очистка Docker
```bash
# Удаление неиспользуемых образов
docker image prune -a -f

# Очистка логов
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=0 -f

# Полная очистка (ОСТОРОЖНО!)
docker system prune -a --volumes
```

## 🆘 Troubleshooting

### Проблема: Контейнеры не запускаются
```bash
# Проверка логов
docker compose --env-file .env.production -f docker-compose.production.yml logs api

# Проверка конфигурации
docker compose --env-file .env.production -f docker-compose.production.yml config

# Перезапуск с пересборкой
docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate --build
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
- [ ] `.env.production` заполнен, секреты заменены на реальные
- [ ] Домены и DNS настроены (api/admin/portal/cashier/app)
- [ ] SSL включён через Traefik или собственные сертификаты
- [ ] `WORKERS_ENABLED=1` у сервиса `worker`
- [ ] Бэкап создан и проверен (backup сервис/pg_dump + `scripts/backup-verify.sh`)

### Production
- [ ] `API_BASE_URL`, `MINIAPP_BASE_URL`, `CORS_ORIGINS` указаны
- [ ] Проверены логины Admin и Merchant Portal
- [ ] Telegram Mini App подключена (если используется)
- [ ] Метрики/алерты настроены при необходимости (`METRICS_TOKEN`, `ALERT_*`)
- [ ] Smoke тесты пройдены (`/healthz`, admin, portal)

### Post-Production
- [ ] Проверены операции: QR → quote → commit
- [ ] Уведомления/рассылки отправляются корректно
- [ ] Документация актуальна

## 📞 Поддержка

### Логи для диагностики
```bash
# Сбор всех логов
docker compose --env-file .env.production -f docker-compose.production.yml logs > logs_$(date +%Y%m%d_%H%M%S).txt

# Логи конкретного сервиса
docker compose --env-file .env.production -f docker-compose.production.yml logs api --tail=1000

# Real-time логи
docker compose --env-file .env.production -f docker-compose.production.yml logs -f
```

## 📚 Дополнительные ресурсы

- [README](./README.md)
- [Runbooks](./RUNBOOKS.md)
- [API Documentation](./API_DOCUMENTATION.md)
- [REST API Docs](./REST-API-DOCS.md)
- [ENV Configuration (API)](./api/ENV_CONFIGURATION.md)
- [`infra/env-examples/`](./infra/env-examples)
