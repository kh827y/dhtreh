# Аудит merchant-portal: Integrations

Ниже — проблемы, отсортированные по убыванию критичности.

## P2 — Средняя критичность

1. **Статус «Подключено» не отражает реальное состояние интеграций.**
   - На странице интеграций статус берётся только из `enabled`, при этом **игнорируется** `connectionHealthy` для Telegram и `status`/ошибки для REST API. В результате при сломанном webhook’е Telegram или других проблемах интеграция визуально остаётся «Подключено», что вводит в заблуждение и мешает диагностике.
   - Где: `merchant-portal/app/integrations/page.tsx` (логика `connected: Boolean(telegram?.enabled)` и `connected: Boolean(restApi?.enabled)`), backend возвращает `connectionHealthy` и другие поля через `/portal/integrations/telegram-mini-app` и `/portal/integrations/rest-api`.

## P3 — Низкая критичность

1. **Кнопка «Документация» — заглушка и не открывает реальную документацию.**
   - В карточках интеграций `docsUrl` задан как `"#"`, а обработчик клика вызывает `alert` вместо открытия страницы. В продакшене пользователи не могут перейти в документацию, хотя UI показывает такую кнопку.
   - Где: `merchant-portal/app/integrations/page.tsx` (`docsUrl: "#"`, `openDocs()` с `alert`).

2. **Эндпоинт `/portal/integrations` возвращает список интеграций, но в UI он не используется.**
   - В API есть агрегированный список интеграций (`id`, `isActive`, `lastSync`, `errorCount`), однако страница `/integrations` опрашивает только две конкретные интеграции и не показывает общую картину/ошибки синхронизации. В итоге данные и поддерживаемый API оказываются «мертвыми», а ошибки по интеграциям не видны пользователю.
   - Где: `api/src/portal/portal.controller.ts` (`GET /portal/integrations`), `merchant-portal/app/integrations/page.tsx` (нет вызова `/api/portal/integrations`).
