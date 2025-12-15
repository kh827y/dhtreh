
## Merchant Portal — редизайн (new design)

### Цель

- Перевести Merchant Portal на новый дизайн (переносим стили/верстку из папки `new design`, но без зависимостей на неё в коде).
- Удалить legacy-стили/legacy-страницы по мере переноса.
- Убрать заглушки/локальные фоллбеки в прод-коде.
- Подключать UI к реальному backend API.
- Покрыть актуальные части тестами (unit/integration + E2E).

### Текущий фокус (Foundation)

- Tailwind CSS интеграция в `merchant-portal`.
- Новая базовая оболочка: Sidebar + Header + Content layout.
- Login (новый дизайн) + корректные редиректы/guards.
- Экран блокировки при просрочке подписки (новый дизайн) + кнопка продления через Telegram.

### Сделано

- Исправлен logout: `merchant-portal/components/AppHeader.tsx` вызывает `POST /api/session/logout`.
- Убран фейковый fallback-конфиг мастера настройки в `merchant-portal/app/page.tsx` (ошибка загрузки отображается явно).
- Убран «фейковый успех» в `GET /api/portal/setup-status`: теперь при сбоях backend возвращается ошибка (без подстановки `false` по умолчанию).
- Перенесены на Tailwind компоненты оболочки: `app/layout.tsx`, `components/SidebarNav.tsx`, `components/AppHeader.tsx`.
- Переписан `app/login/page.tsx` под новый дизайн (Tailwind), сохранена поддержка 2FA.
- Переписан экран просрочки подписки (lock-screen) под новый дизайн (Tailwind), кнопка ведёт в Telegram: https://t.me/chavron_oceann.
- Добавлен redirect-параметр при редиректе на `/login` и возврат на исходную страницу после логина.

### Дальше (в порядке выполнения)

1) Чистка (по мере переноса):
   - убрать/скрыть из UI разделы-заглушки, которые не подключены к API;
   - удалить неиспользуемый legacy код/стили после переноса.

2) Тесты:
   - базовые тесты на auth flow (login/logout), layout, guards;
   - E2E smoke: login → главная → logout.
