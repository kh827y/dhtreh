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

1. В админке откройте нужную торговую точку и задайте POS-тип (`PUT /merchants/{id}/outlets/{outletId}/pos`, поле `posType` = `PC_POS` или `SMART`).
2. Выдайте `bridgeSecret` для точки: `POST /merchants/{id}/outlets/{outletId}/bridge-secret` (для ротации используйте `/bridge-secret/next`).
3. При вызове `/loyalty/quote` и `/loyalty/commit` передавайте `merchantId`, `outletId`, `orderId` — идентификатор торговой точки обязателен для трекинга POS и бридж-секретов.
3. Если включена опция `requireBridgeSig`, формируйте заголовок `X-Bridge-Signature`:
   - Сигнатура = `base64( HMAC-SHA256( secret, ts + '.' + body ) )`
   - Где `ts` — UNIX-время в секундах, `body` — JSON тела запроса без пробелов.
4. Для вебхуков кассы используйте эндпоинты в разделе провайдеров.

## Журнал синхронизаций (SyncLog)

Каждый входящий вебхук и значимые исходящие вызовы фиксируются в таблице `SyncLog`:

- Поля: `merchantId`, `integrationId`, `provider`, `direction` (IN|OUT), `endpoint`, `status` (ok|error), `request`, `response`, `error`, `retryCount`, `nextRetryAt`.
- Можно использовать для отладки и построения отчётов по синхронизациям.

## Валидация конфигурации интеграций

При регистрации интеграций конфигурация валидируется через AJV‑схемы (`config.schema.ts`). При несоответствии схема вернёт подробные ошибки.

## Подпись вебхуков

Если у провайдера предусмотрена подпись вебхуков, проверка выполняется на уровне сервиса интеграции (пример — Evotor: HMAC по secret). В ответах API лояльности исходящие вебхуки подписываются заголовками `X-Loyalty-Signature`, `X-Signature-Timestamp`, `X-Signature-Key-Id`.

## Метрики

- `pos_requests_total{provider,endpoint,result}`
- `pos_errors_total{provider,endpoint}`
- `pos_webhooks_total{provider}`

## Единые интерфейсы адаптеров

Для унификации интеграций предусмотрены интерфейсы в `api/src/integrations/types.ts`:

- `PosAdapter` — quote/commit/webhook/health.
- `ERPAdapter` — syncProducts/syncInventory/syncCustomers/webhook/health.
- `ShipperAdapter` — create/cancel/track/webhook/health.

Новые провайдеры должны реализовать соответствующий интерфейс и регистрироваться в `IntegrationsModule`.
