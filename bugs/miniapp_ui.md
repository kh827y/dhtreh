# Аудит Telegram Mini App / portal integrations

Ниже — найденные проблемы и недоработки, отсортированные по убыванию критичности.

## Высокий приоритет

1. **Невозможно подключить Telegram Mini App из портала (несовпадение API‑эндпоинтов).**
   - **Что не так:** UI отправляет `POST /api/portal/integrations/telegram-mini-app`, тогда как backend ожидает `POST /integrations/telegram-mini-app/connect`. В результате запрос на подключение токена возвращает 404/405 и интеграция не подключается.
   - **Где видно:** `merchant-portal/app/integrations/telegram-mini-app/page.tsx` вызывает `fetch("/api/portal/integrations/telegram-mini-app", { method: "POST" ... })`, а в backend `api/src/portal/portal.controller.ts` объявлен `@Post('integrations/telegram-mini-app/connect')`.
   - **Последствия:** токен нельзя подключить/заменить из UI; интеграция не заводится без ручных запросов.

## Средний приоритет

2. **Глубокие ссылки `startapp` могут не определять мерчанта из-за некорректной декодировки base64url.**
   - **Что не так:** в miniapp `start_param/startapp` разбирается через `atob` без добавления padding (`=`). Для base64url‑токенов, длина которых не кратна 4, `atob` падает и мерчант не извлекается.
   - **Где видно:** `miniapp/lib/useMiniapp.ts` (`getMerchantFromContext`) и разбор реферального кода в `miniapp/app/page.tsx`.
   - **Последствия:** при открытии через `t.me/<bot>?startapp=<token>` приложение может уйти в дефолтный `NEXT_PUBLIC_MERCHANT_ID`/`M-1` и показывать не тот мерчант (или падать на телетоке/данных). Особенно критично для мульти‑мерчант режима.

3. **Эндпоинт диагностики Telegram‑уведомлений открыт без авторизации.**
   - **Что не так:** `GET /telegram/notify/webhook-info` доступен публично без guard’ов.
   - **Где видно:** `api/src/telegram/telegram-notify.controller.ts` — метод `webhookInfo()` без `@UseGuards`.
   - **Последствия:** любой может запросить текущий webhook URL/ошибки и использовать это для разведки, что не соответствует прод‑нормам безопасности.

## Низкий приоритет

4. **При отсутствии `MINIAPP_BASE_URL` сохраняется некорректная ссылка `undefined/?merchant=...`.**
   - **Что не так:** при регистрации бота `TelegramBotService.registerBot` формирует `miniappBaseUrl` через строковую интерполяцию, даже если `MINIAPP_BASE_URL` не задан.
   - **Где видно:** `api/src/telegram/telegram-bot.service.ts`.
   - **Последствия:** в портале пользователю показывается неправильная ссылка (и меню‑кнопка может настроиться на невалидный URL), что осложняет первичную настройку интеграции.
