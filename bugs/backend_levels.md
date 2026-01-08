# Аудит backend уровней (GET /levels/:merchantId/:customerId)

Недоработки отсортированы по убыванию важности.

## P1 — High

- **[SEC][Auth] `GET /levels/:merchantId/:customerId` публичный и не требует авторизации**
  - **Риск**: любой, кто узнает `customerId`, может получать уровень и прогресс (косвенно — активность/объём покупок) по любому мерчанту; для miniapp отсутствует привязка к Telegram‑контексту (можно подменить `customerId`).
  - **Где**: `api/src/levels/levels.controller.ts` (нет guard’ов), `api/src/levels/levels.service.ts` (принимает `merchantId/customerId` без доп. проверки контекста).

- **[Logic][TTL] Авто‑назначенные уровни не истекают и не понижаются, хотя расчёт идёт по окну 365 дней**
  - **Риск**: клиент сохраняет повышенные лимиты начисления/списания навсегда, даже если перестал выполнять пороги за последние 365 дней — «TTL» уровней фактически игнорируется.
  - **Причина**: `promoteTierIfEligible` пишет `expiresAt: null`, а `getLevel` при наличии назначения всегда отдаёт назначенный уровень, не сверяя его с текущим `value`.
  - **Где**: `api/src/loyalty/loyalty.service.ts` (`promoteTierIfEligible`), `api/src/levels/levels.service.ts` (override по assignment), `api/src/loyalty/levels.util.ts` (`periodDays=365`).

## P2 — Medium

- **[Logic][Limits] Чтение `/levels` создаёт «базовый» tier с дефолтными лимитами (3%/50%) и меняет фактические правила начислений**
  - **Риск**: если мерчант не настраивал уровни и рассчитывает на старые `merchantSettings.earnBps/redeemLimitBps`, единичный вызов `/levels` создаёт `LoyaltyTier` с дефолтами и дальше именно он используется при расчётах начисления/списания — поведение меняется «из‑за чтения».
  - **Где**: `api/src/levels/levels.service.ts` (вызов `ensureBaseTier`), `api/src/loyalty/tier-defaults.util.ts` (дефолты 300/5000), `api/src/loyalty/loyalty.service.ts` (приоритет `LoyaltyTier` над базовыми настройками).

- **[API][Ошибки] Для несуществующих/чужих `customerId` возвращается 500 вместо 4xx**
  - **Риск**: miniapp/клиенты получают «Internal Server Error» вместо понятной 404/400; сложнее отлаживать и мониторить.
  - **Причина**: выбрасывается `Error('customer not found')`, который не переводится в HTTP‑статус.
  - **Где**: `api/src/levels/levels.service.ts` (ручные `throw new Error`).
