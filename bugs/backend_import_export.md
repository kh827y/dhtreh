# Аудит import/export (backend)

Недоработки отсортированы по убыванию важности.

## P0 — Critical

### 1) Один общий API‑ключ даёт доступ ко всем мерчантам (cross‑tenant экспорт/импорт)
- **Риск:** любой, кто получил `API_KEY`, может экспортировать/импортировать данные **любого** мерчанта, просто передав `merchantId` в query/body (ПДн клиентов, транзакции, балансы, массовые операции).
- **Где:** контроллер `ImportExportController` принимает `merchantId` из query/body для всех эндпоинтов, а `ApiKeyGuard` проверяет только глобальный `API_KEY` без привязки к мерчанту. (`api/src/import-export/import-export.controller.ts`, `api/src/guards/api-key.guard.ts`)
- **Почему критично:** это прямая утечка ПДн и финансовых данных между компаниями, без какой-либо сегментации ключей.

## P1 — High

### 2) Импорт транзакций неидемпотентен и создаёт дубликаты при повторной загрузке
- **Риск:** повторный импорт того же файла добавит новые транзакции (дубли), потому что `orderId` необязателен и при отсутствии генерируется `import_${Date.now()}_${i}`, а уникального ограничения по `orderId` в `Transaction` нет. Это приводит к повторным начислениям/списаниям и искажению отчётов.
- **Где:** `ImportExportService.importTransactions`, модель `Transaction` без уникального ключа (`api/src/import-export/import-export.service.ts`, `api/prisma/schema.prisma`).

### 3) Эндпоинт bulk‑update фактически не выполняет заявленные операции
- **Риск:** `POST /import-export/bulk-update/customers` принимает `operation` (`add_points`, `set_balance`, `add_tags`, `update_fields`) и `value`, но полностью игнорирует их и просто вызывает `importCustomers` с `updateExisting=true`. Это может привести к ошибочной уверенности, что баллы/теги обновлены, хотя они не изменятся (или будут изменены не тем способом, например через `balance_points` в файле).
- **Где:** `ImportExportController.bulkUpdateCustomers` (`api/src/import-export/import-export.controller.ts`).

### 4) Экспорт CSV уязвим к CSV/Excel‑инъекциям
- **Риск:** значения из БД вставляются в CSV без нейтрализации формул. Если в имени/email/тегах клиента лежит строка вида `=HYPERLINK(...)`, при открытии файла в Excel возможен запуск формул (фишинг/утечки).
- **Где:** `streamCustomersCsv`/`streamTransactionsCsv` используют `csvCell`, но не экранируют формульные префиксы (`=`, `+`, `-`, `@`). (`api/src/import-export/import-export.service.ts`).

## P2 — Medium

### 5) `GET /import-export/stats/:merchantId` — фактически не работает и возвращает заглушку
- **Проявления:** метод помечен как `stats/:merchantId`, но внутри читает `merchantId` из query (`@Query`), путь не используется; в ответе всегда `null/0` без чтения БД.
- **Риск:** аналитика импорта/экспорта не работает, интерфейсы/интеграции получают ложные данные.
- **Где:** `ImportExportController.getImportExportStats` (`api/src/import-export/import-export.controller.ts`).

### 6) Нет валидации обязательных параметров `format/type` → 500 на некорректном запросе
- **Проявления:** если `format` не передан или передан ошибочный, сервис пытается парсить Excel или генерировать шаблон из `undefined`, что приводит к 500.
- **Риск:** нестабильность API и лишние ошибки при интеграции.
- **Где:** `importCustomers`, `importTransactions`, `getImportTemplate` (контроллер/сервис `api/src/import-export/*`).

### 7) Потенциальный DoS по памяти на импорте
- **Риск:** загрузка больших файлов полностью читается в память (`FileInterceptor` + `file.buffer`), без лимитов по размеру и типу — можно положить процесс/увеличить задержки.
- **Где:** `importCustomers`, `importTransactions`, `bulkUpdateCustomers` (`api/src/import-export/import-export.controller.ts`).

## P3 — Low

### 8) Импорт транзакций не проверяет тип/сумму и может писать мусорные значения
- **Проявления:** `type` берётся как строка из файла (`row['Тип']`), `amount` — `parseInt` без проверок на знак/диапазон; при неверном типе Prisma будет бросать ошибку, при неверной сумме — появятся “грязные” записи или непредсказуемые ошибки.
- **Риск:** рост количества ошибок импорта и неконсистентные данные.
- **Где:** `ImportExportService.importTransactions` (`api/src/import-export/import-export.service.ts`).
