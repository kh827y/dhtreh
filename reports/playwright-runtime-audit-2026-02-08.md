# Playwright Runtime Audit — 2026-02-08

## Scope

- Merchant Portal analytics pages
- Merchant Portal customer card (`/customers`)
- Merchant Portal cashier settings page (`/loyalty/cashier`)
- Cashier app entry (`/`)
- Miniapp entry (`/`)

## Merchant Portal analytics (`/analytics*`)

Прогон по всем маршрутам:

- `/analytics`
- `/analytics/time`
- `/analytics/portrait`
- `/analytics/repeat`
- `/analytics/dynamics`
- `/analytics/rfm`
- `/analytics/outlets`
- `/analytics/staff`
- `/analytics/referrals`
- `/analytics/birthdays`

Результат:

- Во всех случаях API-ответы `200`.
- Неблокирующих дублей API-вызовов по одинаковому endpoint-path не обнаружено.
- Фактические вызовы соответствуют ожидаемой декомпозиции (1–2 запроса на страницу, без водопадов из повторов).

## Customer Card (`/customers?customerId=...`)

### Open card flow

Фактические запросы при открытии карточки:

- `GET /api/portal/loyalty/tiers` — 1
- `GET /api/customers?registeredOnly=0&excludeMiniapp=1&limit=200&offset=0` — 1
- `GET /api/customers/:id` — 1

После фикса in-flight dedupe повторный `GET /api/customers/:id` не воспроизводится.

### Edit modal lazy load

При открытии `Редактировать`:

- `GET /api/portal/outlets?status=active` — 1

Лишних запросов к `outlets` вне модалок не зафиксировано.

## Loyalty Cashier page (`/loyalty/cashier`)

Проверено:

- загрузка логина кассира;
- загрузка одноразовых паролей;
- загрузка PIN-кодов сотрудников;
- загрузка активных device sessions.

Результат:

- критичных UI ошибок/падений не выявлено;
- загрузочные состояния корректно сменяются данными.

## Cashier app (`http://localhost:3002/`)

Стартовая страница открывается штатно (форма авторизации устройства/кассира).  
Сквозной runtime-логин в этой сессии не выполнялся из Playwright (нет вводимого действующего one-time пароля в открытом контексте).

## Miniapp (`http://localhost:3003/`)

В веб-контексте Playwright без Telegram `initData` страница остается в состоянии `Загружаем приложение…` и требует запуск из Telegram WebApp-контекста.  
Это ожидаемое поведение guard-аутентификации, не функциональная ошибка.

## Notes

- В dev-режиме наблюдаются предупреждения Recharts `width(-1)/height(-1)` на отдельных mount-моментах; функционально страницы работают, API успешно возвращает данные.

## Re-run 2026-02-08 (post hardening)

Повторный прогон после фикса конкурентной загрузки списка клиентов (`customers/page.tsx`, AbortController):

- `/analytics`: `apiCalls=1`, `non2xx=0`, `failed=0`
- `/analytics/time`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/analytics/portrait`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/analytics/repeat`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/analytics/dynamics`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/analytics/rfm`: `apiCalls=1`, `non2xx=0`, `failed=0`
- `/analytics/outlets`: `apiCalls=1`, `non2xx=0`, `failed=0`
- `/analytics/staff`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/analytics/referrals`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/analytics/birthdays`: `apiCalls=1`, `non2xx=0`, `failed=0`
- `/customers`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `cashier /`: `apiCalls=0` на стартовом auth-экране, ошибок сети нет.

## Re-run 2026-02-08 (analytics SQL unification pass)

Повторный runtime sweep после централизации SQL-политики валидного чека в analytics backend:

- `/analytics`: `apiCalls=1`, `non2xx=0`, `failed=0` (`/api/portal/analytics/dashboard`)
- `/analytics/time`: `apiCalls=2`, `non2xx=0`, `failed=0` (`/api/portal/analytics/time/{recency,activity}`)
- `/analytics/portrait`: `apiCalls=2`, `non2xx=0`, `failed=0` (`/api/portal/audiences`, `/api/portal/analytics/portrait`)
- `/analytics/repeat`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/analytics/dynamics`: `apiCalls=2`, `non2xx=0`, `failed=0` (`/api/portal/analytics/{revenue,loyalty}`)
- `/analytics/rfm`: `apiCalls=1`, `non2xx=0`, `failed=0`
- `/analytics/outlets`: `apiCalls=1`, `non2xx=0`, `failed=0`
- `/analytics/staff`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/analytics/referrals`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/analytics/birthdays` (redirect в `loyalty/mechanics/birthday`): `apiCalls=1`, `non2xx=0`, `failed=0`
- `/customers`: `apiCalls=2`, `non2xx=0`, `failed=0`
- `/loyalty/cashier`: `apiCalls=4`, `non2xx=0`, `failed=0`
- `cashier /` (`http://localhost:3002/`): `apiCalls=0`, `non2xx=0`, `failed=0`
- `miniapp /` (`http://localhost:3003/`): `apiCalls=0`, `non2xx=0`, `failed=0` (вне Telegram-контекста без `initData`).

Итог: по прогону не выявлено `requestfailed` и не-2xx API-ответов; функционально аналитические страницы и связанные разделы доступны.
