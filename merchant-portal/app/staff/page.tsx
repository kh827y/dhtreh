"use client";
import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton, Badge } from "@loyalty/ui";
import { useRouter } from "next/navigation";
import Toggle from "../../components/Toggle";
import { 
  Users, 
  Plus, 
  Search, 
  MapPin, 
  UserCog, 
  ShieldCheck, 
  Clock, 
  ChevronRight,
  Filter,
  X,
  Store
} from "lucide-react";

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
type AccessGroup = {
  id: string;
  name: string;
  scope?: string | null;
  membersCount?: number;
  memberCount?: number;
  isSystem?: boolean;
  isDefault?: boolean;
};

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
      const id = String((g as any).id ?? "").trim();
      const name = String((g as any).name ?? "").trim();
      const scope = String((g as any).scope ?? "").toUpperCase();
      const isSystem = Boolean((g as any).isSystem);
      if (!id || !name) continue;
      if (isSystem) continue;
      if (scope && scope !== "PORTAL") continue;
      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          scope: (g as any).scope ?? null,
          isSystem,
          isDefault: Boolean((g as any).isDefault),
          membersCount: Number((g as any).membersCount ?? (g as any).memberCount ?? 0) || 0,
          memberCount: Number((g as any).memberCount ?? (g as any).membersCount ?? 0) || 0,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
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
      const normalized = (list || [])
        .map((g: any) => ({
          id: String(g?.id ?? ""),
          name: String(g?.name ?? ""),
          scope: g?.scope ?? null,
          isSystem: Boolean(g?.isSystem),
          isDefault: Boolean(g?.isDefault),
          membersCount: Number(g?.membersCount ?? g?.memberCount ?? 0) || 0,
          memberCount: Number(g?.memberCount ?? g?.membersCount ?? 0) || 0,
        }))
        .filter((item) => item.id && item.name);
      setGroups(normalized);
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
      return Boolean(cGroup && cEmail.trim() && cPassword.trim().length >= 6);
    }
    return true;
  }, [cFirstName, cPortal, cGroup, cEmail, cPassword]);

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
      if (cPortal) {
        const pwd = cPassword.trim();
        if (pwd) {
          payload.password = pwd;
          payload.canAccessPortal = true;
          payload.portalAccessEnabled = true;
        }
      }
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
    <div className="animate-in" style={{ display: "grid", gap: 24 }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: "var(--radius-lg)",
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--brand-primary-light)",
        }}>
          <Users size={24} />
        </div>
        <div>
          <h1 style={{ 
            fontSize: 28, 
            fontWeight: 800, 
            margin: 0,
            letterSpacing: "-0.02em",
          }}>
            Сотрудники
          </h1>
          <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              Всего: <strong style={{ color: "var(--fg)" }}>{recordsLabel}</strong>
            </span>
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
           <Button variant="primary" onClick={() => setShowCreate(true)} leftIcon={<Plus size={16} />}>
            Добавить сотрудника
          </Button>
        </div>
      </header>

      {/* Tabs & Filters */}
      <Card>
        <CardBody style={{ padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", gap: 8 }}>
               <button
                className="btn"
                style={{
                  minWidth: 112,
                  background: tab === "ACTIVE" ? "var(--brand-primary)" : "transparent",
                  borderColor: tab === "ACTIVE" ? "transparent" : "var(--border-default)",
                  color: tab === "ACTIVE" ? "#fff" : "var(--fg)",
                  fontWeight: tab === "ACTIVE" ? 600 : 500,
                  transition: "all .2s ease",
                }}
                onClick={() => setTab("ACTIVE")}
              >
                Работает{` (${counters.active})`}
              </button>
              <button
                className="btn"
                style={{
                  minWidth: 112,
                  background: tab === "FIRED" ? "var(--brand-primary)" : "transparent",
                  borderColor: tab === "FIRED" ? "transparent" : "var(--border-default)",
                  color: tab === "FIRED" ? "#fff" : "var(--fg)",
                  fontWeight: tab === "FIRED" ? 600 : 500,
                  transition: "all .2s ease",
                }}
                onClick={() => setTab("FIRED")}
              >
                Уволен{` (${counters.fired})`}
              </button>
            </div>

            <div className="filter-grid">
               <div className="filter-block">
                 <span className="filter-label">Роль</span>
                 <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="input"
                  style={{ minWidth: 180 }}
                >
                  <option value="ALL">Все роли</option>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
               </div>
               <div className="filter-block">
                 <span className="filter-label">Торговая точка</span>
                 <select
                  value={outletFilter}
                  onChange={(e) => setOutletFilter(e.target.value)}
                  className="input"
                  style={{ minWidth: 220 }}
                >
                  <option value="ALL">Все торговые точки</option>
                  {outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name}
                    </option>
                  ))}
                </select>
               </div>
               <div className="filter-block">
                 <span className="filter-label">Доступ</span>
                 <div style={{ paddingTop: 4 }}>
                    <Toggle
                      checked={onlyPortal}
                      onChange={setOnlyPortal}
                      label="Только с доступом в панель"
                    />
                 </div>
               </div>
               <div className="filter-block" style={{ flex: 1, minWidth: 240 }}>
                 <span className="filter-label">Поиск</span>
                 <div style={{ position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-muted)" }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по имени или e-mail"
                    className="input"
                    style={{ paddingLeft: 38, width: "100%" }}
                  />
                </div>
               </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Команда" subtitle="Список сотрудников с правами доступа" />
        <CardBody style={{ padding: 0 }}>
          {loading ? (
             <div style={{ padding: 20 }}><Skeleton height={220} /></div>
          ) : uniqueItems.length ? (
            <div className="data-list">
              <div className="list-row staff-grid" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="cell-label">ИМЯ</div>
                <div className="cell-label">ТОРГОВЫЕ ТОЧКИ</div>
                <div className="cell-label">АКТИВНОСТЬ</div>
                <div className="cell-label">ДОСТУП В ПАНЕЛЬ</div>
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
                
                return (
                  <a
                    key={`${staff.id}-${idx}`}
                    href={`/staff/${encodeURIComponent(staff.id)}`}
                    className="list-row staff-grid"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "var(--brand-primary-light)",
                          overflow: "hidden",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 600,
                          fontSize: 16,
                        }}
                      >
                        {(displayName || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>{displayName}</span>
                          {staff.isOwner || (staff.role || "").toUpperCase() === "MERCHANT" ? (
                            <Badge variant="primary" className="text-xs py-0 px-1.5 h-5">Владелец</Badge>
                          ) : null}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-muted)" }}>
                           <span>{getRoleLabel(staff.role)}</span>
                           {secondary && (
                             <>
                               <span>·</span>
                               <span>{secondary}</span>
                             </>
                           )}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-secondary)", fontSize: 14 }}>
                      <Store size={16} className="text-muted" />
                      {outletText}
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-secondary)", fontSize: 14 }}>
                      <Clock size={16} className="text-muted" />
                      {formatActivityDate(staff.lastActivityAt)}
                    </div>
                    
                    <div>
                      {portalsAccess ? (
                        <Badge variant="success" dot>Да</Badge>
                      ) : (
                        <span style={{ color: "var(--fg-muted)", fontSize: 14 }}>Нет</span>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "40px 20px", textAlign: "center", opacity: 0.7 }}>
              <div style={{ marginBottom: 12, opacity: 0.5 }}><UserCog size={48} /></div>
              Нет сотрудников, удовлетворяющих условиям фильтра
            </div>
          )}
          {error && !loading ? (
            <div style={{ color: "var(--danger)", padding: 20 }}>{error}</div>
          ) : null}
        </CardBody>
      </Card>

      {showCreate && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Добавить сотрудника</div>
                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>Заполните данные и назначьте доступы</div>
              </div>
              <button
                aria-label="Закрыть"
                onClick={() => {
                  setShowCreate(false);
                  resetCreateForm();
                }}
                className="btn-ghost"
                style={{ padding: 6, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex" }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gap: 16 }}>
                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div className="filter-block">
                      <label className="filter-label">Имя *</label>
                      <input
                        value={cFirstName}
                        onChange={(e) => setCFirstName(e.target.value)}
                        placeholder="Например, Анна"
                        className="input"
                      />
                    </div>
                    <div className="filter-block">
                      <label className="filter-label">Фамилия</label>
                      <input
                        value={cLastName}
                        onChange={(e) => setCLastName(e.target.value)}
                        placeholder="Опционально"
                        className="input"
                      />
                    </div>
                 </div>
                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div className="filter-block">
                        <label className="filter-label">Должность</label>
                        <input
                        value={cPosition}
                        onChange={(e) => setCPosition(e.target.value)}
                        placeholder="Например, Старший кассир"
                        className="input"
                        />
                    </div>
                    <div className="filter-block">
                        <label className="filter-label">Телефон</label>
                        <input
                        value={cPhone}
                        onChange={(e) => setCPhone(e.target.value)}
                        placeholder="+7 (___) ___-__-__"
                        className="input"
                        />
                    </div>
                 </div>
                 <div className="filter-block">
                    <label className="filter-label">Комментарий</label>
                    <textarea
                      value={cComment}
                      onChange={(e) => setCComment(e.target.value)}
                      placeholder="Дополнительная информация"
                      className="input"
                      style={{ minHeight: 80, resize: "vertical", paddingTop: 10 }}
                    />
                 </div>
                 
                 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "grid", gap: 2 }}>
                       <div style={{ fontWeight: 500, fontSize: 14 }}>Доступ в панель управления</div>
                       <div style={{ fontSize: 12, opacity: 0.6 }}>Разрешить вход в этот портал</div>
                    </div>
                    <Toggle label="" checked={cPortal} onChange={(next) => {
                        setCPortal(next);
                        if (next && groups.length === 0 && !groupsLoading) ensureGroupsLoaded();
                    }} />
                 </div>
                 
                 {cPortal && (
                   <div className="animate-in" style={{ display: "grid", gap: 16, paddingLeft: 12, borderLeft: "2px solid var(--border-default)" }}>
                      <div className="filter-block">
                        <label className="filter-label">Группа прав *</label>
                        <select value={cGroup} onChange={(e) => setCGroup(e.target.value)} className="input">
                          <option value="">Выберите роль</option>
                          {uniqueGroups.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="filter-block">
                        <label className="filter-label">Email (логин) *</label>
                        <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="employee@company.com" className="input" />
                      </div>
                      <div className="filter-block">
                        <label className="filter-label">Пароль *</label>
                        <input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="Минимум 6 символов" className="input" />
                      </div>
                   </div>
                 )}
                 
                 {createError && (
                   <div style={{ color: "var(--danger)", fontSize: 13 }}>{createError}</div>
                 )}
              </div>
            </div>
            <div className="modal-footer">
               <Button variant="ghost" onClick={() => setShowCreate(false)}>Отмена</Button>
               <Button variant="primary" disabled={!canSubmitCreate || submitting} onClick={handleCreate}>
                 {submitting ? "Создание..." : "Создать сотрудника"}
               </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
