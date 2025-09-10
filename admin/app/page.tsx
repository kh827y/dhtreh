import DashboardStatus from '../components/DashboardStatus';

export default function Page() {
  return (
    <div>
      <DashboardStatus />
      <p style={{ marginTop: 12 }}>Выберите раздел в меню: «Настройки мерчанта», «Telegram / Мини‑аппа», «Outbox», «Точки», «Устройства», «Сотрудники», «Документация».</p>
    </div>
  );
}
