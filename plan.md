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

## Ближайшие шаги (Wave 1)
- [x] Идемпотентность commit/refund — e2e на коллизии `orderId`, гонки, ретраи и идемпотентность `refund`.
- [x] Инварианты транзакций — баланс/атомарность `Wallet/Transaction/Hold` под конкуренцией.
- [x] Фичефлаги/воркеры — TTL превью/сжигание и отложенные начисления: unit‑тесты и README.
- [x] Документация — README разделы «Наблюдаемость» и «Фичефлаги и воркеры», env‑примеры.

— Следующий шаг: оформить PR (conventional commits) с DoD, финальный смоук: `docker compose -f infra/docker-compose.yml up -d` → `pnpm -C api test && pnpm -C api test:e2e`; затем приступить к Wave 2 (ядро лояльности: уровни/TTL/промо).
