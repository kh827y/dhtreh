# Аудит: настройки бонусов (merchant-portal)

## P1 — Critical

- **Пересохранение настроек бонусов может стереть legacy-правила начисления/списания**
  - **Риск**: если у мерчанта ещё используется старый формат `rulesJson` (массив правил), то любое сохранение настроек бонусов заменяет массив на объект с одним ключом `allowEarnRedeemSameReceipt`. Это удаляет все остальные правила и может полностью изменить логику начислений/списаний, антифрода и других механик.
  - **Где**:
    - `api/src/loyalty-program/controllers/redeem-limits.controller.ts` — `ensureObject()` превращает массив в `{}` и затем обновляет `rulesJson`.
    - `merchant-portal/app/api/portal/loyalty/redeem-limits/route.ts` — при `rulesJson` в виде массива берёт `{}` и записывает обратно только `allowEarnRedeemSameReceipt`.
  - **Как исправить**: при обновлении `allowEarnRedeemSameReceipt` сохранять исходный формат `rulesJson` (если это массив — модифицировать без перезаписи), либо привести правила через общий `normalizeRulesJson()` и обновлять только нужное поле без удаления остальных правил.

## P2 — Medium

- **UI «Настройки бонусов» не использует backend-эндпоинт `/portal/loyalty/redeem-limits`**
  - **Риск**: логика и валидации в `RedeemLimitsController` фактически не используются, а фронт всегда работает через `/portal/settings`. Это создаёт риск расхождения поведения (например, при изменении валидации или полномочий в специализированном контроллере) и повышает вероятность случайной перезаписи несвязанных настроек при изменении схемы `/portal/settings`.
  - **Где**:
    - `merchant-portal/app/loyalty/mechanics/bonus-settings/page.tsx` → `/api/portal/loyalty/redeem-limits`.
    - `merchant-portal/app/api/portal/loyalty/redeem-limits/route.ts` — проксирует в `/portal/settings` вместо `/portal/loyalty/redeem-limits`.
    - `api/src/loyalty-program/controllers/redeem-limits.controller.ts` — специализированный, но не используемый в портале контроллер.
  - **Как исправить**: переключить `merchant-portal` на прямую работу с `/portal/loyalty/redeem-limits` и убрать дублирующую логику в proxy-роуте.
