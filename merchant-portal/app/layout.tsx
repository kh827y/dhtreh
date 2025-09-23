import "@loyalty/ui/theme.css";
import React from "react";
import { Inter } from "next/font/google";

export const metadata = {
  title: "Merchant Portal",
  description: "Личный кабинет мерчанта: настройки лояльности, аналитика и CRM",
};

const inter = Inter({ subsets: ["latin", "cyrillic"] });

const LinkItem: React.FC<{ href: string; label: string }> = ({ href, label }) => (
  <a href={href} className="btn btn-ghost" style={{ textDecoration: 'none', justifyContent: 'flex-start', padding: '8px 10px', width: '100%' }}>{label}</a>
);

const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ fontSize: 12, opacity: .7, padding: '8px 10px', textTransform: 'uppercase' }}>{title}</div>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className={inter.className} style={{ margin: 0 }}>
        <div style={{ display: 'grid', gridTemplateRows: '64px 1fr', gridTemplateColumns: '260px 1fr', minHeight: '100dvh' }}>
          <header className="glass" style={{ gridColumn: '1 / -1', display:'flex', alignItems:'center', justifyContent:'space-between', padding: '0 16px' }}>
            <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))' }} />
              <b>Merchant Portal</b>
            </div>
            <div style={{ fontSize: 12, opacity: .7 }}>v1</div>
          </header>
          <aside style={{ borderRight: '1px solid rgba(255,255,255,.06)', padding: 8, overflow: 'auto' }}>
            <nav style={{ display: 'grid', gap: 4 }}>
              <SectionTitle title="Мастер" />
              <LinkItem href="/" label="Мастер настройки" />

              <SectionTitle title="Аналитика" />
              <LinkItem href="/analytics" label="Сводный отчёт" />
              <LinkItem href="/analytics/time" label="По времени" />
              <LinkItem href="/analytics/portrait" label="Портрет клиента" />
              <LinkItem href="/analytics/repeat" label="Повторные продажи" />
              <LinkItem href="/analytics/dynamics" label="Динамика" />
              <LinkItem href="/analytics/rfm" label="RFM-анализ" />
              <LinkItem href="/analytics/outlets" label="Активность торговых точек" />
              <LinkItem href="/analytics/staff" label="Активность сотрудников" />
              <LinkItem href="/analytics/referrals" label="Реферальная программа" />
              <LinkItem href="/analytics/birthdays" label="Дни рождения" />
              <LinkItem href="/analytics/auto-return" label="Автовозврат клиентов" />

              <SectionTitle title="Программа лояльности" />
              <LinkItem href="/loyalty/mechanics" label="Механики" />
              <LinkItem href="/loyalty/actions" label="Акции" />
              <LinkItem href="/loyalty/actions-earn" label="Акции с начислением баллов" />
              <LinkItem href="/loyalty/push" label="Push‑рассылки" />
              <LinkItem href="/loyalty/telegram" label="Telegram‑рассылки" />
              <LinkItem href="/promocodes" label="Промокоды" />
              <LinkItem href="/loyalty/staff-motivation" label="Мотивация персонала" />
              <LinkItem href="/loyalty/antifraud" label="Защита от мошенничества" />
              <LinkItem href="/loyalty/cashier" label="Панель кассира" />

              <SectionTitle title="Отзывы" />
              <LinkItem href="/reviews" label="Обратная связь" />

              <SectionTitle title="Клиенты и аудитории" />
              <LinkItem href="/customers" label="Клиенты" />
              <LinkItem href="/audiences" label="Аудитории" />

              <SectionTitle title="Товары и категории" />
              <LinkItem href="/products" label="Товары" />
              <LinkItem href="/categories" label="Категории" />

              <SectionTitle title="Карта Wallet" />
              <LinkItem href="/wallet" label="Карта Wallet" />

              <SectionTitle title="Настройки" />
              <LinkItem href="/settings/outlets" label="Торговые точки" />
              <LinkItem href="/settings/staff" label="Сотрудники" />
              <LinkItem href="/settings/access" label="Права доступа" />
              <LinkItem href="/settings/integrations" label="Интеграции" />
              <LinkItem href="/settings/telegram" label="Уведомления в телеграм" />
              <LinkItem href="/settings/system" label="Системные настройки" />

              <SectionTitle title="Инструменты" />
              <LinkItem href="/tools/import" label="Импорт данных" />
            </nav>
          </aside>
          <main style={{ padding: 16 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
