# Аудит настроек интеграций (merchant-portal)

## Высокий приоритет

1. **REST API: список доступных эндпоинтов в состоянии интеграции не совпадает с реальными роутами.**
   - В ответе `/portal/integrations/rest-api` поле `availableEndpoints` формируется через `buildEndpoints()` и отдает legacy-пути вроде `/api/integrations/bonus/calculate`, а реальные контроллеры используют `/api/integrations/calculate/action` и `/api/integrations/calculate/bonus`, плюс есть `/outlets`, `/devices`, `/operations`, `/client/migrate`, которые вообще не попадают в список.
   - Риск: интеграторы получают неверные адреса из портала/API документации → интеграция не работает или строится на устаревших путях.
   - Где: `api/src/portal/services/rest-api-integration.service.ts` (buildEndpoints), `api/src/integrations/integrations-loyalty.controller.ts` (реальные пути).

## Средний приоритет

2. **Нет UI-кнопки/действия для полного отключения REST API интеграции.**
   - В портале есть генерация нового ключа, но нет возможности явно «отключить» интеграцию и отозвать доступ. При этом API-эндпоинт `DELETE /portal/integrations/rest-api` существует.
   - Риск: при компрометации/смене подрядчика нельзя быстро выключить доступ из интерфейса (нужна ручная работа через API).
   - Где: `merchant-portal/app/integrations/rest-api/page.tsx` (нет кнопки отключения), `merchant-portal/app/api/portal/integrations/rest-api/route.ts` + `api/src/portal/portal.controller.ts` (эндпоинт есть).

3. **Telegram Miniapp: отсутствует интерфейс для генерации deep link/startapp и ручной настройки Menu Button.**
   - В бекенде есть `/portal/integrations/telegram-mini-app/link` и `/portal/integrations/telegram-mini-app/setup-menu`, но UI их не использует.
   - Риск: мерчант не может получить корректную стартовую ссылку `t.me/<bot>?startapp=...` или повторно установить меню, если автонастройка не сработала (при проблемах с `MINIAPP_BASE_URL` и т.п.).
   - Где: `merchant-portal/app/integrations/telegram-mini-app/page.tsx` (нет действий), `merchant-portal/app/api/portal/integrations/telegram-mini-app/link/route.ts`, `merchant-portal/app/api/portal/integrations/telegram-mini-app/setup-menu/route.ts`, `api/src/portal/portal.controller.ts`.

## Низкий приоритет

4. **Документация по интеграциям — заглушки с `alert()` вместо реальных ссылок.**
   - На карточках интеграций и в деталях REST API «Документация» не ведет на реальный ресурс (href `#`, показывается `alert`).
   - Риск: для продакшена это выглядит как незавершенный функционал и мешает подключению интеграций.
   - Где: `merchant-portal/app/integrations/page.tsx`, `merchant-portal/app/integrations/rest-api/page.tsx`.
