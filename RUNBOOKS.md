# Runbooks (Production)

Короткие сценарии для диагностики и восстановления. Все команды рассчитаны на запуск из корня репозитория.

## Быстрый чек (если «что-то не так»)
```bash
# Статус контейнеров
./scripts/deploy.sh production status

# Smoke-check API (health/ready/live/metrics)
BASE_URL=https://api.example.com METRICS_TOKEN=... ./scripts/smoke-check.sh

# Логи API за последние 1000 строк
docker compose --env-file .env.production -f docker-compose.production.yml logs api --tail=1000
```

## Симптом: API не отвечает / 5xx
```bash
# Проверить контейнеры
./scripts/deploy.sh production status

# Логи API
docker compose --env-file .env.production -f docker-compose.production.yml logs api --tail=200

# Проверить БД и Redis
docker exec postgres pg_isready
```
Что делать:
- если API падает на старте — проверьте `.env.production` и логи, затем перезапустите сервис;
- если растут 5xx — проверьте БД, Redis и внешний интеграционный эндпоинт (webhook), включите временно `MAINTENANCE_MODE=1` для снижения давления.

## Симптом: БД недоступна
```bash
# Проверка состояния PostgreSQL
docker exec postgres pg_isready

# Подключение
docker exec postgres psql -U loyalty -c "SELECT 1"

# Логи БД
docker logs postgres --tail=200
```
Что делать:
- проверьте место на диске (`df -h`), при необходимости очистите старые бэкапы/логи;
- если после падения требуется восстановление — используйте `scripts/restore.sh`.

## Симптом: Redis недоступен
```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs redis --tail=200
```
Что делать:
- Redis опционален, но без него деградируют кеши/лимиты/очереди; восстановите контейнер и проверьте `REDIS_URL`.

## Симптом: воркеры не работают / outbox растёт
```bash
# Логи воркеров
docker compose --env-file .env.production -f docker-compose.production.yml logs worker --tail=200
```
Что делать:
- убедитесь, что у `worker` стоит `WORKERS_ENABLED=1`;
- проверьте лимиты и ошибки доставки вебхуков (админка → Outbox, метрики Prometheus);
- при массовых ошибках внешних вебхуков можно временно приостановить доставку через админку (Outbox pause).

## Симптом: не приходят уведомления в Telegram
```bash
# Логи уведомлений/бота
docker compose --env-file .env.production -f docker-compose.production.yml logs api --tail=200
```
Что делать:
- проверьте `TELEGRAM_NOTIFY_BOT_TOKEN` и `TELEGRAM_NOTIFY_WEBHOOK_SECRET`;
- убедитесь, что заданы `API_BASE_URL` и публичный домен (для webhook).

## Миграции и схема
```bash
# Статус миграций
docker compose --env-file .env.production -f docker-compose.production.yml exec api pnpm prisma migrate status

# Применить миграции
docker compose --env-file .env.production -f docker-compose.production.yml exec api pnpm prisma migrate deploy
```

## Бэкапы
```bash
# Создать бэкап
./scripts/backup.sh .env.production docker-compose.production.yml

# Проверить файл
./scripts/backup-verify.sh backup_20240101.sql.gz

# Восстановить
./scripts/restore.sh backup_20240101.sql.gz
```

## Режим обслуживания
```bash
# Включить maintenance (блокировка запросов, кроме health/metrics)
MAINTENANCE_MODE=1

# Включить read-only (разрешены только GET/HEAD/OPTIONS)
READ_ONLY_MODE=1
```
После изменения переменных — перезапустите контейнеры:
```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

## Релиз и откат
```bash
# Релиз (preflight + backup + миграции + smoke-check)
./scripts/deploy.sh production deploy

# Откат
./scripts/deploy.sh production rollback
```
