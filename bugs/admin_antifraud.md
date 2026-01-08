# Аудит antifraud (admin + /antifraud/*)

Ниже проблемы отсортированы по убыванию критичности.

## P0 — Critical

- **[SEC][Antifraud API] `/antifraud/history/:customerId` отдаёт аудит по всем клиентам мерчанта + возможна утечка между мерчантами**
  - В `getCustomerHistory()` фильтр по `customerId` не применяется к `adminAudit`, поэтому история проверок включает записи по всем клиентам мерчанта.
  - Если `merchantId` не передан (или пустой), Prisma игнорирует фильтр — запрос возвращает данные по всем мерчантам, т.к. `merchantId` становится `undefined`.
  - Риск: при наличии общего `API_KEY` можно вытянуть antifraud‑историю чужих мерчантов или полностью раскрыть журналы проверок.
  - Где: `api/src/antifraud/antifraud.controller.ts`, `api/src/antifraud/antifraud.service.ts`.

## P1 — High

- **[FUNC][Antifraud API] `POST /antifraud/:checkId/review` не изменяет статус проверки и не связан с `FraudCheck`**
  - Метод пишет только `adminAudit`, но не обновляет/не проверяет запись `FraudCheck` (если она вообще есть), поэтому review фактически не влияет на систему.
  - В итоге любой “review” — это лог, но не рабочая функция (не отразится в отчётах/дальнейших проверках).
  - Где: `api/src/antifraud/antifraud.service.ts` (`reviewCheck`).

- **[DATA][Admin antifraud] Анализ возвратов в админке основан на признаках, которых нет в данных**
  - Страница считает возвраты по `receipt.redeemApplied < 0 || receipt.earnApplied < 0`, но в системе суммы сохраняются неотрицательными (отрицательные значения не используются), а возвраты/отмены отражаются иначе (например, `canceledAt` или отдельные транзакции).
  - В результате блок «High Refund Rate Locations» почти всегда пуст или вводит в заблуждение.
  - Где: `admin/app/antifraud/page.tsx` (анализ), `api/prisma/schema.prisma` + логика в `api/src/loyalty/loyalty.service.ts`.

## P2 — Medium

- **[DATA][Admin antifraud] Аналитика строится на неполном наборе данных из‑за скрытого лимита API**
  - UI запрашивает `limit=1000/500`, но админ‑API режет максимум до 200 записей. Из‑за отсутствия пагинации/индикатора усечения анализ строится на последних 200 транзакциях/чеках.
  - Риск: пропуск подозрительных паттернов на активных мерчантах, ложное чувство безопасности.
  - Где: `admin/app/antifraud/page.tsx` + `api/src/merchants/merchants.controller.ts`.

- **[UX][Admin antifraud] Диапазон дат влияет только на транзакции, но не на анализ возвратов**
  - `from/to` применяются к транзакциям, а выборка чеков для возвратов идёт без фильтра по времени. В итоге сравниваются разные временные периоды, что ломает интерпретацию отчёта.
  - Где: `admin/app/antifraud/page.tsx` (`loadReports` / `analyzeSerialRefunds`) + `api/src/merchants/merchants.controller.ts` (нет `from/to` для receipts).

- **[LOGIC][Antifraud scoring] Проверка `new_outlet` даёт ложные срабатывания**
  - В `checkOutlet()` счётчик ищет транзакции **старше 24 часов**, и если их нет — объявляет точку «новой». Это ошибочно метит “новой” точку, где у клиента есть недавние транзакции (<24ч), но нет старых.
  - Риск: завышение риска и ложные блокировки на реальных клиентах.
  - Где: `api/src/antifraud/antifraud.service.ts` (`checkOutlet`).

## P3 — Low

- **[LEGACY/Stub][Antifraud scoring] Геолокация фактически не работает**
  - `checkGeolocation()` всегда считает `distance = 0`, не использует предыдущие координаты и данные в модели транзакций (их нет). Фактор `location_jump` никогда не сработает.
  - Рекомендация: либо реализовать минимальную поддержку (если есть данные), либо удалить этот фактор как legacy, чтобы не вводить в заблуждение.
  - Где: `api/src/antifraud/antifraud.service.ts`.

- **[UX][Admin antifraud] “Ночная активность” и antifraud‑скоры используют разные таймзоны**
  - В админке часы берутся из локального времени браузера, а в antifraud‑скоринге — из времени сервера. Для мерчантов из других таймзон это даёт несогласованные сигналы.
  - Где: `admin/app/antifraud/page.tsx` (night activity), `api/src/antifraud/antifraud.service.ts` (`checkTime`).
