# FIX.md

Этот файл заполняется по мере аудита проекта. Недоработки отсортированы по убыванию важности устранения (сверху — самое критичное для продакшена).

## P0 — Critical (блокеры продакшена)

- **[SEC][Secrets] В репозитории закоммичены `.env`/`.env.local` с реальными ключами/токенами**
  - **Риск**: компрометация `ADMIN_KEY`/Telegram‑ботов/секретов → полный захват админ‑API, подмена/перехват алертов, возможность абуза баллов и утечки данных.
  - **Причина**: файлы с секретами находятся в git‑треке (хотя паттерны `*.env*` уже в `.gitignore`), поэтому даже после удаления останутся в истории.
  - **Где**:
    - `api/.env` (в т.ч. `ALERT_TELEGRAM_BOT_TOKEN`, `TELEGRAM_NOTIFY_BOT_TOKEN`, `ADMIN_KEY`, `PORTAL_*`).
    - `admin/.env.local` (в т.ч. `ADMIN_KEY`, `ADMIN_UI_PASSWORD`, `ADMIN_SESSION_SECRET`).
  - **Что сделать (срочно)**:
    - Ротация всех затронутых ключей/токенов (Telegram, `ADMIN_KEY`, `ADMIN_SESSION_SECRET`, `PORTAL_*`, прочие).
    - Удалить файлы из репозитория и **почистить git history** (иначе секреты остаются доступными).
    - Оставить только шаблоны в `infra/env-examples/*` и `.env.production.example`.

- **[OUTBOX] Ретраи вебхуков сломаны: события зависают в `FAILED` и больше не обрабатываются**
  - **Риск**: любой временный сетевой сбой/5xx/429 приводит к потере webhook‑доставки. Интеграции не получат события `commit/refund` → рассинхрон и ручные разборы.
  - **Причина**: `OutboxDispatcherWorker` выставляет `status='FAILED'`, но в `tick()` выбирает только `status='PENDING'`.
  - **Доп. риск**: `pgAdvisoryUnlock` вызывался не в `finally` → при неожиданном исключении лидер‑лок может остаться на соединении и воркер перестанет обрабатывать outbox до перезапуска.
  - **Где**: `api/src/outbox-dispatcher.worker.ts`.
  - **Что сделать**:
    - `tick()` должен выбирать `PENDING` + `FAILED`, а `claim()` принимать `FAILED`;
    - `pgAdvisoryUnlock` перенести в `finally`;
    - добавить reaper для событий, зависших в `SENDING` (см. P1 ниже).

- **[INFRA][Redis] `docker-compose.production.yml`: healthcheck Redis не проходит при включённом `--requirepass` → `api/worker` могут не стартовать**
  - **Риск**: деплой “встаёт” — `depends_on: condition: service_healthy` блокирует запуск `api`/`worker`, система не работает.
  - **Причина**: Redis запущен с `--requirepass ${REDIS_PASSWORD}`, но healthcheck использует `redis-cli ping` без авторизации (получает `NOAUTH`).
  - **Где**: `docker-compose.production.yml` (`services.redis.healthcheck`).
  - **Что сделать**: использовать `redis-cli -a ${REDIS_PASSWORD} ping` (или заменить проверку/убрать `condition: service_healthy`).

- **[INFRA][ENV] `.env.production` не подхватывается `docker compose`/CI по умолчанию → `${...}` подставляются пустыми (пароли/секреты) и деплой ломается**
  - **Риск**:
    - Postgres/Redis могут не стартовать (пустые `POSTGRES_PASSWORD`/`--requirepass` без аргумента).
    - Либо стартуют с пустыми секретами/паролями (security disaster).
    - Traefik basic-auth может работать непредсказуемо при пустых значениях.
  - **Причина**:
    - `DEPLOYMENT_GUIDE.md` предлагает создать `.env.production`, но `docker compose -f docker-compose.production.yml up` читает только `.env` (или переменные окружения/`--env-file`).
    - В `.github/workflows/ci-cd.yml` на сервере вызывается `docker compose -f docker-compose.production.yml ...` без явного `--env-file`.
  - **Где**: `DEPLOYMENT_GUIDE.md`, `.github/workflows/ci-cd.yml`, `docker-compose.production.yml` (использование `${...}`).
  - **Что сделать**: выбрать один стандарт:
    - либо хранить прод‑переменные в `.env` рядом с compose,
    - либо везде использовать `docker compose --env-file .env.production ...`,
    - либо прописать `env_file: .env.production` в compose.

- **[INFRA][ENV] `docker-compose.production.yml`: `api`/`worker` не получают обязательные ENV → сервисы падают при старте в `NODE_ENV=production`**
  - **Риск**: API и воркеры не поднимаются, система полностью/частично неработоспособна (невозможны операции, вебхуки/фоновые задачи не выполняются).
  - **Причина**: в `api/src/main.ts` в production включён fail‑fast ENV‑чек (минимум `ADMIN_SESSION_SECRET`, `QR_JWT_SECRET` не dev‑дефолт, `CORS_ORIGINS`), но compose не передаёт эти переменные в контейнеры.
    - Дополнительно: критичные секреты портала/ApiKeyGuard (`PORTAL_JWT_SECRET`, `PORTAL_REFRESH_SECRET`, `API_KEY`) **не валидируются** в fail‑fast и в compose тоже не прокинуты → API может стартовать, но портал/часть API будет падать/давать 401.
  - **Конкретно**:
    - `api` в compose **не содержит** `ADMIN_SESSION_SECRET` → приложение падает с ошибкой `[ENV] ADMIN_SESSION_SECRET not configured`.
    - `api` в compose **не содержит** `PORTAL_JWT_SECRET`/`PORTAL_REFRESH_SECRET` → `POST /portal/auth/login` и `PortalGuard` ломаются (500/401 `PORTAL_* not configured`).
    - `api` в compose **не содержит** `API_KEY` → всё, что под `ApiKeyGuard` (`/analytics`, `/referral/*` и др.) становится недоступным (401).
    - `worker` в compose **не содержит** `ADMIN_KEY`/`QR_JWT_SECRET`/`ADMIN_SESSION_SECRET`/`CORS_ORIGINS` → воркеры также не стартуют.
    - `.env.production.example` не содержит `PORTAL_JWT_SECRET`, но при этом содержит `PORTAL_REFRESH_SECRET` → легко получить “наполовину” сконфигурированный портал (login/guard падают).
  - **Где**: `docker-compose.production.yml` (`services.api.environment`, `services.worker.environment`), `api/src/main.ts`.
  - **Что сделать (без overengineering)**: передавать одинаковый обязательный набор ENV в `api` и `worker` (например, через `env_file: .env.production` + точечные override’ы, либо явно добавить `ADMIN_SESSION_SECRET: ${ADMIN_SESSION_SECRET}` и т.п. в оба сервиса).

- **[INFRA][Dockerfile] Dockerfile’ы содержат невалидный `COPY ... 2>/dev/null || true` → сборка образов падает**
  - **Риск**: production деплой не собирается (`api/admin/miniapp/bridge`), сервисы не стартуют.
  - **Причина**: в Dockerfile используется синтаксис shell (`2>/dev/null || true`) внутри инструкции `COPY`, что Docker воспринимает как пути к файлам/каталогам.
    - Дополнительно (P0): даже после исправления `COPY` контейнер `api/worker` может падать на старте с ошибкой Prisma Client:
      - `api/Dockerfile` в runtime‑stage делает `pnpm i --prod` (а `prisma` лежит в `devDependencies`) и **не** выполняет `prisma generate`;
      - `node_modules`/сгенерированный Prisma Client из build‑stage в runtime‑stage не копируются → клиент не инициализируется.
  - **Где**:
    - `api/Dockerfile`
    - `admin/Dockerfile`
    - `miniapp/Dockerfile`
    - `bridge/Dockerfile`
  - **Что сделать**:
    - убрать редиректы/`|| true`, оставить валидный `COPY` (и решить вопрос “опциональных” файлов через явное наличие в репозитории или корректную структуру копирования);
    - для Prisma выбрать один понятный вариант:
      - либо держать `prisma` в `dependencies` (чтобы `@prisma/client` мог генерироваться в runtime),
      - либо копировать `node_modules` (или хотя бы `.prisma`) из build‑stage,
      - либо выполнять `prisma generate` в runtime‑stage (и установить `prisma` там).

- **[INFRA][Traefik] Неверные `loadbalancer.server.port` для Next.js сервисов (`admin`/`miniapp`/`cashier`) → UI недоступен (502)**
  - **Риск**: админка/miniapp/cashier не открываются через Traefik, интеграции/операторы не могут работать с системой.
  - **Причина**: в `docker-compose.production.yml` для `admin/miniapp/cashier` указан порт `3000`, но Dockerfile’ы задают `PORT=3001` (admin) и `PORT=3003` (miniapp); для `cashier` Dockerfile отсутствует/неочевиден.
  - **Где**: `docker-compose.production.yml` (labels `traefik.http.services.*.loadbalancer.server.port`), `admin/Dockerfile`, `miniapp/Dockerfile`.
  - **Что сделать**: синхронизировать порты — либо выставить `PORT=3000` внутри контейнеров, либо изменить `loadbalancer.server.port` на фактический порт сервиса.

- **[INFRA][Docker] Нет `.dockerignore` в build‑контекстах сервисов → риск утечки `.env`/секретов в Docker image**
  - **Риск**: на прод‑хосте часто лежат `.env`/`.env.local` (не в git), а в Dockerfile’ах (`admin/miniapp`) используется `COPY . .` — секреты могут попасть в слои образа и утечь в registry/логи/бэкапы.
  - **Причина**: root `.dockerignore` не применяется к `build.context: ./admin|./miniapp|...`; при отсутствии локального `.dockerignore` в директории сервиса в контекст попадают все файлы.
  - **Где**: `admin/Dockerfile`, `miniapp/Dockerfile`, отсутствие `.dockerignore` в `admin/`, `miniapp/`, `api/`, `bridge/`, `cashier/`.
  - **Что сделать (без overengineering)**: добавить `.dockerignore` в каждую директорию сервиса и исключить минимум `.env*`, `node_modules`, `.next`, `dist`, логи; по возможности заменить `COPY . .` на копирование только нужных файлов.

- **[INFRA][Cashier] `docker-compose.production.yml` ссылается на `cashier/Dockerfile`, которого нет**
  - **Риск**: деплой/сборка `cashier` падает, сервис недоступен.
  - **Причина**: в репозитории отсутствует `cashier/Dockerfile`, но compose ожидает его.
  - **Где**: `docker-compose.production.yml` (`services.cashier.build`).
  - **Что сделать**: добавить Dockerfile (по аналогии с `admin/miniapp`) или убрать сервис из production compose, если кассовый UI не используется.

- **[REFUND] Возможен двойной `refund` (гонка/повтор) → двойное изменение баланса/лотов/ledger**
  - **Риск**: при двух параллельных запросах возврата для одного чека можно дважды восстановить/списать баллы. Это критично (потери, абуз, разъезд бухгалтерии).
  - **Причина**:
    - Проверка “refund уже был” выполняется **до транзакции**, а внутри транзакции нет атомарного “захвата” чека.
    - Нет ограничения/условного обновления вида `UPDATE receipt SET canceledAt=... WHERE canceledAt IS NULL`.
    - `Idempotency-Key` опционален и не гарантирует защиту.
  - **Где**: `api/src/loyalty/loyalty.service.ts` (`refund`).
  - **Что сделать**: в начале DB‑транзакции атомарно “захватить” чек через `updateMany` с условием `canceledAt = null` и продолжать только если `count == 1` (иначе вернуть идемпотентный ответ “уже возвращено”).

- **[COMMIT] Возможен двойной `commit` одного `holdId` (параллельные запросы/ретраи) → двойное изменение баланса/лотов/ledger**
  - **Риск**: один `holdId` можно закоммитить дважды с разными `orderId` → создаются два `Receipt` и два набора транзакций.
  - **Причина**: внутри транзакции нет атомарного “захвата” `Hold` по `status=PENDING`; `hold` читается вне транзакции и используется как снимок.
  - **Где**: `api/src/loyalty/loyalty.service.ts` (`commit`).
  - **Что сделать (без overengineering)**: в начале транзакции делать условный `updateMany` (`id=holdId AND status=PENDING`) и продолжать только если `count==1`; если `hold.orderId` уже задан — требовать совпадение с входным.

- **[LEGACY][Gifts] Механика `gifts` устарела, но код оставляет критичную дыру (публичный redeem со списанием баллов)**
  - **Риск**: пока модуль присутствует в проде, его можно использовать для абуза (списание баллов/"погашение" от имени других клиентов по `customerId`).
  - **Причина**: публичный эндпоинт `POST /gifts/:merchantId/:giftId/redeem` не защищён и не привязан к аутентифицированному клиенту.
  - **Где**: `api/src/gifts/gifts.controller.ts`, `api/src/gifts/gifts.service.ts`.
  - **Что сделать (как вы просили, без фикса логики)**:
    - **Коротко (P0)**: отключить роутинг модуля/удалить `GiftsModule` из `AppModule`/маршрутов; в крайнем случае — поставить feature-flag и по умолчанию выключить.
    - **Дальше**: полностью удалить таблицы/модели/контроллеры `Gift/GiftRedemption` после проверки, что в UI/бэке нет зависимостей.

- **[BALANCE] `wallet.balance` обновляется через read-modify-write → потеря обновлений/"создание" баллов при параллельных операциях**
  - **Риск**: баланс расходится при конкурирующих операциях (commit/refund/redeem/подарки/рефералы) → можно потратить больше баллов чем есть, либо баланс станет неверным.
  - **Причина**: паттерн `findUnique()` → `update({ balance: fresh.balance +/- delta })` вместо атомарных операций `increment/decrement` или условных апдейтов.
  - **Где (примеры)**:
    - `api/src/loyalty/loyalty.service.ts` (много мест: `commit`, `refund`, `redeem`, `applyPromoCode`, `grantRegistrationBonus` и др.)
    - `api/src/gifts/gifts.service.ts` (`redeemGift`)
    - `api/src/referral/referral.service.ts` (`activateReferral`, `completeReferral`)
  - **Что сделать**: перейти на атомарные апдейты Prisma (`balance: { increment/decrement: ... }`) + при списании проверять условием `updateMany(where: balance >= amount)`/оптимистичную блокировку.

## P1 — High (высокий риск потерь/абуза/падений)

- **[SEC][Cashier] PIN‑коды сотрудников хранятся в открытом виде и почти не защищены от перебора**
  - **Риск**: при компрометации `cashier_device` (или утечке activation‑кода) злоумышленник может перебрать 4‑значный PIN и получить `cashier_session` → проводить кассовые операции (в т.ч. абуз баллов/возвраты).
  - **Причина**:
    - `StaffOutletAccess.pinCode` хранится как plaintext; `pinCodeHash`/`pinRetryCount`/`revokedAt` в схеме есть, но в коде не используются для защиты.
    - `POST /loyalty/cashier/session` и `POST /loyalty/cashier/staff-access` фактически завязаны на “ввод 4 цифр” с лимитом только `@Throttle` (60/min), без блокировок по попыткам.
  - **Где**: `api/prisma/schema.prisma` (`StaffOutletAccess.pinCode/pinCodeHash/pinRetryCount`), `api/src/merchants/merchants.service.ts` (`resolveActiveAccessByPin`, `startCashierSessionByMerchantId`), `api/src/loyalty/loyalty.controller.ts` (`cashier/session`, `cashier/staff-access`).
  - **Что сделать (просто)**: реализовать блокировку по попыткам на `pinAccessId`/device‑token (использовать `pinRetryCount`, `pinUpdatedAt`, `revokedAt`), а хранение перевести на `pinCodeHash` (оставить plaintext только если он реально нужен для показа в портале — но тогда это не “секрет”).

- **[SEC][Portal] `GET /portal/settings` отдаёт чувствительные секреты в браузер (webhook/Telegram/bridge)**
  - **Риск**: компрометация `telegramBotToken`/`webhookSecret`/`bridgeSecret*` через XSS/расширения/логи/DevTools у любого пользователя портала, имеющего доступ к настройкам → захват Telegram‑бота, подделка вебхуков/подписей и дальнейшая эскалация атак.
  - **Причина**: `MerchantsService.getSettings()` возвращает “сырые” секреты, а `merchant-portal` дергает их напрямую через `/api/portal/settings` (например, для настроек отзывов), поэтому значения оказываются в клиентском JS.
  - **Усугубляет риск**: часть `merchant-portal` update‑роутов реализована как `GET /portal/settings` → “слепить полный payload” → `PUT /portal/settings` и **прокидывает секреты обратно** даже при сохранении не связанных настроек → секреты чаще оказываются в request/response и потенциально в логах прокси/Next.
  - **Где**: `api/src/merchants/merchants.service.ts` (`getSettings`), `api/src/portal/portal.controller.ts` (`GET /portal/settings`), `merchant-portal/app/api/portal/settings/route.ts`, `merchant-portal/app/reviews/page.tsx`.
  - **Что сделать (без overengineering)**:
    - в `GET /portal/settings` не возвращать значения секретов (только маску/флаг “настроено”), а полный секрет показывать только один раз при генерации/ротации через отдельный endpoint (или вообще не показывать, если не нужно);
    - на `PUT /portal/settings`/в портальных апдейтах перейти на “partial update”: секреты не требовать/не пересылать при сохранении прочих полей (отсутствующее поле = “не менять”, `null` = “очистить”).

- **[BUG][Portal] Конфликт маршрутов `GET /portal/customers` и `GET /portal/customers/:id` между двумя контроллерами**
  - **Риск**: недетерминированное поведение (зависит от порядка модулей): один обработчик “затеняет” другой → часть функционала клиентов/аудиторий может внезапно перестать работать при рефакторинге или изменении порядка импортов.
  - **Причина**: одинаковые `method + path` объявлены в `PortalController` и `CustomerAudiencesController` (оба `@Controller('portal')`), при этом возвращают разные формы ответа (array vs `{ total, items }`).
  - **Где**: `api/src/portal/portal.controller.ts`, `api/src/customer-audiences/customer-audiences.controller.ts`, `api/src/app.module.ts`.
  - **Что сделать**: выбрать один источник истины для `/portal/customers` (скорее `PortalCustomersService`) и удалить/переименовать дублирующие маршруты из второго контроллера (например, вынести в `/portal/audiences/:id/customers` или оставить только `/portal/audiences`).

- **[SEC][StaffKey] С `X-Staff-Key` можно подменять `staffId` в body и обходить атрибуцию/лимиты**
  - **Риск**: интеграция/кассир с валидным `X-Staff-Key` может:
    - атрибутировать операции на другого сотрудника (мотивация/аудит/аналитика искажаются);
    - потенциально обходить лимиты/трекинг, завязанные на `staffId` (throttler tracker использует `body.staffId`).
  - **Причина**: ветка `X-Staff-Key` в `CashierGuard` валидирует ключ, но **не форсирует** `body.staffId = staff.id` (в отличие от ветки `cashier_session`, где `staffId`/`merchantId` подставляются и проверяются).
  - **Где**: `api/src/guards/cashier.guard.ts` (ветка `if (key) { ... }`).
  - **Что сделать**: после успешной проверки `X-Staff-Key` принудительно выставлять `body.merchantId`/`body.staffId` и проверять/фиксировать `outletId` по доступам сотрудника (как это сделано для `cashier_session`).

- **[SEC][SSRF] Webhook URL мерчанта используется в outbox без защиты от SSRF**
  - **Риск**:
    - мерчант может настроить `webhookUrl` на внутренний адрес (например, `http://localhost:...`, `http://169.254.169.254/...`) и заставить воркер ходить во внутреннюю сеть;
    - ответ сервиса целиком сохраняется в `EventOutbox.lastError` (`res.text()`), что создаёт канал эксфильтрации (через админку/outbox‑мониторинг/логи) и может раздувать БД.
  - **Где**: `api/src/outbox-dispatcher.worker.ts`, `MerchantSettings.webhookUrl`.
  - **Что сделать (без overengineering)**:
    - валидировать URL: только `https`, запрет редиректов уже есть (`redirect:'manual'`) — дополнить блокировкой private/loopback/link-local сетей и явным allowlist доменов/суффиксов (хотя бы per-merchant);
    - ограничить размер сохраняемой ошибки (например, первые N байт) и не сохранять тело ответа целиком;
    - опционально: выделить отдельную сеть/egress‑политику для воркеров вебхуков.

- **[WORKERS][Cron] Часть cron-задач игнорирует `WORKERS_ENABLED` и не имеет distributed lock → дубли/нагрузка на проде**
  - **Риск**:
    - при `api: replicas>1` cron выполняется параллельно в каждой реплике (и ещё раз в `worker`, т.к. `NO_HTTP=1` не отключает Schedule) → дубли, гонки, лишняя нагрузка;
    - `SubscriptionCronService` может отправлять напоминания несколько раз (пока флаги `reminderSent*` не успели обновиться).
  - **Где**: `api/src/analytics/analytics-aggregator.worker.ts`, `api/src/subscription/subscription.cron.ts`, запуск `Nest` в режиме `NO_HTTP=1` в `api/src/main.ts`.
  - **Что сделать**: добавить `if (WORKERS_ENABLED==='0') return;` + advisory lock (`pgTryAdvisoryLock`) как у остальных воркеров, либо вынести Schedule‑задачи в отдельный “worker-only” модуль/процесс.

- **[WORKERS][TTL] Дублирующая и неконсистентная реализация TTL‑сгорания баллов**
  - **Риск**: неверное “сгорание” (или не‑сгорание) баллов → финансовые потери/конфликты с клиентами/поддержкой; на нескольких репликах возможны двойные списания.
  - **Проблемы**:
    - есть два разных воркера с разными флагами: `PointsBurnWorker` (`POINTS_TTL_BURN`) и `TtlBurnWorker` (`TTL_BURN_ENABLED`);
    - `TtlBurnWorker` не использует advisory lock (только `isRunning` в памяти) → при нескольких репликах возможны параллельные burn’ы;
    - оба подхода вычисляют “просрочку” от `earnedAt + pointsTtlDays` и **игнорируют `EarnLot.expiresAt`**, хотя при начислении лотов выставляется `expiresAt` (в т.ч. для промо‑баллов/других сроков);
    - `TtlBurnWorker` выбирает лоты без `status='ACTIVE'` и при `wallet.balance < burnAmount` просто “скипает” клиента, оставляя просроченные лоты навсегда.
  - **Где**: `api/src/points-burn.worker.ts`, `api/src/ttl-burn.worker.ts`, `api/src/points-ttl.worker.ts`, `api/src/points-ttl-reminder.worker.ts`, `api/prisma/schema.prisma` (`EarnLot.expiresAt`).
  - **Что сделать (без лишней сложности)**:
    - удалить/отключить `TtlBurnWorker` как legacy и оставить один набор воркеров `POINTS_TTL_*`;
    - считать просрочку строго по `earnLot.expiresAt` (если `expiresAt=null` — не сгорает) и фильтровать `status='ACTIVE'`;
    - защитить burn worker advisory lock’ом и делать списание кошелька атомарно (`decrement`/условный `updateMany`), чтобы не терять апдейты при параллельных `commit/redeem`.

- **[AUTH][Portal] Проверка прав staff’а в портале fail-open и обходится через `/api/v1/*`**
  - **Риск**: сотрудник с ограниченными правами может получить доступ к “чужим” ресурсам внутри мерчанта (настройки, интеграции, промо, вебхуки) просто дергая неучтённые маршруты или добавляя префикс `/api/v1`.
  - **Причина**:
    - `PortalGuard.resolvePermissionTarget()` возвращает `null` для неизвестных путей, а `enforcePortalPermissions()` в этом случае **ничего не запрещает**;
    - `api/src/main.ts` добавляет алиас `/api/v1/*` → `PortalGuard` использует `req.originalUrl`, где остаётся `/api/v1/...`, и маппинг ресурсов не срабатывает (target=`null` → allow).
  - **Где**: `api/src/portal-auth/portal.guard.ts`, `api/src/main.ts`.
  - **Что сделать**: для staff сделать default-deny (неизвестный путь → 403) и/или нормализовать путь, убирая префикс `/api/v1` (использовать `req.url` после rewrite или strip в `normalizePath`); добавить тест на запрет доступа через `/api/v1/portal/*`.

- **[OUTBOX] События могут навсегда зависать в `SENDING` при падении воркера после `claim()`**
  - **Риск**: событие не доставится и не будет ретраиться без ручного вмешательства.
  - **Причина**: нет механизма “reaper” для возврата `SENDING` → `PENDING` по таймауту.
  - **Что сделать (просто)**: в `OutboxDispatcherWorker.tick()` добавить восстановление зависших событий:
    - `updateMany` где `status='SENDING' AND updatedAt < now - OUTBOX_SENDING_STALE_MS` → `status='PENDING'`, `nextRetryAt=now`, `lastError='stale sending'`.

- **[INFRA][Backup] `backup` сервис в `docker-compose.production.yml` работает некорректно (риск перегруза БД/переполнения диска; бэкапы могут не выгружаться в S3)**
  - **Риск**:
    - При `restart: unless-stopped` контейнер после успешного завершения скрипта перезапускается и может делать бэкапы в цикле → нагрузка на Postgres, быстрый рост `backup_data`.
    - S3/Telegram уведомления могут не работать (в образе `postgres:15-alpine` обычно нет `aws`/`curl`).
  - **Причина**:
    - В `docker-compose.production.yml` в контейнер передаётся `POSTGRES_PASSWORD`, но скрипт ожидает `DB_PASSWORD` → `pg_dump` не получает пароль и бэкап всегда падает.
    - `infra/backup/backup.sh` не использует `BACKUP_SCHEDULE` и не запускает cron/daemon — это “одноразовый” скрипт.
    - В `backup.sh` нет `set -o pipefail` → ошибки `pg_dump` в пайпе могут быть замаскированы.
    - Контейнер `backup` не имеет явной зависимости на наличие `aws-cli`.
  - **Где**: `docker-compose.production.yml` (`services.backup`), `infra/backup/backup.sh`.
  - **Что сделать**: либо убрать `restart` и запускать по cron снаружи, либо сделать отдельный образ с cron + aws-cli (простая реализация без усложнений), либо временно отключить сервис до готовности.

- **[INFRA][Deploy] `scripts/deploy.sh` и документация деплоя не соответствуют реальному репозиторию → высокий риск “сломать прод” при запуске по инструкции**
  - **Риск**: автоматизированный деплой/бэкап не работает, возможны простои при попытке релиза.
  - **Причина (примеры)**:
    - `DEPLOYMENT_GUIDE.md` ссылается на `docker-compose.dev.yml`, которого нет.
    - `scripts/deploy.sh` ожидает `docker-compose.staging.yml` и `docker-compose.test.yml`, которых нет.
    - `scripts/deploy.sh` использует `docker exec postgres ...`/`docker exec redis ...` — без `container_name` это, как правило, не сработает (нужно `docker compose exec`).
    - Redis‑проверка в `deploy.sh` не учитывает пароль (`--requirepass`).
  - **Где**: `scripts/deploy.sh`, `DEPLOYMENT_GUIDE.md`.
  - **Что сделать**: либо привести скрипт/гайд в рабочее состояние под текущий compose, либо удалить как legacy, чтобы им случайно не воспользовались.

- **[INFRA][CI/CD] GitHub Actions пайплайн деплоя/сборки сейчас нерабочий (staging compose отсутствует; Docker build падает) → релизы через CI невозможны**
  - **Риск**: невозможность выпускать обновления через CI/CD, “ложное чувство” что релиз проходит, а на деле pipeline падает/не применяет миграции.
  - **Причина (примеры)**:
    - В `.github/workflows/ci-cd.yml` деплой в staging использует `docker-compose.staging.yml`, которого нет в репозитории.
    - В том же workflow сборка Docker‑образов использует Dockerfile’ы с невалидным `COPY ... 2>/dev/null || true`.
    - Для `cashier` в репозитории нет `cashier/Dockerfile`, но workflow пытается собрать `./cashier`.
  - **Где**: `.github/workflows/ci-cd.yml`, `api/Dockerfile`, `admin/Dockerfile`, `miniapp/Dockerfile`, `bridge/Dockerfile`, отсутствие `cashier/Dockerfile`.
  - **Что сделать**: либо привести workflow/compose/Dockerfile’ы к одной рабочей схеме, либо отключить CI/CD до готовности.

- **[OBS][Prometheus] Конфиг мониторинга не соответствует production compose → алерты/метрики частично не работают**
  - **Риск**: отсутствие сигналов о деградации (воркеры, outbox, БД), инциденты замечаются поздно.
  - **Причина**:
    - `infra/prometheus.yml` ожидает `alertmanager`, `postgres-exporter`, `redis-exporter`, `node-exporter`, `bridge`, но в `docker-compose.production.yml` этих сервисов нет.
    - `rule_files: "alerts/*.yml"`, но каталог `alerts` в контейнер не примонтирован → Prometheus может не стартовать/работать без правил.
    - `worker` запускается с `NO_HTTP=1`, но `infra/prometheus.yml` пытается scrape `worker:3000/metrics` → метрики воркеров не собираются.
  - **Где**: `docker-compose.production.yml`, `infra/prometheus.yml`, `infra/prometheus/alerts.yml`, `infra/alertmanager/alertmanager.yml`.
  - **Что сделать**: синхронизировать compose и prometheus config (или упростить: собирать метрики только с `api`), а воркерам оставить HTTP хотя бы для `/metrics` (или поднять отдельный порт только для метрик внутри сети).

- **[DB] Нет автоочистки `EventOutbox` (retention) по реальному TTL хранения событий**
  - **Риск**: рост БД и индексов (особенно `EventOutbox`) → деградация производительности и стоимость инфраструктуры.
  - **Причина**: для `EventOutbox` нет GC/retention (в отличие от `IdempotencyKey`).
  - **Что сделать**: добавить простой GC‑воркер для удаления `EventOutbox` со статусами `SENT/DEAD` старше N дней (например 30–90), N — через ENV.

- **[Idempotency] `Idempotency-Key` общий на мерчанта (без scope операции) и создаётся после выполнения → возможны коллизии и дубли**
  - **Риск**:
    - Один и тот же `Idempotency-Key` может “склеить” ответы разных эндпоинтов (`commit`/`refund`) → вернётся не тот ответ.
    - Параллельные запросы с одним ключом оба выполнятся (запись создаётся постфактум).
    - В `commit` `merchantId` для проверки/идемпотентности берётся из body (`dto.merchantId`) и не сверяется с `hold.merchantId` → запись ключа/ответа может уйти “не тому” мерчанту.
  - **Где**: `api/src/loyalty/loyalty.controller.ts` (`commit`, `refund`), модель `IdempotencyKey`.
  - **Что сделать (без overengineering)**: добавить scope (хотя бы `operation`/`path`) в уникальность и резервировать ключ атомарно до выполнения (например `create` перед операцией + обработка unique).

- **[SEC][Integrations] Флаг `requireBridgeSignature` для REST-интеграций не делает подпись обязательной (по факту “проверить если пришло”)**
  - **Риск**: мерчант/интеграция ожидают усиление безопасности, но запросы проходят без подписи (только по `X-Api-Key`).
  - **Причина**: `verifyBridgeSignatureIfRequired()` делает `return`, если `X-Bridge-Signature` отсутствует.
    - Дополнительно: даже при включённом `requireBridgeSignature` проверка **fail-open**.
      - Если `bridgeSecret`/`bridgeSecretNext` не настроены (ни у `outlet`, ни у `merchantSettings`) — функция тоже делает `return` и пропускает запрос.
      - Все ошибки (например, ошибки чтения `merchantSettings/outlet`) кроме `UnauthorizedException` глушатся и запрос пропускается.
  - **Где**: `api/src/integrations/integrations-loyalty.controller.ts`.
  - **Что сделать**: если `requireBridgeSignature=true` — требовать заголовок и валидировать; либо удалить этот флаг как legacy, чтобы не вводить в заблуждение.

## P2 — Medium (важно, но не блокирует работу)

- **[AUTH][Portal] STAFF‑логин в портале ищется по `email` без привязки к `merchantId` → возможны коллизии между мерчантами**
  - **Риск**: если у двух мерчантов есть сотрудники с одинаковым email, вход становится недетерминированным (берётся первый `findFirst`) или вообще “ломается” (пароль не подходит к найденной записи) → поддержка/хаос.
  - **Причина**:
    - `PortalAuthController.login()` делает `staff.findFirst({ where: { email, status: ACTIVE, portalAccessEnabled: true, canAccessPortal: true } })` без `merchantId`.
    - В БД нет ограничения уникальности `Staff.email` в рамках мерчанта.
  - **Где**: `api/src/portal-auth/portal-auth.controller.ts`, `api/prisma/schema.prisma` (`Staff`).
  - **Что сделать (просто)**: либо добавлять контекст мерчанта в логин (например, `merchantId`/`merchantLogin` в форме и фильтрация по нему), либо ввести `@@unique([merchantId, email])` и везде использовать `(merchantId, email)` как ключ.

- **[UI][Mechanics] Механики “через Telegram-бота” можно включить в `merchant-portal`, но backend‑воркеры их молча пропускают, если бот не подключён**
  - **Риск**: мерчант видит “включено”, но механика фактически не работает (нет поздравлений/автовозврата/напоминаний), аналитика будет пустой → недоверие и нагрузка на поддержку.
  - **Причина**:
    - воркеры фильтруют мерчантов по `telegramBotEnabled=true` и логируют `Skip merchant=...: ... enabled but Telegram bot disabled`;
    - UI не проверяет `telegramBotEnabled`/статус интеграции при включении механик, а на TTL‑странице даже игнорируется `telegramBotConnected` из `/api/portal/loyalty/ttl`.
  - **Где**: `api/src/birthday.worker.ts`, `api/src/auto-return.worker.ts`, `api/src/points-ttl-reminder.worker.ts`, `merchant-portal/app/loyalty/mechanics/birthday/page.tsx`, `merchant-portal/app/loyalty/mechanics/auto-return/page.tsx`, `merchant-portal/app/loyalty/mechanics/ttl/page.tsx`, `merchant-portal/app/api/portal/loyalty/ttl/route.ts`.
  - **Что сделать (без overengineering)**: в UI показывать явный статус “Telegram подключён/не подключён” и не давать включать механику без подключения (или разрешать включить, но показывать жёсткий warning + ссылку на `/integrations/telegram-mini-app`).

- **[DX][Typecheck] `pnpm typecheck` сейчас падает из-за несинхронизированных тестов/типов**
  - **Риск**: ломается CI/локальная проверка перед релизом, растёт шанс “случайно сломать” важную логику без раннего сигнала.
  - **Проявления**: `pnpm typecheck` падает на `.spec.ts`/тестах (например, `api/src/loyalty/loyalty.service.spec.ts`, `api/src/loyalty/loyalty.calculate-action.spec.ts`, `api/src/guards/telegram-miniapp.guard.spec.ts`).
  - **Что сделать**: синхронизировать тесты с актуальными типами (или исключить `*.spec.ts` из `tsc --noEmit` в `api` и проверять тесты через `jest`/`ts-jest` отдельно).

- **[DOC][Integrations] Несоответствие документации/портала реальным эндпоинтам REST-интеграций (`/api/integrations/*`)**
  - **Риск**:
    - мерчанты/интеграторы получают неверные URL из портала → ошибки интеграции/лишняя поддержка;
    - конфиг `rateLimits` (по ключам `calculate/clientMigrate`) может фактически **не применяться** к реальным маршрутам;
    - присутствуют “скрытые” методы, не описанные в `REST-API-DOCS.md` (в т.ч. потенциально лишние по поверхности атаки).
  - **Проявления**:
    - `GET /portal/integrations/rest-api` возвращает `availableEndpoints` с `/api/integrations/bonus/calculate` и `/api/integrations/client/migrate`, но в API реализованы `POST /api/integrations/calculate/bonus` и `POST /api/integrations/calculate/action`, а `client/migrate` отсутствует.
    - `CustomThrottlerGuard` маппит per-integration лимиты по путям `/api/integrations/bonus/calculate` и `/api/integrations/client/migrate` — из-за этого лимит `calculate`/`clientMigrate` не привязывается к фактическим эндпоинтам.
      - Дополнительно: guard берёт `path` как `req.route.path || req.path || req.originalUrl`. В Express/Nest `req.route.path` обычно содержит **только хвост** (`/bonus`, `/refund`), без префикса роутера (`/api/integrations/...`), поэтому проверки `path.includes('/api/integrations/...')` могут **вообще не срабатывать** — и `rateLimits` из конфигурации интеграции не применяются.
      - Ещё один риск: `CustomThrottlerGuard` подключён как `APP_GUARD` (глобально), поэтому он, как правило, отрабатывает **до** `IntegrationApiKeyGuard`.
        - В этот момент `req.integrationId`/`req.integrationRateLimits` ещё не выставлены → per‑integration лимиты/трекер по `integrationId` не применяются.
        - `getTracker()` для интеграций тогда деградирует до ключа `ip|path` (т.к. ожидает `body.merchantId/outletId/staffId` в camelCase, а REST‑интеграции используют `snake_case`) → возможны коллизии лимитов между разными интеграциями/мерчантами при одинаковом IP.
    - В `IntegrationsLoyaltyController` есть `GET /api/integrations/outlets|devices|operations`, которых нет в `REST-API-DOCS.md` и `availableEndpoints` (при этом `/outlets` отдаёт список сотрудников/логины/емейлы).
  - **Где**:
    - `api/src/portal/services/rest-api-integration.service.ts` (`buildEndpoints`)
    - `api/src/guards/custom-throttler.guard.ts` (mapping путей)
    - `api/src/integrations/integrations-loyalty.controller.ts` (реальные маршруты)
    - `REST-API-DOCS.md`
  - **Что сделать (просто)**:
    - выбрать один канон URL (сейчас фактический: `/calculate/action`, `/calculate/bonus`) и синхронизировать `availableEndpoints` + mapping rate limits;
    - удалить/задокументировать `client/migrate` и “скрытые” `outlets/devices/operations` (или хотя бы явно пометить как internal + минимизировать выдаваемые поля).

- **[SEC][Metrics] `/metrics` публичный, если `METRICS_TOKEN` не задан**
  - **Риск**: утечка внутренних метрик (структура эндпоинтов/ошибки/версия/нагрузка) — облегчает атаки и разведку; иногда в метриках случайно оказываются чувствительные лейблы.
  - **Причина**: `MetricsController` проверяет токен только если он непустой (`if (token) { ... }`).
  - **Где**: `api/src/metrics.controller.ts`.
  - **Что сделать**: в production требовать `METRICS_TOKEN` (fail-fast) или закрыть `/metrics` на уровне сети/Traefik (и не держать “публичный” режим).

- **[Idempotency] `Idempotency-Key` не привязан к payload**
  - **Риск**: при повторном использовании одного ключа с другим телом запроса API вернёт старый ответ “молча”, что усложняет расследования и может маскировать ошибки интеграций.
  - **Что сделать**: хранить вместе с ответом хэш/слепок входных параметров (path + body + merchantId) и при несовпадении возвращать 409.

- **[OUTBOX] При отсутствии webhook‑настроек события ретраятся и уходят в `DEAD`, но не “аккуратно пропускаются”**
  - **Риск**: лишний шум в метриках/алертах + накопление “мёртвых” событий.
  - **Что сделать**: если `webhookUrl/webhookSecret` не настроены — помечать событие как `SENT` (или отдельный `SKIPPED`) сразу/после 1 попытки, и очищать по retention.

- **[Legacy] Два параллельных механизма интеграций/авторизации вокруг `Bridge signature`**
  - **Наблюдение**: в проекте одновременно присутствуют:
    - `X-Bridge-Signature` на `POST /loyalty/*` (через `CashierGuard`/`merchantSettings.requireBridgeSig`)
    - `X-Staff-Key` как отдельный путь авторизации кассовых операций (и как зависимость `bridge/` в некоторых сценариях)
    - отдельный “новый” REST API интеграций `POST /api/integrations/*` с `X-Api-Key` (и опциональной подписью)
  - **Риск**: расширение поверхности атаки и путаница в enforcement (часть проверок “best-effort”, часть глушит ошибки).
  - **Решение (без overengineering, под вашу аудиторию 50–100 SMB)**:
    - в проде оставить один интеграционный контур: `POST /api/integrations/*` + `X-Api-Key` (и при необходимости — обязательная подпись/allowlist IP);
    - `X-Staff-Key` и `X-Bridge-Signature` для `/loyalty/*` считать legacy: закрыть/удалить из прод‑контура (либо оставить только для `cashier_session` и UI кассы);
    - `bridge/` не деплоить как часть прод‑стека (вынести как отдельный optional‑инструмент/legacy, иначе он резко увеличивает поверхность атаки).

- **[INFRA][K8s] Манифесты в `infra/k8s/` не согласованы с текущими Dockerfile/ENV и содержат ошибки (если использовать — деплой не взлетит)**
  - **Риск**: при попытке деплоя в Kubernetes сервисы не стартуют/не работают (особенно UI), “тихие” ошибки из‑за неверных ENV.
  - **Причины (примеры)**:
    - В `configmap-*-*.yaml` используются переменные `NEXT_PUBLIC_API_BASE_URL`, тогда как фронты ожидают `NEXT_PUBLIC_API_BASE`.
    - `configmap-admin.yaml` не задаёт `API_BASE`, который обязателен для прокси‑эндпоинтов админки.
    - `secret-api.example.yaml`: `DATABASE_URL` задан как `postgresql://...:$(DB_PASSWORD)...` — Kubernetes не подставляет переменные внутри значений Secret/ConfigMap.
  - **Где**: `infra/k8s/configmap-*.yaml`, `infra/k8s/secret-api.example.yaml`.
  - **Что сделать**: либо актуализировать k8s‑манифесты под реальные переменные/порты, либо удалить/перенести в отдельный `legacy/` чтобы не вводить в заблуждение.

## P3 — Low (улучшения/гигиена)

- **[UI][Stub] В merchant-portal есть страницы-заглушки**
  - **Проявления**: `merchant-portal/app/wallet/page.tsx` (“Раздел-заглушка”).
  - **Риск**: пользователи видят функционал, которого нет/не работает → недоверие и нагрузка на поддержку.
  - **Что сделать**: либо реализовать, либо убрать из меню/роутинга до готовности.

- **[LEGACY][Admin UI] Лишние/неиспользуемые роли и переменные окружения в админке**
  - **Наблюдение**: в `docker-compose.production.yml` и `admin/.env.local` есть `ADMIN_UI_MANAGER_PASSWORD`, а в коде `admin/app/api/auth/login/route.ts` роль фактически одна (`ADMIN`).
  - **Что сделать**: удалить/почистить неиспользуемые роли/ENV, чтобы не вводить в заблуждение при деплое и ротации паролей.

## Карта проекта (что где находится)

- **`api/`** — NestJS API (основная бизнес‑логика, Prisma/PostgreSQL)
  - Entry: `api/src/main.ts`, DI/root: `api/src/app.module.ts`
  - Ключевой контур лояльности: `api/src/loyalty/*` (`quote/commit/refund`, QR, holds, wallets, earn lots, ledger)
  - Админ‑API мерчанта: `api/src/merchants/*` (настройки, staff/outlets, outbox monitor)
  - Портал мерчанта: `api/src/portal/*` (PortalGuard, управление настройками/CRM/каталогом)
  - Интеграции: `api/src/integrations/*` (`IntegrationApiKeyGuard`)
  - БД: `api/prisma/schema.prisma`
  - Воркеры (запускаются в режиме `WORKERS_ENABLED=1`, часто вместе с `NO_HTTP=1`):
    - `api/src/outbox-dispatcher.worker.ts` — доставка вебхуков
    - `api/src/notification-dispatcher.worker.ts` — доставка `notify.*`
    - `api/src/idempotency-gc.worker.ts` — GC идемпотентности
    - прочие воркеры: TTL/burn/earn‑activation и т.д.

- **`admin/`** — Next.js админка (управление мерчантами/мониторинг), проксирование в API через `X-Admin-Key`.

- **`merchant-portal/`** — Next.js портал мерчанта (работает через `PortalGuard`).

- **`cashier/`** — Next.js кассовый интерфейс (работает через `cashier_session`).

- **`miniapp/`** — Telegram mini‑app.

- **`infra/` + compose файлы** — деплой/Traefik/Prometheus/Grafana/бэкапы.
