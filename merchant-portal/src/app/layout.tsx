import "./globals.css";
import React from "react";
import { Inter } from "next/font/google";
import SidebarNav, { SidebarSection } from "../components/SidebarNav";
import { cookies } from "next/headers";
import TimezoneProvider, { PortalTimezone } from "../components/TimezoneProvider";
import { ThemeProvider } from "../components/ThemeProvider";
import { AppHeader } from "../components/AppHeader";
import { AlertTriangle, Lock, CreditCard } from "lucide-react";
import { ContentWrapper } from "../components/ContentWrapper";
import { PortalFetchCacheProvider } from "../components/PortalFetchCacheProvider";

export const metadata = {
  title: "Panel Loyalty",
  description: "Личный кабинет мерчанта: настройки лояльности, аналитика и CRM",
  icons: {
    icon: "/favicon.svg",
  },
};

// Секции sidebar — 1:1 как в new design/components/Sidebar.tsx
const sections: SidebarSection[] = [
  {
    id: "master",
    title: "МАСТЕР",
    items: [{ href: "/", label: "Основные настройки" }],
  },
  {
    id: "analytics",
    title: "АНАЛИТИКА",
    items: [
      { href: "/analytics", label: "Сводный отчет" },
      { href: "/analytics/time", label: "По времени" },
      { href: "/analytics/portrait", label: "Портрет клиента" },
      { href: "/analytics/repeat", label: "Повторные продажи" },
      { href: "/analytics/dynamics", label: "Динамика" },
      { href: "/analytics/rfm", label: "RFM Анализ" },
      { href: "/analytics/outlets", label: "Активность точек" },
      { href: "/analytics/staff", label: "Активность персонала" },
      { href: "/analytics/referrals", label: "Реферальная программа" },
      { href: "/loyalty/mechanics/birthday?tab=stats", label: "Дни рождения" },
      { href: "/loyalty/mechanics/auto-return?tab=stats", label: "Автовозврат клиентов" },
    ],
  },
  {
    id: "loyalty",
    title: "ПРОГРАММА ЛОЯЛЬНОСТИ",
    items: [
      { href: "/loyalty/mechanics", label: "Механики" },
      { href: "/loyalty/actions", label: "Акции с товарами" },
      { href: "/loyalty/actions-earn", label: "Акции с баллами" },
      { href: "/promocodes", label: "Промокоды" },
      { href: "/loyalty/staff-motivation", label: "Мотивация персонала" },
      { href: "/loyalty/cashier", label: "Панель кассира" },
      { href: "/loyalty/antifraud", label: "Защита от мошенничества" },
      { href: "/operations", label: "Журнал операций" },
      { href: "/loyalty/push", label: "Push-рассылки" },
      { href: "/loyalty/telegram", label: "Telegram-рассылки" },
    ],
  },
  {
    id: "feedback",
    title: "ОБРАТНАЯ СВЯЗЬ",
    items: [{ href: "/reviews", label: "Отзывы" }],
  },
  {
    id: "clients",
    title: "КЛИЕНТЫ И АУДИТОРИИ",
    items: [
      { href: "/customers", label: "Клиенты" },
      { href: "/audiences", label: "Аудитории" },
    ],
  },
  {
    id: "goods",
    title: "ТОВАРЫ И КАТЕГОРИИ",
    items: [
      { href: "/products", label: "Товары" },
      { href: "/categories", label: "Категории" },
    ],
  },
  {
    id: "settings",
    title: "НАСТРОЙКИ",
    items: [
      { href: "/settings/system", label: "Системные настройки" },
      { href: "/settings/outlets", label: "Торговые точки" },
      { href: "/settings/staff", label: "Сотрудники" },
      { href: "/settings/access", label: "Группы доступа" },
      { href: "/settings/telegram", label: "Уведомления в Telegram" },
      { href: "/settings/integrations", label: "Интеграции" },
    ],
  },
  {
    id: "tools",
    title: "ИНСТРУМЕНТЫ",
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

type PortalTimezonePayload = {
  timezone: PortalTimezone;
  options: PortalTimezone[];
};

type PortalSubscription = {
  status: string;
  planId: string | null;
  planName: string | null;
  currentPeriodEnd: string | null;
  daysLeft: number | null;
  expiresSoon: boolean;
  expired: boolean;
};

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

const MECHANIC_PERMISSION_IDS = [
  "mechanic_birthday",
  "mechanic_auto_return",
  "mechanic_levels",
  "mechanic_redeem_limits",
  "mechanic_registration_bonus",
  "mechanic_ttl",
  "mechanic_referral",
];

const ITEM_PERMISSION_REQUIREMENTS: Record<
  string,
  Array<{ resource: string; action?: string }>
> = {
  "/": [{ resource: "system_settings", action: "read" }],
  "/analytics": [{ resource: "analytics", action: "read" }],
  "/analytics/time": [{ resource: "analytics", action: "read" }],
  "/analytics/portrait": [{ resource: "analytics", action: "read" }],
  "/analytics/repeat": [{ resource: "analytics", action: "read" }],
  "/analytics/dynamics": [{ resource: "analytics", action: "read" }],
  "/analytics/rfm": [{ resource: "rfm_analysis", action: "read" }],
  "/analytics/outlets": [{ resource: "analytics", action: "read" }],
  "/analytics/staff": [{ resource: "analytics", action: "read" }],
  "/analytics/referrals": [{ resource: "analytics", action: "read" }],
  "/loyalty/mechanics": [{ resource: "mechanic_birthday", action: "read" }],
  "/loyalty/mechanics/birthday": [{ resource: "mechanic_birthday", action: "read" }],
  "/loyalty/mechanics/auto-return": [{ resource: "mechanic_auto_return", action: "read" }],
  "/loyalty/mechanics/levels": [{ resource: "mechanic_levels", action: "read" }],
  "/loyalty/mechanics/bonus-settings": [{ resource: "mechanic_redeem_limits", action: "read" }],
  "/loyalty/mechanics/registration-bonus": [{ resource: "mechanic_registration_bonus", action: "read" }],
  "/loyalty/mechanics/ttl": [{ resource: "mechanic_ttl", action: "read" }],
  "/referrals/program": [{ resource: "mechanic_referral", action: "read" }],
  "/loyalty/actions": [{ resource: "product_promotions", action: "read" }],
  "/loyalty/actions-earn": [{ resource: "points_promotions", action: "read" }],
  "/operations": [{ resource: "customers", action: "read" }],
  "/loyalty/push": [{ resource: "broadcasts", action: "read" }],
  "/loyalty/telegram": [{ resource: "broadcasts", action: "read" }],
  "/promocodes": [{ resource: "promocodes", action: "read" }],
  "/loyalty/staff-motivation": [{ resource: "staff_motivation", action: "read" }],
  "/loyalty/antifraud": [{ resource: "antifraud", action: "read" }],
  "/loyalty/cashier": [{ resource: "cashier_panel", action: "read" }],
  "/reviews": [{ resource: "feedback", action: "read" }],
  "/customers": [{ resource: "customers", action: "read" }],
  "/customers/import": [{ resource: "import", action: "read" }],
  "/audiences": [{ resource: "audiences", action: "read" }],
  "/products": [{ resource: "products", action: "read" }],
  "/categories": [{ resource: "categories", action: "read" }],
  "/settings/outlets": [{ resource: "outlets", action: "read" }],
  "/outlets": [{ resource: "outlets", action: "read" }],
  "/settings/staff": [{ resource: "staff", action: "read" }],
  "/staff": [{ resource: "staff", action: "read" }],
  "/settings/access": [{ resource: "access_groups", action: "read" }],
  "/settings/integrations": [{ resource: "integrations", action: "read" }],
  "/settings/telegram": [{ resource: "telegram_notifications", action: "read" }],
  "/settings/system": [{ resource: "system_settings", action: "read" }],
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
    const base = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
    if (!base) return null;
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
                  .filter((group: { id: string; name: string | null; scope: string }) => group.id && group.name)
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

const FALLBACK_TIMEZONE: PortalTimezone = {
  code: "MSK+4",
  label: "Барнаул (Алтай и Красноярский край, МСК+4, UTC+7)",
  city: "Барнаул",
  description: "Алтай и Красноярский край",
  mskOffset: 4,
  utcOffsetMinutes: 420,
  iana: "Asia/Barnaul",
};

async function fetchPortalTimezone(): Promise<PortalTimezonePayload> {
  try {
    const store = await cookies();
    const token = store.get("portal_jwt")?.value;
    if (!token) {
      return { timezone: FALLBACK_TIMEZONE, options: [FALLBACK_TIMEZONE] };
    }
    const base = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
    if (!base) {
      return { timezone: FALLBACK_TIMEZONE, options: [FALLBACK_TIMEZONE] };
    }
    const res = await fetch(`${base}/portal/settings/timezone`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to load timezone");
    const data = (await res.json()) as PortalTimezonePayload;
    const timezone = data?.timezone ?? FALLBACK_TIMEZONE;
    const options = Array.isArray(data?.options) && data.options.length > 0 ? data.options : [timezone];
    return { timezone, options };
  } catch {
    return { timezone: FALLBACK_TIMEZONE, options: [FALLBACK_TIMEZONE] };
  }
}

async function fetchPortalSubscription(): Promise<PortalSubscription | null> {
  try {
    const store = await cookies();
    const token = store.get("portal_jwt")?.value;
    if (!token) return null;
    const base = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
    if (!base) return null;
    const res = await fetch(`${base}/portal/subscription`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const endRaw = data?.currentPeriodEnd;
    const end =
      typeof endRaw === "string"
        ? endRaw
        : endRaw instanceof Date
          ? endRaw.toISOString()
          : null;
    const daysLeftRaw = Number(data?.daysLeft);
    return {
      status: typeof data?.status === "string" ? data.status : "missing",
      planId: typeof data?.planId === "string" ? data.planId : null,
      planName: typeof data?.planName === "string" ? data.planName : null,
      currentPeriodEnd: end,
      daysLeft: Number.isFinite(daysLeftRaw) ? daysLeftRaw : null,
      expiresSoon: Boolean(data?.expiresSoon),
      expired:
        Boolean(data?.expired) ||
        String(data?.status || "").toLowerCase() === "expired",
    };
  } catch {
    return null;
  }
}

const READ_IMPLIED_ACTIONS = new Set(["create", "update", "delete", "manage", "*"]);

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
  if (action === "read") {
    if (actions.includes("read")) return true;
    if (actions.some((value) => READ_IMPLIED_ACTIONS.has(value))) return true;
    return false;
  }
  return actions.includes(action);
}

function normalizeHref(href: string) {
  const base = href.split("?")[0] ?? "";
  return base.endsWith("/") && base !== "/" ? base.slice(0, -1) : base;
}

function canAccessRoute(permissions: PortalPermissions, href: string) {
  if (!permissions) return false;
  const normalized = normalizeHref(href);
  if (normalized === "/loyalty/mechanics") {
    return MECHANIC_PERMISSION_IDS.some((resource) =>
      hasPermission(permissions, resource, "read"),
    );
  }
  const rules = ITEM_PERMISSION_REQUIREMENTS[normalized] ?? [
    { resource: "customers", action: "read" },
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

function formatDateLabel(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [profile, timezonePayload, subscription] = await Promise.all([
    fetchPortalProfile(),
    fetchPortalTimezone(),
    fetchPortalSubscription(),
  ]);
  const filteredSections = filterSectionsByProfile(profile);
  const staffLabel = profile?.staff?.name || profile?.staff?.email || null;
  const expired = subscription?.expired ?? false;
  const expiredPlanLabel =
    subscription?.planName || subscription?.planId || "—";
  
  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider defaultTheme="light">
          <PortalFetchCacheProvider />
          <TimezoneProvider timezone={timezonePayload.timezone} options={timezonePayload.options}>
            <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
              {/* Sidebar — 1:1 как в new design */}
              <aside
                className={
                  "w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 h-full overflow-y-auto custom-scrollbar" +
                  (expired ? " opacity-40 pointer-events-none" : "")
                }
              >
                <div className="p-6 flex items-center space-x-2">
                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    L
                  </div>
                  <div>
                    <h1 className="font-bold text-gray-800 text-lg leading-tight">Loyalty</h1>
                    <span className="text-xs text-gray-500 uppercase tracking-widest">
                      Business
                    </span>
                  </div>
                </div>

                <SidebarNav sections={filteredSections} />
              </aside>

              {/* Header + Content */}
              <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
                <AppHeader
                  staffLabel={staffLabel}
                  role={profile?.role || null}
                  subscription={subscription}
                  navSections={filteredSections}
                />

                <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gray-50/50 custom-scrollbar">
                  <div className="main-content flex-1 min-h-0 relative">
                    {subscription?.expired && (
                      <div className="fixed inset-0 z-50 bg-gray-50 flex items-center justify-center p-4 overflow-hidden">
                        <div
                          className="absolute inset-0 opacity-[0.03] pointer-events-none"
                          style={{
                            backgroundImage:
                              "radial-gradient(#6b7280 1px, transparent 1px)",
                            backgroundSize: "32px 32px",
                          }}
                        />
                        <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden relative z-10">
                          <div className="bg-red-500 h-2 w-full" />

                          <div className="p-8">
                            <div className="flex flex-col items-center text-center">
                              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 ring-8 ring-red-50/50">
                                <Lock className="h-10 w-10 text-red-500" />
                              </div>

                              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                                Доступ приостановлен
                              </h1>
                              <p className="text-gray-500 mb-8 max-w-sm">
                                Срок действия вашей подписки истек. Функции портала
                                временно заблокированы.
                              </p>

                              <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 mb-8 text-left">
                                <div className="flex justify-between items-start mb-4 border-b border-gray-200 pb-3">
                                  <div>
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                      Ваш тариф
                                    </span>
                                    <div className="font-bold text-gray-900 text-lg">
                                      {expiredPlanLabel}
                                    </div>
                                  </div>
                                  <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-md font-medium">
                                    Истек
                                  </span>
                                </div>
                                <div className="space-y-2 text-sm text-gray-600">
                                  <div className="flex justify-between">
                                    <span>Дата окончания:</span>
                                    <span className="font-medium text-gray-900">
                                      {formatDateLabel(subscription.currentPeriodEnd)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Actions — 1:1 как в new design */}
                              <div className="w-full space-y-3">
                                <a
                                  href="https://t.me/chavron_oceann"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full flex items-center justify-center py-3.5 px-4 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl"
                                >
                                  <CreditCard className="mr-2 h-5 w-5" />
                                  Оплатить и возобновить
                                </a>
                              </div>
                            </div>
                          </div>

                          {/* Footer — 1:1 как в new design */}
                          <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 text-center">
                            <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
                              <AlertTriangle size={12} className="text-amber-500" />
                              <span>
                                Данные ваших клиентов сохраняются в течение 90 дней после блокировки.
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <ContentWrapper>
                      <div
                        style={{
                          opacity: subscription?.expired ? 0.35 : 1,
                          pointerEvents: subscription?.expired ? "none" : "auto",
                        }}
                      >
                        {children}
                      </div>
                    </ContentWrapper>
                  </div>
                </main>
              </div>
            </div>
          </TimezoneProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
