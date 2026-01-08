# Аудит админ‑документации (admin/app/docs/*)

Недоработки отсортированы по убыванию критичности.

## P1 — High

### 1) Документация мини‑аппы обещает обязательную авторизацию `Authorization: tma <initData>`, но API это не гарантирует
**Где в документации:** `admin/app/docs/miniapp/page.tsx` (абзац про «все дальнейшие запросы»).

**Факт в коде:** большинство эндпоинтов мини‑аппы в `api/src/loyalty/loyalty.controller.ts` (например, `GET /loyalty/bootstrap`, `GET /loyalty/profile`, `GET /loyalty/transactions`, `GET /loyalty/consent`, `GET /loyalty/balance`) не защищены `TelegramMiniappGuard`. Guard применяется только к отдельным публичным маршрутам (`api/src/loyalty/loyalty.public.controller.ts`).

**Риск/эффект:** документация создаёт ложное ощущение безопасности. Интеграторы/мерчанты могут считать, что без `initData` доступ невозможен, хотя фактически запросы проходят по `merchantId + customerId`. Это повышает риск утечек при компрометации `customerId` и ломает ожидаемую модель авторизации мини‑аппы.

---

### 2) Примеры POS‑интеграции используют поля, которые API не принимает
**Где в документации:** `admin/app/docs/integration/page.tsx` — примеры `positions: [{ id_product, qty, price, accruePoints }]`.

**Факт в коде:**
- DTO `LoyaltyPositionDto` в `api/src/loyalty/dto.ts` не содержит `id_product` и `accruePoints`.
- Глобальный `ValidationPipe` включён с `whitelist: true`, поэтому неизвестные поля из запроса отбрасываются.

**Риск/эффект:**
- `id_product` не сохраняется и не участвует в правилах/аналитике, что делает примеры из документации нерабочими.
- `accruePoints=false` не применяется → списания/начисления могут быть рассчитаны неверно, что влияет на финансы и доверие к программе лояльности.

---

### 3) Раздел «CRM‑виджет» описывает эндпоинты `/merchants/:id/customer/*`, которые недоступны мерчантам
**Где в документации:** `admin/app/docs/integration/page.tsx` (CRM‑виджет).

**Факт в коде:** `api/src/merchants/merchants.controller.ts` помечен `AdminGuard` + `AdminIpGuard` и требует `X-Admin-Key`. Эти маршруты предназначены для админ‑панели, а не для CRM‑интеграции мерчанта. Аналогичные CRM‑ручки есть в `api/src/crm/crm.controller.ts`, но они тоже под `AdminGuard` и не подходят для внешних мерчантов.

**Риск/эффект:** интеграция CRM по документации не заработает в проде без доступа к админ‑ключу и IP‑allowlist. Это ведёт к блокеру внедрения и ошибочной архитектуре (мерчанты не должны получать админ‑ключ).

## P2 — Medium

### 4) Документация мини‑аппы неверно описывает приоритет определения `merchantId`
**Где в документации:** `admin/app/docs/miniapp/page.tsx` — порядок: `start_param` → `?merchantId=` → сегмент пути `/miniapp/<merchantId>` → env.

**Факт в коде:** `miniapp/lib/useMiniapp.ts` сначала использует query‑параметры, затем пытается извлечь `merchantId` из `start_param/startapp`. Поддержки сегмента пути нет (нет роутов вида `/miniapp/[merchantId]`).

**Риск/эффект:** оператор опирается на неверный приоритет, и мерчант может открываться не тот, особенно если URL содержит `merchantId` и `start_param` одновременно.

## P3 — Low

### 5) Документация деплоя админки содержит неиспользуемые переменные окружения
**Где в документации:** `admin/app/docs/deployment/page.tsx` — `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_API_KEY`.

**Факт в коде:** админка использует серверные env (`API_BASE`, `ADMIN_UI_PASSWORD`, `ADMIN_SESSION_SECRET`, `ADMIN_KEY`) и нигде не читает `NEXT_PUBLIC_*` переменные (`admin/app/layout.tsx`, `admin/app/api/admin/[...path]/route.ts`).

**Риск/эффект:** лишние переменные вводят в заблуждение и усложняют деплой (особенно для SMB‑клиентов, на которых ориентирован продукт).
