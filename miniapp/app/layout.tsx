import { Providers } from "./providers";

export const metadata = { title: "Loyalty Miniapp", description: "Клиентская мини‑аппа" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body
        style={{
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
          background: '#f5f5ff',
          color: '#1f1f33',
          margin: 0,
        }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto', minHeight: '100vh' }}>
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
