# POS Bridge (MVP)

Локальный сервис для интеграции с кассовым ПО. Слушает 127.0.0.1 и проксирует операции в API лояльности, добавляя идемпотентность и оффлайн‑очередь.

## Возможности
- POST /quote — расчёт скидки/начисления (QUOTE)
- POST /commit — фиксация операции (COMMIT) с заголовком Idempotency-Key
- POST /queue/flush — принудительная отправка очереди
- Фоновая попытка догона очереди
- Локальная подпись X-Bridge-Signature (ts + '.' + body) HMAC-SHA256

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
- OUTLET_ID / DEVICE_ID: дефолтная атрибуция
- STAFF_KEY: ключ кассира (проксируется как X-Staff-Key)
- BRIDGE_SECRET: секрет для подписи X-Bridge-Signature
- FLUSH_INTERVAL_MS: период фона догона очереди (по умолчанию 5000)

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

