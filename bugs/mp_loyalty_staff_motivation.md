# Аудит: Мотивация персонала (merchant-portal)

Ниже перечислены проблемы и недоработки, отсортированные по убыванию критичности.

## P1 — Высокая важность

1. **Несовпадение дефолтных значений между UI и backend (включённость программы, баллы, период).**
   - **Симптом:** UI стартует с `enabled=true`, `10/1` баллов и периодом `month`, тогда как backend по умолчанию отдаёт `enabled=false`, `30/10` и `week`.
   - **Риск:** при ошибке загрузки настроек или сохранении сразу после открытия страницы мерчант может непреднамеренно включить механику с «урезанными» баллами и другим периодом. Это приводит к несогласованным ожиданиям и реальным начислениям в кассе.
   - **Где:** `merchant-portal/app/loyalty/staff-motivation/page.tsx` (DEFAULT_STATE), `api/src/portal/services/staff-motivation.service.ts` (getSettings defaults), `api/src/staff-motivation/staff-motivation.constants.ts`.

2. **Текст в UI обещает «текущую неделю/месяц», а расчёт в backend и кассовом интерфейсе идёт за «последние N дней».**
   - **Симптом:** в портале опции подписаны как «Неделя (текущая)», «Месяц (текущий)», но на сервере окна формируются как rolling window на 7/30/90/365 дней; в кассе отображается «Последние 7/30 дней».
   - **Риск:** мерчант и персонал видят разные ожидания по периоду рейтинга → неверные управленческие решения и споры по мотивации.
   - **Где:** `merchant-portal/app/loyalty/staff-motivation/page.tsx` (лейблы периодов), `api/src/staff-motivation/staff-motivation.constants.ts` (calculatePeriodWindow/periodLabel), `cashier/src/app/page.tsx` (buildMotivationPeriodLabel).

## P3 — Низкая важность

1. **Нет клиентской валидации максимума для «произвольного периода».**
   - **Симптом:** UI позволяет ввести любое число дней, но backend отвергает значения >365.
   - **Риск:** пользователь получает только алерт об ошибке при сохранении без подсказки допустимого диапазона; лишние обращения к API.
   - **Где:** `merchant-portal/app/loyalty/staff-motivation/page.tsx` (input customDays), `api/src/portal/services/staff-motivation.service.ts` (валидация), `api/src/staff-motivation/staff-motivation.constants.ts` (лимит 365).
