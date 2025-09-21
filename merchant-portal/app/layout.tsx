import "@loyalty/ui/theme.css";
import React from "react";
import { Inter } from "next/font/google";

export const metadata = {
  title: "Merchant Portal",
  description: "Личный кабинет мерчанта: настройки лояльности, аналитика и CRM",
};

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className={inter.className} style={{ margin: 0 }}>
        <div style={{ display: 'grid', gridTemplateRows: '64px 1fr', minHeight: '100dvh' }}>
          <header className="glass" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: '0 16px' }}>
            <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))' }} />
              <b>Merchant Portal</b>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
              <nav style={{ display:'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href="/" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Дашборд</a>
                <a href="/outlets" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Точки</a>
                <a href="/staff" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Сотрудники</a>
                <a href="/customers" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Клиенты</a>
                <a href="/operations" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Операции</a>
                <a href="/promocodes" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Промокоды</a>
                <a href="/broadcasts" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Рассылки</a>
                <a href="/analytics" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Аналитика</a>
                <a href="/referrals/program" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Рефералка</a>
                <a href="/campaigns" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Кампании</a>
                <a href="/integrations" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Интеграции</a>
                <a href="/gifts" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Подарки</a>
              </nav>
            </div>
          </header>
          <main style={{ padding: 16 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
