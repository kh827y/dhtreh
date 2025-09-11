# Loyalty Program — Monorepo

Этот репозиторий содержит:

- `api` — сервер (NestJS + Prisma/PostgreSQL)
- `admin` — панель администратора/настройки (Next.js)
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
  - (опц.) `STAFF_KEY=...`, `BRIDGE_SECRET=...`, `OUTLET_ID=...`, `DEVICE_ID=...`
  - В проде: `BRIDGE_SECRET` обязателен (Bridge завершит работу при старте, если не задан)
- `pnpm i` → `pnpm start` (http://127.0.0.1:18080)

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

## Продакшн конфигурация

- API: `DATABASE_URL`, `ADMIN_KEY`, `ADMIN_SESSION_SECRET`, `QR_JWT_SECRET` (не `dev_change_me`), `CORS_ORIGINS` обязательны; `WORKERS_ENABLED=1` в отдельном процессе.
- Admin: `API_BASE` (абсолютный URL), `ADMIN_UI_ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.
- Bridge: `API_BASE` (абсолютный URL), `MERCHANT_ID`, `BRIDGE_SECRET`.

## Дополнительно
- (опц.) Redis для rate limiting: поднимите `redis:7` и задайте `REDIS_URL=redis://localhost:6379` в `api` — лимиты будут распределёнными.

## Замечания
- Для защиты API используйте длинные и ротационные секреты.
- Всегда передавайте `Idempotency-Key` на commit/refund.
- Вебхуки проверяйте по `X-Loyalty-Signature` и окну времени ±5 минут.
 - (опц.) Для распределённого rate limiting можно использовать Redis (`infra/docker-compose.yml` содержит сервис),
   задайте `REDIS_URL=redis://localhost:6379` в API.
