# Planning Mode — Long Run (2025-09-15)  
## Новая структура панелей (договорились)

- Админ‑панель (Owner Admin):
  - Мерчанты: список/создание/редактирование/удаление. При создании ОБЯЗАТЕЛЬНО ownerName; автоматически создаётся сотрудник‑владелец.
  - Настройки мерчанта (перенос): QR TTL, Требовать подпись Bridge, Требовать Staff‑ключ; логин кассира (slug) и пароль из 9 цифр (регенерация).
  - Интеграции и POS‑настройки, Telegram‑бот (токен), наблюдаемость (Metrics/Outbox/SyncLog).

- Мерчант‑панель (Merchant Portal):
  - Сотрудники: табы Работает/Уволен, фильтры (Роли/Точки/«Только с доступом в панель»), поиск, карточка сотрудника (доступы/связанные точки/пин‑коды/уволить/сменить пароль и т.п.).
  - Торговые точки (вместо устройств): список/создание/редактирование.
  - Программа лояльности: Механики, Акции, Промокоды (взамен Ваучеров), Push/Telegram‑рассылки, Мотивация персонала, Антифрод, Панель кассира (логин/пароль, таблица пинкодов сотрудников по точкам).
  - Клиенты и аудитории; Товары и категории; Отзывы; Аналитика (Сводный, По времени, Портрет, Повторы, Динамика, RFM, Активность точек/сотрудников, Рефералы, ДР, Автовозврат).

— Устройства: депрекация. UI/роуты удаляем, опираемся на Торговые точки.

## Батчи внедрения (план)

1) Бэкенд — мерчанты/владелец/CRUD (минимальная версия, обратная совместимость)
- Добавить в админ‑API: PUT/DELETE мерчанта; POST /merchants принимать ownerName и авто‑создавать сотрудника‑владельца (роль MERCHANT). До миграции — без новых полей, только `login`.
- Перенос настроек в админку: использовать существующие поля `MerchantSettings` (qrTtlSec, requireBridgeSig, requireStaffKey); портальную страницу настроек позже очистить.
- Прогнать тесты, починить до зелёного.

2) Prisma‑миграции (расширение моделей)
- Staff: firstName/lastName/position/phone/comment/avatarUrl, pinCode(4), canAccessPortal(bool), isOwner(bool).
- Merchant: cashierLogin(unique), cashierPassword9, archivedAt.
- AccessGroup/AccessGroupMember; StaffOutletAccess (staff↔outlet + pinCode, lastTxnAt).
- Методы Admin/Portal для управления пинкодами и доступами.

3) Портал/Админ — фронтенд
- Удалить «Устройства», усилить «Торговые точки».
- Перенести UI настроек (QR TTL/BridgeSig/StaffKey) в админку; в портале убрать эти поля.
- ✅ Реализованы «Сотрудники» по ТЗ: табы «Работает»/«Уволен», фильтры (роли/точки/только с доступом), поиск, новая таблица с аватарами/иконкой владельца, карточка сотрудника (доступы, связанные точки, PIN‑коды, увольнение, смена пароля, просмотр транзакций), модалки создания/редактирования.
- ✅ Добавлен клиентский UI управления группами доступа (таблица RUD, модалка CRUD‑прав, локальное хранение и интеграция с формами сотрудников).
- ✅ Панель кассира: отображение логина и 9‑значного пароля, генерация и копирование, обязательный персональный PIN каждого сотрудника, обновлённый виртуальный терминал с двухшаговой авторизацией (slug+пароль → PIN) и выдачей staff key.
- ✅ Сделаны промокоды на баллы: новая страница с табами «Активные/Архивные», строкой «Показаны записи …», таблицей с колонками «Промокод/Описание/Баллы/Группа/Срок/Использован» и иконками RUD (в архиве — «Вернуть»), полнофункциональной модалкой создания/редактирования (период действия, начисление баллов, сгорание, уровень, лимиты, периодичность, визиты) и поддержкой восстановления промокода.
- ✅ Раздел «Акции»: tabs «Предстоящие/Активные/Прошедшие», карточки c участниками, мини‑графиками выручки, режимом «Акция не запущена», расширенная модалка создания (период, аудитория, выдача баллов, сгорание, PUSH‑уведомления, автозапуск).
- ✅ Раздел «Аудитории клиентов»: поиск, таблица всех метрик, модалка создания/редактирования с чекбоксами, мультиселектами, диапазонами, уровнями RFM, просмотр состава аудитории.

4) Аналитика/Аудитории/Отзывы/Рассылки — расширение
- Добрать разделы аналитики по ТЗ, аудитории (CRUD/состав), отзывы (миниаппа + портал), Telegram‑уведомления.

5) Интеграции — паритет по GMB API и каталог API
- Сверка функционала с: gmb_api.pdf, gmb_catalog_api.pdf; доработать API.
- Интеграции по pdf (1C/r_keeper/iiko/Poster/Frontol/МойСклад/CommerceML): адаптеры/валидаторы/вебхуки.

Каждый батч → тестовый ритуал: `pnpm -C api test && pnpm -C api test:e2e`. Обновлять README/Docs и этот план.

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

- Волна 5 — Фронтенды (Owner Admin / Merchant Portal / Cashier / Miniapp)
  - Современный UI: единая дизайн‑система, i18n, доступность, skeletons/загрузки.
  - Owner Admin (админ‑консоль): глобальные настройки и наблюдаемость системы (страница Metrics, воркеры, Outbox/вебхуки, POS‑метрики, интеграции), управление мерчантами и ролями; режим «Просмотр как мерчант» с правом редактирования.
  - Merchant Portal (личный кабинет бизнеса): аналитика и CRM, механики/акции, аудитории, промокоды, отзывы; настройки перенесены в админку.
  - Cashier: QR → quote → commit, возвраты, безопасные повторы. Авторизация кассира: login = slug от имени мерчанта, пароль = 9 цифр; у сотрудников — пинкод 4 цифры (по точкам).
  - Miniapp (Telegram): баланс/история/QR, промо/подарки/ДР, уведомления; рефералка через deep‑link t.me/<bot>?start=ref_<code> и активацию при первом визите мини‑аппы.

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
- Инициализирован `merchant-portal` (Next.js) — базовый дашборд, подключение дизайн‑системы.
- Создан пакет `@loyalty/ui` (токены темы, базовые компоненты: Button/Card/Skeleton/Chart; иконки Lucide; анимации Framer Motion). Обновлён `pnpm-workspace.yaml`.
- Merchant Portal: реализована аутентификация по email+паролю (+ TOTP опц.), добавлена страница `/login`, middleware защиты, server routes `/api/session/*`.
- API: модуль `PortalAuth` (`POST /portal/auth/login`, `GET /portal/auth/me`), CORS для `authorization`, `PORTAL_JWT_SECRET` в ENV и `infra/env-examples/api.env.example`.
- Prisma: у `Merchant` добавлены `portalEmail` (unique), `portalPasswordHash`, а также `portalKeyHash/portalTotpSecret/portalTotpEnabled/portalLoginEnabled/portalLastLoginAt`; миграции применены.
- Admin: «Мерчанты» — список/создание (Name/Email/Password), включение/выключение входа, TOTP (init/verify/disable), «Открыть как мерчант» (имперсонация в портал).
- Merchant Portal: подключены данные — `Настройки` (GET/PUT), `Сотрудники` (список/создать), `Точки` (список/создать), `Устройства` (список/создать), `Клиенты` (поиск по телефону), `Операции` (транзакции/чеки); добавлены `Ваучеры` (список/выпуск/деактивация), `Рассылки` (dry-run/enqueue), `Интеграции` (список); аналитика подключена: `Дашборд`, `RFM`, `Портрет`, `Повторы`, `Время`, `ДР` (через портальные прокси `/portal/analytics/*`).
 - PortalAuth: добавлены e2e-тесты `login` (email+пароль), ветвь `TOTP`, `me` и админская имперсонация; внедрён jose-wrapper `getJose()` для стабильных тестов (используется в `PortalAuthController`, `PortalGuard`, `MerchantsService.signPortalJwt`); добавлен smoke‑тест портальной аналитики; обновлён `README` (раздел PortalAuth/имперсонация); все тесты зелёные.
- RBAC: переименована роль `MANAGER` → `MERCHANT` во фронтах/admin‑proxy и Prisma enum (миграция).
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
  - Levels: применяются бонусы уровня к `earnBps`/`redeemLimitBps` в `quote()` по `rulesJson.levelsCfg` + `levelBenefits`; добавлены unit/e2e тесты.
  - Admin: добавлены редакторы `levelsCfg`/`levelBenefits` и страница предпросмотра уровня клиента (`admin/src/app/levels/page.tsx`).
  - UI-качество: заменены внутренние `<a>` на `Link` в Admin и безопасная типизация `catch (unknown)`.
  - Тестовый ритуал: исправлен «зависон» после e2e — в `api/package.json` скрипт `test:e2e` дополнен `--forceExit`.
  - E2E комбо: Levels + Voucher + Promo — добавлены кейсы на EARN (59 баллов после ваучера/промо и бонуса уровня) и REDEEM (лимит 510) в `api/test/loyalty.e2e-spec.ts`.
  - TTL: усилены unit‑тесты `PointsBurnWorker` (явные проверки суммы сгорания/баланса/события), превью TTL (`PointsTtlWorker`) и активация лотов — зелёные.
  - Документация: `API_DOCUMENTATION.md` — разделы «Уровни и бонусы» и «TTL/Сгорание баллов» (флаги, события, настройки в админке).
  - Admin: добавлены проверки валидности JSON для `levelsCfg` и `levelBenefits` (кнопки «Проверить уровни/бонусы» на странице настроек).
  - Подключён `PromosModule` (prev. этап) и добавлены превью‑правила (категория, minEligible), e2e `promos.e2e-spec.ts` — зелёные.
  - Реализованы `Vouchers`: `preview`, `issue`, `redeem` в `api/src/vouchers/*`. В `redeem` — идемпотентность по `(voucherId, customerId, orderId)` и проверка лимитов/валидности.
  - Интеграция в денежный флоу: `loyalty.controller.quote()` сначала уменьшаем `eligibleTotal` ваучером → промо, затем считаем. В `commit()` при наличии `voucherCode` выполняется идемпотентный `redeem` по `orderId`.
  - Promocodes (points): добавлен поток промокодов как отдельный механизм управления (поверх `VouchersService`) для портала.
    - `PortalController`: `GET /portal/promocodes`, `POST /portal/promocodes/issue`, `POST /portal/promocodes/deactivate` (фильтр `type: 'PROMO_CODE'`, `valueType: 'POINTS'`).
    - `VouchersService`: `issue()` поддерживает `valueType='POINTS'` с `type='PROMO_CODE'`; `list()` фильтрует по `type`; `status()` возвращает `type/valueType/value`.
    - Merchant Portal: прокси‑роуты `/app/api/portal/promocodes/*` и страница `/promocodes` (табы Активные/Архивные, создание/деактивация).
  - Cashier auth: публичные эндпоинты в `LoyaltyController` — `POST /loyalty/cashier/login` (merchantLogin+password9) и `POST /loyalty/cashier/staff-token` (по PIN и точке).
    - `CashierGuard`: whitelist для `/loyalty/cashier/*` и прочих публичных GET.
    - `LoyaltyModule`: импортирован `MerchantsModule` для DI.
    - Восстановлен `POST /loyalty/qr` в корректном месте.
  - Навигация портала: «Ваучеры» заменены на «Промокоды», ссылки «Устройства»/«Настройки» убраны из шапки.
-  - Merchant Portal: реализована боковая навигация (sidebar) по структуре из PAGES.md: Мастер настройки; Аналитика (все подпункты); Программа лояльности (механики/акции/акции с начислением/push/telegram/промокоды/мотивация/антифрод/панель кассира); Отзывы; Клиенты и аудитории; Товары и категории; Карта Wallet; Настройки; Инструменты. Созданы страницы‑скелеты по каждому разделу. Корневая страница теперь «Мастер настройки».
  - Панель кассира (портал): backend эндпойнты `GET /portal/cashier` и `POST /portal/cashier/rotate`, прокси в `merchant-portal` и страница `/loyalty/cashier` с показом логина/статуса пароля, ротацией (отображение нового 9‑значного пароля, кнопка «Скопировать»), таблицей пин‑кодов сотрудников по точкам (обновление PIN/отозвать доступ).
  - Ритуал тестов после правок: `pnpm -C api test && pnpm -C api test:e2e` — все зелёные.
  - Merchant Portal: «Акции» — список с фильтрами статуса (`/loyalty/actions`, прокси `/api/portal/campaigns`), детальная страница `/loyalty/actions/[id]` (прокси `/api/portal/campaigns/[id]`, backend `GET /portal/campaigns/:campaignId`).
  - Merchant Portal: «Акции с начислением» — отдельный список кампаний с наградой POINTS/PERCENT (`/loyalty/actions-earn`).
  - Merchant Portal: «Механики» — добавлена сводка параметров программы из `/portal/settings` (earnBps/redeemLimitBps/TTL/задержка/QR TTL/требования Staff‑Key/Bridge).
  - Merchant Portal: добавлены страницы механик и сохранение в `rulesJson`:
    - «Ограничения списания» (`/loyalty/mechanics/redeem-limits`) — TTL баллов, запрет одновременного списания/начисления, задержка активации.
    - «Автовозврат клиентов» (`/loyalty/mechanics/auto-return`) — конфиг `rulesJson.autoReturn` (enabled/days/text/giftPoints/giftTtlDays/repeat).
    - «ДР‑поздравления» (`/loyalty/mechanics/birthday`) — конфиг `rulesJson.birthday` (enabled/daysBefore/daysAfter/text/giftPoints/giftTtlDays).
    - «Бонус за регистрацию» (`/loyalty/mechanics/registration-bonus`) — конфиг `rulesJson.registration` (enabled/points/ttlDays/text).
    - «Сгорание (TTL)» (`/loyalty/mechanics/ttl`) — управление `pointsTtlDays` и `rulesJson.burnReminder` (enabled/daysBefore/text).
  - Merchant Portal: `auto-return` сохранение рефакторено — отправляется минимальный DTO (`earnBps`, `redeemLimitBps`, `rulesJson`) вместо полного объекта настроек.
  - Добавлены e2e в `api/test/loyalty.e2e-spec.ts`: применение ваучера в quote и идемпотентность `commit` с ваучером.
  - Дополнительные e2e: комбо ваучер+промо (REDEEM) влияет на лимит, проверка `redeemApplied` на `commit`, `redeem` идемпотентен при достижении `maxUses`, `issue` создаёт код и работает в `preview`.
  - Prisma: добавлен уникальный индекс `@@unique([voucherId, customerId, orderId])` для `VoucherUsage` (идемпотентность на уровне БД, миграция будет сгенерирована).
  - SDK TS: добавлены `vouchers.preview/issue/redeem/status/deactivate` и поддержка `voucherCode` в `quote/commit`.
  - README дополнен разделом «Vouchers» (эндпоинты, порядок применения скидок).
  - Все тесты зелёные: `pnpm -C api test && pnpm -C api test:e2e`.
  - Admin UI: добавлен раздел «Ваучеры» — список/поиск/выпуск/деактивация/экспорт (admin/app/vouchers), клиентские методы (admin/lib/vouchers.ts).
  - API: админские эндпоинты для ваучеров: `GET /vouchers/list`, `GET /vouchers/export.csv` (защищены AdminGuard/AdminIpGuard).
  - Admin (CRM): мини‑карточка уровня на странице клиентов, автозагрузка уровня, ссылка «Подробнее», бейдж уровня в транзакциях/чеках с tooltip «эффективные ставки» (base rules + level bonus).
  - Admin (Levels): автозагрузка по query `merchantId/customerId`, прогресс‑бар, расчёт «эффективных ставок» на странице уровней и в настройках мерчанта.
  - TTL e2e: полный флоу PENDING→ACTIVE→preview→burn (`ttl.flow.e2e-spec.ts`) и FIFO‑сгорание с проверкой `consumedPoints` (`ttl.fifo.e2e-spec.ts`).
  - Levels x TTL interplay: при metric=earn активация PENDING(120) поднимает уровень до Silver; quote на 1000 даёт 70 баллов (700 bps) — `levels.ttl.interplay.e2e-spec.ts`.
  - Метрики: e2e проверки /metrics после превью и burn (`metrics.workers.e2e-spec.ts`), gauge `loyalty_worker_last_tick_seconds`, счётчики burn.
  - Referrals: e2e‑заглушки контроллера с mock Prisma (`referral.e2e-spec.ts`); подключён `ReferralModule`, экспортирован `LoyaltyService` из `LoyaltyModule`.
  - Docs: `API_DOCUMENTATION.md` — добавлены примеры конфигов уровней и раздел «Порядок применения» (Voucher → Promo → Rules + Levels) с формулами и примерами.
  - Admin: единый поповер «эффективные ставки» (`admin/components/EffectiveRatesPopover.tsx`) подключён на страницах `customers` и `levels`.
  - E2E REDEEM: пер‑заказный cap — `redeem.order.cap.e2e-spec.ts` (учёт `receipt.redeemApplied`), дневной cap — `redeem.daily.cap.e2e-spec.ts` (rolling 24h) — оба зелёные.
  - Docs: `README.md` дополнен Quickstart «Levels + TTL». `API_DOCUMENTATION.md` — раздел «Referrals (beta/preview)» и примечания к REDEEM (per‑order cap и daily cap).
  - E2E EARN: дневной cap — `earn.daily.cap.e2e-spec.ts` — зелёный.
  - Referrals: позитивный флоу create→activate→complete — `referral.flow.e2e-spec.ts` — зелёный; API docs — добавлен `/referral/complete`.
  - Idempotency: конкурентные commit по одному `orderId` — `redeem.concurrent.order.commit.e2e-spec.ts` — второй commit идемпотентен.
  - Admin UX: поповер — закрытие по клику вне и по Esc, скелетон‑состояние загрузки.

 - Следующий шаг (Wave 2):
  - E2E: «ваучер+промо+уровень+commit → повторный quote (per‑order cap)», расширение TTL‑кейсов, нагрузочные sanity‑чек‑тесты.
  - Referrals: e2e без моков на dev‑БД (идемпотентность, самореферал), SDK методы и примеры.
  - Admin: типографика/отступы/тени поповера (унификация с дизайн‑системой), быстрые подсказки на списках.
  - Ритуал: держать `pnpm -C api test && pnpm -C api test:e2e` зелёным на каждом батче; фиксировать прогресс в `plan.md`.

— Следующий шаг (Wave 2, текущая сессия):
  - Cashier UI: реализовать экран кассира (login 9‑значный пароль мерчанта → ввод PIN сотрудника по точке) и привязку к `X-Staff-Key`.
  - Promocodes (points): расширить обработку в `LoyaltyService.commit()` для начислений по промокоду (POINTS) — idempotent по `orderId`, структурные логи/метрики; e2e.
  - E2E: добавить кейс earn по промокоду POINTS (issue → quote/commit с voucherCode → проверка баланса/транзакций).

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

## Волна 4 — Аналитика (в работе 2025-09-15)

- [x] Сверстать «Сводный отчёт» и «Распределение по времени» по ТЗ: фильтры периода, карточки, графики, подписи.
- [x] Обновить «Портрет клиента», «Повторные продажи» и «Динамика»: фильтры/тумблеры, графики, метрики.
- [x] Реализовать требования для «RFM-анализ», «Активность торговых точек», «Активность сотрудников», «Реферальная программа» (таблицы, модалки, кнопки).
- [x] Пройтись по документации (README/PAGES) и зафиксировать изменения.

## Волна 4 — Механики (в работе 2025-09-15)

- [ ] Обновить страницу перечня механик: карточки с иконками/описаниями, тумблеры по ТЗ.
- [ ] Реализовать UI «Уровни клиентов»: список, создание, редактирование, детальная с корректировками и составом.
- [ ] Сверстать страницы настроек: «Ограничения в баллах», «Автовозврат», «Поздравить с днём рождения», «Баллы за регистрацию», «Напоминание о сгорании», «Реферальная программа».
- [x] Обновлён раздел «Акции»: вкладки Предстоящие/Текущие/Прошедшие, поиск и таблица с меню действий, мастер создания в два шага.
- [x] Добавлен «Журнал начисления баллов»: фильтры, список операций с пагинацией и модальное окно просмотра операции.
- [x] Push-рассылки: вкладки активных/архивных кампаний, таблица и модальное окно создания с ограничением 300 символов и выбором аудитории.
- [x] Telegram-рассылки: пустое состояние, таблица архивов, расширенная модалка с лимитом 512 символов, загрузкой изображения и валидациями.
- [x] Мотивация персонала: настройки начислений и отображения рейтинга, предпросмотр панели кассира, сохранение только при изменениях.
- [x] Навигация портала: сворачиваемые группы разделов и ссылка на «Журнал начисления баллов» в блоке «Программа лояльности».
- [x] Бэкенд портала: API для push/telegram-рассылок, мотивации персонала, списка акций и журнала операций с фильтрами и деталями.
