# Интеграции с кассовыми системами

## ModulKassa

- Quote: `POST /integrations/modulkassa/quote`
- Commit: `POST /integrations/modulkassa/commit`
- Webhook: `POST /integrations/modulkassa/webhook`

Тело quote/commit повторяет API `/loyalty/quote` и `/loyalty/commit`.
Добавьте подпись `X-Bridge-Signature` если включено в настройках мерчанта.

## Poster POS

- Quote: `POST /integrations/poster/quote`
- Commit: `POST /integrations/poster/commit`
- Webhook: `POST /integrations/poster/webhook`

## Как подключить

1. В админке создайте устройство кассы (`type: PC_POS` или `SMART`) и получите `deviceId` и `bridgeSecret`.
2. При вызове `/loyalty/quote` и `/loyalty/commit` указывайте `merchantId`, `deviceId`, `orderId`.
3. Если включена опция `requireBridgeSig`, формируйте заголовок `X-Bridge-Signature`:
   - Сигнатура = `base64( HMAC-SHA256( secret, ts + '.' + body ) )`
   - Где `ts` — UNIX-время в секундах, `body` — JSON тела запроса без пробелов.
4. Для вебхуков кассы используйте эндпоинты в разделе провайдеров.

## Метрики

- `pos_requests_total{provider,endpoint,result}`
- `pos_errors_total{provider,endpoint}`
- `pos_webhooks_total{provider}`
