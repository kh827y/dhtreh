export const metadata = { title: 'Loyalty Admin', description: 'Админ‑панель' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', background: '#0b1220', color: '#e6edf3', margin: 0 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
          <h1 style={{ margin: '8px 0 16px' }}>Loyalty Admin</h1>
          <nav style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <a href="/" style={{ color: '#89b4fa' }}>Главная</a>
            <a href="/telegram" style={{ color: '#89b4fa' }}>Telegram / Мини‑аппа</a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}

