# Loyalty Admin

Админка для глобальных настроек, мониторинга стабильности и управления мерчантами. Работает только с реальным API через `/api/admin` (проксируется в `API_BASE`, заголовок `X-Admin-Key`).

## Быстрый старт

1) Скопировать env: `cp infra/env-examples/admin.env.example admin/.env.local` и заполнить значения.
2) Установить зависимости в корне: `pnpm install`.
3) Запустить из каталога `admin`: `pnpm dev` (порт 3001 по умолчанию).

Логин: `ADMIN_UI_PASSWORD` (опц. TOTP `ADMIN_UI_TOTP_SECRET`). Cookie шифруется `ADMIN_SESSION_SECRET`.

## Ключевые переменные окружения

- `API_BASE` — базовый URL API (https).
- `ADMIN_KEY` — admin key для заголовка `X-Admin-Key`.
- `ADMIN_SESSION_SECRET` — секрет подписи сессии админки (обязательно в проде).
- `ADMIN_UI_PASSWORD` — пароль входа (обязательно в проде).
- `ADMIN_UI_TOTP_SECRET` — опциональный TOTP для роли ADMIN.
- `NEXT_PUBLIC_API_KEY` — публичный API key для фронтовых запросов админки.
- `METRICS_TOKEN` — если `/metrics` требует заголовок `X-Metrics-Token`.

Полный список/подсказки — `infra/env-examples/admin.env.example`.

## Основные разделы

- Главная: системный обзор по `/observability/summary`, состояния воркеров, быстрые ссылки на мониторы.
- Мерчанты: создание, поиск по id/названию/email, фильтры по статусу подписки, включение логина/TOTP, выдача Full подписки, кассовые учётные данные, вход в портал.
- Мониторы: Outbox, TTL reconciliation, Observability/health, аудит и экспорт CSV.
- Настройки мерчанта: реальные earn/redeem BPS, rulesJson, вебхуки, bridge secret, брендинг мини‑аппы (без моков и dev‑исключений).
- Выбор мерчанта происходит вручную на страницах Outbox/TTL/Antifraud/Settings; выбранный merchantId сохраняется в localStorage (без дефолтов).

## Принципы

- Только реальные HTTP‑запросы (никаких моков или dev‑веток).
- Все ключи/секреты приходят из env (см. пример выше).
- Ориентир на 50–100 мерчантов: лёгкие фильтры и минимум лишнего UI, без over‑engineering.
