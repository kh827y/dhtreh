# Аудит: RFM аналитика (merchant-portal)

## P1 — Высокая

### 1) Настройки RFM из портала не влияют на распределение комбинаций до пересчёта воркером
**Где:** `api/src/analytics/analytics.service.ts` (`getRfmGroupsAnalytics`), `api/src/analytics/analytics-aggregator.worker.ts` (`recalculateCustomerStatsForMerchant`), `merchant-portal/app/analytics/rfm/page.tsx`.

**Что происходит:**
- В `getRfmGroupsAnalytics` для распределения сегментов используется `row.rfmClass`, если он уже сохранён в `CustomerStats`. При этом вычисленные “на лету” R/F/M с учётом новых порогов **игнорируются** для `distribution` и комбинированной таблицы.
- Пересчёт `rfmClass` происходит только в воркере (`recalculateCustomerStatsForMerchant`). Если воркер не запущен в том же процессе API или пересчёт отложен, то изменения порогов в UI **не отражаются** в распределении сегментов.

**Риск:** пользователь в портале меняет параметры RFM, но получает те же сегменты — аналитика выглядит «сломано» и даёт неверные выводы. Это особенно критично для решения по коммуникациям/кампаниям.

---

### 2) Несогласованные данные между `/portal/analytics/rfm` и `/portal/analytics/rfm-heatmap`
**Где:** `api/src/analytics/analytics.service.ts` (`getRfmGroupsAnalytics`, `getRfmHeatmap`).

**Что происходит:**
- `/portal/analytics/rfm` строит аналитику только по клиентам с покупками (`visits > 0` и `totalSpent > 0`).
- `/portal/analytics/rfm-heatmap` считает матрицу по **всем** `CustomerStats`, включая клиентов без покупок, и если `rfmR/rfmF` не рассчитаны — принудительно относит их к 1.
- Дополнительно, `heatmap` зависит от сохранённых `rfmR/rfmF` и может быть **устаревшей**, пока не выполнится пересчёт воркером.

**Риск:** heatmap будет давать искажённые данные относительно основной аналитики (разные базы клиентов и разные источники расчётов), что подрывает доверие к аналитике.

## P3 — Низкая

### 3) `/portal/analytics/rfm-heatmap` нигде не используется в интерфейсе
**Где:** `merchant-portal/app/analytics/rfm/page.tsx`, `merchant-portal/app/api/portal/analytics/rfm-heatmap/route.ts`.

**Что происходит:** API-эндпоинт существует и защищён правами, но UI не делает запросов и не отображает heatmap. Функция фактически «мертвая» и не приносит пользы бизнесу.

**Риск:** лишний функционал/поддержка без ценности, а ожидание heatmap со стороны бизнеса остаётся невыполненным.
