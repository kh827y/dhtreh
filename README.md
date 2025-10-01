# Loyalty Program — Monorepo

Этот репозиторий содержит:

- `api` — сервер (NestJS + Prisma/PostgreSQL)
- `admin` — панель администратора/настройки (Next.js)
- 'merchant-portal' - панель управления мерчантов
- `cashier` — виртуальный терминал кассира (Next.js)
- `miniapp` — Telegram мини‑аппа клиента (Next.js)
- `bridge` — локальный POS Bridge для касс/ПО
- `infra` — Docker Compose для БД

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
  - при наличии бота: `TELEGRAM_BOT_TOKEN=12345:ABC...`
- Установите зависимости: `pnpm i`
- Примените миграции: `pnpm prisma migrate dev`
- Заполните демо-данные: `pnpm seed` (выведет Staff Key и demo customer)
- Запустите: `pnpm start:dev` (http://localhost:3000)

3) Admin (панель)
- Перейдите в `admin`
- Создайте `.env.local` (пример):
  - `API_BASE=http://localhost:3000` (серверная переменная для прокси)
  - `ADMIN_KEY=admin123` (серверно, прокидывается в `x-admin-key` при прокси)
  - `ADMIN_SESSION_SECRET=change_me_admin_ui_cookie_secret`
  - `ADMIN_UI_ADMIN_PASSWORD=admin_password`
  - (опц.) `ADMIN_UI_MANAGER_PASSWORD=manager_password`
  - (опц.) `NEXT_PUBLIC_MERCHANT_ID=M-1` (лишь для дефолта в UI)
- `pnpm i` → `pnpm dev` (http://localhost:3001)

4) Cashier (виртуальный терминал)
- Перейдите в `cashier`
- Создайте `.env.local` (пример):
  - `NEXT_PUBLIC_API_BASE=http://localhost:3000`
  - `NEXT_PUBLIC_MERCHANT_ID=M-1`
- `pnpm i` → `pnpm dev` (http://localhost:3002)

5) Miniapp (Telegram мини‑аппа)
- Перейдите в `miniapp`
- `.env.local` (пример):
  - `NEXT_PUBLIC_API_BASE=http://localhost:3000`
  - `NEXT_PUBLIC_MERCHANT_ID=M-1`
  - `NEXT_PUBLIC_QR_TTL=60`
- `pnpm i` → `pnpm dev` (http://localhost:3003)

6) POS Bridge (по желанию)
- Перейдите в `bridge`
- Env (пример):
  - `API_BASE=http://localhost:3000`
  - `MERCHANT_ID=M-1`
  - `BRIDGE_PORT=18080`
  - (опц.) `STAFF_KEY=...`, `BRIDGE_SECRET=...`, `OUTLET_ID=...`
  - В проде: `BRIDGE_SECRET` обязателен (Bridge завершит работу при старте, если не задан)
- `pnpm i` → `pnpm start` (http://127.0.0.1:18080)

### Торговые точки: агрегированные POS‑поля

- `Outlet.posType` — тип устройства, которое последнее выходило на связь (`lastSeenAt`). Если все устройства молчат, берём запись с максимальным `createdAt`.
- `Outlet.posLastSeenAt` — дата/время последнего события от выбранного устройства; при отсутствии `lastSeenAt` используем `createdAt`.
- `Outlet.bridgeSecret` — первый ненулевой `bridgeSecret` среди устройств точки (по тому же порядку сортировки).
- `Outlet.bridgeSecretNext` — резерв для ротации секрета мостика (заполняется приложениями).
- `Outlet.bridgeSecretUpdatedAt` — когда `bridgeSecret` был синхронизирован из устройств (миграции и будущий воркер обновляют поле).

API управления секретами/статусами точек:

- Выдача/ревокация секрета: `POST /merchants/:id/outlets/:outletId/bridge-secret` и `DELETE .../bridge-secret`.
- Ротация next-секрета: `POST /merchants/:id/outlets/:outletId/bridge-secret/next` / `DELETE .../bridge-secret/next`.
- Обновление POS-статуса: `PUT /merchants/:id/outlets/:outletId/pos` (поля `posType`, `posLastSeenAt`).
- Переключение точки (ACTIVE/INACTIVE): `PUT /merchants/:id/outlets/:outletId/status`.

> POS Bridge теперь опирается только на `outletId` + `bridgeSecret`: таблица `Device` удалена, а `deviceId` больше не хранится в моделях.
> DTO и SDK сотрудников очищены от `allowedDeviceId`: ограничения задаются только через `allowedOutletId`, все публичные схемы и Postman обновлены.

> Миграция `20251201090000_remove_device_table` добирает остаточные `bridgeSecret`/`lastSeen`, переносит ограничения сотрудников на точки и удаляет все поля `deviceId`. Ранее миграция `20251025120000_device_pos_fields` перенесла первичные данные из `Device` в `Outlet`.

## Проверка E2E (понятно и по шагам)

A. Настройка мерчанта
- Откройте admin: http://localhost:3001
- Введите ключ (если требуется) и дождитесь загрузки «Настройки мерчанта»
- При необходимости включите:
  - «Require Staff Key» — чтобы кассир проходил по токену сотрудника
  - «Require Bridge Signature» — чтобы API принимал только запросы с подписью Bridge
- Сохраните настройки кнопкой «Сохранить»

B. Создание сотрудника и выдача Staff Key (если включили «Require Staff Key»)
- В admin перейдите на вкладку «Staff»
- Нажмите «Добавить» (минимум — роль CASHIER)
- Для сотрудника нажмите «Выдать токен» и СКОПИРУЙТЕ значение (показывается один раз)

C. Генерация QR клиентом (мини‑аппа)
- Откройте miniapp: http://localhost:3003
- Нажмите «Показать QR для оплаты» — отобразится QR
- Если используете Telegram, установите переменную `TELEGRAM_BOT_TOKEN` в API и откройте мини‑аппу внутри Telegram — авторизация произойдёт автоматически
 - В продакшне `/loyalty/qr` доступен только с валидным Telegram `initData` (серверная проверка подписи) или при включённом `Require Staff Key` — с заголовком `X-Staff-Key`.

D. Продажа через виртуальный терминал кассира
- Откройте cashier: http://localhost:3002
- Вставьте Staff Key (если включено «Require Staff Key»)
- Нажмите «Сканировать QR», наведите камеру на экран мини‑аппы
- После сканирования автоматически выполнится QUOTE (расчёт)
- Нажмите «Оплачено (COMMIT)» — операция зафиксируется
- В случае сетевой ошибки попробуйте повторно (идемпотентность не даст задвоить)

E. Проверка результатов
- В admin откройте «Txns» и «Receipts» — увидите операции и чеки
- В miniapp нажмите «Обновить» баланс и посмотрите «Историю операций»
- В admin «Outbox» увидите события на вебхуки и их доставку
- Метрики: http://localhost:3000/metrics (и admin → Metrics)

## Полезные ссылки
- Документация по подписи: admin → Docs → Signature
- POS Bridge: admin → Docs → Bridge
- Варианты интеграции: admin → Docs → Integration

## PortalAuth (Merchant Portal)

Аутентификация мерчанта для Merchant Portal использует JWT, подписанный секретом `PORTAL_JWT_SECRET`.

- Эндпоинты API:
  - `POST /portal/auth/login` — вход по email+пароль (+опц. `code` TOTP).
  - `GET /portal/auth/me` — проверить токен, вернуть `{ merchantId, role }`.
- Имперсонация из админки:
  - `POST /merchants/:id/portal/impersonate` — выдаёт портальный токен от имени мерчанта (требуется заголовок `X-Admin-Key`).
- Переменные окружения:
  - `PORTAL_JWT_SECRET` — обязательный секрет для подписи/проверки токенов портала.

Примечания:

- При включённом TOTP у мерчанта логин требует поле `code` с текущим одноразовым паролем.
- В продакшне используйте длинный, ротационный `PORTAL_JWT_SECRET`.

### Merchant Portal — Аналитика

- Добавлены разделы «Сводный отчёт», «По времени», «Портрет клиента», «Повторные продажи», «Динамика», «RFM-анализ», «Активность торговых точек», «Активность сотрудников» и «Реферальная программа».
- Каждый раздел поддерживает заявленные ТЗ фильтры (периоды, торговые точки, аудитории, группировки) и обновлённые визуализации (линейные/столбчатые графики, тепловые карты, таблицы).
- «RFM-анализ» содержит справку, интерактивные таблицы и модалку настройки границ сегментов.
- «Повторные продажи» и «Реферальная программа» используют тумблеры/быстрые вкладки, карточки метрик и распределения по покупкам/рефералам.

### LoyaltyPromotion — акции и коммуникации

- Сущность `LoyaltyPromotion` заменяет legacy-кампании: портал и API работают с единым CRUD `/portal/loyalty/promotions`.
- Исторические `GET /reports/export/:merchantId` отключены — используйте аналитику портала или выгрузку через API лояльности.
- Статистика применения акции формируется из записей `PromotionParticipant` (участники, начисленные баллы, ROI) и доступна в `GET /portal/loyalty/promotions/:id`.
- Уведомления (email/push/telegram) используют `promotionId`: шаблоны получают название акции, сроки и тип из `metadata.legacyCampaign`.

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

Если токен/чат не заданы или сэмплинг `0`, алерты не отправляются. Тексты включают: статус, метод, маршрут, `requestId` и усечённое сообщение ошибки.

Замечания:

- В dev используйте небольшие сэмплы (`0.01–0.1`), чтобы не шуметь.
- Секреты не коммитьте — храните в локальных `.env`.
- В Admin есть страница «Metrics» для быстрых проверок.

## Фичефлаги и воркеры

Воркеры управляются переключателем `WORKERS_ENABLED` (по умолчанию `0` в прод‑примере и `1` в локальном примере). Для отдельных сценариев включаются фичефлаги:

- `EARN_LOTS_FEATURE=1` — ведение лотов начислений баллов (FIFO потребление, LIFO unconsume/revoke); события `loyalty.earnlot.*` в `eventOutbox`.
- `POINTS_TTL_FEATURE=1` — периодическое превью истекающих баллов (`loyalty.points_ttl.preview`).
- `POINTS_TTL_BURN=1` — периодическое сжигание истекших баллов на основе лотов (`loyalty.points_ttl.burned`).
- `TTL_BURN_ENABLED=1` — альтернативный воркер сжигания (совместимость, если используется).

Полезные интервалы/настройки (значения по умолчанию заданы в `.env.example`):

- `EARN_ACTIVATION_INTERVAL_MS` и `EARN_ACTIVATION_BATCH` — активация отложенных начислений (модуляция PENDING→ACTIVE лотов).
- `OUTBOX_WORKER_INTERVAL_MS`, `OUTBOX_WORKER_CONCURRENCY`, `OUTBOX_MAX_RETRIES`, `OUTBOX_RPS_DEFAULT`, `OUTBOX_RPS_BY_MERCHANT` — доставка вебхуков из `eventOutbox`.
- `HOLD_GC_INTERVAL_MS` — сборщик просроченных hold’ов.
- `TTL_BURN_INTERVAL_MS` — частота сжигания TTL.

Пример локального запуска с включёнными лотами и превью TTL:

```bash
# api/.env
WORKERS_ENABLED=1
EARN_LOTS_FEATURE=1
POINTS_TTL_FEATURE=1
POINTS_TTL_BURN=0
```

Проверка статуса: `GET /healthz` возвращает `flags` и `workers` (alive/lastTickAt для некоторых воркеров).

## Уровни (Levels)

Сервис уровней рассчитывает текущий уровень клиента за период и прогресс до следующего уровня.

- Эндпоинт: `GET /levels/:merchantId/:customerId`
- Настройка в `merchantSettings.rulesJson.levelsCfg`:

```json
{
  "levelsCfg": {
    "periodDays": 365,
    "metric": "earn",
    "levels": [
      { "name": "Base",   "threshold": 0 },
      { "name": "Silver", "threshold": 500 },
      { "name": "Gold",   "threshold": 1000 }
    ]
  }
}
```

- Поддерживаемые метрики: `earn` (сумма начислений), `redeem` (сумма списаний), `transactions` (кол-во операций) за последние `periodDays`.
- Ответ:

```json
{
  "merchantId": "M1",
  "customerId": "C1",
  "metric": "earn",
  "periodDays": 365,
  "value": 600,
  "current": { "name": "Silver", "threshold": 500 },
  "next": { "name": "Gold", "threshold": 1000 },
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
```

2) Настройте уровни/бонусы в Admin → «Настройки мерчанта»:

- Заполните `levelsCfg` и `levelBenefits` (см. пример выше) и сохраните.
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
  - `POST /portal/promocodes/issue` — создание промокода. Тело соответствует `PortalPromoCodePayload` (код, описание, баллы, TTL, ограничения, период действия и т.д.). Возвращает `{ ok: true, promoCodeId }`.
  - `POST /portal/promocodes/deactivate` — `{ promoCodeId }` переводит промокод в архив (паузит использование).
  - `POST /portal/promocodes/activate` — `{ promoCodeId }` повторно активирует промокод.
  - `PUT /portal/promocodes/:promoCodeId` — обновляет настройки существующего промокода.
  - `GET /portal/loyalty/promocodes?status=ACTIVE|ARCHIVE|ALL` — список промокодов с «сырыми» полями для страницы лояльности.
  - `POST /portal/loyalty/promocodes` — создание промокода через `LoyaltyPromoCodePayload` (сегменты, уровни, лимиты, autoArchive).
  - `PUT /portal/loyalty/promocodes/:id` / `POST /portal/loyalty/promocodes/:id/status` / `POST /portal/loyalty/promocodes/bulk/status` — управление статусами/метаданными через тот же сервис `PromoCodesService`.

Промокод применяется при `POST /loyalty/quote|commit`, если передан `promoCode`.

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
- Admin: `API_BASE` (абсолютный URL), `ADMIN_UI_ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.
- Bridge: `API_BASE` (абсолютный URL), `MERCHANT_ID`, `OUTLET_ID`, `BRIDGE_SECRET`.

## Дополнительно
- (опц.) Redis для rate limiting: поднимите `redis:7` и задайте `REDIS_URL=redis://localhost:6379` в `api` — лимиты будут распределёнными.

## Замечания
- Для защиты API используйте длинные и ротационные секреты.
- Всегда передавайте `Idempotency-Key` на commit/refund.
- Вебхуки проверяйте по `X-Loyalty-Signature` и окну времени ±5 минут.
 - (опц.) Для распределённого rate limiting можно использовать Redis (`infra/docker-compose.yml` содержит сервис),
   задайте `REDIS_URL=redis://localhost:6379` в API.

## Уведомления (Notifications)

Волна 3 добавляет заготовку рассылок:

- Админка: `admin/app/notifications` — форма для широковещательной рассылки по каналу `ALL/EMAIL/PUSH`, есть `dry-run`.
- API: `POST /notifications/broadcast` и `POST /notifications/test` (защищено `AdminGuard`/`AdminIpGuard`).
- Воркер: `NotificationDispatcherWorker` читает события `notify.*` из `EventOutbox` и отправляет через существующие сервисы `EmailService`/`PushService`.

ENV подсказки:

- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
- Push: `FIREBASE_SERVICE_ACCOUNT` — JSON service account (строкой).
- Воркер: `WORKERS_ENABLED=1`, опционально `NOTIFY_WORKER_INTERVAL_MS`, `NOTIFY_WORKER_BATCH`.
