export const metadata = { title: 'Loyalty Miniapp', description: 'Клиентская мини‑аппа' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', background: '#0b1220', color: '#e6edf3', margin: 0 }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: 16 }}>{children}</div>
      </body>
    </html>
  );
}

