# Аудит: merchant-portal /loyalty/mechanics и /portal/loyalty/mechanics

Ниже перечислены найденные проблемы/недоработки, отсортированные по убыванию важности устранения.

## P1 — критичные/высокие

### 1) Переключатель «Реферальная программа» на странице механик затирает существующие настройки
**Суть:** при включении/выключении «Реферальной программы» с главной страницы механик в запросе не передаются `shareMessage` и `minPurchaseAmount`. Бэкэнд нормализует отсутствующие поля к дефолтам, из-за чего настройки программы могут быть перезаписаны на значения по умолчанию (например, кастомный текст шаринга пропадает, минимальная сумма покупки сбрасывается в 0).
**Где:**
- `merchant-portal/app/loyalty/mechanics/page.tsx` — payload для referral не содержит `shareMessage` и `minPurchaseAmount`.
- `api/src/portal/portal.controller.ts` → `normalizeReferralProgramPayload()` — при отсутствии полей использует дефолты.
- `api/src/referral/referral.service.ts` → `normalizeShareMessage()` / нормализация minPurchaseAmount.
**Риск:** потеря продакшн-настроек реферальной программы при простом клике «Вкл/Выкл».

### 2) Страница «Механики» падает/становится недоступной для сотрудников с ограниченными правами
**Суть:** доступ к `/loyalty/mechanics` требует только `mechanic_birthday: read`, но при загрузке выполняются запросы ко всем механикам (`auto-return`, `registration-bonus`, `ttl`, `referral`, `tiers`). Если у сотрудника нет прав на одну из механик, соответствующий API вернёт 403 и **вся страница покажет ошибку**, т.к. `Promise.all` падает целиком.
**Где:**
- `merchant-portal/app/layout.tsx` — права на страницу `/loyalty/mechanics`.
- `merchant-portal/app/loyalty/mechanics/page.tsx` — `Promise.all` на все механики без деградации.
- `api/src/portal-auth/portal.guard.ts` — проверка прав на `/portal/referrals/*` и другие механики.
**Риск:** частичные роли в проде лишаются доступа к странице механик, хотя должны видеть хотя бы доступные им разделы.

## P2 — средние

### 3) `setup-status` всегда считает механики выключенными из-за несовпадения формата API
**Суть:** `/portal/loyalty/mechanics` возвращает массив записей `LoyaltyMechanic`, а `setup-status` ожидает объект вида `{ birthday: {enabled}, referral: {enabled}, ... }`. В итоге `hasMechanics` почти всегда `false`, и прогресс настройки в онбординге/статусах отображается неверно.
**Где:**
- `merchant-portal/app/api/portal/setup-status/route.ts` — проверяет `mechanics.birthday?.enabled` и т.п.
- `api/src/loyalty-program/controllers/mechanics.controller.ts` + `api/src/loyalty-program/loyalty-program.service.ts` — возвращают массив.
**Риск:** некорректная аналитика/онбординг; мерчанту показывается, что механики не настроены, хотя они включены в правилах.

### 4) Дублирующиеся/несвязанные модели механик: правила (`rulesJson`) и `LoyaltyMechanic` живут отдельно
**Суть:** UI управляет механиками через `rulesJson` в `/portal/settings`, а эндпоинт `/portal/loyalty/mechanics` использует отдельную модель `LoyaltyMechanic`. Между ними нет синхронизации: включение механик в UI не создаёт/обновляет `LoyaltyMechanic`, и наоборот.
**Где:**
- `merchant-portal/app/api/portal/loyalty/*` — обновляет `rulesJson` через `/portal/settings`.
- `api/src/loyalty-program/controllers/mechanics.controller.ts` — отдельный CRUD по `LoyaltyMechanic`.
**Риск:** «мертвая»/legacy модель, расхождение данных между UI и бэкендом. Нужна унификация или удаление legacy, иначе статус механик в системе разъезжается.

### 5) Включение напоминаний о сгорании при `pointsTtlDays = 0` делает механику фиктивной
**Суть:** в UI можно включить «Напоминание о сгорании» даже когда TTL баллов равен 0 (сгорание отключено). В воркере такие мерчанты пропускаются, уведомления никогда не отправляются, но UI показывает механику активной.
**Где:**
- `merchant-portal/app/api/portal/loyalty/ttl/route.ts` — нет валидации `pointsTtlDays > 0` при `enabled=true`.
- `api/src/points-ttl-reminder.worker.ts` — игнорирует мерчантов с `pointsTtlDays <= 0`.
**Риск:** ложное ощущение, что напоминания работают, хотя фактически не отправляются.

## P3 — низкие/UX

### 6) Включение авто-возврата/дней рождения возможно без подключённого Telegram-бота
**Суть:** воркеры авто-возврата и поздравлений с ДР пропускают мерчанты без Telegram-бота, однако на общей странице механик переключатели доступны и показывают «Активна» даже при отсутствии Telegram-интеграции.
**Где:**
- `merchant-portal/app/loyalty/mechanics/page.tsx` — нет блокировки/предупреждения.
- `api/src/auto-return.worker.ts`, `api/src/birthday.worker.ts` — явные `Skip` при отсутствии Telegram.
**Риск:** у мерчанта создаётся ложное ожидание, что механика работает.
