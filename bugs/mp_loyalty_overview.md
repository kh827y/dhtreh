# Merchant Portal — Loyalty overview (аудит)

Ниже перечислены найденные проблемы по разделу лояльности. Сортировка по убыванию критичности.

## P1 — Высокая важность (Security/PII)

1) **PII клиентов доступна через промо‑акции без прав на клиентов**
   - **Где:** `api/src/loyalty-program/controllers/promotions.controller.ts` (`GET /portal/loyalty/promotions/:id`).
   - **Что происходит:** ответ включает участников промо с `customer.phone`/`customer.name`. Проверка прав выполняется только по ресурсам акций (`points_promotions`/`product_promotions`), без проверки `customers`.
   - **Риск:** сотрудник с маркетинговыми правами может увидеть телефоны клиентов и другие данные, что нарушает изоляцию ПДн.

2) **PII клиентов доступна через уровни лояльности без прав на клиентов**
   - **Где:** `api/src/loyalty-program/controllers/tiers.controller.ts` (`GET /portal/loyalty/tiers/:tierId/customers`), `api/src/loyalty-program/loyalty-program.service.ts` (`listTierCustomers` возвращает `phone`, `totalSpent`).
   - **Что происходит:** доступ управляется ресурсом `mechanic_levels`, но ответ содержит телефоны клиентов и суммы трат.
   - **Риск:** роль, которой нужно управлять уровнями, получает доступ к ПДн/финансовым данным клиентов без разрешения `customers`.

## P2 — Средняя важность (abuse/надёжность)

3) **В уровнях лояльности нет верхних ограничений на проценты начисления/списания**
   - **Где:** `api/src/loyalty-program/loyalty-program.service.ts` (`sanitizePercent` и `createTier`/`updateTier`).
   - **Что происходит:** `earnRatePercent`/`redeemRatePercent` валидируются только на неотрицательность и переводятся в bps, верхний предел отсутствует.
   - **Риск:** ошибочная настройка (например, 500% или 5000%) ведёт к мгновенному “раздутию” баллов и финансовому ущербу/абузу.
   - **Примечание:** в других местах (например, `earnBps` в `UpdateMerchantSettingsDto`) лимит 0–10000 уже задан, здесь аналогичный лимит отсутствует.

4) **`GET /portal/loyalty/mechanics` может падать на невалидном статусе**
   - **Где:** `api/src/loyalty-program/controllers/mechanics.controller.ts` (параметр `status` приводится к `MechanicStatus` без валидации) + `api/src/loyalty-program/loyalty-program.service.ts` (`listMechanics` передаёт его в Prisma).
   - **Что происходит:** при передаче произвольного `status` (не из enum) Prisma может вернуть 500.
   - **Риск:** нестабильность API/ошибки в проде при некорректных запросах или ручной подстановке параметров.
