# Аудит аналитики backend (api/src/analytics/analytics.controller.ts)

Ниже перечислены найденные проблемы/недоработки. Отсортировано по убыванию важности устранения.

## P1 — High

1. **Периоды аналитики считаются в таймзоне сервера, а не мерчанта**
   - `getPeriod()` формирует границы day/week/month из локального времени сервера и сразу применяется во всех эндпоинтах аналитики. Это приводит к смещению дневных/недельных метрик и несоответствию фактическим операциям (особенно при `timezone` мерчанта ≠ серверной).
   - Затрагивает: `dashboard`, `portrait`, `repeat`, `referral`, `business`, `revenue`, `customers`, `loyalty`, `auto-return`, `birthday-mechanic`, `campaigns`, `time/activity`, `operations`, `widgets` и т.д.
   - Где: `api/src/analytics/analytics.controller.ts` (helper `getPeriod()`).

2. **Метрика “Бизнес‑метрики” использует транзакции EARN (баллы) вместо чеков**
   - `getBusinessMetrics()` группирует `Transaction` по `type='EARN'` и суммирует `amount` (баллы), но результат выдаётся как “средний чек/выручка/кол-во транзакций”. Это приводит к несоответствию денежным операциям и может сильно искажать аналитику.
   - Где: `api/src/analytics/analytics.service.ts` (`getBusinessMetrics`).

3. **Метрики клиентов считаются по “любой транзакции” без фильтров типов/отмен**
   - `activeCustomers` и `averageVisitsPerCustomer` берутся из `Transaction` без фильтра `type` и без учета `canceledAt`, т.е. сюда попадают `REDEEM/REFUND/ADJUST` и отменённые операции.
   - `churnRate` считается относительно “последних 30 дней от текущей даты”, игнорируя выбранный период (`period`). Это делает показатель несопоставимым с остальными метриками периода.
   - Где: `api/src/analytics/analytics.service.ts` (`getCustomerMetrics`).

4. **ROI/Conversion в лояльности рассчитываются на “балльных” транзакциях, а не на денежной выручке**
   - `calculateLoyaltyROI()` берёт сумму `Transaction.amount` для `EARN` как “выручку” и суммарные `EARN/CAMPAIGN/REFERRAL` как “стоимость” — в итоге ROI отражает движение баллов, а не денег и почти всегда стремится к 0.
   - `calculateLoyaltyConversion()` считает конверсию на уровне транзакций (`EARN/REDEEM`), без фильтра отмен и без привязки к чекам, поэтому показатель может существенно отличаться от реальной конверсии покупателей.
   - Где: `api/src/analytics/analytics.service.ts` (`calculateLoyaltyROI`, `calculateLoyaltyConversion`).

## P2 — Medium

5. **Повторные покупки: `newBuyers` игнорирует фильтр по outlet**
   - В `getRepeatPurchases()` фильтр `outletId` применяется только к основному запросу, но не применяется при расчёте `newBuyers`. В результате показатель “новые покупатели” не совпадает с остальными метриками по точке.
   - Где: `api/src/analytics/analytics.service.ts` (`getRepeatPurchases`).

6. **Retention cohorts считают возвраты по чекам без фильтра отмен/возвратов**
   - В `getRetentionCohorts()` возвраты считаются по `Receipt` без фильтров `canceledAt`, `total > 0` и исключения refund-операций, что может завышать retention.
   - Где: `api/src/analytics/analytics.service.ts` (`getRetentionCohorts`).

7. **Campaign metrics: ROI на баллах + отменённые транзакции**
   - `campaignROI` вычисляется из `Transaction.amount` типа `CAMPAIGN` (баллы), без фильтра `canceledAt`, и без привязки к денежной выручке/чекам. Итоговый ROI не отражает реальную эффективность кампаний.
   - Где: `api/src/analytics/analytics.service.ts` (`getCampaignMetrics`).

8. **Widgets: “сегодня” определяется в таймзоне сервера**
   - `getWidgetData()` выставляет период “сегодня” через `new Date()` без учета таймзоны мерчанта, из-за чего витринные метрики могут отставать/спешить относительно реального рабочего дня точки.
   - Где: `api/src/analytics/analytics.controller.ts` (`getWidgetData`).

## P3 — Low

9. **Список дней рождения обрезается до 5000 клиентов без сортировки**
   - `getBirthdays()` делает `take: 5000` без сортировки, поэтому при базе >5000 часть клиентов выпадет случайно, а не по ближайшей дате. Это даёт неполный список ближайших дней рождения.
   - Где: `api/src/analytics/analytics.service.ts` (`getBirthdays`).

10. **Операционные метрики по точкам считают любые транзакции**
    - `getOutletUsage()` использует `Transaction` без фильтра `type`/`canceledAt`, поэтому “активность” может включать ручные корректировки и отменённые операции, а не реальные продажи.
    - Где: `api/src/analytics/analytics.service.ts` (`getOutletUsage`).
