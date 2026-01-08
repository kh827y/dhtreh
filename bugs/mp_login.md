# Аудит: merchant-portal логин и /portal/auth/*

Недоработки отсортированы по убыванию критичности.

## P1 — High

- **[SEC][Portal Auth] Логин сотрудника ищется только по email без привязки к мерчанту → риск доступа в чужой мерчант**
  - **Риск:** если одинаковый email используется в нескольких мерчантах, `POST /portal/auth/login` выберет первый попавшийся `Staff` и при совпадении пароля выдаст токен на *не того* мерчанта (cross‑tenant доступ/утечка данных).
  - **Причина:** `staff.findFirst({ where: { email, status: ACTIVE, portalAccessEnabled: true, canAccessPortal: true } })` без фильтра по `merchantId`; при этом `Staff.email` не уникален глобально (есть только индекс `[merchantId, email]`).
  - **Где:** `api/src/portal-auth/portal-auth.controller.ts` (login), `api/prisma/schema.prisma` (Staff).
  - **Что сделать (просто):** требовать в логине явно выбранный `merchantId`/subdomain и искать `Staff` по `{ merchantId, email }`, либо сделать `Staff.email` глобально уникальным (если это не ломает текущую модель бизнеса).

## P2 — Medium

- **[SEC][Portal Auth] Обновление токена не проверяет актуальность доступа (staff/merchant) → отключённые аккаунты сохраняют доступ до 30 дней**
  - **Риск:** после отключения доступа сотруднику (`status != ACTIVE`, `portalAccessEnabled=false`, `canAccessPortal=false`) или выключения портала у мерчанта можно продолжать обновлять токены через `POST /portal/auth/refresh` до истечения refresh‑токена (30 дней), сохраняя доступ в портал.
  - **Причина:** `refresh()` валидирует только подпись refresh‑JWT и сразу выдаёт новый access/refresh без проверки в БД статуса сотрудника/мерчанта и флага `portalLoginEnabled`.
  - **Где:** `api/src/portal-auth/portal-auth.controller.ts` (refresh).
  - **Что сделать (просто):** при refresh загружать `Staff`/`Merchant` по данным из токена и проверять актуальные флаги/статус; при несоответствии возвращать 401 и очищать куки на фронте.
