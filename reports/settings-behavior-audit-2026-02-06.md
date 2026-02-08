# Settings Behavior Audit (2026-02-06)

## Методика

Проверка выполнена по 3 контурам:
1. Статический аудит `setting -> code-path` в backend (`api/src`).
2. Наличие автоматических тестов по влиянию настройки на поведение (`*.spec.ts`, `api/test`).
3. Runtime smoke через Playwright по всем маршрутам приложений (без полного перебора всех комбинаций значений каждой настройки).

## Матрица “настройка -> эффект”

| Настройка | Где влияет на поведение | Покрытие тестами | Статус |
|---|---|---|---|
| `requireJwtForQuote` | Режим токена в `quote/code` (JWT vs short token) | `integrations-loyalty.controller.spec.ts`, `loyalty-transactions.use-case.spec.ts` | OK |
| `qrTtlSec` | TTL QR/short-code в `mintQr` и public settings | `merchants-settings.service.spec.ts`, `loyalty-transactions.use-case.spec.ts` | OK |
| `earnBps`, `redeemLimitBps` | Расчет начисления/лимитов списания | `loyalty.service.redeem-caps.spec.ts`, `loyalty.service.levels.spec.ts`, `contracts.e2e-spec.ts` | OK |
| `redeemCooldownSec`, `earnCooldownSec` | Блокировка частых операций | `loyalty.service.redeem-caps.spec.ts`, `loyalty-promotions.use-case.spec.ts` | OK |
| `redeemDailyCap`, `earnDailyCap` | Суточные лимиты операций | `loyalty.service.redeem-caps.spec.ts`, `loyalty-promotions.use-case.spec.ts` | OK |
| `maxOutlets` | Ограничение создания точек | `catalog.service.spec.ts`, `merchants.service.spec.ts` | OK |
| `pointsTtlDays` | Сгорание баллов, forecast/reminders/workers | `points-ttl.worker.spec.ts`, `points-ttl-reminder.worker.spec.ts`, `redeem-caps` suite | OK |
| `earnDelayDays` | Задержка начисления | `bonus-settings.e2e.test.tsx`, `loyalty.service.spec.ts` (scheduled earn) | OK |
| `rulesJson.reviews.enabled` | Разрешение/запрет отправки отзыва | `loyalty-promotions.use-case.spec.ts` (добавлено) | OK |
| `rulesJson.reviewsShare` | Условия показа share после отзыва | `loyalty-promotions.use-case.spec.ts`, `loyalty-transactions.use-case.spec.ts`, `reviews page` tests | OK |
| `rulesJson.miniapp.supportTelegram` | Контакт поддержки в public miniapp settings | `portal-settings.use-case.spec.ts`, `loyalty-transactions.use-case.spec.ts` (добавлено) | OK |
| `rulesJson.allow/disallowEarnRedeemSameReceipt` | Разрешение смешанных earn+redeem в одном чеке | `loyalty.service.redeem-caps.spec.ts` | OK |
| `telegramStartParamRequired` | Проверка `start_param` в miniapp auth | `telegram-miniapp.guard.spec.ts`, `merchants-settings.service.spec.ts` | OK |
| `telegramBotToken`, `telegramBotUsername` | Telegram bot auth/deep links/integration state | `telegram-integration.service.spec.ts`, `merchants-settings.service.spec.ts` | OK |
| `miniappBaseUrl`, `miniappThemePrimary`, `miniappThemeBg`, `miniappLogoUrl` | Public miniapp branding/settings | `merchants-settings.service.spec.ts`, `loyalty-transactions.use-case.spec.ts` | OK |
| `webhookUrl`, `webhookSecret`, `webhookKeyId`, `useWebhookNext` | Подпись webhook и ротация ключей | `merchants.service.spec.ts`, `merchants-settings.service.spec.ts`, `outbox-dispatcher.worker.spec.ts` | OK |
| `staffMotivation*` | Начисления/leaderboard мотивации персонала | `staff-motivation.service.spec.ts`, analytics ops tests | OK |
| `timezone` | TZ-зависимые выборки/формат времени/периоды | `merchants-settings.service.spec.ts`, `portal-settings.use-case.spec.ts`, `settings-system.e2e.test.tsx`, runtime Playwright | OK |
| `outboxPausedUntil` | Пауза outbox dispatcher | `outbox-dispatcher.worker.spec.ts` (paused deferral + resume path в API) | OK |
| `monthlyReports` | Только фильтрация в `subscription.cron.ts` | Тестов/полного end-to-end нет | LEGACY/STUB |
| `smsSignature` | Не найден рабочий code-path | Нет тестов | LEGACY/STUB |

## Подтвержденные пробелы

1. `monthlyReports` и `smsSignature` выглядят как legacy-поля без полноценной пользовательской механики в текущем цикле.
2. Runtime Playwright прогон подтверждает, что страницы не падают и сетка запросов рабочая, но не заменяет полный комбинаторный перебор каждого значения каждой настройки в UI.

## Runtime findings (Playwright)

1. Подтверждено, что изменение `timezone` и QR-режима в `/settings/system` реально меняет backend-состояние (`GET /api/portal/settings/timezone`, `GET /api/portal/settings/qr`).
2. Подтверждено, что изменение задержки начисления в `/loyalty/mechanics/bonus-settings` реально меняет `delayEnabled/delayDays` (`GET /api/portal/loyalty/redeem-limits`).
3. Подтверждено, что `supportTelegram` сохраняется/читается через `PUT/GET /api/portal/settings/support`.
4. После runtime-проверки значения возвращены в исходное состояние (`requireJwtForQuote=false`, `supportTelegram=null`, `timezone=MSK+4`, `delayEnabled=false`, `delayDays=0`).

## Что сделано в этом проходе

1. Добавлено backend-покрытие для `timezone` в `portal-settings.use-case.spec.ts`.
2. Добавлено backend-покрытие для `useWebhookNext` и `outboxPausedUntil` в `outbox-dispatcher.worker.spec.ts`.
3. Добавлено backend-покрытие фактического поведения `earnDelayDays` в `loyalty.service.spec.ts` (ветка `loyalty.earn.scheduled` без мгновенного инкремента кошелька).
4. Расширен frontend-тест `settings-system.e2e.test.tsx` на сохранение `supportTelegram` и QR-режима.
5. Полный regression-прогон: `pnpm test:ci:all`, `pnpm typecheck` и `pnpm audit --prod --audit-level=high` — PASS по `high/critical`.
