# Аудит merchant-portal: настройки торговых точек (/settings/outlets, /outlets) и /portal/outlets

## P1 — Высокая

1. **Удаление торговой точки — жёсткий `DELETE` без безопасной деактивации/архивации и без проверки зависимостей.**
   - В UI есть кнопка «Удалить», которая вызывает `DELETE /api/portal/outlets/:id`, а backend делает прямой `prisma.outlet.delete`. Это либо ломается из‑за FK (транзакции/чеки/другие сущности), либо приводит к потере истории, если каскады включены.
   - Риск: реальные точки с историей продаж невозможно удалить (ошибка без понятного сообщения), либо случайно удалить исторические данные, что критично для продакшена.
   - Где смотреть: `merchant-portal/app/outlets/page.tsx` (кнопка удаления), `merchant-portal/app/api/portal/outlets/[id]/route.ts`, `api/src/portal/portal.controller.ts`, `api/src/merchants/merchants.service.ts`, связи `Outlet` в `api/prisma/schema.prisma`.

## P3 — Низкая
Нет актуальных пунктов.
