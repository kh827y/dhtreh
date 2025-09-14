export const metadata = { title: 'Loyalty Admin', description: 'Админ‑панель' };

import StatusBar from '../components/StatusBar';
import OutboxLink from '../components/OutboxLink';
import RoleBadge from '../components/RoleBadge';
import '../src/app/globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Fail-fast ENV validation for Admin
  if (typeof window === 'undefined') {
    const required = ['API_BASE', 'ADMIN_UI_PASSWORD', 'ADMIN_SESSION_SECRET'];
    for (const key of required) {
      if (!process.env[key] || process.env[key].trim() === '') {
        throw new Error(`[Admin ENV] ${key} not configured`);
      }
    }
    if (process.env.NODE_ENV === 'production') {
      if (process.env.ADMIN_SESSION_SECRET === 'dev_change_me') {
        throw new Error('[Admin ENV] ADMIN_SESSION_SECRET must not use dev default in production');
      }
    }
  }
  
  const merchantId = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';
  return (
    <html lang="ru">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', background: '#0b1220', color: '#e6edf3', margin: 0 }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {/* Sidebar */}
          <aside style={{ width: 240, background: '#0e1629', borderRight: '1px solid #1e2a44', padding: 16, position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16 }}>
              <a href="/" style={{ color:'#e6edf3', textDecoration:'none', fontWeight:700 }}>Loyalty Admin</a>
              <RoleBadge />
            </div>
            <nav style={{ display:'grid', gap:8 }}>
              <a href="/" style={{ color:'#89b4fa' }}>Главная</a>
              <a href="/settings" style={{ color:'#89b4fa' }}>Настройки мерчанта</a>
              <a href="/telegram" style={{ color:'#89b4fa' }}>Telegram / Мини‑аппа</a>
              <a href="/docs/miniapp" style={{ color:'#89b4fa' }}>Мини‑аппа (док)</a>
              <OutboxLink merchantId={merchantId} />
              <a href="/outbox/monitor" style={{ color:'#89b4fa' }}>Outbox Monitor</a>
              <a href="/outlets" style={{ color:'#89b4fa' }}>Точки</a>
              <a href="/devices" style={{ color:'#89b4fa' }}>Устройства</a>
              <a href="/staff" style={{ color:'#89b4fa' }}>Сотрудники</a>
              <a href="/customers" style={{ color:'#89b4fa' }}>Клиенты</a>
              <a href="/segments" style={{ color:'#89b4fa' }}>Сегменты</a>
              <a href="/transactions" style={{ color:'#89b4fa' }}>Операции</a>
              <a href="/ttl" style={{ color:'#89b4fa' }}>TTL Reconciliation</a>
              <div style={{ marginTop:8, opacity:0.8, fontSize:12, textTransform:'uppercase' }}>Аналитика</div>
              <a href="/analytics/summary" style={{ color:'#89b4fa' }}>Сводный отчет</a>
              <a href="/analytics/cohorts" style={{ color:'#89b4fa' }}>Cohorts</a>
              <a href="/analytics/rfm" style={{ color:'#89b4fa' }}>RFM Heatmap</a>
              <a href="/analytics/portrait" style={{ color:'#89b4fa' }}>Портрет клиента</a>
              <a href="/analytics/repeat" style={{ color:'#89b4fa' }}>Повторные продажи</a>
              <a href="/analytics/time" style={{ color:'#89b4fa' }}>По времени</a>
              <a href="/analytics/operations" style={{ color:'#89b4fa' }}>Активность точек/сотрудников</a>
              <a href="/analytics/birthdays" style={{ color:'#89b4fa' }}>Дни рождения</a>
              <a href="/analytics/referral" style={{ color:'#89b4fa' }}>Реферальная сводка</a>
              <div style={{ marginTop:8, opacity:0.8, fontSize:12, textTransform:'uppercase' }}>Реферальная программа</div>
              <a href="/referral/settings" style={{ color:'#89b4fa' }}>Настройки</a>
              <div style={{ marginTop:8, opacity:0.8, fontSize:12, textTransform:'uppercase' }}>Документация</div>
              <a href="/docs/webhooks" style={{ color:'#89b4fa' }}>Вебхуки</a>
              <a href="/docs/integration" style={{ color:'#89b4fa' }}>Интеграции</a>
              <a href="/docs/bridge" style={{ color:'#89b4fa' }}>Bridge</a>
              <a href="/docs/deployment" style={{ color:'#89b4fa' }}>Деплой</a>
              <a href="/docs/observability" style={{ color:'#89b4fa' }}>Наблюдаемость</a>
              <div style={{ marginTop:8, opacity:0.8, fontSize:12, textTransform:'uppercase' }}>Инструменты</div>
              <a href="/exports" style={{ color:'#89b4fa' }}>Экспорт</a>
              <a href="/tools/signature" style={{ color:'#89b4fa' }}>Подпись</a>
              <a href="/rules/test" style={{ color:'#89b4fa' }}>Правила (тест)</a>
              <a href="/antifraud" style={{ color:'#89b4fa' }}>Антифрод</a>
              <a href="/status" style={{ color:'#89b4fa' }}>Статус API</a>
              <a href="/audit" style={{ color:'#89b4fa' }}>Аудит</a>
              <a href="/logout" style={{ color:'#f38ba8', marginTop: 16 }}>Выход</a>
            </nav>
          </aside>
          {/* Main */}
          <main style={{ flex: 1, padding: 16 }}>
            <StatusBar merchantId={merchantId} />
            <div style={{ marginTop: 12 }}>{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
