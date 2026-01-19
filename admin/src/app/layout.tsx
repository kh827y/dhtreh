export const metadata = { title: 'Loyalty Admin', description: 'Админ‑панель' };

import Link from 'next/link';
import OutboxLink from '../components/OutboxLink';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', background: '#0b1220', color: '#e6edf3', margin: 0 }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {/* Sidebar */}
          <aside style={{ width: 240, background: '#0e1629', borderRight: '1px solid #1e2a44', padding: 16, position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Link href="/" style={{ color: '#e6edf3', textDecoration: 'none', fontWeight: 700 }}>Loyalty Admin</Link>
            </div>
            <nav style={{ display: 'grid', gap: 8 }}>
              <Link href="/" style={{ color: '#89b4fa' }}>Главная</Link>
              <Link href="/merchants" style={{ color: '#89b4fa' }}>Мерчанты</Link>
              <Link href="/settings" style={{ color: '#89b4fa' }}>Настройки мерчанта</Link>
              <OutboxLink />
              <Link href="/outbox/monitor" style={{ color: '#89b4fa' }}>Outbox Monitor</Link>
              <Link href="/ttl" style={{ color: '#89b4fa' }}>TTL Reconciliation</Link>
              <Link href="/observability" style={{ color: '#89b4fa' }}>Наблюдаемость</Link>
              <div style={{ marginTop: 8, opacity: 0.8, fontSize: 12, textTransform: 'uppercase' }}>Документация</div>
              <Link href="/docs/webhooks" style={{ color: '#89b4fa' }}>Вебхуки</Link>
              <Link href="/docs/integration" style={{ color: '#89b4fa' }}>Интеграции</Link>
              <Link href="/docs/deployment" style={{ color: '#89b4fa' }}>Деплой</Link>
              <Link href="/docs/observability" style={{ color: '#89b4fa' }}>Наблюдаемость</Link>
              <div style={{ marginTop: 8, opacity: 0.8, fontSize: 12, textTransform: 'uppercase' }}>Инструменты</div>
              <Link href="/exports" style={{ color: '#89b4fa' }}>Экспорт</Link>
              <Link href="/antifraud" style={{ color: '#89b4fa' }}>Антифрод</Link>
              <Link href="/status" style={{ color: '#89b4fa' }}>Статус API</Link>
              <Link href="/audit" style={{ color: '#89b4fa' }}>Аудит</Link>
              <Link href="/logout" style={{ color: '#f38ba8', marginTop: 16 }}>Выход</Link>
            </nav>
          </aside>
          {/* Main */}
          <main style={{ flex: 1, padding: 16 }}>
            <div style={{ marginTop: 12 }}>{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
