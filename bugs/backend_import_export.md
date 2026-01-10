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

## P2 — Medium

### 7) Потенциальный DoS по памяти на импорте
- **Риск:** загрузка больших файлов полностью читается в память (`FileInterceptor` + `file.buffer`), без лимитов по размеру и типу — можно положить процесс/увеличить задержки.
- **Где:** `importCustomers`, `importTransactions`, `bulkUpdateCustomers` (`api/src/import-export/import-export.controller.ts`).
