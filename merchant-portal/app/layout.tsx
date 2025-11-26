import "@loyalty/ui/theme.css";
import React from "react";
import { Inter } from "next/font/google";
import SidebarNav, { SidebarSection } from "../components/SidebarNav";
import { cookies } from "next/headers";
import TimezoneProvider, { PortalTimezone } from "../components/TimezoneProvider";

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
      { href: "/operations", label: "Журнал операций" },
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

type PortalTimezonePayload = {
  timezone: PortalTimezone;
  options: PortalTimezone[];
};

type PortalSubscription = {
  status: string;
  planName: string | null;
  currentPeriodEnd: string | null;
  daysLeft: number | null;
  expiresSoon: boolean;
  expired: boolean;
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

function SubscriptionNotice({ subscription }: { subscription: PortalSubscription | null }) {
  if (!subscription) return null;
  const { expiresSoon, expired, daysLeft } = subscription;
  if (!expiresSoon && !expired) return null;
  const tone = expired ? "#f87171" : "#f59e0b";
  const bg = expired ? "rgba(248,113,113,0.14)" : "rgba(245,158,11,0.16)";
  const title = expired ? "Подписка закончилась" : "Подписка скоро истекает";
  const text = expired
    ? null
    : `Осталось ${daysLeft ?? "несколько"} дней. Продлите подписку, чтобы не потерять доступ.`;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      {!expired && (
        <div
          style={{
            maxWidth: 340,
            border: `1px solid ${tone}`,
            background: bg,
            borderRadius: 12,
            padding: "10px 12px",
            color: "#fff",
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>{text}</div>
        </div>
      )}
    </div>
  );
}

function PlanSummary({ subscription }: { subscription: PortalSubscription | null }) {
  if (!subscription) return null;
  const endLabel = formatDateLabel(subscription.currentPeriodEnd);
  const tone = subscription.expired
    ? "#f87171"
    : subscription.expiresSoon
      ? "#fbbf24"
      : "#34d399";
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        padding: "10px 12px",
        borderRadius: 12,
        marginBottom: 12,
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Тариф</div>
        <div style={{ fontWeight: 700 }}>{subscription.planName || "—"}</div>
      </div>
      <div style={{ display: "grid", textAlign: "right", gap: 4 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Статус</div>
        <div style={{ color: tone, fontWeight: 700 }}>
          {subscription.status}
          {subscription.daysLeft != null && !subscription.expired
            ? ` · ${subscription.daysLeft} дн.`
            : ""}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Истекает: {endLabel}</div>
      </div>
    </div>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchPortalProfile();
  const timezonePayload = await fetchPortalTimezone();
  const subscription = await fetchPortalSubscription();
  const filteredSections = filterSectionsByProfile(profile);
  const staffLabel = profile?.staff?.name || profile?.staff?.email || null;
  const expired = subscription?.expired ?? false;
  const showPlan = subscription && !subscription.expired;
  return (
    <html lang="ru" className="dark">
      <body className={inter.className} style={{ margin: 0 }}>
        <TimezoneProvider timezone={timezonePayload.timezone} options={timezonePayload.options}>
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
            <aside style={{ borderRight: '1px solid rgba(255,255,255,.06)', padding: 8, overflow: 'auto', opacity: expired ? 0.4 : 1, pointerEvents: expired ? 'none' : 'auto' }}>
              <SidebarNav sections={filteredSections} />
            </aside>
            <main style={{ padding: 16, position: 'relative' }}>
              <SubscriptionNotice subscription={subscription} />
              {showPlan ? <PlanSummary subscription={subscription} /> : null}
              <div style={{ position: 'relative' }}>
                {subscription?.expired && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 3,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.9))',
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ textAlign: 'center', maxWidth: 480, padding: 16 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Подписка закончилась</div>
                      <div style={{ opacity: 0.85, fontSize: 14 }}>
                        Продлите, чтобы продолжить пользоваться услугами.
                      </div>
                    </div>
                  </div>
                )}
                <div
                  style={{
                    opacity: subscription?.expired ? 0.35 : 1,
                    pointerEvents: subscription?.expired ? 'none' : 'auto',
                  }}
                >
                  {children}
                </div>
              </div>
            </main>
          </div>
        </TimezoneProvider>
      </body>
    </html>
  );
}
