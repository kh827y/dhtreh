import DashboardStatus from '../components/DashboardStatus';

export default function Page() {
  return (
    <div>
      <DashboardStatus />
      <p style={{ marginTop: 12 }}>Выберите раздел в меню: «Мерчанты», «Outbox», «Outbox Monitor», «TTL Reconciliation», «Антифрод», «Статус API», «Документация», «Экспорт», «Подпись».</p>
    </div>
  );
}
