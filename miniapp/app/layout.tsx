export const metadata = { title: 'Loyalty Miniapp', description: 'Клиентская мини‑аппа' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body
        style={{
          fontFamily: '"SF Pro Display", "Inter", "Segoe UI", Roboto, system-ui, -apple-system, sans-serif',
          background: '#f4f7fb',
          color: '#0f172a',
          margin: 0,
          minHeight: '100vh',
        }}
      >
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 32px' }}>{children}</div>
      </body>
    </html>
  );
}
