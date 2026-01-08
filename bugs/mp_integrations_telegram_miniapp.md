# Telegram Mini App (merchant-portal) — аудит

## Критичные
1. **Если `MINIAPP_BASE_URL` не задан, в настройки записывается некорректный URL `undefined/?merchant=...`, и он же используется в меню бота.**
   - В `registerBot` значение `miniappBaseUrl` формируется через шаблонную строку без проверки наличия `MINIAPP_BASE_URL`, после чего сохраняется в `merchantSettings`.
   - В результате мерчант получает неработающую ссылку в портале, а бот может получить невалидный `web_app` URL при установке Chat Menu Button.
   - Затрагиваемый код: `api/src/telegram/telegram-bot.service.ts`, метод `registerBot`.

## Высокие
2. **После отключения интеграции токен бота остается в базе (`telegramBot.botToken`), хотя бот деактивируется.**
   - `deactivateBot` удаляет webhook и ставит `isActive = false`, но токен не очищается. Это повышает риск утечки/компрометации, особенно если учетные записи или дампы БД попадут наружу.
   - Затрагиваемый код: `api/src/telegram/telegram-bot.service.ts`, метод `deactivateBot`.

3. **В UI нет механизма повторной установки Menu Button, хотя для этого есть API `/portal/integrations/telegram-mini-app/setup-menu`.**
   - Если автоматическая установка кнопки меню падает (например, временные проблемы Telegram API или некорректный URL), мерчант не может повторить действие без переподключения.
   - Затрагиваемый код: `merchant-portal/app/integrations/telegram-mini-app/page.tsx` (отсутствует кнопка/действие), `api/src/portal/portal.controller.ts` (эндпоинт уже существует).

## Средние
4. **Токен бота вводится в открытом виде (тип `text`), что повышает риск подсмотра и случайного копирования.**
   - Для чувствительных данных нужно хотя бы `type="password"` или переключатель «показать/скрыть».
   - Затрагиваемый код: `merchant-portal/app/integrations/telegram-mini-app/page.tsx`.

5. **Статус подключения на странице опирается только на `enabled`, а не на `connectionHealthy`.**
   - При сбоях webhook страница продолжит показывать «Бот успешно подключен», хотя интеграция фактически не работает; пользователь видит проблему только после ручной проверки.
   - Затрагиваемый код: `merchant-portal/app/integrations/telegram-mini-app/page.tsx` (игнорируется `connectionHealthy`).
