# Security/Abuse аудит (portal/admin/cashier/miniapp)

Ниже — проблемы, отсортированные по убыванию критичности. Дубликаты из `FIX.md` не повторяю.

## P1 — High

### 2) Глобальный `TELEGRAM_BOT_TOKEN` фактически открывает miniapp для всех мерчантов
**Риск:** если в окружении задан `TELEGRAM_BOT_TOKEN`, любой пользователь с валидным `initData` этого бота может авторизоваться в miniapp для *любого* `merchantId` (даже если бот не подключён у мерчанта), создавать `Customer` и получать доступ к функционалу (в т.ч. начислениям/промо).

**Где:**
- `api/src/loyalty/telegram-auth.helper.ts` — `resolveTelegramAuthContext()` берёт `process.env.TELEGRAM_BOT_TOKEN` при отсутствии `merchantSettings.telegramBotToken`.
- `api/src/loyalty/loyalty.controller.ts` — `POST /loyalty/teleauth` использует глобальный токен по умолчанию.
- `api/src/guards/cashier.guard.ts` — `ensureTelegramContextForRequest()` прокидывает `tokenHint`, но при его отсутствии helper всё равно падает на глобальный токен.

**Как воспроизвести:**
1. В проде задан `TELEGRAM_BOT_TOKEN` (общий бот).
2. Запрос:
   ```
   POST /loyalty/teleauth { "merchantId": "M-2", "initData": "<initData от общего бота>" }
   ```
3. Клиент получит `customerId` и сможет идти в miniapp‑эндпоинты мерчанта без явного подключения Telegram‑бота.

**Что делать:**
- Убрать fallback на `TELEGRAM_BOT_TOKEN` для prod (fail‑fast, если у мерчанта не задан токен).
- Дополнительно требовать `merchant.telegramBotEnabled === true` перед выдачей доступа.
- Явно разделить legacy/dev режим (например, через `ALLOW_GLOBAL_TG_BOT=1` только в dev).

## P2 — Medium

### 3) Portal‑логин для сотрудников ищет пользователя только по email (без мерчанта)
**Риск:** если у двух мерчантов есть сотрудники с одинаковым email (в схеме это разрешено), логин может совпасть с «чужим» аккаунтом — риск кросс‑тенант доступа при совпадении пароля/ролей или «плавающих» результатов `findFirst`.

**Где:**
- `api/src/portal-auth/portal-auth.controller.ts` — поиск staff по `email` без `merchantId`.
- `api/prisma/schema.prisma` — в `Staff` нет уникального ограничения на `email` (есть только `@@unique([merchantId, login])`).

**Что делать:**
- Явно привязывать логин к мерчанту (например, требовать `merchantId` или доменное пространство в email).
- Добавить уникальность `@@unique([merchantId, email])` и искать по паре `merchantId + email`.

### 4) PIN‑коды кассиров хранятся и проверяются в открытом виде, без лимитов попыток
**Риск:** при утечке БД/логов известны рабочие PIN‑коды кассиров; плюс 4‑значный PIN без lockout можно перебрать (endpoint throttling 60/min даёт возможность перебора за разумное время). Это прямой риск несанкционированных списаний/начислений.

**Где:**
- `api/prisma/schema.prisma` — `StaffOutletAccess.pinCode` хранится plaintext, `pinCodeHash` не используется.
- `api/src/merchants/merchants.service.ts` — `resolveActiveAccessByPin()` сравнивает `pinCode` в явном виде, нет счётчиков блокировки.

**Что делать:**
- Хранить только `pinCodeHash`, сравнивать через безопасный hash (bcrypt/argon2).
- Включить простую блокировку по `pinRetryCount`/таймауту на PIN (на уровне `StaffOutletAccess` или по IP).

### 5) Начисления по промо обходят лимиты/блокировки начислений
**Риск:** даже если для клиента выставлен `accrualsBlocked` или действуют дневные лимиты, `POST /loyalty/promotions/claim` начисляет баллы без проверки этих ограничений. Это позволяет обходить анти‑фрод и бизнес‑лимиты.

**Где:**
- `api/src/loyalty/loyalty.controller.ts` — `claimPromotion()` не вызывает `ensureCustomerContext()` и не учитывает `earnDailyCap/earnCooldown`.

**Что делать:**
- Перед выдачей бонуса проверять `ensureCustomerContext()` и лимиты начислений (по аналогии с quote/commit).
- Либо явно документировать, что промо обходят лимиты, и добавить отдельный флаг `promoBypassLimits` (по умолчанию `false`).
