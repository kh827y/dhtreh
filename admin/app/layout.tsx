export const metadata = { title: 'Loyalty Admin', description: 'Админ‑панель' };

import StatusBar from '../components/StatusBar';
import OutboxLink from '../components/OutboxLink';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const merchantId = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';
  return (
    <html lang="ru">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', background: '#0b1220', color: '#e6edf3', margin: 0 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
          <h1 style={{ margin: '8px 0 16px' }}>Loyalty Admin</h1>
          <nav style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <a href="/" style={{ color: '#89b4fa' }}>Главная</a>
            <a href="/settings" style={{ color: '#89b4fa' }}>Настройки мерчанта</a>
            <a href="/telegram" style={{ color: '#89b4fa' }}>Telegram / Мини‑аппа</a>
            <OutboxLink merchantId={merchantId} />
            <a href="/outlets" style={{ color: '#89b4fa' }}>Точки</a>
            <a href="/devices" style={{ color: '#89b4fa' }}>Устройства</a>
            <a href="/staff" style={{ color: '#89b4fa' }}>Сотрудники</a>
            <a href="/ttl" style={{ color: '#89b4fa' }}>TTL Reconciliation</a>
            <a href="/docs/webhooks" style={{ color: '#89b4fa' }}>Документация вебхуков</a>
            <a href="/docs/integration" style={{ color: '#89b4fa' }}>Интеграции</a>
            <a href="/docs/bridge" style={{ color: '#89b4fa' }}>Bridge</a>
            <a href="/docs/deployment" style={{ color: '#89b4fa' }}>Деплой</a>
            <a href="/exports" style={{ color: '#89b4fa' }}>Экспорт</a>
            <a href="/tools/signature" style={{ color: '#89b4fa' }}>Инструменты</a>
          </nav>
          <StatusBar merchantId={merchantId} />
          {children}
        </div>
      </body>
    </html>
  );
}
