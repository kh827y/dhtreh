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
      { href: "/loyalty/mechanics/birthday?tab=stats", label: "Дни рождения" },
      { href: "/loyalty/mechanics/auto-return?tab=stats", label: "Автовозврат клиентов" },
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
    items: [{ href: "/customers/import", label: "Импорт данных" }],
  },
];

type PortalPermissions = Record<string, string[]>;
type PortalStaffProfile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  groups: Array<{ id: string; name: string; scope: string }>;
};

type PortalProfile = {
  merchantId: string;
  role: string;
  actor: string;
  adminImpersonation: boolean;
  staff: PortalStaffProfile | null;
  permissions: PortalPermissions;
};

const ITEM_PERMISSION_REQUIREMENTS: Record<
  string,
  Array<{ resource: string; action?: string }>
> = {
  "/": [{ resource: "loyalty", action: "read" }],
  "/analytics": [{ resource: "analytics", action: "read" }],
  "/analytics/time": [{ resource: "analytics", action: "read" }],
  "/analytics/portrait": [{ resource: "analytics", action: "read" }],
  "/analytics/repeat": [{ resource: "analytics", action: "read" }],
  "/analytics/dynamics": [{ resource: "analytics", action: "read" }],
  "/analytics/rfm": [{ resource: "analytics", action: "read" }],
  "/analytics/outlets": [{ resource: "analytics", action: "read" }],
  "/analytics/staff": [{ resource: "analytics", action: "read" }],
  "/analytics/referrals": [{ resource: "analytics", action: "read" }],
  "/loyalty/mechanics": [{ resource: "loyalty", action: "read" }],
  "/loyalty/mechanics/birthday": [{ resource: "loyalty", action: "read" }],
  "/loyalty/mechanics/auto-return": [{ resource: "loyalty", action: "read" }],
  "/loyalty/actions": [{ resource: "loyalty", action: "read" }],
  "/loyalty/actions-earn": [{ resource: "loyalty", action: "read" }],
  "/operations": [{ resource: "loyalty", action: "read" }],
  "/loyalty/push": [{ resource: "loyalty", action: "read" }],
  "/loyalty/telegram": [{ resource: "loyalty", action: "read" }],
  "/promocodes": [{ resource: "loyalty", action: "read" }],
  "/loyalty/staff-motivation": [{ resource: "loyalty", action: "read" }],
  "/loyalty/antifraud": [{ resource: "loyalty", action: "read" }],
  "/loyalty/cashier": [{ resource: "loyalty", action: "read" }],
  "/reviews": [{ resource: "loyalty", action: "read" }],
  "/customers": [{ resource: "loyalty", action: "read" }],
  "/customers/import": [{ resource: "loyalty", action: "read" }],
  "/audiences": [{ resource: "loyalty", action: "read" }],
  "/products": [{ resource: "loyalty", action: "read" }],
  "/categories": [{ resource: "loyalty", action: "read" }],
  "/wallet": [{ resource: "loyalty", action: "read" }],
  "/settings/outlets": [{ resource: "outlets", action: "read" }],
  "/settings/staff": [{ resource: "staff", action: "read" }],
  "/settings/access": [{ resource: "staff", action: "read" }],
  "/settings/integrations": [{ resource: "loyalty", action: "read" }],
  "/settings/telegram": [{ resource: "loyalty", action: "read" }],
  "/settings/system": [{ resource: "loyalty", action: "read" }],
};

function normalizePermissions(payload: unknown): PortalPermissions {
  const out: PortalPermissions = {};
  if (!payload || typeof payload !== "object") return out;
  const raw = payload as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (Array.isArray(value)) {
      out[key] = Array.from(
        new Set(
          value
            .map((item) => String(item || "").toLowerCase().trim())
            .filter(Boolean),
        ),
      );
    }
  }
  return out;
}

async function fetchPortalProfile(): Promise<PortalProfile | null> {
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
    const data = await res.json();
    const permissions = normalizePermissions(data?.permissions);
    if (
      Array.isArray(permissions.__all__) &&
      !permissions.__all__.includes("*")
    ) {
      permissions.__all__.push("*");
    }
    const actor = typeof data?.actor === "string" ? data.actor : "MERCHANT";
    const staffRaw = data?.staff;
    const staff: PortalStaffProfile | null =
      actor.toUpperCase() === "STAFF" && staffRaw && typeof staffRaw === "object"
        ? {
            id: String(staffRaw?.id ?? ""),
            name:
              typeof staffRaw?.name === "string"
                ? staffRaw.name
                : null,
            email:
              typeof staffRaw?.email === "string"
                ? staffRaw.email
                : null,
            role:
              typeof staffRaw?.role === "string"
                ? staffRaw.role
                : null,
            groups: Array.isArray(staffRaw?.groups)
              ? staffRaw.groups
                  .map((group: any) => ({
                    id: String(group?.id ?? ""),
                    name: String(group?.name ?? "").trim() || null,
                    scope: String(group?.scope ?? "").toUpperCase(),
                  }))
                  .filter((group) => group.id && group.name)
              : [],
          }
        : null;
    return {
      merchantId: String(data?.merchantId ?? ""),
      role: typeof data?.role === "string" ? data.role : actor,
      actor,
      adminImpersonation: Boolean(data?.adminImpersonation),
      staff,
      permissions,
    };
  } catch {
    return null;
  }
}

function hasPermission(
  permissions: PortalPermissions,
  resource: string,
  action = "read",
) {
  if (!permissions) return false;
  const all = permissions.__all__;
  if (Array.isArray(all) && (all.includes("*") || all.includes("manage"))) {
    return true;
  }
  const actions = permissions[resource];
  if (!actions || !actions.length) return false;
  if (actions.includes("*") || actions.includes("manage")) return true;
  if (action === "read") return actions.includes("read");
  return actions.includes(action);
}

function normalizeHref(href: string) {
  const base = href.split("?")[0];
  return base.endsWith("/") && base !== "/" ? base.slice(0, -1) : base;
}

function canAccessRoute(permissions: PortalPermissions, href: string) {
  if (!permissions) return false;
  const rules =
    ITEM_PERMISSION_REQUIREMENTS[normalizeHref(href)] ?? [
      { resource: "loyalty", action: "read" },
    ];
  return rules.every((rule) =>
    hasPermission(permissions, rule.resource, rule.action ?? "read"),
  );
}

function filterSectionsByProfile(profile: PortalProfile | null): SidebarSection[] {
  if (!profile) return sections;
  if (
    hasPermission(profile.permissions, "__all__", "*") ||
    profile.actor.toUpperCase() !== "STAFF"
  ) {
    return sections;
  }
  return sections
    .map((section) => {
      const allowedItems = section.items.filter((item) =>
        canAccessRoute(profile.permissions, item.href),
      );
      if (!allowedItems.length) return null;
      return { ...section, items: allowedItems };
    })
    .filter(Boolean) as SidebarSection[];
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchPortalProfile();
  const filteredSections = filterSectionsByProfile(profile);
  const staffLabel = profile?.staff?.name || profile?.staff?.email || null;
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
              {staffLabel ? <span>{staffLabel}</span> : null}
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
