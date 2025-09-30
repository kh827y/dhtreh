# POS Bridge (MVP)

Локальный сервис для интеграции с кассовым ПО. Слушает 127.0.0.1 и проксирует операции в API лояльности, добавляя идемпотентность и оффлайн‑очередь.

## Возможности
- POST /quote — расчёт скидки/начисления (QUOTE)
- POST /commit — фиксация операции (COMMIT) с заголовком Idempotency-Key
- POST /queue/flush — принудительная отправка очереди
- Фоновая попытка догона очереди
- Локальная подпись X-Bridge-Signature (ts + '.' + body) HMAC-SHA256

## Заголовки и безопасность
- X-Request-Id — уникальный ID запроса (генерируется мостом)
- Idempotency-Key — для /commit и /refund (генерируется мостом, можно передать вручную)
- X-Staff-Key — проксируется из переменной окружения `STAFF_KEY` (если задана)
- X-Bridge-Signature — подпись тела запроса. Формат заголовка:

```
X-Bridge-Signature: v1,ts=<unix_seconds>,sig=<base64(HMAC_SHA256(ts + '.' + body))>
```

Рекомендуемая верификация на стороне API:
1) распарсить `ts` и `sig`, проверить окно времени (например, ±5 минут);
2) вычислить `base64(HMAC_SHA256(ts + '.' + body, BRIDGE_SECRET))` и сравнить с `sig` из заголовка.

## Установка и запуск
```
cd bridge
pnpm i   # или npm i / yarn
env BRIDGE_PORT=18080 API_BASE=http://localhost:3000 pnpm start
```

## Конфиг (env)
- BRIDGE_PORT: порт (по умолчанию 18080)
- API_BASE: базовый URL API (по умолчанию http://localhost:3000)
- MERCHANT_ID: дефолтный мерчант, если не приходит в запросе
- OUTLET_ID: дефолтная атрибуция точки
- STAFF_KEY: ключ кассира (проксируется как X-Staff-Key)
- BRIDGE_SECRET: секрет для подписи X-Bridge-Signature
- FLUSH_INTERVAL_MS: период фона догона очереди (по умолчанию 5000)
- BRIDGE_QUEUE_BACKEND: json | sqlite (по умолчанию json)
- BRIDGE_DB_PATH: путь к базе для sqlite (по умолчанию ./data/bridge.db)

## Примеры запросов
- QUOTE
```
POST http://127.0.0.1:18080/quote
{
  "mode": "redeem",
  "merchantId": "M-1",
  "orderId": "O-123",
  "total": 1000,
  "eligibleTotal": 1000,
  "userToken": "<jwt или customerId>"
}
```
Ответ: passthrough из API (discountToApply/pointsToEarn/holdId,...)

- COMMIT
```
POST http://127.0.0.1:18080/commit
{
  "merchantId": "M-1",
  "holdId": "...",
  "orderId": "O-123",
  "receiptNumber": "000001"
}
```
Если сети нет — заявка кладётся в очередь и уходит позже.

## Очередь
Файл `data/queue.json` (создаётся автоматически). Можно принудительно отправить: `POST /queue/flush`.

Backend очереди:
- JSON (по умолчанию) — файл `./data/queue.json`;
- SQLite — установить `better-sqlite3`, задать `BRIDGE_QUEUE_BACKEND=sqlite`, опционально `BRIDGE_DB_PATH`.

## Эндпоинты
- GET /health — liveness
- GET /ready — readiness
- GET /config — безопасный просмотр конфигурации (без секретов)
- GET /metrics — метрики в формате Prometheus:
  - `bridge_queue_pending` — текущая длина очереди
  - `bridge_queue_enqueued_total` — всего поставлено в очередь
  - `bridge_queue_flushed_total` — всего успешно отправлено из очереди
  - `bridge_queue_fail_total` — ошибок при отправке из очереди

