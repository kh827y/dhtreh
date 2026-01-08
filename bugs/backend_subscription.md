# Аудит backend подписок

Ниже перечислены проблемы по убыванию критичности. Дубли из `FIX.md` не включались.

## P1 — High

### 1) Trial-период фактически не работает и может истекать неверно
- **Риск/эффект:** мерчант может получить доступ дольше/короче заявленного trial, либо trial вообще не закончится без ручных действий. Это критично для монетизации/контроля доступа.
- **Причины в коде:**
  - При создании подписки `trialEnd` рассчитывается, но `currentPeriodEnd` всегда ставится по интервалу плана и именно он используется в `computeState` как первичный срок окончания, из‑за чего `trialEnd` игнорируется для определения истечения подписки. В результате trial может продлиться до `currentPeriodEnd` (часто месяц), даже если `trialDays` меньше. Также возможна обратная ситуация для коротких интервалов (например, `day`).
  - Обработка истекших trial предусмотрена в `processExpiredTrials`, но расписание `@Cron` закомментировано и метод нигде не вызывается.
- **Где:** `api/src/subscription/subscription.service.ts` (создание подписки, `computeState`, `processExpiredTrials`, `calculatePeriodEnd`).

### 2) Неправильная интерпретация `immediately` приводит к немедленной отмене
- **Риск/эффект:** `DELETE /subscription/:merchantId?immediately=false` всё равно отменяет подписку сразу, так как `immediately` приходит строкой и в `if (immediately)` считается truthy.
- **Где:** `api/src/subscription/subscription.controller.ts` (`cancelSubscription`), `api/src/subscription/subscription.service.ts` (`cancelSubscription`).

## P2 — Medium

### 3) Несогласованная логика лимитов между API, проверками и cron
- **Риск/эффект:** клиент/мерчант видит в статистике и предупреждениях разные значения, возможны ложные предупреждения/блокировки или их отсутствие.
- **Проявления:**
  - `getUsageStatistics` и `validatePlanLimits` считают транзакции за последние 30 дней, а cron‑предупреждения — с начала календарного месяца.
  - В cron‑проверке лимита клиентов используется `wallet.count`, что считает кошельки, а не уникальных клиентов; при нескольких типах кошельков это завышает использование.
- **Где:** `api/src/subscription/subscription.service.ts` (`getUsageStatistics`, `validatePlanLimits`), `api/src/subscription/subscription.cron.ts` (`checkUsageLimits`).

### 4) Очистка trial‑подписок не срабатывает
- **Риск/эффект:** накопление старых данных, некорректное состояние тестовых trial.
- **Причина:** cleanup‑cron удаляет `status: 'trial'`, тогда как создание подписки выставляет `status: 'trialing'`.
- **Где:** `api/src/subscription/subscription.cron.ts` (`cleanupOldData`), `api/src/subscription/subscription.service.ts` (`createSubscription`).

## P3 — Low

### 5) Эндпоинт проверки лимитов принимает произвольный план без валидации
- **Риск/эффект:** клиент может отправить «план без лимитов» и получить `valid: true`, что делает эндпоинт недостоверным для фронта/интеграций.
- **Причина:** если в body пришёл объект с `id`, то он используется напрямую, без `ensurePlan()` и без валидации структуры/ограничений.
- **Где:** `api/src/subscription/subscription.controller.ts` (`validatePlanLimits`).
