# Аудит admin-audit эндпоинтов

Проверены эндпоинты:
- `GET /admin/audit`
- `GET /admin/audit/:id`
- `GET /admin/audit/csv`

Источники: `api/src/admin-audit.controller.ts`, `api/src/admin-audit.interceptor.ts`, `api/src/admin.guard.ts`, `api/src/admin-ip.guard.ts`, сопутствующие контроллеры, которые пишут в `adminAudit`.

## P1 — высокий приоритет

### 2) [SEC][Access] Whitelist по IP можно обойти подменой `X-Forwarded-For`
**Риск:** если приложение не настроено с `trust proxy`, атакующий может подставить `X-Forwarded-For` и пройти `AdminIpGuard`, получив доступ к `/admin/audit` и другим админ‑эндпоинтам.  
**Детали:** `AdminIpGuard` всегда берёт IP из `x-forwarded-for` и не проверяет доверенность прокси/настройку `trust proxy`.  
**Где:** `api/src/admin-ip.guard.ts` (функция `getClientIp`).

## P2 — средний приоритет

### 4) [AUDIT] Аудит неполный: логируются только успешные write‑операции и далеко не все админ‑действия
**Риск:** критические события остаются без следа (ошибки, неудачные попытки, часть админ‑операций), что делает аудит невалидным для расследований.  
**Детали:** `AdminAuditInterceptor` логирует только write‑запросы и делает запись через `tap` после успешного ответа — ошибки/исключения не попадают в лог. Кроме того, interceptor подключён только к `MerchantsController`; другие админ‑контроллеры либо пишут аудит вручную (и не всегда полно), либо не пишут его вообще.  
**Где:** `api/src/admin-audit.interceptor.ts`, `api/src/merchants/merchants.controller.ts`, прочие админ‑контроллеры.

### 5) [AUDIT] Недостоверность данных аудита: `actor` берётся из заголовка клиента без валидации
**Риск:** любой, кто знает `ADMIN_KEY`, может подставить произвольный `X-Admin-Actor` и подменять историю действий.  
**Детали:** `AdminAuditInterceptor` читает `x-admin-actor` и пишет в лог как есть; связи с реальной учётной записью/сессией нет.  
**Где:** `api/src/admin-audit.interceptor.ts`.

## P3 — низкий приоритет

Нет актуальных пунктов.
