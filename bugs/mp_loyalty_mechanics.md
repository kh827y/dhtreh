# Аудит: merchant-portal /loyalty/mechanics и /portal/loyalty/mechanics

Ниже перечислены найденные проблемы/недоработки, отсортированные по убыванию важности устранения.

## P1 — критичные/высокие

Нет актуальных пунктов.

## P2 — средние

### 1) Дублирующиеся/несвязанные модели механик: правила (`rulesJson`) и `LoyaltyMechanic` живут отдельно
**Суть:** UI управляет механиками через `rulesJson` в `/portal/settings`, а эндпоинт `/portal/loyalty/mechanics` использует отдельную модель `LoyaltyMechanic`. Между ними нет синхронизации: включение механик в UI не создаёт/обновляет `LoyaltyMechanic`, и наоборот.
**Где:**
- `merchant-portal/app/api/portal/loyalty/*` — обновляет `rulesJson` через `/portal/settings`.
- `api/src/loyalty-program/controllers/mechanics.controller.ts` — отдельный CRUD по `LoyaltyMechanic`.
**Риск:** «мертвая»/legacy модель, расхождение данных между UI и бэкендом. Нужна унификация или удаление legacy, иначе статус механик в системе разъезжается.

## P3 — низкие/UX

### 1) Включение авто-возврата/дней рождения возможно без подключённого Telegram-бота
**Суть:** воркеры авто-возврата и поздравлений с ДР пропускают мерчанты без Telegram-бота, однако на общей странице механик переключатели доступны и показывают «Активна» даже при отсутствии Telegram-интеграции.
**Где:**
- `merchant-portal/app/loyalty/mechanics/page.tsx` — нет блокировки/предупреждения.
- `api/src/auto-return.worker.ts`, `api/src/birthday.worker.ts` — явные `Skip` при отсутствии Telegram.
**Риск:** у мерчанта создаётся ложное ожидание, что механика работает.
