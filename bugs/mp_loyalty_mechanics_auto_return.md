# Аудит: механика «Автовозврат клиентов» (merchant-portal)

Найденные проблемы отсортированы по убыванию критичности.

## P1 — Критично

### 1) UI обращается к несуществующему API для настроек механики
**Риск:** страница «Автовозврат клиентов» и тумблер в списке механик не смогут загрузить/сохранить настройки (получат 404), настройка фактически не работает в проде.

**Почему это баг:** фронтенд ожидает эндпоинт `/api/portal/loyalty/auto-return`, но в merchant-portal нет proxy‑роута, а в backend нет контроллера `/portal/loyalty/auto-return`.

**Где смотреть:**
- `merchant-portal/app/loyalty/mechanics/auto-return/page.tsx` — `fetch("/api/portal/loyalty/auto-return")` при загрузке и сохранении.
- `merchant-portal/app/loyalty/mechanics/page.tsx` — тумблер использует тот же эндпоинт.
- `api/src/portal/portal.controller.ts` — отсутствуют методы для `/portal/loyalty/auto-return`.

**Что сделать (без overengineering):** добавить простой portal‑endpoint (GET/PUT) для чтения/записи `rulesJson.autoReturn` или проксировать на существующий сервис, если он есть.

### 2) Выключатель «Подарить баллы» в UI не влияет на начисления
**Риск:** мерчант думает, что подарочные баллы отключены, но воркер продолжает начислять баллы (абуз и незапланированные расходы).

**Почему это баг:** UI отправляет `giftEnabled`, но backend/воркер вообще не использует этот флаг — начисление определяется только `giftPoints`.

**Где смотреть:**
- `merchant-portal/app/loyalty/mechanics/auto-return/page.tsx` — в payload есть `giftEnabled`, но `giftPoints` отправляется всегда.
- `api/src/auto-return.worker.ts` — `parseConfig()` берёт `giftPoints`, не учитывает `giftEnabled`.

**Что сделать:** добавить `giftEnabled` в правила/конфиг и в воркере начислять баллы только при `giftEnabled=true` (или принудительно обнулять `giftPoints` при выключении в API‑слое).

## P2 — Средняя критичность

### 3) Флаг «Сгораемые баллы» не соблюдается воркером
**Риск:** клиентам могут сгорать подарочные баллы даже при выключенной опции, что создаёт конфликт ожиданий/реальности и жалобы.

**Почему это баг:** UI отправляет `giftBurnEnabled=false`, но воркер строит срок действия только из `giftTtlDays` и игнорирует `giftBurnEnabled`.

**Где смотреть:**
- `merchant-portal/app/loyalty/mechanics/auto-return/page.tsx` — `giftBurnEnabled` и `giftTtlDays` в payload.
- `api/src/auto-return.worker.ts` — `giftTtlDays` применяется без учёта `giftBurnEnabled`.

**Что сделать:** в конфиге учитывать `giftBurnEnabled` и использовать `giftTtlDays` только когда флаг включён.

### 4) Флаг «Повторять попытку возврата» не соблюдается воркером
**Риск:** повторные попытки могут отправляться даже при выключенном флаге, если в правилах сохранены `repeatDays`.

**Почему это баг:** UI отправляет `repeatEnabled`, но воркер игнорирует его и включает повтор по факту `repeatDays > 0`.

**Где смотреть:**
- `merchant-portal/app/loyalty/mechanics/auto-return/page.tsx` — `repeatEnabled` в payload.
- `api/src/auto-return.worker.ts` — `parseConfig()` ориентируется только на `repeatDays`/`repeatAfterDays`.

**Что сделать:** уважать `repeatEnabled` (например, хранить `repeat: { enabled, days }` и использовать его в воркере).
