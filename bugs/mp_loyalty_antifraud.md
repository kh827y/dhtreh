# Аудит: Loyalty → Antifraud (merchant-portal + /antifraud/*)

Ниже — найденные проблемы, отсортированные по убыванию критичности.

## P1 — Высокая

1. **Сохранение антифрод‑настроек может повредить legacy `rulesJson` и сбросить правила механик.**
   - Бэкенд явно поддерживает legacy‑формат `rulesJson` в виде массива (см. валидацию и совместимость), но UI‑роут портала ожидает объект и при POST «разворачивает» массив в объект с числовыми ключами, добавляя только `af`. В результате любые старые правила (rules‑механики) теряются/ломаются после нажатия «Сохранить» в антифроде. Это критично для действующих мерчантов с legacy‑настройками.
   - Где: `merchant-portal/app/api/portal/loyalty/antifraud/route.ts` (логика чтения/записи `rulesJson`), `api/src/merchants/merchants.service.ts` (поддержка/валидация legacy‑формата массива).【F:merchant-portal/app/api/portal/loyalty/antifraud/route.ts†L34-L100】【F:api/src/merchants/merchants.service.ts†L619-L713】

2. **Глобальный `API_KEY` без привязки к мерчанту: `/antifraud/*` допускает межмерчантный доступ.**
   - Все эндпоинты `/antifraud/*` защищены только `ApiKeyGuard`, который проверяет *единственный* ключ из ENV, но не проверяет, что запрошенный `merchantId` принадлежит вызывающей стороне. При утечке или шаринге ключа между интеграторами можно читать историю/статистику и писать review для чужих мерчантов.
   - Где: `api/src/antifraud/antifraud.controller.ts` (merchantId в query/body), `api/src/guards/api-key.guard.ts` (глобальный ключ без привязки к мерчанту).【F:api/src/antifraud/antifraud.controller.ts†L21-L97】【F:api/src/guards/api-key.guard.ts†L8-L71】

## P2 — Средняя

1. **`GET /antifraud/history/:customerId` возвращает аудит по мерчанту без фильтра по `customerId`.**
   - В истории проверок клиенту возвращаются `adminAudit` записи по всему мерчанту, а не только по выбранному клиенту. Это искажает данные, и потенциально раскрывает информацию о других клиентах (особенно при использовании ключа в интеграциях).
   - Где: `api/src/antifraud/antifraud.service.ts` (`getCustomerHistory` не фильтрует `adminAudit` по `customerId`).【F:api/src/antifraud/antifraud.service.ts†L544-L562】

2. **`POST /antifraud/:checkId/review` не обновляет реальные проверки и не связан с `FraudCheck`.**
   - Review просто пишет запись в `adminAudit`, но не связывается с `FraudCheck` и не меняет статус проверок. В итоге ручная разметка не влияет на антифрод‑историю/аналитику и может вводить в заблуждение.
   - Где: `api/src/antifraud/antifraud.service.ts` (`reviewCheck` vs `recordFraudCheck`).【F:api/src/antifraud/antifraud.service.ts†L564-L678】

## P3 — Низкая

1. **Части антифрод‑скоринга являются заглушками и не дают эффекта.**
   - Геолокация: в `checkGeolocation` расстояние всегда `0` → фактор никогда не срабатывает.
   - Чёрный список: `checkBlacklist` всегда возвращает `false`.
   - В продакшне это создаёт ложное ощущение полноты проверки, хотя фактически часть факторов не работает.
   - Где: `api/src/antifraud/antifraud.service.ts` (`checkGeolocation`, `checkBlacklist`).【F:api/src/antifraud/antifraud.service.ts†L320-L395】
