# Аудит merchant-portal/app/audiences/page.tsx и /portal/audiences

## Высокая важность

1) **Модалка состава аудитории загружает только первые 200 клиентов без серверной пагинации.**
   - В `openMembers` жёстко передаётся `limit=200`, а дальше используется только клиентская пагинация/поиск по уже загруженному массиву. В сегментах больше 200 человек будет отображаться лишь часть участников, при этом шапка модалки показывает “из {viewingAudience.count}”. Пользователь не сможет просмотреть или проверить весь сегмент, а аналитика по аудитории визуально будет расходиться с реальностью.
   - Где: `merchant-portal/app/audiences/page.tsx` (`openMembers`, `paginatedMembers`).

2) **Список участников сегмента по умолчанию фильтруется “только зарегистрированные”, что занижает состав аудитории.**
   - Запрос в модалке не передаёт `registeredOnly=0`, а в `PortalCustomersService.list` дефолт `registeredOnly = true`. В результате часть клиентов сегмента (без полного профиля) не попадает в выдачу, хотя в сегменте они учитываются. Это искажает фактический состав и метрики сегмента.
   - Где: `merchant-portal/app/audiences/page.tsx` (запрос без `registeredOnly`), `api/src/portal/customers.service.ts` (дефолт `registeredOnly = true`).

## Средняя важность

3) **Модалка ожидает поля `spendTotal/daysSinceLastVisit/levelId/levelName`, но бэкенд `/portal/customers` (в варианте из `CustomerAudiencesService`) отдаёт другой формат.**
   - `mapMember` берёт LTV и дату последней покупки из `spendTotal`/`daysSinceLastVisit`, но `CustomerAudiencesService.listCustomers` возвращает объект `{ total, items }`, где в `items` есть `stats`, а не эти поля. В таком случае LTV и “посл. покупка” превращаются в `0/—`, а уровень клиента — в дефолт. Это приводит к неверной аналитике в модалке сегмента.
   - Где: `merchant-portal/app/audiences/page.tsx` (`mapMember`), `api/src/customer-audiences/customer-audiences.service.ts` (`listCustomers`).

4) **При редактировании аудитории описание не пересчитывается и может устаревать.**
   - В `handleSave` описание берётся из уже сохранённого `currentAudience.description`, а пересчёт по новым фильтрам вызывается только если описание пустое. В итоге при изменении фильтров описание сегмента остаётся старым, что вводит в заблуждение и в интерфейсе, и в других местах, где это описание используется.
   - Где: `merchant-portal/app/audiences/page.tsx` (`handleSave`).
