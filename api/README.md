# API (NestJS)

Основной backend сервиса лояльности. Отвечает за операции начисления/списания, уровни, портал и интеграции.

## Быстрый старт

1) Запуск БД/Redis — см. `README.md` в корне.
2) Проверьте `api/.env`.
3) Миграции:

```bash
pnpm --filter api prisma migrate dev
```

4) Запуск API:

```bash
pnpm --filter api start:dev
```

## Воркеры

Фоновые задачи запускаются отдельным процессом:

```bash
pnpm --filter api start:worker
```

Для воркера обычно устанавливают `WORKERS_ENABLED=1` и `NO_HTTP=1`.

## Тесты

```bash
pnpm --filter api test
pnpm --filter api test:e2e
```
