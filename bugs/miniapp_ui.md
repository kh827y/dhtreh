# Аудит Telegram Mini App / portal integrations

Ниже — найденные проблемы и недоработки, отсортированные по убыванию критичности.

## Высокий приоритет

1. **Невозможно подключить Telegram Mini App из портала (несовпадение API‑эндпоинтов).**
   - **Что не так:** UI отправляет `POST /api/portal/integrations/telegram-mini-app`, тогда как backend ожидает `POST /integrations/telegram-mini-app/connect`. В результате запрос на подключение токена возвращает 404/405 и интеграция не подключается.
   - **Где видно:** `merchant-portal/app/integrations/telegram-mini-app/page.tsx` вызывает `fetch("/api/portal/integrations/telegram-mini-app", { method: "POST" ... })`, а в backend `api/src/portal/portal.controller.ts` объявлен `@Post('integrations/telegram-mini-app/connect')`.
   - **Последствия:** токен нельзя подключить/заменить из UI; интеграция не заводится без ручных запросов.

## Средний приоритет
Нет актуальных пунктов.

## Низкий приоритет
Нет актуальных пунктов.
