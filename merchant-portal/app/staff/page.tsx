"use client";
import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
import { useRouter } from "next/navigation";
import Toggle from "../../components/Toggle";

type StaffOutletAccess = {
  id: string;
  outletId: string;
  outletName?: string | null;
  pinCode?: string | null;
  status: string;
};

type StaffGroup = {
  id: string;
  name: string;
  scope?: string;
};

type Staff = {
  id: string;
  login?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  comment?: string | null;
  role: string;
  status: string;
  portalAccessEnabled: boolean;
  canAccessPortal: boolean;
  isOwner: boolean;
  accesses: StaffOutletAccess[];
  groups: StaffGroup[];
  lastActivityAt?: string | null;
};

type Outlet = { id: string; name: string };
type AccessGroup = { id: string; name: string; membersCount?: number; memberCount?: number };

const DEFAULT_GROUPS: AccessGroup[] = [
  { id: "MERCHANT", name: "Владелец" },
  { id: "MANAGER", name: "Менеджер" },
  { id: "ANALYST", name: "Аналитик" },
  { id: "CASHIER", name: "Кассир" },
];

function formatActivityDate(value?: string | null): string {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const today = new Date();
    const isSameDay =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
    const formatter = new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return isSameDay ? `Сегодня, ${timeFormatter.format(date)}` : formatter.format(date);
  } catch (e) {
    return "—";
  }
}

function getDisplayName(staff: Staff): string {
  if (!staff) return "?";
  const composed = [staff.firstName, staff.lastName].filter(Boolean).join(" ");
  return (composed || staff.login || staff.email || staff.phone || staff.position || staff.id || "?") as string;
}

function getRoleLabel(role?: string | null): string {
  if (!role) return "—";
  const upper = role.toUpperCase();
  if (upper === "MERCHANT") return "Владелец";
  if (upper === "MANAGER") return "Менеджер";
  if (upper === "ANALYST") return "Аналитик";
  if (upper === "CASHIER") return "Кассир";
  return upper;
}

function hasPortalAccess(staff: Staff): boolean {
  return Boolean(staff.isOwner || staff.portalAccessEnabled || staff.canAccessPortal);
}

export default function StaffPage() {
  const router = useRouter();
  const [items, setItems] = React.useState<Staff[]>([]);
  const [outlets, setOutlets] = React.useState<Outlet[]>([]);
  const [groups, setGroups] = React.useState<AccessGroup[]>([]);
  const [meta, setMeta] = React.useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [counters, setCounters] = React.useState({
    active: 0,
    pending: 0,
    suspended: 0,
    fired: 0,
    archived: 0,
    portalEnabled: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [createError, setCreateError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [groupsLoading, setGroupsLoading] = React.useState(false);

  const [tab, setTab] = React.useState<"ACTIVE" | "FIRED">("ACTIVE");
  const [roleFilter, setRoleFilter] = React.useState<string>("ALL");
  const [outletFilter, setOutletFilter] = React.useState<string>("ALL");
  const [onlyPortal, setOnlyPortal] = React.useState<boolean>(false);
  const [search, setSearch] = React.useState<string>("");

  const [cFirstName, setCFirstName] = React.useState("");
  const [cLastName, setCLastName] = React.useState("");
  const [cPosition, setCPosition] = React.useState("");
  const [cPhone, setCPhone] = React.useState("");
  const [cComment, setCComment] = React.useState("");
  const [cPortal, setCPortal] = React.useState(false);
  const [cGroup, setCGroup] = React.useState<string>("");
  const [cEmail, setCEmail] = React.useState("");
  const [cPassword, setCPassword] = React.useState("");

  const roles = React.useMemo(() => {
    const unique = new Set<string>();
    items.forEach((item) => {
      if (item.role) unique.add(item.role.toUpperCase());
    });
    return Array.from(unique).sort();
  }, [items]);

  const uniqueGroups = React.useMemo(() => {
    const map = new Map<string, AccessGroup>();
    for (const g of groups) {
      if (!g) continue;
      const id = String((g as any).id ?? '').trim();
      const name = String((g as any).name ?? '').trim();
      const key = id || name;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { id: id || key, name, membersCount: (g as any).membersCount, memberCount: (g as any).memberCount });
      }
    }
    return Array.from(map.values());
  }, [groups]);

  const filteredItems = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((staff) => {
      const status = String(staff.status || '').trim().toUpperCase();
      if (tab === "ACTIVE" && (status === "FIRED" || status === "ARCHIVED")) return false;
      if (tab === "FIRED" && !(status === "FIRED" || status === "ARCHIVED")) return false;
      if (roleFilter !== "ALL" && (staff.role || "").toUpperCase() !== roleFilter) return false;
      if (outletFilter !== "ALL") {
        const accesses = Array.isArray(staff.accesses) ? staff.accesses : [];
        const hasAccess = accesses.some(
          (access) => access.outletId === outletFilter && access.status === "ACTIVE"
        );
        if (!hasAccess) return false;
      }
      if (onlyPortal && !hasPortalAccess(staff)) return false;
      if (q) {
        const haystack = [
          staff.firstName,
          staff.lastName,
          staff.login,
          staff.email,
          staff.phone,
          staff.position,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase())
          .join(" ");
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, tab, roleFilter, outletFilter, onlyPortal, search]);

  const uniqueItems = React.useMemo(() => {
    const seen = new Set<string>();
    return filteredItems.filter((s) => {
      const id = String(s?.id ?? "");
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [filteredItems]);

  const recordsLabel = React.useMemo(() => {
    if (loading) return "Показано: —";
    const visible = uniqueItems.length;
    const total = meta.total ?? visible;
    return `Показано: ${visible} из ${total}`;
  }, [uniqueItems.length, loading, meta.total]);

  const ensureGroupsLoaded = React.useCallback(async () => {
    if (groupsLoading) return;
    setGroupsLoading(true);
    try {
      let list: AccessGroup[] = [];
      try {
        const res = await fetch("/api/portal/access-groups");
        if (res.ok) {
          const payload = await res.json();
          if (Array.isArray(payload)) list = payload;
          else if (payload?.items && Array.isArray(payload.items)) list = payload.items;
        }
      } catch {}
      if (typeof window !== "undefined") {
        try {
          const stored = window.localStorage.getItem("portal.accessGroups");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              const map = new Map<string, AccessGroup>((list || []).map((g) => [g.id, g]));
              parsed.forEach((g: AccessGroup) => { if (g?.id) map.set(g.id, g); });
              list = Array.from(map.values());
            }
          }
        } catch {}
      }
      if (!list.length) list = DEFAULT_GROUPS;
      setGroups(list);
    } finally {
      setGroupsLoading(false);
    }
  }, [groupsLoading]);

  const resetCreateForm = React.useCallback(() => {
    setCFirstName("");
    setCLastName("");
    setCPosition("");
    setCPhone("");
    setCComment("");
    setCPortal(false);
    setCGroup("");
    setCEmail("");
    setCPassword("");
    setCreateError("");
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("page", "1");
      qs.set("pageSize", "100");
      if (outletFilter !== "ALL") qs.set("outletId", outletFilter);
      if (onlyPortal) qs.set("portalOnly", "true");
      const trimmedSearch = search.trim();
      if (trimmedSearch) qs.set("search", trimmedSearch);

      const [staffRes, outletsRes] = await Promise.all([
        fetch(`/api/portal/staff?${qs.toString()}`),
        fetch(`/api/portal/outlets`),
      ]);
      if (staffRes.status === 401 || staffRes.status === 403) {
        router.push('/login');
        return;
      }
      if (!staffRes.ok) throw new Error(await staffRes.text());
      if (!outletsRes.ok) throw new Error(await outletsRes.text());
      const staffPayload = await staffRes.json();
      const outletsPayload = await outletsRes.json();

      const staffItemsRaw: Staff[] = Array.isArray(staffPayload?.items)
        ? staffPayload.items
        : Array.isArray(staffPayload)
          ? staffPayload
          : [];
      const staffItems = staffItemsRaw.map((it, idx) => {
        const id = String((it as any)?.id ?? '');
        const status = String((it as any)?.status ?? '').toUpperCase();
        const role = String((it as any)?.role ?? '').toUpperCase();
        const accesses = Array.isArray((it as any)?.accesses)
          ? (it as any).accesses.map((a: any, k: number) => ({
              id: String(a?.id ?? `${id}:${a?.outletId ?? k}`),
              outletId: String(a?.outletId ?? ''),
              outletName: a?.outletName ?? null,
              pinCode: a?.pinCode ?? null,
              status: String(a?.status ?? '').toUpperCase(),
            }))
          : [];
        const groups = Array.isArray((it as any)?.groups)
          ? (it as any).groups.map((g: any) => ({ id: String(g?.id ?? ''), name: String(g?.name ?? ''), scope: g?.scope }))
          : [];
        return {
          ...it,
          id,
          status,
          role,
          accesses,
          groups,
        } as Staff;
      });
      setItems(staffItems);
      const metaData = staffPayload?.meta;
      setMeta(
        metaData && typeof metaData === "object"
          ? {
              page: Number(metaData.page) || 1,
              pageSize: Number(metaData.pageSize) || staffItems.length || 20,
              total: Number(metaData.total) || staffItems.length,
              totalPages: Number(metaData.totalPages) || 1,
            }
          : { page: 1, pageSize: staffItems.length || 20, total: staffItems.length, totalPages: 1 }
      );
      const countersData = staffPayload?.counters;
      setCounters(
        countersData && typeof countersData === "object"
          ? {
              active: Number(countersData.active) || 0,
              pending: Number(countersData.pending) || 0,
              suspended: Number(countersData.suspended) || 0,
              fired: Number(countersData.fired) || 0,
              archived: Number(countersData.archived) || 0,
              portalEnabled: Number(countersData.portalEnabled) || 0,
            }
          : { active: 0, pending: 0, suspended: 0, fired: 0, archived: 0, portalEnabled: 0 }
      );
      const outletItems: Outlet[] = Array.isArray(outletsPayload?.items)
        ? outletsPayload.items
        : Array.isArray(outletsPayload)
          ? outletsPayload
          : [];
      setOutlets(outletItems);
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось загрузить данных"));
    } finally {
      setLoading(false);
    }
  }, [tab, outletFilter, onlyPortal, search]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (showCreate) {
      setCreateError("");
    }
  }, [showCreate]);

  const canSubmitCreate = React.useMemo(() => {
    if (!cFirstName.trim()) return false;
    if (cPortal) {
      return Boolean(cGroup && cEmail.trim());
    }
    return true;
  }, [cFirstName, cPortal, cGroup, cEmail]);

  async function handleCreate() {
    if (!canSubmitCreate) return;
    setSubmitting(true);
    setCreateError("");
    try {
      const normalizedGroup = cGroup.trim();
      const payload: Record<string, any> = {
        firstName: cFirstName.trim(),
        lastName: cLastName.trim() || undefined,
        login: [cFirstName, cLastName].filter(Boolean).join(" ") || cFirstName.trim(),
        position: cPosition.trim() || undefined,
        phone: cPhone.trim() || undefined,
        comment: cComment.trim() || undefined,
        canAccessPortal: cPortal,
        portalAccessEnabled: cPortal,
        email: cPortal ? cEmail.trim() : undefined,
        status: 'ACTIVE',
      };
      if (normalizedGroup) {
        payload.accessGroupIds = [normalizedGroup];
        const upper = normalizedGroup.toUpperCase();
        if (["MERCHANT", "MANAGER", "ANALYST", "CASHIER"].includes(upper)) {
          payload.role = upper;
        }
      }
      if (!payload.role && !cPortal) {
        payload.role = "CASHIER";
      }
      const res = await fetch("/api/portal/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowCreate(false);
      resetCreateForm();
      await load();
    } catch (e: any) {
      setCreateError(String(e?.message || e || "Не удалось создать сотрудника"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Сотрудники</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Управляйте доступами и статусами команды</div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>{recordsLabel}</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <button
          className="btn"
          style={{
            minWidth: 112,
            background: tab === "ACTIVE" ? "var(--brand-primary)" : "rgba(255,255,255,.06)",
            borderColor: "transparent",
            color: tab === "ACTIVE" ? "#0b0f19" : "#fff",
            fontWeight: tab === "ACTIVE" ? 600 : 500,
            transition: "background .2s ease",
          }}
          onClick={() => setTab("ACTIVE")}
        >
          Работает{` (${counters.active})`}
        </button>
        <button
          className="btn"
          style={{
            minWidth: 112,
            background: tab === "FIRED" ? "var(--brand-primary)" : "rgba(255,255,255,.06)",
            borderColor: "transparent",
            color: tab === "FIRED" ? "#0b0f19" : "#fff",
            fontWeight: tab === "FIRED" ? 600 : 500,
            transition: "background .2s ease",
          }}
          onClick={() => setTab("FIRED")}
        >
          Уволен{` (${counters.fired})`}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ padding: "8px 12px", minWidth: 180, borderRadius: 8 }}
          >
            <option value="ALL">Все роли</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {getRoleLabel(role)}
              </option>
            ))}
          </select>
          <select
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            style={{ padding: "8px 12px", minWidth: 220, borderRadius: 8 }}
          >
            <option value="ALL">Все торговые точки</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
          <Toggle
            checked={onlyPortal}
            onChange={setOnlyPortal}
            label="Только с доступом в панель"
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            Добавить сотрудника
          </Button>
          <div style={{ position: "relative" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или e-mail"
              style={{
                padding: "8px 36px 8px 14px",
                minWidth: 240,
                borderRadius: 8,
              }}
            />
            <span
              aria-hidden
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 16,
                opacity: 0.6,
              }}
            >
              🔍
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader title="Команда" subtitle="Список сотрудников с правами доступа" />
        <CardBody>
          {loading ? (
            <Skeleton height={220} />
          ) : uniqueItems.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(260px, 2fr) minmax(180px, 1fr) minmax(200px, 1fr) minmax(200px, 1fr)",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  opacity: 0.7,
                  padding: "4px 12px",
                }}
              >
                <div>Имя</div>
                <div>Торговые точки</div>
                <div>
                  Активность
                  <span
                    title="Дата последней транзакции или входа в панель управления"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "1px solid rgba(255,255,255,.4)",
                      marginLeft: 6,
                      fontSize: 10,
                    }}
                  >
                    ?
                  </span>
                </div>
                <div>Доступ в панель управления</div>
              </div>
              {uniqueItems.map((staff, idx) => {
                const displayName = getDisplayName(staff);
                const secondary = staff.email || staff.phone || staff.position;
                const portalsAccess = hasPortalAccess(staff);
                const outletText = (() => {
                  const accesses = Array.isArray(staff.accesses) ? staff.accesses : [];
                  const active = accesses.filter((access) => access.status === "ACTIVE");
                  if (active.length === 0) return "—";
                  if (active.length === 1) {
                    const only = active[0] as StaffOutletAccess;
                    return only.outletName || "1 торговая точка";
                  }
                  return `${active.length} торговых точек`;
                })();
                const applyRowHighlight = (el: HTMLAnchorElement, active: boolean) => {
                  el.style.borderColor = active ? "var(--brand-primary)" : "rgba(255,255,255,.05)";
                  el.style.background = active ? "rgba(20,26,38,.72)" : "rgba(10,14,24,.4)";
                  el.style.transform = active ? "translateY(-1px)" : "translateY(0)";
                };
                return (
                  <a
                    key={`${staff.id}-${idx}`}
                    href={`/staff/${encodeURIComponent(staff.id)}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(260px, 2fr) minmax(180px, 1fr) minmax(200px, 1fr) minmax(200px, 1fr)",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 12px",
                      borderRadius: 12,
                      textDecoration: "none",
                      color: "inherit",
                      background: "rgba(10,14,24,.4)",
                      border: "1px solid rgba(255,255,255,.05)",
                      transition: "border-color .2s ease, transform .2s ease, background .2s ease",
                      transform: "translateY(0)",
                    }}
                    onMouseEnter={(e) => applyRowHighlight(e.currentTarget, true)}
                    onMouseLeave={(e) => applyRowHighlight(e.currentTarget, false)}
                    onFocus={(e) => applyRowHighlight(e.currentTarget, true)}
                    onBlur={(e) => applyRowHighlight(e.currentTarget, false)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          background: "rgba(255,255,255,.08)",
                          overflow: "hidden",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 600,
                          fontSize: 18,
                        }}
                      >
                        {(displayName || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 600 }}>{displayName}</span>
                          {staff.isOwner || (staff.role || "").toUpperCase() === "MERCHANT" ? (
                            <span
                              title="Владелец мерчанта"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                background: "var(--brand-primary)",
                                color: "#0b0f19",
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              А
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 13, opacity: 0.75 }}>{getRoleLabel(staff.role)}</div>
                        {secondary ? (
                          <div style={{ fontSize: 12, opacity: 0.6 }}>{secondary}</div>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>{outletText}</div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>{formatActivityDate(staff.lastActivityAt)}</div>
                    <div>
                      {portalsAccess ? (
                        <span style={{ color: "#4ade80", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          ✓ <span>Да</span>
                        </span>
                      ) : (
                        <span style={{ color: "#f87171", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          ✕ <span>Нет</span>
                        </span>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "16px 12px", opacity: 0.7 }}>Нет сотрудников, удовлетворяющих условиям фильтра</div>
          )}
          {error && !loading ? (
            <div style={{ color: "#f87171", marginTop: 16 }}>{error}</div>
          ) : null}
        </CardBody>
      </Card>

      {showCreate ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,8,16,0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 60,
          }}
        >
          <div
            style={{
              width: "min(720px, 96vw)",
              background: "rgba(12,16,26,0.96)",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,.08)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              maxHeight: "90vh",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 24px",
                borderBottom: "1px solid rgba(255,255,255,.06)",
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Добавить сотрудника</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Заполните данные и назначьте доступы</div>
              </div>
              <button
                aria-label="Закрыть"
                onClick={() => {
                  setShowCreate(false);
                  resetCreateForm();
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(248,113,113,0.15)",
                  color: "#fca5a5",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: "24px",
                overflowY: "auto",
                display: "grid",
                gap: 18,
              }}
            >
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Имя *</label>
                  <input
                    value={cFirstName}
                    onChange={(e) => setCFirstName(e.target.value)}
                    placeholder="Например, Анна"
                    style={{ padding: "10px 12px", borderRadius: 8 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Фамилия</label>
                  <input
                    value={cLastName}
                    onChange={(e) => setCLastName(e.target.value)}
                    placeholder="Опционально"
                    style={{ padding: "10px 12px", borderRadius: 8 }}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Должность</label>
                  <input
                    value={cPosition}
                    onChange={(e) => setCPosition(e.target.value)}
                    placeholder="Например, Старший кассир"
                    style={{ padding: "10px 12px", borderRadius: 8 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Телефон</label>
                  <input
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                    placeholder="+7 (___) ___-__-__"
                    style={{ padding: "10px 12px", borderRadius: 8 }}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, opacity: 0.75 }}>Комментарий</label>
                <textarea
                  value={cComment}
                  onChange={(e) => setCComment(e.target.value)}
                  placeholder="Дополнительная информация, заметки"
                  style={{ padding: "10px 12px", borderRadius: 8, minHeight: 80, resize: "vertical" }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Toggle
                  checked={cPortal}
                  onChange={(next) => {
                    setCPortal(next);
                    if (next && groups.length === 0 && !groupsLoading) {
                      ensureGroupsLoaded();
                    }
                  }}
                  label="Доступ в админ‑панель"
                />
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, opacity: 0.75 }}>
                  <span
                    title="Позволяет входить в панель управления программы лояльности. При создании кассиров обычно ставим выкл."
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: "1px solid rgba(255,255,255,.4)",
                      fontSize: 12,
                      cursor: "help",
                    }}
                  >
                    ?
                  </span>
                </div>
              </div>

              {cPortal ? (
                <div style={{ display: "grid", gap: 18 }}>
                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "minmax(260px, 1fr) auto auto",
                      alignItems: "end",
                    }}
                  >
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ fontSize: 13, opacity: 0.75 }}>Выбрать группу доступа *</label>
                      <select
                        value={cGroup}
                        onChange={(e) => setCGroup(e.target.value)}
                        style={{ padding: "10px 12px", borderRadius: 8 }}
                      >
                        <option value="">— выберите группу —</option>
                        {uniqueGroups.map((group, idx) => (
                          <option key={`${group.id || group.name}-${idx}`} value={group.id || group.name}>
                            {group.name}{" "}
                            {typeof group.membersCount === "number"
                              ? `(${group.membersCount})`
                              : typeof group.memberCount === "number"
                              ? `(${group.memberCount})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="btn btn-ghost"
                      onClick={ensureGroupsLoaded}
                      disabled={groupsLoading}
                      title="Обновить список групп"
                      style={{ padding: "10px 18px" }}
                    >
                      ⟳
                    </button>
                    <a
                      href="/settings/access"
                      className="btn btn-ghost"
                      style={{ textDecoration: "none", padding: "10px 18px" }}
                      title="Перейти к настройке групп доступа"
                    >
                      ＋
                    </a>
                  </div>
                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ fontSize: 13, opacity: 0.75 }}>E-mail *</label>
                      <input
                        value={cEmail}
                        onChange={(e) => setCEmail(e.target.value)}
                        placeholder="example@company.ru"
                        style={{ padding: "10px 12px", borderRadius: 8 }}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ fontSize: 13, opacity: 0.75 }}>Пароль *</label>
                      <input
                        value={cPassword}
                        onChange={(e) => setCPassword(e.target.value)}
                        placeholder="Придумайте пароль"
                        type="password"
                        style={{ padding: "10px 12px", borderRadius: 8 }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {createError ? (
                <div style={{ color: "#f87171", fontSize: 13 }}>{createError}</div>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                padding: "16px 24px",
                borderTop: "1px solid rgba(255,255,255,.06)",
              }}
            >
              <button
                className="btn"
                onClick={() => {
                  setShowCreate(false);
                  resetCreateForm();
                }}
              >
                Отмена
              </button>
              <Button variant="primary" disabled={!canSubmitCreate || submitting} onClick={handleCreate}>
                {submitting ? "Сохраняем…" : "Создать"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
