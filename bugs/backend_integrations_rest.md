# Аудит REST-интеграций (backend_integrations_rest)

Ниже перечислены проблемы, обнаруженные при проверке REST-интеграций и их связки с POS. Сортировка — по убыванию критичности.

## P1 — High

### 1) `requireBridgeSignature` фактически не принуждает подпись
**Риск:** интеграции, которые рассчитывают на обязательную подпись POS/бриджа, фактически принимают запросы без подписи. Это снижает уровень защиты и позволяет выполнять чувствительные операции при наличии только API‑ключа.

**Причина:** `verifyBridgeSignatureIfRequired()` возвращает управление, если заголовок `X-Bridge-Signature` отсутствует. Даже при включённом `requireBridgeSignature` запрос не блокируется. Аналогичная проблема усиливается тем, что для `refund` можно передать `outlet_id` без проверки существования торговой точки — тогда секрет для подписи не находится и проверка фактически пропускается.

**Где:**
- `api/src/integrations/integrations-loyalty.controller.ts` → `verifyBridgeSignatureIfRequired()` и использование в `code/calculate/bonus/bonus/refund`.

**Что сделать (без overengineering):**
- Если `requireBridgeSignature=true` (в настройках мерчанта или интеграции) — требовать присутствие `X-Bridge-Signature`, иначе возвращать `401`.
- В `refund` валидировать `outlet_id` так же, как в `bonus/calculate/bonus`, чтобы не было обхода per‑outlet секрета.

## P2 — Medium

### 2) Балансы до/после операции в `GET /api/integrations/operations` могут быть неверными
**Риск:** POS или аналитика интегратора получают некорректные `balance_before/balance_after`, если в истории есть отменённые транзакции. Это ломает сверку с кассой и ведёт к неверным отчётам.

**Причина:** при расчёте баланса используется полный список транзакций без фильтра `canceledAt: null`. Отменённые транзакции учитываются в реконструкции баланса, хотя в фактическом балансе они уже не участвуют.

**Где:**
- `api/src/integrations/integrations-loyalty.controller.ts` → блок выборки `transaction.findMany` в `operations()`.

**Что сделать:**
- Добавить фильтрацию `canceledAt: null` при построении истории транзакций для вычисления `balance_before/balance_after`.

### 3) Нет аудита (sync log) для самых критичных write-операций
**Риск:** операции списания/начисления и возврата не логируются в `syncLog`, что усложняет разбор инцидентов, реконсиляцию с POS и расследование спорных случаев.

**Причина:** `logIntegrationSync()` вызывается для `code`, `calculate/*`, `outlets/devices/operations`, но **не вызывается** для `POST /api/integrations/bonus` и `POST /api/integrations/refund`.

**Где:**
- `api/src/integrations/integrations-loyalty.controller.ts` → методы `bonus()` и `refund()`.

**Что сделать:**
- Добавить запись в `syncLog` (хотя бы с `status`, `endpoint`, `idempotency_key`/`order_id`, `outlet_id`), чтобы операции были полностью трассируемы.
