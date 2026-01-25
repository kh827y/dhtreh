# Runbooks (Production)

Короткие сценарии для диагностики и восстановления. Все команды рассчитаны на запуск из корня репозитория.

## Быстрый чек (если «что-то не так»)
```bash
# Статус контейнеров
./scripts/deploy.sh production status

# Smoke-check API (health/ready/live/metrics)
BASE_URL=https://api.example.com METRICS_TOKEN=... ./scripts/smoke-check.sh

# Smoke-check интеграционного API (минимальные сценарии + пороги)
BASE_URL=https://api.example.com \
INTEGRATION_API_KEY=... \
SMOKE_USER_TOKEN=... \
SMOKE_OUTLET_ID=... \
SMOKE_ALLOW_MUTATIONS=0 \
./scripts/smoke-integrations.sh

# Логи API за последние 1000 строк
docker compose --env-file .env.production -f docker-compose.production.yml logs api --tail=1000
```

## Наблюдаемость и алерты
Что включить:
- `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` для Telegram‑алертов.
- Пороги по метрикам:
  - `ALERT_HTTP_5XX_PER_MIN` — 5xx в минуту.
  - `ALERT_HTTP_SLOW_PER_MIN` — медленные запросы в минуту.
  - `ALERT_HTTP_SLOW_THRESHOLD_MS` — порог «медленного» запроса.
  - `ALERT_OUTBOX_DEAD_DELTA` — рост `outbox_dead` за окно мониторинга.
- `ALERTS_5XX_SAMPLE_RATE` — выборочные инциденты по 5xx с контекстом.

Проверка метрик:
```bash
curl -s -H "X-Metrics-Token: $METRICS_TOKEN" https://api.example.com/metrics | rg "http_requests_total|http_slow_requests_total|loyalty_outbox_dead_total|loyalty_outbox_pending"
```

Ключевые метрики:
- `http_requests_total` и `http_request_duration_seconds`
- `http_slow_requests_total`
- `loyalty_outbox_pending`, `loyalty_outbox_dead_total`
- `external_requests_total`
- `portal_auth_login_total`, `portal_auth_refresh_total`

## Интеграционный smoke
Что нужно:
- `INTEGRATION_API_KEY` и `SMOKE_USER_TOKEN` (для `/code`).
- Контекст клиента: `SMOKE_CUSTOMER_ID` или `SMOKE_PHONE` (если не берётся из `/code`).
- Для мутирующих ручек: `SMOKE_ALLOW_MUTATIONS=1` и один из `SMOKE_OUTLET_ID`/`SMOKE_DEVICE_ID`/`SMOKE_MANAGER_ID`.

Пример:
```bash
BASE_URL=https://api.example.com \
INTEGRATION_API_KEY=... \
SMOKE_USER_TOKEN=... \
SMOKE_OUTLET_ID=... \
SMOKE_ALLOW_MUTATIONS=1 \
./scripts/smoke-integrations.sh
```
Пороги ответов можно переопределить через `SMOKE_MAX_MS_*`.

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

## Симптом: растут медленные запросы
Что смотреть:
- `http_slow_requests_total` и `http_request_duration_seconds`.
Что делать:
- проверьте медленные запросы БД (лог/метрика slow‑query), индексы и планы;
- проверьте внешние интеграции (`external_requests_total`, статус/таймауты);
- при пике нагрузки уменьшите concurrency воркеров или включите режим обслуживания.

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

## DB аудит и индексы
Что делать при замедлениях:
- Включить slow‑лог Prisma: `PRISMA_SLOW_QUERY_MS=200` в `.env.production`, перезапустить контейнер `api`.
- По логам найти медленные операции и проверить планы.

Проверка одного запроса:
```bash
docker exec postgres psql -U loyalty -c "EXPLAIN (ANALYZE, BUFFERS) SELECT 1;"
```

Применение миграций с индексами:
```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec -T api pnpm prisma migrate deploy
```
Рекомендуется выполнять вне пиковых часов.

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

## Симптом: растёт outbox dead
Что смотреть:
- `loyalty_outbox_dead_total` и алерты по `ALERT_OUTBOX_DEAD_DELTA`.
Что делать:
- проверьте коды ответов вебхуков и сертификаты/URL;
- убедитесь, что у мерчантов корректные секреты и конечные точки;
- при необходимости приостановите доставку и разберите причины, затем повторно отправьте.

## Симптом: не приходят уведомления в Telegram
```bash
# Логи уведомлений/бота
docker compose --env-file .env.production -f docker-compose.production.yml logs api --tail=200
```
Что делать:
- проверьте `TELEGRAM_NOTIFY_BOT_TOKEN` и `TELEGRAM_NOTIFY_WEBHOOK_SECRET`;
- убедитесь, что заданы `API_BASE_URL` и публичный домен (для webhook).

## Симптом: ошибки внешних интеграций (Telegram/webhooks)
Что смотреть:
- метрика `external_requests_total` с фильтрами `provider="telegram"` или `provider="merchant_webhook"`;
- рост `result="rate_limited"` и `status="429"` указывает на лимиты провайдера;
- рост `result="http_error"` или `result="error"` — проблемы сети, неверные URL/токены или сбои у провайдера.
Что делать:
- проверьте токены/URL в настройках мерчанта, доступность домена и SSL;
- при массовых 429 увеличьте интервалы или включите паузу доставки (Outbox);
- при ошибках вебхуков проверьте логи обработчиков на стороне мерчанта.

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
