# Аудит backend loyalty mechanics

Проверены эндпоинты `GET/POST/PUT/DELETE /portal/loyalty/mechanics` и влияние механик на начисления/списания.

## P0 — Critical

- **CRUD механик не влияет на реальные начисления/списания и работу механик.**
  - Эндпоинты `/portal/loyalty/mechanics` работают только с таблицей `LoyaltyMechanic`, но реальная логика механик использует `merchantSettings.rulesJson` (день рождения, winback/auto-return, TTL, регистрационный бонус) и отдельные параметры в `merchantSettings`.
  - В результате включение/выключение или изменение механик через эти endpoints **не влияет** на начисления/списания: бонусы/уведомления продолжают выдаваться/работать по правилам из `rulesJson`, а не по `LoyaltyMechanic.status/settings`.
  - Риск: менеджер отключил механику через портал (или UI использует этот CRUD), но система продолжает начислять/списывать баллы → абуз баллов, финансовые потери, несоответствие ожиданиям.
  - Где видно несоответствие:
    - `LoyaltyProgramService` CRUD механик (`LoyaltyMechanic`).
    - `BirthdayWorker`, `AutoReturnWorker`, `PointsTTLReminderWorker`, `LoyaltyService.grantRegistrationBonus` читают `merchantSettings.rulesJson`.

## P1 — High

- **Отсутствует единственный источник истины для механик (дублирование хранилищ).**
  - `LoyaltyMechanic` хранит `status/settings`, но эти значения нигде не синхронизируются с `merchantSettings.rulesJson`.
  - Если часть UI/админки читает `LoyaltyMechanic`, а бизнес-логика — `rulesJson`, то конфигурация расходится. Это вызывает «ложное» состояние механик, неконсистентную аналитику и сложности поддержки.

## P2 — Medium

- **Можно создать несколько механик одного типа для одного мерчанта.**
  - В `LoyaltyMechanic` нет уникального ограничения по `(merchantId, type)`; контроллер тоже не проверяет уникальность.
  - Это приводит к дублирующимся механикам (например, два `BIRTHDAY`), с разными `status/settings` и непредсказуемым поведением UI и аналитики.

- **Изменение статуса через `PUT /portal/loyalty/mechanics/:id` не обновляет `enabledAt/disabledAt`.**
  - `updateMechanic()` позволяет менять `status`, но timestamps включения/выключения выставляются только в `changeMechanicStatus()`.
  - Риск: аналитика и аудит механики становятся некорректными (механика включена, но `enabledAt` пустой, и наоборот).

- **`actorId` доверяется телу запроса.**
  - `create/update/status` принимают `actorId` из body и записывают его в `createdById/updatedById`.
  - Это позволяет подменять автора изменений и искажать аудит действий (любая staff-сессия может указать чужой `actorId`).

