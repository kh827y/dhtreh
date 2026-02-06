# Production Readiness Status (2026-02-06, update 19:58)

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

7. Доработан аудит “настройка -> поведение” и расширено backend-покрытие:
   - добавлены unit-тесты:
     - `api/src/modules/loyalty/__tests__/loyalty-promotions.use-case.spec.ts` (ветка `reviews.enabled`, share payload);
     - `api/src/modules/loyalty/__tests__/loyalty-transactions.use-case.spec.ts` (`publicSettings`: `supportTelegram`, `reviewsEnabled`, `reviewsShare`, defaults);
     - `api/src/modules/portal/use-cases/portal-settings.use-case.spec.ts` (`get/update supportTelegram`);
     - `api/src/modules/merchants/services/merchants-settings.service.spec.ts` (miniapp/integrations flags, `useWebhookNext`, `telegramStartParamRequired`, themes/logo/timezone).
   - отдельный отчет по матрице настроек: `reports/settings-behavior-audit-2026-02-06.md`.

## Проверки и результаты

1. `pnpm --filter api test` -> PASS (66 suites, 236 tests).
2. `pnpm --filter api test:e2e` -> PASS (3 suites, 27 tests).
3. `pnpm --filter merchant-portal test` -> PASS (36 suites, 99 tests).
4. `pnpm typecheck` -> PASS.
5. `pnpm test:ci:all` -> PASS (api + e2e + admin + merchant-portal + cashier + miniapp + sdk); повторно прогнан в 19:56, PASS.
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
3. Несмотря на прохождение тестов и canary-механики, абсолютная гарантия "ничего не упадет" физически недостижима; остаточный риск закрывается только staging + canary + rollback runbook на боевой конфигурации.
