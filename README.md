# Loyalty Program — Monorepo

Этот репозиторий содержит:

- `api` — сервер (NestJS + Prisma/PostgreSQL)
- `admin` — панель администратора/настройки (Next.js)
- 'merchant-portal' - панель управления мерчантов
- `cashier` — виртуальный терминал кассира (Next.js)
- `miniapp` — Telegram мини‑аппа клиента (Next.js)
- `infra` — Docker Compose для БД

> Внешние платёжные провайдеры (YooKassa/CloudPayments/Тинькофф) и кассовые интеграции (АТОЛ/Эвотор/Poster/МодульКасса/1С) удалены: подписки ведутся без сторонних оплат, кассовые вебхуки не используются.

## Быстрый старт (локально)

1) База данных
- Установите Docker Desktop
- Запустите PostgreSQL: `docker compose -f infra/docker-compose.yml up -d`

2) API (сервер)
- Перейдите в `api`
- Скопируйте `.env` (пример):
  - `DATABASE_URL=postgresql://loyalty:loyalty@localhost:5432/loyalty`
  - `ADMIN_KEY=admin123` (для админки)
  - `QR_JWT_SECRET=dev_change_me`
  - `PORTAL_JWT_SECRET=change_me_portal`
  - `PORTAL_REFRESH_SECRET=change_me_portal_refresh`
  - при наличии бота: `TELEGRAM_BOT_TOKEN=12345:ABC...`
- Установите зависимости: `pnpm i`
- Примените миграции: `pnpm prisma migrate dev`
- (опционально) Минимальный сид: `pnpm seed` (только системный план, без демо)
- Запустите: `pnpm start:dev` (http://localhost:3000)

3) Admin (панель)
- Перейдите в `admin`
- Создайте `.env.local` (пример):
  - `API_BASE=http://localhost:3000` (серверная переменная для прокси)
  - `ADMIN_KEY=admin123` (серверно, прокидывается в `x-admin-key` при прокси)
  - `ADMIN_SESSION_SECRET=change_me_admin_ui_cookie_secret`
  - `ADMIN_UI_PASSWORD=admin_password`
  - (опц.) `NEXT_PUBLIC_MERCHANT_ID=<merchant_id>` (лишь для дефолта в UI)
- `pnpm i` → `pnpm dev` (http://localhost:3001)

4) Cashier (виртуальный терминал)
- Перейдите в `cashier`
- Создайте `.env.local` (пример):
  - `NEXT_PUBLIC_API_BASE=http://localhost:3000`
  - `NEXT_PUBLIC_MERCHANT_ID=<merchant_id>`
- `pnpm i` → `pnpm dev` (http://localhost:3002)

5) Miniapp (Telegram мини‑аппа)
- Перейдите в `miniapp`
- `.env.local` (пример):
  - `NEXT_PUBLIC_API_BASE=http://localhost:3000`
  - `NEXT_PUBLIC_MERCHANT_ID=<merchant_id>`
  - `NEXT_PUBLIC_QR_TTL=60`
- `pnpm i` → `pnpm dev` (http://localhost:3003)

### Торговые точки

- Переключение точки (ACTIVE/INACTIVE): `PUT /merchants/:id/outlets/:outletId/status`.
- API работает с устройствами `Device`, привязанными к `Outlet`: идентификатор устройства передаётся в операции и антифрод, наряду с `outletId`.

## Проверка E2E (понятно и по шагам)

A. Создание мерчанта и базовых данных
- Откройте admin: http://localhost:3001
- Создайте мерчанта и задайте portal email/пароль
- Выдайте подписку (plan `full`)
- В портале создайте торговую точку и сотрудника с PIN (для кассира)
- Если используете cashier/miniapp, пропишите `NEXT_PUBLIC_MERCHANT_ID` в их `.env.local`

B. Генерация QR клиентом (мини‑аппа)
- Откройте miniapp: http://localhost:3003
- Нажмите «Показать QR для оплаты» — отобразится QR
- Если используете Telegram, установите переменную `TELEGRAM_BOT_TOKEN` в API и откройте мини‑аппу внутри Telegram — авторизация произойдёт автоматически
 - В продакшне `/loyalty/qr` доступен только с валидным Telegram `initData` (серверная проверка подписи).

C. Продажа через виртуальный терминал кассира
- Откройте cashier: http://localhost:3002
- В портале выпустите код активации устройства (раздел «Касса») и используйте его для активации
- Введите логин мерчанта и 9‑значный код активации (после первого ввода они сохраняются в куках браузера)
- Укажите PIN сотрудника. При необходимости отметьте чекбокс «Сохранить PIN», чтобы автоподставлять его при следующем входе
- После успешного входа откроется рабочее место кассира. Нажмите «Сканировать QR», наведите камеру на экран мини‑аппы
- После сканирования автоматически выполнится QUOTE (расчёт)
- Нажмите «Оплачено (COMMIT)» — операция зафиксируется
- В случае сетевой ошибки попробуйте повторно (идемпотентность не даст задвоить)
- По желанию укажите «Номер чека» — он появится в истории и пригодится для ручного возврата (вместо публичных orderId). Если поле оставить пустым, чек останется без номера.
- Для завершения смены используйте кнопку «Выйти из сессии» — HTTP-only кука `cashier_session` будет очищена, и кассир снова увидит экран авторизации PIN

D. Проверка результатов
- В admin откройте «Txns» и «Receipts» — увидите операции и чеки
- В miniapp нажмите «Обновить» баланс и посмотрите «Историю операций»
- В admin «Outbox» увидите события на вебхуки и их доставку
- Метрики: http://localhost:3000/metrics (и admin → Metrics)
- Для возврата в кассире сначала загрузите историю клиента: после этого поле «Refund» подставит orderId по номеру чека и отправит на API реальный идентификатор без ввода вручную.

## Полезные ссылки
- Варианты интеграции: admin → Docs → Integration

## PortalAuth (Merchant Portal)

Аутентификация мерчанта и сотрудников Merchant Portal основана на JWT, подписанном секретом `PORTAL_JWT_SECRET`.

- Эндпоинты API:
  - `POST /portal/auth/login` — вход по email+паролю. Для мерчантов при активном TOTP требуется доп. поле `code`. Сотрудники используют тот же эндпоинт (TOTP не запрашивается).
  - `GET /portal/auth/me` — проверка токена; ответ содержит `{ merchantId, role, actor, staffId, adminImpersonation }`.
- Имперсонация из админки:
  - `POST /merchants/:id/portal/impersonate` — выдаёт портальный токен от имени мерчанта (требуется заголовок `X-Admin-Key`).
- Сессия хранится в httpOnly‑cookie `portal_jwt` (устанавливается фронтом после успешного логина).
- Переменные окружения:
  - `PORTAL_JWT_SECRET` — обязательный секрет для подписи/проверки токенов портала.
  - `PORTAL_REFRESH_SECRET` — обязательный секрет для refresh‑токенов портала.

Особенности:

- Для сотрудников проверяются статус (`ACTIVE`), флаги `portalAccessEnabled`/`canAccessPortal` и пароль. Их права формируются из групп доступа (раздел «Права доступа» портала) и проксируются в `/portal/me` (`permissions`), чтобы фронтенд скрывал недоступные разделы.
- При включённом TOTP у мерчанта фронтенд автоматически запрашивает одноразовый код после ввода логина/пароля.
- В продакшне используйте длинный и регулярно ротируемый `PORTAL_JWT_SECRET`.

### Merchant Portal — Аналитика

- Добавлены разделы «Сводный отчёт», «По времени», «Портрет клиента», «Повторные продажи», «Динамика», «RFM-анализ», «Активность торговых точек», «Активность сотрудников» и «Реферальная программа».
- Каждый раздел поддерживает заявленные ТЗ фильтры (периоды, торговые точки, аудитории, группировки) и обновлённые визуализации (линейные/столбчатые графики, тепловые карты, таблицы).
- «RFM-анализ» содержит справку, интерактивные таблицы и модалку настройки границ сегментов: данные читаются из `CustomerStats`, настройки сохраняются через `/portal/analytics/rfm`, а для Frequency/Money есть автоподбор порогов по живым данным.
- Баллы R/F/M идут по убыванию: `5` — самые активные/лояльные клиенты, `1` — «остывшие» или потерянные.
- В аудиториях портала доступны фильтры по RFM (Давность/Частота/Деньги, группы 1–5) — значения прокидываются в `filters.rfmRecency|rfmFrequency|rfmMonetary` и применяются на сервере.
- «Повторные продажи» подключены к живому API: фильтр по периоду (неделя/месяц/квартал/год), выпадающий список торговых точек из `/portal/outlets`, гистограмма с долями клиентов и тумблер «Не показывать значения меньше …%» (по умолчанию 3%).
- «Активность торговых точек» и «Активность сотрудников» используют реальные данные: произвольный период (дефолт 30 дней), таблицы без моков, строка/сноска «ИТОГО», раздельные колонки «Очки» (из кассира) и «Оценки работы» (средний рейтинг отзывов), фильтр и объединение по торговым точкам. Колонки «Новые клиенты» заполняются только теми покупателями, чья первая покупка по чеку произошла в выбранный период (данные берутся напрямую из чеков без повторного подсчёта).
- «Реферальная программа» использует тумблеры/быстрые вкладки, карточки метрик и распределения по покупкам/рефералам.

### LoyaltyPromotion — акции и коммуникации

- Сущность `LoyaltyPromotion` заменяет legacy-кампании: портал и API работают с единым CRUD `/portal/loyalty/promotions`.
- Исторические `GET /reports/export/:merchantId` отключены — используйте аналитику портала или выгрузку через API лояльности.
- Статистика применения акции формируется из записей `PromotionParticipant` (участники, начисленные баллы, ROI) и доступна в `GET /portal/loyalty/promotions/:id`.
- Уведомления (email/push/telegram) используют `promotionId`: шаблоны получают название акции, сроки и тип из `rewardType`/`rewardMetadata.kind`.
- Push-уведомления доставляются через Telegram Mini App: регистрация устройств и FCM-провайдеры убраны, `PushService` использует `sendNotification` и воркер коммуникаций.

## Наблюдаемость: метрики и алерты

Метрики доступны по `GET /metrics` (Prometheus, `text/plain; version=0.0.4`).

- Защита метрик: если задан `METRICS_TOKEN`, требуется один из заголовков:
  - `X-Metrics-Token: <token>`
  - или `Authorization: Bearer <token>`

Примеры:

```bash
# Без токена (если METRICS_TOKEN не установлен)
curl -s http://localhost:3000/metrics | head -n 20

# С токеном через заголовок
curl -s -H "X-Metrics-Token: $METRICS_TOKEN" http://localhost:3000/metrics | head -n 20

# С токеном через Bearer
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics | head -n 20
```

5xx алерты (опционально) отправляются в Telegram с сэмплингом:

- Переменные окружения API (`api/.env`):
  - `ALERT_TELEGRAM_BOT_TOKEN`
  - `ALERT_TELEGRAM_CHAT_ID`
  - `ALERTS_5XX_SAMPLE_RATE` — число от `0.0` до `1.0` (например, `0.05` для 5% семплинга)
- Пороги фонового мониторинга: `ALERT_OUTBOX_PENDING_THRESHOLD`, `ALERT_OUTBOX_DEAD_THRESHOLD`, `ALERT_WORKER_STALE_MINUTES`, интервал проверок — `ALERT_MONITOR_INTERVAL_MS` (дефолт 60s), подавление повторов — `ALERT_REPEAT_MINUTES` (дефолт 30m).
- В админке раздел `/observability`: статус бота, последние инциденты, стейт воркеров и основные показатели очередей/ошибок. Есть кнопка «Отправить тест».
- Рекомендуемый стек для 50–100 мерчантов: Prometheus + Grafana; Telegram-бот для живых инцидентов; Sentry — только на проде; OpenTelemetry отключён по умолчанию, включать точечно при отладке.

Если токен/чат не заданы или сэмплинг `0`, алерты не отправляются. Тексты включают: статус, метод, маршрут, `requestId`/`traceId` и усечённое сообщение ошибки.

Замечания:

- В dev используйте небольшие сэмплы (`0.01–0.1`), чтобы не шуметь.
- Секреты не коммитьте — храните в локальных `.env`.
- В Admin есть страница «Metrics» для быстрых проверок и раздел «Наблюдаемость» для алертов.

## Фичефлаги и воркеры

Воркеры управляются переключателем `WORKERS_ENABLED` (по умолчанию `0` в прод‑примере и `1` в локальном примере). Для отдельных сценариев включаются фичефлаги:

- `EARN_LOTS_FEATURE=1` — ведение лотов начислений баллов (FIFO потребление, LIFO unconsume/revoke); события `loyalty.earnlot.*` в `eventOutbox`.
- `POINTS_TTL_FEATURE=1` — периодическое превью истекающих баллов (`loyalty.points_ttl.preview`).
- `POINTS_TTL_BURN=1` — периодическое сжигание истекших баллов на основе лотов (`loyalty.points_ttl.burned`).
- `POINTS_TTL_REMINDER=1` — push-напоминания через Telegram Mini App по настройке `rulesJson.burnReminder`.

Полезные интервалы/настройки (значения по умолчанию заданы в `.env.example`):

- `EARN_ACTIVATION_INTERVAL_MS` и `EARN_ACTIVATION_BATCH` — активация отложенных начислений (модуляция PENDING→ACTIVE лотов).
- `OUTBOX_WORKER_INTERVAL_MS`, `OUTBOX_WORKER_CONCURRENCY`, `OUTBOX_MAX_RETRIES`, `OUTBOX_RPS_DEFAULT`, `OUTBOX_RPS_BY_MERCHANT` — доставка вебхуков из `eventOutbox`.
- `HOLD_GC_INTERVAL_MS` — сборщик просроченных hold’ов.
- `POINTS_TTL_REMINDER_INTERVAL_MS` — частота запуска напоминаний о сгорании (по умолчанию 6 часов).

Пример локального запуска с включёнными лотами и превью TTL:

```bash
# api/.env
WORKERS_ENABLED=1
EARN_LOTS_FEATURE=1
POINTS_TTL_FEATURE=1
POINTS_TTL_BURN=0
POINTS_TTL_REMINDER=1
```

Проверка статуса: `GET /healthz` возвращает `flags` и `workers` (alive/lastTickAt для некоторых воркеров).

## Уровни (Levels)

Уровни управляются только через портал (модель `LoyaltyTier`). Настройки из `rulesJson.levelsCfg/levelBenefits` больше не используются.

- Эндпоинт: `GET /levels/:merchantId/:customerId` — возвращает текущий уровень, прогресс и следующий порог. Расчёт идёт по сумме чеков за 365 дней (`metric=earn`).
- Каталог уровней для миниаппы:`GET /loyalty/mechanics/levels/:merchantId` — отдает видимые (`isHidden=false`) уровни с порогами/ставками.
- Если уровней нет, при первом обращении создаётся базовый `Base` (`earnRateBps=300`, `redeemRateBps=5000`, `minPaymentAmount=0`, `isInitial=true`).
- Автоповышение: после `commit` считается прогресс за окно 365 дней по сумме чеков и выбирается максимальный видимый tier с `thresholdAmount <= progress`. Скрытые уровни не участвуют в авто‑повышении.
- Возвраты/отмены: полный возврат помечает чек отменённым, частичный учитывается через `TxnType.REFUND.share`, прогресс уровня уменьшается и при необходимости происходит понижение tier.
- Пример ответа `/levels/...`:

```json
{
  "merchantId": "M1",
  "customerId": "C1",
  "metric": "earn",
  "periodDays": 365,
  "value": 600,
  "current": { "name": "Silver", "threshold": 500, "earnRateBps": 700, "redeemRateBps": 5000, "minPaymentAmount": 0 },
  "next": { "name": "Gold", "threshold": 1000, "earnRateBps": 900 },
  "progressToNext": 400
}
```

### Quickstart: Levels + TTL

1) Включите воркеры/флаги в `api/.env` (или экспортируйте в shell):

```bash
WORKERS_ENABLED=1
EARN_LOTS_FEATURE=1
POINTS_TTL_FEATURE=1
POINTS_TTL_BURN=1
POINTS_TTL_REMINDER=1
```

2) Настройте уровни/бонусы в Admin → «Настройки мерчанта»:

- Уровни и бонусы настраиваются только на страницах портала (`/loyalty/mechanics/levels`); legacy поля `levelsCfg/levelBenefits` не используются.
- Страница «Levels» позволяет ввести `customerId`, автозагрузить уровень и увидеть прогресс‑бар.

3) Превью эффективных ставок:

- На странице «Настройки мерчанта» есть блок «Превью эффективных ставок (правила + бонус уровня)» — введите `CustomerId` и нажмите «Посчитать».
- На странице «Levels» можно посчитать те же ставки для текущего уровня клиента.

4) Проверка TTL/воркеров:

- Превью/сжигание баллов выполняют воркеры с указанными флагами. Метрики доступны на `GET /metrics`.
- Полезные автотесты: `ttl.flow.e2e-spec.ts`, `ttl.fifo.e2e-spec.ts`, `levels.ttl.interplay.e2e-spec.ts`.

## Промокоды (Promo Codes)

Промокоды позволяют начислять дополнительные баллы, ускорять сгорание и повышать уровень клиента. Настройки доступны в портале мерчанта (`/promocodes`).

- Эндпоинты портала:
  - `GET /portal/promocodes?status=ACTIVE|ARCHIVE` — список последних промокодов с метриками.
  - `POST /portal/promocodes/issue` — создание промокода. Тело соответствует `PortalPromoCodePayload` (код, описание, баллы, TTL, ограничения, период действия и т.д.; `usageLimitValue` задаёт, сколько клиентов могут применить код при `usageLimit=once_total`; `levelExpireDays` задаёт срок действия присвоенного уровня, 0 — бессрочно). Возвращает `{ ok: true, promoCodeId }`.
  - `POST /portal/promocodes/deactivate` — `{ promoCodeId }` переводит промокод в архив (паузит использование).
  - `POST /portal/promocodes/activate` — `{ promoCodeId }` повторно активирует промокод.
  - `PUT /portal/promocodes/:promoCodeId` — обновляет настройки существующего промокода.
- `POST /loyalty/promocodes/apply` — активация промокода клиентом (мини-аппа); возвращает начисленные баллы, срок действия бонуса и новый баланс.`

## Лимиты списаний/начислений (cap’ы)

- REDEEM per‑order cap: лимит на заказ рассчитывается как `floor(eligible' * (redeemBps_base + levelBonus) / 10000)`. Повторный `quote` по тому же `orderId` учитывает уже применённое списание `receipt.redeemApplied` (остаток не может быть отрицательным). После `commit` следующий `quote` по тому же заказу вернёт остаток или `0`.
- REDEEM daily cap: при заданном `redeemDailyCap` применяется остаток за последние 24 часа `dailyRedeemLeft = max(0, redeemDailyCap - sum(|REDEEM| за 24h))`. Итоговое списание: `min(wallet.balance, perOrderCap, dailyRedeemLeft)`.
- EARN daily cap: при заданном `earnDailyCap` начисление ограничивается остатком `dailyEarnLeft = max(0, earnDailyCap - sum(EARN за 24h))`. Итоговые баллы: `min(pointsByBps, dailyEarnLeft)`.

Подробности и числовые примеры — в `API_DOCUMENTATION.md` (раздел «Порядок применения» и примечания к REDEEM/EARN).

## Уведомления (Notifications)

Волна 3 добавляет заготовку рассылок:

- Админка: `admin/app/notifications` — форма для широковещательной рассылки по каналу `ALL/EMAIL/PUSH`, есть `dry-run`.
- API: `POST /notifications/broadcast` и `POST /notifications/test` (защищено `AdminGuard`/`AdminIpGuard`).
- Воркер: `NotificationDispatcherWorker` читает события `notify.*` из `EventOutbox` и отправляет через существующие сервисы `EmailService`/`PushService`.

ENV подсказки:

- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
- Push: `FIREBASE_SERVICE_ACCOUNT` — JSON service account (строкой).
- Воркер: `WORKERS_ENABLED=1`, опционально `NOTIFY_WORKER_INTERVAL_MS`, `NOTIFY_WORKER_BATCH`.
  - Троттлинг RPS: `NOTIFY_RPS_DEFAULT` (по умолчанию на мерчанта; `0` — без ограничений), `NOTIFY_RPS_BY_MERCHANT` (`M-1=5,M-2=3`).

Метрики уведомлений:

- `notifications_enqueued_total{type}` — количество поставленных в outbox задач (`broadcast`/`test`).
- `notifications_processed_total{type,result}` — обработанные воркером события (`broadcast`/`test` + `sent`/`dry`/`retry`/`dead`/`throttled`).
- `notifications_channel_attempts_total{channel,merchantId}` — попытки отправки по каналам (`EMAIL`/`PUSH`).
- `notifications_channel_sent_total{channel,merchantId}` — успешно отправленные по каналам.
- `notifications_channel_failed_total{channel,merchantId}` — неуспешные по каналам.

## Продакшн конфигурация

- API: `DATABASE_URL`, `ADMIN_KEY`, `ADMIN_SESSION_SECRET`, `QR_JWT_SECRET` (не `dev_change_me`), `CORS_ORIGINS` обязательны; `WORKERS_ENABLED=1` в отдельном процессе.
- Admin: `API_BASE` (абсолютный URL), `ADMIN_UI_PASSWORD`, `ADMIN_SESSION_SECRET`.

## Дополнительно
- (опц.) Redis для rate limiting: поднимите `redis:7` и задайте `REDIS_URL=redis://localhost:6379` в `api` — лимиты будут распределёнными.

## Замечания
- Для защиты API используйте длинные и ротационные секреты.
- Всегда передавайте `Idempotency-Key` на commit/refund.
- Вебхуки проверяйте по `X-Loyalty-Signature` и окну времени ±5 минут.
 - (опц.) Для распределённого rate limiting можно использовать Redis (`infra/docker-compose.yml` содержит сервис),
   задайте `REDIS_URL=redis://localhost:6379` в API.

## Miniapp realtime события

- Каждая транзакция (покупка, рефанд, промокод, burn, реферальные бонусы и т.д.) триггерит триггер `loyalty_realtime_event_emit`: запись попадает в таблицу `LoyaltyRealtimeEvent` и транслируется через `pg_notify('loyalty_realtime_events', ...)`.
- API держит отдельное PG-подключение (`LoyaltyEventsService`), слушает канал и мгновенно закрывает long-poll `GET /loyalty/events/poll?merchantId=...&customerId=...`, а при недоступности канала деградирует в периодическую проверку таблицы (без потери событий).
- Клиент миниаппы подписывается один раз, долговисящий запрос держится ~25 секунд и при событии локально вызывает `loadBalance`/`loadTx({ fresh: true })`/`loadLevels`, так что история/баланс/уровень обновляются без перезагрузки экрана.
- События хранятся до тех пор, пока не будут выданы конкретному `customerId`; повторная выдача исключена — по выдаче `deliveredAt` проставляется и запись игнорируется при следующем poll.
- В-production используйте реальные API/секреты: никаких моков/Dev-путей, endpoint опирается на Postgres LISTEN/NOTIFY и общую БД (масштабирование в несколько инстансов поддерживается из коробки).

## Уведомления (Notifications)

Волна 3 добавляет заготовку рассылок:

- Админка: `admin/app/notifications` — форма для широковещательной рассылки по каналу `ALL/EMAIL/PUSH`, есть `dry-run`.
- API: `POST /notifications/broadcast` и `POST /notifications/test` (защищено `AdminGuard`/`AdminIpGuard`).
- Воркер: `NotificationDispatcherWorker` читает события `notify.*` из `EventOutbox` и отправляет через существующие сервисы `EmailService`/`PushService`.

ENV подсказки:

- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
- Push: `FIREBASE_SERVICE_ACCOUNT` — JSON service account (строкой).
- Воркер: `WORKERS_ENABLED=1`, опционально `NOTIFY_WORKER_INTERVAL_MS`, `NOTIFY_WORKER_BATCH`.
