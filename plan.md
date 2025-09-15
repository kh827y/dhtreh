# Planning Mode — Long Run (2025-09-15)

Обновлённый рабочий план доведения проекта лояльности до стабильного и надёжного состояния с современным UI. План синхронизирован с Memories (dev/test ритуал, бэкенд гарантий, Prisma‑правила, фичефлаги/воркеры, интеграции/bridge, фронтенды, DoD).

## Волны работ

- Волна 0 — Префлайт (завершена)
  - Пересмотр плана.
  - Строгий TS/ESLint/Prettier, базовый `tsconfig.base.json`. Скрипты: `typecheck`, `lint`, `lint:fix`, `test`.
  - Глобальная защита API: Helmet, CORS из `CORS_ORIGINS`, Nest Throttler/Redis, JSON‑логирование (pino). Валидация ENV (fail‑fast).
  - Прогон тестов: `pnpm -C api test && pnpm -C api test:e2e`.

- Волна 1 — Устойчивость и надёжность бэкенда
  - Идемпотентность commit/refund через `Idempotency-Key`, ретраи безопасны.
  - Транзакционные границы в денежных сценариях; инварианты Wallet/Transaction/Hold покрыты тестами.
  - Фичефлаги: `EARN_LOTS_FEATURE`, `POINTS_TTL_FEATURE`, `POINTS_TTL_BURN`, переключатель `WORKERS_ENABLED` — тесты сценариев TTL/отложенных начислений.
  - Алерты на 5xx/аномалии; базовые метрики latency/RPS/errors.

- Волна 2 — Функции лояльности (ядро)
  - Уровни (CustomerLevel): правила перехода и выгоды.
  - TTL/сгорание баллов: безопасный расчёт; тесты.
  - Промокоды/ваучеры: выпуск/активация/ограничения; анти‑фрод капы.
  - Рефералка многоуровневая; защита от саморефералки/дубликатов.
  - Акции: buy‑N‑get‑1, спеццены, бонусные коэффициенты.
  - Подарки за баллы и «Подарок на ДР».

- Волна 3 — Коммуникации и CRM/аналитика
  - Email/push через адаптеры, сегментация; outbox + ретраи.
  - Отчёты LTV/ретеншен/ARPU, сегменты и выгрузки.

- Волна 4 — Интеграции и Bridge
  - Единый интерфейс адаптеров: POS/Payments/ERP/Shipper; dry‑run, валидация конфигов, подписанные webhooks.
  - Минимальные коннекторы (iiko/r_keeper/frontol/Evotor/1C/CommerceML/robokassa/ecommpay/DPD и др.) с записями `Integration`.
  - Встроить в Bridge; подпись `BRIDGE_SECRET`.

- Волна 5 — Фронтенды (admin/cashier/miniapp)
  - Современный UI: единая дизайн‑система, i18n, доступность, skeletons/загрузки.
  - Admin: кампании/акции, сегменты, отчёты, Docs (Signature/Bridge/Integrations), системная «Metrics».
  - Cashier: QR → quote → commit, возвраты, безопасные повторы.
  - Miniapp: баланс/история/QR, промо/подарки/ДР, уведомления.

## Definition of Done (общие)
- Строгий TS, валидируемые ENV; глобальные фильтры ошибок и логирование; Helmet/CORS/rate‑limit включены.
- Все тесты зелёные: `pnpm -C api test && pnpm -C api test:e2e`.
- Миграции Prisma — атомарны; без потерь денежных данных; тесты на миграции и инварианты.
- Современный UI и понятные UX‑флоу на фронтендах.
- Документация обновлена: README/DEPLOYMENT_GUIDE/API_DOCUMENTATION; краткий итог в `plan.md`.

## Риски и блокеры
- Отсутствующая dev‑БД → поднять Docker Compose.
- Долгие агрегации аналитики → кеш Redis + индексы.
- Интеграции с внешними API → мок/фичефлаги, dry‑run.

## Выполнено недавно
- Модернизация admin analytics: единый `TopBar`/`Card`/`Skeleton`, улучшенные графики (`SimpleLineChart` с tooltip/hover/линейкой).
- Аналитика backend: заменены сырые SQL ($queryRaw) на Prisma в `getTopCustomers/getTopOutlets/getTopStaff/getDeviceUsage`.
- Включён строгий TS на уровне монорепо: обновлён `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`).
- Настроены ESLint/Prettier во всех пакетах (`api`, `admin`, `cashier`, `miniapp`, `bridge`); добавлены корневые `.prettierrc`, `.prettierignore`, `.eslintignore`, `.editorconfig`.
- Корневой `package.json`: добавлены скрипты `format`/`format:check` и унифицированные `typecheck/lint`.
- API hardening: подтверждены Helmet/CORS/Throttler/Pino; добавлена schema‑валидация ENV через Ajv (fail‑fast в `api/src/main.ts`).
- Поднята dev‑БД (`docker compose -f infra/docker-compose.yml up -d`), применены миграции (`prisma migrate deploy`).
- Тестовый ритуал выполнен: `pnpm -C api test && pnpm -C api test:e2e` — зелёные.

- 5xx алерты: `AlertsService` интегрирован в `HttpMetricsInterceptor`, сэмплинг по `ALERTS_5XX_SAMPLE_RATE`; добавлены переменные для Telegram в `api/.env.example`.
- Идемпотентность commit: `merchantId` выводится из `hold`, кэшируемый ответ нормализован (устранён дрейф `alreadyCommitted`), повторные вызовы стабильно детерминированы.
- Антифрод: `dailyCap` переведён на скользящее 24‑часовое окно, чтобы избежать TZ/полуночных артефактов.
- E2E: добавлен тест идемпотентности `refund` (повтор по одному `Idempotency-Key`).
- Wave 1: углублённые e2e по идемпотентности и инвариантам — коллизии `orderId`, конкурентные `commit`, многошаговые частичные `refund` для `EARN/REDEEM`, идемпотентность `refund`.
- Воркеры/флаги: добавлены unit‑тесты `PointsTtlWorker`, `PointsBurnWorker`, `EarnActivationWorker`; документированы фичефлаги и интервалы, примеры `.env` обновлены (локальный/infra).
- Тестовая инфраструктура: устранены «залипающие» open handles в Jest. Во всех воркерах таймеры `unref()`, таймауты очищаются; Prometheus default timers выключены в тестах (`METRICS_DEFAULTS=0`), e2e запускаются `--runInBand --detectOpenHandles`.
- Интеграции: Evotor — AJV‑валидация конфигурации, журнал `SyncLog` (IN ok/error), контроллер инкрементирует `pos_webhooks_total`. ModulKassa/Poster — `POST /register` с OAuthGuard, валидация и upsert `Integration`, вебхуки пишут `SyncLog`, стандартизированы лейблы метрик; добавлены e2e тесты (включая проверку `pos_webhooks_total`).

## Волна 1 — Завершена (2025-09-15)
- Идемпотентность денежных операций: `commit/refund` с `Idempotency-Key`, эмулированы повторы/гонки; стабильные e2e на коллизии `orderId` и повторные вызовы.
- Транзакционные инварианты: активное использование Prisma‑транзакций; тесты на баланс и атомарность `Wallet/Transaction/Hold` под конкуренцией — зелёные.
- Безопасность по умолчанию: Helmet, CORS из `CORS_ORIGINS`, rate‑limit (порог по умолчанию), централизованные фильтры ошибок и структурные логи.
- Воркеры/фичефлаги: `WORKERS_ENABLED`, TTL‑воркеры и earn‑активации — покрыты unit‑тестами; таймеры размечены `unref()` для чистоты тестов.
- Наблюдаемость: ключевые метрики (RPS/latency/errors, outbox) экспортируются на `/metrics`; алерты 5xx интегрированы; дефолтные пром‑метрики отключаются в тестах.
- ENV‑валидация: Ajv‑schema для API, fail‑fast при некорректных значениях; примеры `.env` обновлены.

— Следующий шаг: оформить PR (conventional commits) с DoD, финальный смоук: `docker compose -f infra/docker-compose.yml up -d` → `pnpm -C api test && pnpm -C api test:e2e`; затем приступить к Wave 2 (ядро лояльности: уровни/TTL/промо).

## Волна 2 — Прогресс (2025-09-15)

- Выполнено:
  - Подключён `PromosModule` (prev. этап) и добавлены превью‑правила (категория, minEligible), e2e `promos.e2e-spec.ts` — зелёные.
  - Реализованы `Vouchers`: `preview`, `issue`, `redeem` в `api/src/vouchers/*`. В `redeem` — идемпотентность по `(voucherId, customerId, orderId)` и проверка лимитов/валидности.
  - Интеграция в денежный флоу: `loyalty.controller.quote()` сначала уменьшает `eligibleTotal` ваучером → промо, затем считает. В `commit()` при наличии `voucherCode` выполняется идемпотентный `redeem` по `orderId`.
  - Добавлены e2e в `api/test/loyalty.e2e-spec.ts`: применение ваучера в quote и идемпотентность `commit` с ваучером.
  - Дополнительные e2e: комбо ваучер+промо (REDEEM) влияет на лимит, проверка `redeemApplied` на `commit`, `redeem` идемпотентен при достижении `maxUses`, `issue` создаёт код и работает в `preview`.
  - Prisma: добавлен уникальный индекс `@@unique([voucherId, customerId, orderId])` для `VoucherUsage` (идемпотентность на уровне БД, миграция будет сгенерирована).
  - SDK TS: добавлены `vouchers.preview/issue/redeem/status/deactivate` и поддержка `voucherCode` в `quote/commit`.
  - README дополнен разделом «Vouchers» (эндпоинты, порядок применения скидок).
  - Все тесты зелёные: `pnpm -C api test && pnpm -C api test:e2e`.
  - Admin UI: добавлен раздел «Ваучеры» — список/поиск/выпуск/деактивация/экспорт (admin/app/vouchers), клиентские методы (admin/lib/vouchers.ts).
  - API: админские эндпоинты для ваучеров: `GET /vouchers/list`, `GET /vouchers/export.csv` (защищены AdminGuard/AdminIpGuard).

- Следующий шаг (Wave 2):
  - Завершить управление ваучерами: отчётность и фильтры/пагинация; документация admin‑раздела.
  - Документация промо/ваучеров: совместимость, приоритеты, идемпотентность, примеры.
  - PR с DoD и чек‑листом; затем план Wave 3 (CRM/аналитика) уточнить.

## Волна 3 — Завершена (2025-09-15)

- Выполнено:
  - Заготовка уведомлений: `NotificationsService.broadcast/test` — постановка задач в Outbox (`eventType=notify.*`), метрика `notifications_enqueued_total`.
  - Подключён `NotificationsModule` в `AppModule` (используем существующие Email/Push/SMS контроллеры для дальнейшей интеграции).
  - Admin UI: добавлена страница `admin/app/notifications` с формой рассылки (канал, сегмент, шаблон), поддержкой `dry-run`, выводом оценки получателей, выпадающим списком сегментов (`getSegmentsAdmin`).
  - Worker: создан `NotificationDispatcherWorker` (обработка `notify.broadcast`/`notify.test`), исключены `notify.*` из `OutboxDispatcherWorker`. Метрики `notifications_processed_total` и liveness.
  - Worker: добавлены per‑channel метрики (`notifications_channel_attempts_total/sent_total/failed_total` с label `channel`) и запись аудита в `AdminAudit` для событий broadcast.
  - Worker: внедрён per‑merchant RPS‑троттлинг (`NOTIFY_RPS_DEFAULT`, `NOTIFY_RPS_BY_MERCHANT`), события при ограничении переносятся на +1s; покрыто unit‑тестом `notification-dispatcher.worker.spec.ts`.
  - README и `infra/env-examples/api.env.example`: добавлены раздел и переменные для SMTP/SMS/FCM и настроек воркера уведомлений.
  - Dry-run: `NotificationsService.broadcast()` возвращает `estimated` по сегменту или каналам (email/sms/push) на основе Prisma счётчиков и consent’ов.
  - Admin UI: i18n (RU/EN), a11y‑лейблы, skeleton‑лоадеры для сегментов; предпросмотр шаблонов с `{{var}}`.
  - Метрики: пер‑канальные метрики дополнены лейблом `merchantId` для разреза по мерчанту.
  - Тесты: добавлены unit‑тесты воркера на троттлинг и ветви ошибок/ретраев (`notification-dispatcher.worker.spec.ts`, `notification-dispatcher.errors.spec.ts`).

- Итог: функционал рассылок завершён — воркер уведомлений с метриками/аудитом, dry‑run и сегментами; Admin UI с предпросмотром/валидацией; документация и env‑пример обновлены; покрыто unit/e2e тестами; все тесты зелёные.

## Волна 4 — Старт (2025-09-15)

- Задачи:
  - Адаптеры интеграций: унифицировать интерфейсы (`POSAdapter`/`PaymentProvider`/`ERPAdapter`/`Shipper`), описать контракты.
  - Валидация конфигов интеграций (AJV): схемы для Evotor/ModulKassa/Poster, ошибки — fail‑fast.
  - Подписанные вебхуки провайдеров: проверка подписи, окно времени; логирование входа/выхода, ретраи.
  - Журнал `SyncLog`: IN/OUT события, статус/ошибка, payload, план ретраев.
  - Bridge: обновить README/пример `.env`, описать подпись `BRIDGE_SECRET`, офлайн‑очередь.
  - Тесты: unit для валидаторов/подписей, e2e флоу интеграций (моки провайдеров), метрики `pos_*`.

## Волна 4 — Прогресс (2025-09-15)

- Выполнено:
  - Evotor: валидация конфигов (AJV), `SyncLog` входящих вебхуков, метрики `pos_webhooks_total` и `pos_requests_total`/`pos_errors_total` в контроллере.
  - ModulKassa/Poster: реализованы `POST /register` (OAuthGuard) с валидацией и upsert `Integration`; вебхуки пишут `SyncLog`; стандартизированы лейблы провайдера в метриках; e2e на вебхуки и метрики.
  - E2E инфраструктура стабилизирована без open handles.
  - Централизация POS‑метрик: `pos_requests_total`/`pos_errors_total`/`pos_webhooks_total` перенесены в prom‑client (`MetricsService`), роутинг через `inc()` без дублей.
  - Негативные e2e: Evotor — неверная подпись вебхука → `SyncLog.status=error` и метрики; ModulKassa/Poster — `POST /register` с некорректным конфигом → 400 и `pos_requests_total{result="error"}`.
  - DRY: общий helper `upsertIntegration()` для регистрации интеграций, используется в ModulKassa/Poster.
  - Bridge: README дополнен (формат `X-Bridge-Signature`, заголовки, офлайн‑очередь/бэкенды, метрики/эндпоинты); `infra/env-examples/bridge.env.example` обновлён (переменные очереди).

- Следующие шаги:
  - Расширить общий helper для ERP/Shipper и перевести оставшиеся адаптеры.
  - Добавить Admin‑виджеты по POS‑метрикам (`pos_*`) и краткий раздел API Docs о верификации `X-Bridge-Signature` в `loyalty.controller`.
  - Покрыть негативные сценарии вебхуков прочих провайдеров (assert `pos_errors_total`, `SyncLog.status=error`).
