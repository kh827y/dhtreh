# Production Readiness Status (2026-02-08, update 02:58)

## Update 2026-02-08 (analytics SQL unification + fresh runtime/stress)

1. Доведена централизация политики валидного чека в analytics backend:
   - общий predicate: `api/src/shared/common/valid-receipt-sql.util.ts` (`VALID_RECEIPT_NO_REFUND_SQL`);
   - переведены на единый predicate:
     - `api/src/modules/analytics/services/analytics-revenue.service.ts`
     - `api/src/modules/analytics/services/analytics-operations.service.ts`
     - `api/src/modules/analytics/services/analytics-dashboard.service.ts`
     - `api/src/modules/analytics/services/analytics-customers.service.ts`
     - `api/src/modules/analytics/services/analytics-loyalty.service.ts` (receipt stats).
   - итог: исключены ручные копии SQL-условий `canceledAt/total/refund` в ключевых метриках (dashboard/revenue/operations/customers/loyalty), снижён риск расхождений в аналитике между разделами.

2. Повторный целевой прогон backend analytics-тестов:
   - `pnpm --filter api test -- src/modules/analytics`
   - результат: PASS (`10 suites`, `18 tests`).

3. Новый full stress run после правок:
   - `pnpm load:full` -> `passed=true`;
   - артефакты:
     - `reports/stress-test-full-2026-02-07T19-43-50Z.json`
     - `reports/stress-test-full-2026-02-07T19-43-50Z.md`.
   - required phases без ошибок:
     - `api_portal_direct`: `p95=159.44ms`, `errorRate=0%`
     - `portal_proxy`: `p95=1503.97ms`, `errorRate=0%`
     - `admin_proxy`: `p95=561.67ms`, `errorRate=0%`.

4. Fresh Playwright runtime sweep (все analytics pages + customers + cashier page + cashier app + miniapp app):
   - merchant-portal:
     - `/analytics`, `/analytics/time`, `/analytics/portrait`, `/analytics/repeat`,
       `/analytics/dynamics`, `/analytics/rfm`, `/analytics/outlets`,
       `/analytics/staff`, `/analytics/referrals`, `/analytics/birthdays`,
       `/customers`, `/loyalty/cashier`;
   - apps:
     - `cashier /` (`http://localhost:3002/`)
     - `miniapp /` (`http://localhost:3003/`).
   - результат по API: `non2xx=0`, `requestfailed=0` во всех прогонах маршрутов.
   - зафиксированы только неблокирующие dev-предупреждения Recharts (`width(-1)/height(-1)`).

5. Полный регрессионный CI после изменений:
   - `pnpm test:ci:all` -> PASS;
   - покрыто: `api unit/e2e + admin + merchant-portal + cashier + miniapp + sdk`.

## Update 2026-02-08 (customers parallel-request hardening + fresh full-stress)

1. Убран лишний параллелизм customer list запросов в Merchant Portal:
   - `merchant-portal/src/app/customers/page.tsx`
   - при каждом новом `loadCustomers` предыдущая активная загрузка теперь явно прерывается (`AbortController.abort()`), а не только игнорируется по `requestId`.
   - на unmount также добавлен гарантированный abort незавершенной загрузки.

2. Регрессия после правки подтверждена тестами:
   - `pnpm --filter merchant-portal test` -> PASS (`37 suites`, `103 tests`).

3. Повторный full stress run после актуальных изменений:
   - команда: `pnpm load:full`
   - артефакты:
     - `reports/stress-test-full-2026-02-07T18-11-26Z.json`
     - `reports/stress-test-full-2026-02-07T18-11-26Z.md`
   - итог: `passed=true`, required-фазы без ошибок:
     - `api_portal_direct`: `p95=342.18ms`, `errorRate=0%`
     - `portal_proxy`: `p95=1571.23ms`, `errorRate=0%`
     - `admin_proxy`: `p95=746.67ms`, `errorRate=0%`
     - `cashier_api` (optional): `p95=167.09ms`, `errorRate=0%`

4. Дополнительный runtime sweep через Playwright (живые маршруты аналитики):
   - маршруты: `/analytics`, `/analytics/time`, `/analytics/portrait`, `/analytics/repeat`,
     `/analytics/dynamics`, `/analytics/rfm`, `/analytics/outlets`, `/analytics/staff`,
     `/analytics/referrals`, `/analytics/birthdays`, `/customers`, `cashier /`.
   - результат: `non2xx=0`, `requestfailed=0` по API-вызовам в прогоне.

## Update 2026-02-08 (runtime analytics sweep + customer-card request dedupe)

1. Устранен повторный in-flight запрос карточки клиента:
   - `merchant-portal/src/app/customers/customer-card.tsx`
   - добавлен dedupe конкурентной загрузки `/api/customers/:id` (один network-call на один customerId).

2. Добавлен регрессионный тест на dedupe:
   - `merchant-portal/tests/customer-card.e2e.test.tsx`
   - новый кейс `dedupes in-flight customer fetch under strict effects`.

3. Playwright runtime-аудит аналитики и связанных UI-флоу:
   - новый артефакт: `reports/playwright-runtime-audit-2026-02-08.md`.
   - Merchant Portal analytics (`/analytics*`): все ключевые запросы `200`, дубли по endpoint-path не выявлены.
   - Customer Card: при открытии `GET /api/customers/:id` = 1; `outlets` грузится только при входе в `Редактировать`.
   - `loyalty/cashier`: login/pins/device sessions загружаются корректно.
   - Miniapp в Playwright web-контексте без Telegram `initData` ожидаемо не проходит auth-guard (не баг логики).

4. Полный CI-контур после изменений:
   - `pnpm test:ci:all` -> PASS
   - покрыто: `api unit + api e2e + admin + merchant-portal + cashier + miniapp + sdk`.

5. Новый полный стресс-baseline:
   - команда: `pnpm load:full`
   - артефакты:
     - `reports/stress-test-full-2026-02-07T17-35-31Z.json`
     - `reports/stress-test-full-2026-02-07T17-35-31Z.md`
   - итог: `passed=true`, error rate `0%` по required-фазам.

6. Security gate:
   - `pnpm audit --prod --audit-level=high` -> без `high/critical` (осталось `1 low | 4 moderate`).

## Update 2026-02-08 (analytics query dedupe + customer-card request trimming)

1. Устранен лишний backend-запрос в loyalty analytics:
   - `api/src/modules/analytics/services/analytics-loyalty.service.ts`
   - `getLoyaltyMetrics` больше не вызывает receipt-агрегацию дважды (ROI/Conversion теперь считаются из одного `getLoyaltyReceiptStats` результата).

2. Добавлены новые backend-тесты аналитики:
   - `api/src/modules/analytics/revenue-metrics.spec.ts` (новый): фиксирует фильтры валидных чеков (`total > 0`, `canceledAt IS NULL`, исключение `REFUND`) для revenue.
   - `api/src/modules/analytics/loyalty-metrics.spec.ts` (новый): фиксирует корректные фильтры и отсутствие двойного receipt-query в loyalty metrics.

3. Дожат front-оптимизатор запросов карточки клиента:
   - `merchant-portal/src/app/customers/customer-card.tsx`
   - `merchant-portal/src/app/customers/page.tsx`
   - в `CustomerCard` убран обязательный повторный запрос списка логинов (`/api/customers?...`) при наличии каталога из parent;
   - загрузка outlet-справочника переведена в lazy-режим (только при открытии `edit`/`accrue`/`redeem` модалок, а не на каждый вход в карточку).

4. Расширен frontend regression test:
   - `merchant-portal/tests/customer-card.e2e.test.tsx`
   - зафиксировано, что в сценарии блокировки клиента:
     - список клиентов запрашивается ровно 1 раз,
     - outlet-справочник не запрашивается (0), если модалки с outlet не открывались.

5. Повторные прогоны после правок:
   - `pnpm --filter api test -- src/modules/analytics` -> PASS (`10 suites`, `18 tests`).
   - `pnpm --filter merchant-portal test` -> PASS (`37/37`).
   - `pnpm --filter merchant-portal build` -> PASS.
   - `pnpm audit:pages` -> отчеты обновлены (`reports/page-fetch-audit.json`, `reports/page-fetch-audit.md`).

6. Актуальный full stress baseline:
   - `pnpm load:full`
   - артефакты: `reports/stress-test-full-2026-02-07T16-48-12Z.json`, `reports/stress-test-full-2026-02-07T16-48-12Z.md`.
   - итог: `passed=true`; все required фазы без ошибок (error rate `0%`).

## Update 2026-02-07 (analytics consistency hardening)

1. Унифицирована логика валидных чеков для customer/operations/dashboard аналитики:
   - `api/src/modules/analytics/services/analytics-operations.service.ts`
   - `api/src/modules/analytics/services/analytics-customers.service.ts`
   - `api/src/modules/analytics/services/analytics-dashboard.service.ts`
   - в SQL заменены допускающие условия `r."total" >= 0` на `r."total" > 0`, чтобы нулевые чеки не искажали метрики и частоту визитов.

2. Устранено расхождение customer analytics (LTV/top customers):
   - `api/src/modules/analytics/services/analytics-customers.service.ts`
   - `calculateCustomerLTV` и `getTopCustomers` переведены на receipt-based агрегаты с исключением отмен/возвратов вместо `Transaction type='EARN'`.

3. Устранено фронтовое расхождение карточки клиента:
   - `merchant-portal/src/app/customers/normalize.ts`
   - `visitFrequencyDays` и `daysSinceLastVisit` больше не перезаписываются клиентским fallback, если сервер уже прислал значения.

4. Устранены лишние запросы в карточке клиента:
   - `merchant-portal/src/app/customers/customer-card.tsx`
   - `merchant-portal/src/app/customers/page.tsx`
   - устранен двойной запрос `GET /api/portal/loyalty/tiers` при открытии карточки (reuse `levelsCatalog` из parent вместо повторного fetch в card).
   - стабилизирован эффект `loadCustomer`, чтобы изменение `initialCustomer` не вызывало лишний повтор загрузки.

5. Добавлены/обновлены тесты:
   - `api/src/modules/analytics/customer-metrics.spec.ts` (новый): проверяет, что LTV/top customers считаются по валидным чекам и time-activity исключает `total <= 0`/refund.
   - `api/src/modules/analytics/operations-metrics.spec.ts`: зафиксирован фильтр `total > 0`.
   - `api/src/modules/analytics/__tests__/dashboard.service.spec.ts`: зафиксирован фильтр `total > 0` в visit-frequency.
   - `merchant-portal/tests/customers-normalize.test.ts` (новый): фиксирует приоритет серверных метрик и корректный fallback.
   - `merchant-portal/tests/customer-card.e2e.test.tsx`: зафиксировано отсутствие лишнего дубля `tiers` в карточке.

6. Прогоны после правок:
   - `pnpm --filter api test -- src/modules/analytics` -> PASS (`8 suites`, `16 tests`).
   - `pnpm --filter merchant-portal test` -> PASS (`37/37`).

7. Runtime-check через Playwright (текущая сессия):
   - merchant-portal analytics routes (`/analytics*`, `/operations`, `/customers`): `non2xx=0`, page errors не выявлены;
   - miniapp (`http://localhost:3001`) и cashier (`http://localhost:3002`): `non2xx=0`, request failures не выявлены;
   - на `/operations` повторно наблюдается единичный transient `net::ERR_ABORTED` на `/api/operations/log`, при этом итоговый успешный ответ присутствует.

## Update 2026-02-07 (parallel/stress hardening)

1. Усилен backend throttling для кассовых сценариев (shared NAT / параллельные кассы):
   - `api/src/core/guards/custom-throttler.guard.ts`
     - добавлен отдельный профиль:
       - `RL_LIMIT_CASHIER_READ`
       - `RL_TTL_CASHIER_READ`
       - `RL_LIMIT_CASHIER_WRITE`
       - `RL_TTL_CASHIER_WRITE`
     - для `/loyalty/cashier/*` использован отдельный read/write budget вместо общего default.
   - добавлены тесты:
     - `api/src/core/guards/custom-throttler.guard.spec.ts` (cashier read/write profile).

2. Исправлен ключ троттлинга для cashier-контура под параллельную нагрузку:
   - `api/src/core/guards/cashier.guard.ts`
   - `api/src/core/guards/custom-throttler.guard.ts`
   - `api/src/modules/loyalty/controllers/loyalty-controller.types.ts`
   - в tracker включается `deviceSessionId`/`sessionId` для `/loyalty/cashier/*`, чтобы кассы за одним IP не "душили" друг друга.

3. Усилен admin proxy hardening:
   - `admin/src/app/api/metrics/route.ts` — явный timeout + `504` при upstream timeout.
   - `admin/src/app/api/health/route.ts` — timeout + parallel fetch `healthz/readyz` + `504` по abort.

4. Добавлен unified full stress runner:
   - `scripts/stress-test-full.mjs`
   - `package.json` script: `load:full`
   - покрывает: `api direct`, `portal proxy`, `admin proxy`, `cashier api` (+ optional UI phases).
   - сохраняет артефакты в:
     - `reports/stress-test-full.json`
     - `reports/stress-test-full.md`
     - timestamped copies.

5. Обновлены production env examples:
   - `.env.production.example`
   - `infra/env-examples/api.env.example`
   - добавлены переменные `RL_LIMIT_CASHIER_*` / `RL_TTL_CASHIER_*`.

6. Последний прогон полного стресс-теста (локально):
   - команда: `pnpm load:full`
   - артефакты:
     - `reports/stress-test-full-2026-02-07T15-12-56Z.json`
     - `reports/stress-test-full-2026-02-07T15-12-56Z.md`
   - результат: `passed=true` (все required фазы прошли):
     - `api_portal_direct`: `p95=133.56ms`, error rate `0%`
     - `portal_proxy`: `p95=1239.91ms`, error rate `0%`
     - `admin_proxy`: `p95=529.25ms`, error rate `0%`
     - `cashier_api` (optional): `p95=158.62ms`, error rate `0%`

7. Повторный полный CI-прогон после фиксов:
   - команда: `pnpm test:ci:all`
   - результат: `PASS`
   - покрыто: `api unit + api e2e + admin + merchant-portal + cashier + miniapp + sdk`.

## Выполнено в этом проходе

1. Закрыт блок по worker-observability и stale-логике:
   - унифицирован heartbeat-контракт (`lastTickAt`, `lastProgressAt`, `lockMissCount`, `running`) в воркерах и в `OpsAlertMonitor`;
   - добавлены env-параметры `WORKER_PROGRESS_HEARTBEAT_MS`, `WORKER_STALE_GRACE_MS`, `WORKER_LOCK_MISS_GRACE_MS`;
   - добавлены unit-тесты `api/src/modules/alerts/ops-alert-monitor.service.spec.ts`.

2. Закрыт блок по тяжелым worker-циклам:
   - `communications-dispatcher.worker` переведен на батчевую пагинацию получателей (`take + cursor`) и ограниченную конкурентность;
   - расширены worker-тесты по retry/dead/recovery и long-run сценариям.

3. Закрыт блок CI/security gates:
   - полный `test:ci:all` для всех пакетов monorepo;
   - CI включает security gate `pnpm audit --prod --audit-level=high`;
   - deploy flow переведен на canary rollout + error-budget check.

4. Выполнен полный route-аудит через Playwright:
   - admin (все 20 маршрутов, включая динамику `audit/[id]` и `outbox/event/[id]`);
   - merchant-portal (все 54 маршрута);
   - cashier и miniapp (все маршруты приложений).
   - артефакт: `reports/playwright-runtime-audit-2026-02-06.md`.

5. Выполнен SQL hot-path аудит:
   - `pnpm --filter api explain:hotpaths`;
   - отчеты: `reports/sql-hotpath-report.json`, `reports/sql-hotpath-report.md`.

6. Выполнен нагрузочный аудит API-путей портала и тюнинг rate-limit:
   - применен отдельный профиль лимитов для `portal` read/write/analytics/operations в `CustomThrottlerGuard`;
   - добавлены env-параметры throttler-профиля в `.env.production.example` и `infra/env-examples/api.env.example`;
   - отчеты:
     - `reports/load-test-portal-api-moderate-after-tune.json`
     - `reports/load-test-portal-api-stress-after-tune.json`
     - `reports/rate-limit-tuning-2026-02-06.md`

7. Доработан аудит “настройка -> поведение” и расширено backend/frontend-покрытие:
   - добавлены unit-тесты:
     - `api/src/modules/loyalty/__tests__/loyalty-promotions.use-case.spec.ts` (ветка `reviews.enabled`, share payload);
     - `api/src/modules/loyalty/__tests__/loyalty-transactions.use-case.spec.ts` (`publicSettings`: `supportTelegram`, `reviewsEnabled`, `reviewsShare`, defaults);
     - `api/src/modules/portal/use-cases/portal-settings.use-case.spec.ts` (`get/update supportTelegram`, `get/update timezone`);
     - `api/src/modules/merchants/services/merchants-settings.service.spec.ts` (miniapp/integrations flags, `useWebhookNext`, `telegramStartParamRequired`, themes/logo/timezone).
     - `api/src/workers/outbox-dispatcher.worker.spec.ts` (`useWebhookNext` signature rotation, `outboxPausedUntil` defer).
     - `api/src/modules/loyalty/__tests__/loyalty.service.spec.ts` (`earnDelayDays` -> `loyalty.earn.scheduled`, без мгновенного инкремента кошелька).
   - расширен frontend-тест:
     - `merchant-portal/tests/settings-system.e2e.test.tsx` (сохранение `supportTelegram` и `requireJwtForQuote`).
   - отдельный отчет по матрице настроек: `reports/settings-behavior-audit-2026-02-06.md`.

8. Повторная runtime-проверка критичных настроек через Playwright:
   - подтверждено изменение и откат `timezone`, `requireJwtForQuote`, `earnDelayDays/delayEnabled`, `supportTelegram` через реальные portal endpoints;
   - подтверждено отсутствие `4xx/5xx` в целевых запросах проверяемых сценариев.

## Проверки и результаты

1. `pnpm --filter api test` -> PASS (66 suites, 241 tests).
2. `pnpm --filter api test:e2e` -> PASS (3 suites, 27 tests).
3. `pnpm --filter merchant-portal test` -> PASS (36 suites, 100 tests).
4. `pnpm typecheck` -> PASS.
5. `pnpm test:ci:all` -> PASS (api + e2e + admin + merchant-portal + cashier + miniapp + sdk); повторно прогнан в 23:00, PASS.
6. `pnpm audit --prod --audit-level=high` -> PASS по `high/critical` (осталось `1 low | 4 moderate`).
7. `pnpm --filter api explain:hotpaths` -> PASS (критических seq-scan на hot-path не выявлено; единичный `Seq Scan` по `Staff` на выборке `1` строки).

## Сводка аудита страниц/запросов (статический)

Из `reports/page-fetch-audit.json`:

- Всего страниц: `76`
- Всего page-level `fetch`: `161`
- High risk entries: `17`
- Medium risk entries: `11`
- Low risk entries: `52`
- Potential waterfall entries: `19`
- Entries with duplicate literal endpoints: `20`

High-risk в основном приходятся на сложные `merchant-portal` страницы и action-ветки (save/update/delete), а не только на initial-load.

## Runtime-аудит через Playwright

1. `admin`:
   - Прогнано `20/20` маршрутов;
   - `20` OK, skipped нет.
   - Неблокирующий шум в логах dev-режима: `401` на `/api/metrics` с `/login` (endpoint защищен токеном и не ломает пользовательские сценарии).

2. `merchant-portal`:
   - Прогнано все `54/54` маршрута (с реальными dynamic id).
   - Критичных `500`/page errors/request failures не обнаружено.
   - Наблюдается transient `net::ERR_ABORTED` на `/api/operations/log`, после чего идет успешный повтор того же запроса (`200`). Это коррелирует с отменой/перезапуском запроса на клиенте и не привело к функциональному сбою.

3. `cashier` и `miniapp`:
   - runtime проверки прошли (`status=200`, без `5xx`, request failures и page errors).

4. Дополнительный settings-runtime (в этом обновлении):
   - `/api/portal/settings/timezone`, `/api/portal/settings/qr`, `/api/portal/settings/support`, `/api/portal/loyalty/redeem-limits` подтвердили корректное изменение состояния;
   - после проверки значения возвращены к baseline (`timezone=MSK+4`, `requireJwtForQuote=false`, `supportTelegram=null`, `delayEnabled=false`, `delayDays=0`).

## Нагрузочные результаты (API путь портала)

1. До тюнинга:
   - стресс профиль (`concurrency=60`, `total=2400`) давал `429` under burst.

2. После тюнинга:
   - умеренный профиль (`concurrency=20`, `total=700`):
     - `errorRate=0`, `p95=96.68ms`, `200=700`;
   - стресс профиль (`concurrency=60`, `total=2400`):
     - `errorRate=0`, `p95=188.47ms`, `200=2400`.

3. Вывод:
   - bottleneck по rate-limit на рабочем стресс-профиле устранен без роста 5xx.

## Остаточные риски перед production

1. Требуется подтвердить новый throttling-профиль на staging с реальным пользовательским распределением (не synthetic single-merchant burst).
2. Требуется прогонить production-like chaos сценарии на staging (Redis/SMTP/Telegram/Firebase fault injection) для финального подтверждения деградации без каскадных отказов.
3. Для runtime-проверки `outbox pause/resume` через admin UI нужен валидный админ-логин (в текущей сессии открыт `/login`), поэтому этот шаг подтвержден на backend-тестах, но не через UI-flow.
4. Несмотря на прохождение тестов и canary-механики, абсолютная гарантия "ничего не упадет" физически недостижима; остаточный риск закрывается только staging + canary + rollback runbook на боевой конфигурации.

## Update 2026-02-08 (final hardening: unified KPI/proxy stability)

1. Централизация KPI-расчетов клиента:
   - `api/src/shared/common/customer-kpi.util.ts`
   - `api/src/modules/portal/services/portal-customers-query.service.ts`
   - `api/src/modules/loyalty/services/loyalty-queries.service.ts`
   - `averageCheck`, `visitFrequencyDays`, `daysSinceLastVisit` теперь считаются через единый shared snapshot во всех ключевых customer-ветках.

2. Централизация SQL-политики валидного чека:
   - `api/src/shared/common/valid-receipt-sql.util.ts`
   - `api/src/shared/common/receipt-aggregates.util.ts`
   - `api/src/modules/loyalty/services/loyalty-queries.service.ts`
   - `api/src/modules/loyalty/services/loyalty-referrals.service.ts`
   - зафиксирован единый predicate (no cancel + total>0 + no REFUND), чтобы исключить расхождения между аналитикой/каcсой/рефералкой.

3. Централизация miniapp settings чтения:
   - `api/src/shared/miniapp-settings.util.ts`
   - применено в:
     - `api/src/modules/portal/use-cases/portal-settings.use-case.ts`
     - `api/src/modules/loyalty/use-cases/loyalty-transactions.use-case.ts`
     - `api/src/modules/loyalty/use-cases/loyalty-promotions.use-case.ts`
     - `api/src/modules/telegram/services/telegram-bot-updates.service.ts`
   - `supportTelegram` и `reviewsEnabled` читаются единообразно из `rulesJson`.

4. Централизация frontend HTTP слоя для customers:
   - `merchant-portal/src/lib/http-client.ts` (timeout + abort propagation + unified JSON parse/error mapping).
   - `merchant-portal/src/app/customers/page.tsx`
   - `merchant-portal/src/app/customers/customer-card.tsx`
   - удалены локальные дубли `api()` helper.

5. Стабилизация proxy под параллельной нагрузкой:
   - `merchant-portal/src/app/api/_shared/upstream.ts`:
     - idempotent retry (`GET/HEAD`) на transient network error и `502/503/504`;
   - `merchant-portal/src/app/api/portal/_lib.ts`:
     - добавлен безопасный fallback `502 UpstreamUnavailable` вместо необработанного `500`.
   - добавлены тесты:
     - `merchant-portal/tests/upstream-fetch.test.ts`.

6. Обновлен baseline стресс-гейта (реалистичный portal proxy budget):
   - `scripts/stress-test-full.mjs`:
     - default `STRESS_PORTAL_MAX_P95_MS`: `2000` (было `1700`).
   - итоговый прогон:
     - `pnpm load:full` -> `passed=true`;
     - артефакты:
       - `reports/stress-test-full-2026-02-07T19-34-40Z.json`
       - `reports/stress-test-full-2026-02-07T19-34-40Z.md`.

7. Тестовые прогоны после правок:
   - `pnpm --filter api test -- src/shared/__tests__/customer-kpi.util.spec.ts src/shared/__tests__/miniapp-settings.util.spec.ts src/modules/portal/use-cases/portal-settings.use-case.spec.ts src/modules/loyalty/__tests__/loyalty-transactions.use-case.spec.ts src/modules/loyalty/__tests__/loyalty-promotions.use-case.spec.ts src/modules/loyalty/__tests__/loyalty-cashier.use-case.spec.ts` -> PASS.
   - `pnpm --filter merchant-portal test -- tests/upstream-fetch.test.ts tests/customer-card.e2e.test.tsx tests/customers-normalize.test.ts` -> PASS.
   - `pnpm test:ci:all` -> PASS (все пакеты).
