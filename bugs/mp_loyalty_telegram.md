# Аудит: Telegram‑рассылки и Telegram Mini App (merchant-portal)

Ниже проблемы отсортированы по убыванию критичности. Дубликаты из `FIX.md` не включал.

## Высокая критичность

### 1) Ложноположительный статус «подключено/здорово» после ошибки вебхука
- **Где**: `api/src/telegram/telegram-bot.service.ts`, `api/src/portal/services/telegram-integration.service.ts`.
- **Что происходит**: `registerBot()` создаёт/обновляет `telegramBot` с `isActive: true`, даже если установка webhook завершилась ошибкой. В `getState()` признак `connectionHealthy` рассчитывается как `telegramBotEnabled && telegramBot.isActive`, поэтому UI может показывать «подключено», хотя webhook не установлен.
- **Риск**: рассылки и события не дойдут до бота, а в интерфейсе это выглядит как «всё ок», что мешает диагностике.
- **Доказательство в коде**: `isActive: true` при upsert и отсутствие отката при ошибке; `connectionHealthy` завязан на `telegramBot.isActive`.【F:api/src/telegram/telegram-bot.service.ts†L104-L159】【F:api/src/portal/services/telegram-integration.service.ts†L93-L107】

## Средняя критичность
Нет актуальных пунктов.

## Низкая критичность
Нет актуальных пунктов.
