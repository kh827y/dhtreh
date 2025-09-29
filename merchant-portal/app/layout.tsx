import "@loyalty/ui/theme.css";
import React from "react";
import { Inter } from "next/font/google";
import SidebarNav, { SidebarSection } from "../components/SidebarNav";
import { cookies } from "next/headers";

export const metadata = {
  title: "Merchant Portal",
  description: "Личный кабинет мерчанта: настройки лояльности, аналитика и CRM",
};

const inter = Inter({ subsets: ["latin", "cyrillic"] });

const sections: SidebarSection[] = [
  {
    id: "wizard",
    title: "Мастер",
    items: [{ href: "/", label: "Мастер настройки" }],
  },
  {
    id: "analytics",
    title: "Аналитика",
    items: [
      { href: "/analytics", label: "Сводный отчёт" },
      { href: "/analytics/time", label: "По времени" },
      { href: "/analytics/portrait", label: "Портрет клиента" },
      { href: "/analytics/repeat", label: "Повторные продажи" },
      { href: "/analytics/dynamics", label: "Динамика" },
      { href: "/analytics/rfm", label: "RFM-анализ" },
      { href: "/analytics/outlets", label: "Активность торговых точек" },
      { href: "/analytics/staff", label: "Активность сотрудников" },
      { href: "/analytics/referrals", label: "Реферальная программа" },
      { href: "/analytics/birthdays", label: "Дни рождения" },
      { href: "/analytics/auto-return", label: "Автовозврат клиентов" },
    ],
  },
  {
    id: "loyalty",
    title: "Программа лояльности",
    items: [
      { href: "/loyalty/mechanics", label: "Механики" },
      { href: "/loyalty/actions", label: "Акции" },
      { href: "/loyalty/actions-earn", label: "Акции с начислением баллов" },
      { href: "/operations", label: "Журнал начисления баллов" },
      { href: "/loyalty/push", label: "Push‑рассылки" },
      { href: "/loyalty/telegram", label: "Telegram‑рассылки" },
      { href: "/promocodes", label: "Промокоды" },
      { href: "/loyalty/staff-motivation", label: "Мотивация персонала" },
      { href: "/loyalty/antifraud", label: "Защита от мошенничества" },
      { href: "/loyalty/cashier", label: "Панель кассира" },
    ],
  },
  {
    id: "reviews",
    title: "Отзывы",
    items: [{ href: "/reviews", label: "Обратная связь" }],
  },
  {
    id: "customers",
    title: "Клиенты и аудитории",
    items: [
      { href: "/customers", label: "Клиенты" },
      { href: "/audiences", label: "Аудитории" },
    ],
  },
  {
    id: "catalog",
    title: "Товары и категории",
    items: [
      { href: "/products", label: "Товары" },
      { href: "/categories", label: "Категории" },
    ],
  },
  {
    id: "wallet",
    title: "Карта Wallet",
    items: [{ href: "/wallet", label: "Карта Wallet" }],
  },
  {
    id: "settings",
    title: "Настройки",
    items: [
      { href: "/settings/outlets", label: "Торговые точки" },
      { href: "/settings/staff", label: "Сотрудники" },
      { href: "/settings/access", label: "Права доступа" },
      { href: "/settings/integrations", label: "Интеграции" },
      { href: "/settings/telegram", label: "Уведомления в телеграм" },
      { href: "/settings/system", label: "Системные настройки" },
    ],
  },
  {
    id: "tools",
    title: "Инструменты",
    items: [{ href: "/tools/import", label: "Импорт данных" }],
  },
];

async function fetchPortalProfile() {
  try {
    const store = await cookies();
    const token = store.get("portal_jwt")?.value;
    if (!token) return null;
    const base = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000").replace(/\/$/, "");
    const res = await fetch(`${base}/portal/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { merchantId: string; role?: string };
  } catch {
    return null;
  }
}

function filterSectionsByRole(role?: string): SidebarSection[] {
  if (!role) return sections;
  const upper = role.toUpperCase();
  if (upper === "CASHIER") {
    return sections
      .filter((section) => ["wizard", "loyalty"].includes(section.id))
      .map((section) =>
        section.id === "loyalty"
          ? { ...section, items: section.items.filter((item) => item.href === "/loyalty/cashier") }
          : section,
      );
  }
  if (upper === "ANALYST") {
    return sections.filter((section) => ["wizard", "analytics"].includes(section.id));
  }
  return sections;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchPortalProfile();
  const filteredSections = filterSectionsByRole(profile?.role);
  return (
    <html lang="ru" className="dark">
      <body className={inter.className} style={{ margin: 0 }}>
        <div style={{ display: 'grid', gridTemplateRows: '64px 1fr', gridTemplateColumns: '260px 1fr', minHeight: '100dvh' }}>
          <header className="glass" style={{ gridColumn: '1 / -1', display:'flex', alignItems:'center', justifyContent:'space-between', padding: '0 16px' }}>
            <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))' }} />
              <b>Merchant Portal</b>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, opacity: .7 }}>
              {profile?.role ? <span>Роль: {profile.role}</span> : null}
              <span>v1</span>
            </div>
          </header>
          <aside style={{ borderRight: '1px solid rgba(255,255,255,.06)', padding: 8, overflow: 'auto' }}>
            <SidebarNav sections={filteredSections} />
          </aside>
          <main style={{ padding: 16 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
