"use client";
import React, { use } from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

type StaffGroup = { id: string; name: string; scope?: string | null };

type Staff = {
  id: string;
  login?: string | null;
  email?: string | null;
  role?: string | null;
  status: string;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  phone?: string | null;
  comment?: string | null;
  avatarUrl?: string | null;
  canAccessPortal?: boolean | null;
  portalAccessEnabled?: boolean | null;
  isOwner?: boolean | null;
  lastActivityAt?: string | null;
  lastPortalLoginAt?: string | null;
  pinCode?: string | null;
  groups?: StaffGroup[];
};

type AccessRow = {
  id: string;
  outletId: string;
  outletName: string;
  pinCode?: string | null;
  lastTxnAt?: string | null;
  transactionsTotal?: number | null;
  status?: string;
};

type Outlet = { id: string; name: string };

type AccessGroup = { id: string; name: string; membersCount?: number };

const DEFAULT_GROUPS: AccessGroup[] = [
  { id: "MERCHANT", name: "Владелец" },
  { id: "MANAGER", name: "Менеджер" },
  { id: "ANALYST", name: "Аналитик" },
  { id: "CASHIER", name: "Кассир" },
];

function formatActivityDate(value?: string | null) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function getDisplayName(staff: Staff | null): string {
  if (!staff) return "—";
  const composed = [staff.firstName, staff.lastName].filter(Boolean).join(" ");
  return composed || staff.login || staff.email || staff.id;
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

function mergeGroups(options: AccessGroup[], currentRole?: string | null) {
  const map = new Map<string, AccessGroup>();
  [...DEFAULT_GROUPS, ...options].forEach((group) => {
    if (group.id) map.set(group.id, group);
  });
  if (currentRole && !map.has(currentRole)) {
    map.set(currentRole, { id: currentRole, name: getRoleLabel(currentRole) });
  }
  return Array.from(map.values());
}

export default function StaffCardPage({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId: promisedStaffId } = use(params);
  const staffId = (typeof promisedStaffId === "string" ? promisedStaffId : "").toString();

  const [loading, setLoading] = React.useState(true);
  const [item, setItem] = React.useState<Staff | null>(null);
  const [accesses, setAccesses] = React.useState<AccessRow[]>([]);
  const [outlets, setOutlets] = React.useState<Outlet[]>([]);
  const [groups, setGroups] = React.useState<AccessGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = React.useState(false);

  const [newOutletId, setNewOutletId] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [editForm, setEditForm] = React.useState({ firstName: "", lastName: "", position: "", phone: "", comment: "" });
  const [editSaving, setEditSaving] = React.useState(false);

  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [passwordForm, setPasswordForm] = React.useState({ current: "", next: "", confirm: "" });
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState("");

  const [accessForm, setAccessForm] = React.useState({ email: "", role: "CASHIER", canAccessPortal: false });
  const [accessSaving, setAccessSaving] = React.useState(false);
  const [accessSubmitLoading, setAccessSubmitLoading] = React.useState(false);
  const [pinBusy, setPinBusy] = React.useState(false);

  const [accessActionOutlet, setAccessActionOutlet] = React.useState<string | null>(null);
  const [addAccessLoading, setAddAccessLoading] = React.useState(false);
  const [firing, setFiring] = React.useState(false);

  const [banner, setBanner] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [error, setError] = React.useState("");

  const [sessionStaffId, setSessionStaffId] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("portal.staffId") : null;
      if (stored) setSessionStaffId(stored);
    } catch {}
  }, []);

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

  React.useEffect(() => {
    ensureGroupsLoaded();
  }, [ensureGroupsLoaded]);

  const load = React.useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    setError("");
    setBanner(null);
    try {
      const [staffRes, accessRes, outletsRes] = await Promise.all([
        fetch(`/api/portal/staff/${encodeURIComponent(staffId)}`),
        fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access`),
        fetch("/api/portal/outlets"),
      ]);
      if (!staffRes.ok) throw new Error(await staffRes.text());
      if (!accessRes.ok) throw new Error(await accessRes.text());
      if (!outletsRes.ok) throw new Error(await outletsRes.text());
      const [staffPayload, accessData, outletsData] = await Promise.all([staffRes.json(), accessRes.json(), outletsRes.json()]);
      const detail: Staff | null = staffPayload && typeof staffPayload === "object" && staffPayload.id ? staffPayload : null;
      if (!detail) {
        setError("Сотрудник не найден или недоступен");
        setItem(null);
      } else {
        setItem(detail);
        setAccessForm({
          email: detail.email || "",
          role: (detail.role || "CASHIER").toUpperCase(),
          canAccessPortal: !!(detail.isOwner || detail.portalAccessEnabled || detail.canAccessPortal),
        });
      }
      const accessItems: any[] = Array.isArray(accessData?.items)
        ? accessData.items
        : Array.isArray(accessData)
          ? accessData
          : [];
      const mappedAccesses: AccessRow[] = accessItems.map((row: any) => ({
        id: String(row?.id ?? `${row?.outletId || ''}`),
        outletId: String(row?.outletId ?? ''),
        outletName: String(row?.outletName ?? row?.outletId ?? ''),
        pinCode: row?.pinCode ?? null,
        lastTxnAt: row?.lastTxnAt ?? null,
        transactionsTotal: row?.transactionsTotal ?? null,
        status: row?.status ?? null,
      }));
      setAccesses(mappedAccesses);

      const outletsItems: any[] = Array.isArray(outletsData?.items)
        ? outletsData.items
        : Array.isArray(outletsData)
          ? outletsData
          : [];
      const mappedOutlets: Outlet[] = outletsItems.map((outlet: any) => ({
        id: String(outlet?.id ?? ''),
        name: String(outlet?.name ?? outlet?.id ?? ''),
      }));
      setOutlets(mappedOutlets);
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось загрузить данные сотрудника"));
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (item) {
      setEditForm({
        firstName: item.firstName || "",
        lastName: item.lastName || "",
        position: item.position || "",
        phone: item.phone || "",
        comment: item.comment || "",
      });
    }
  }, [item]);

  const groupOptions = React.useMemo(() => mergeGroups(groups, item?.role), [groups, item?.role]);
  const canChangePassword = sessionStaffId === staffId;
  const canTogglePortal = !item?.isOwner;
  const hasTransactions = React.useMemo(() => {
    if (!item) return false;
    if (item.lastActivityAt) return true;
    return accesses.some((a) => (a.transactionsTotal || 0) > 0);
  }, [item, accesses]);

  const accessChanged = React.useMemo(() => {
    if (!item) return false;
    const emailChanged = (accessForm.email || "").trim() !== (item.email || "");
    const roleChanged = (accessForm.role || "CASHIER").toUpperCase() !== (item.role || "CASHIER").toUpperCase();
    return emailChanged || roleChanged;
  }, [accessForm, item]);

  async function handlePortalToggle(value: boolean) {
    if (!item || accessSaving) return;
    setAccessSaving(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canAccessPortal: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setItem(updated);
      setAccessForm((prev) => ({ ...prev, canAccessPortal: !!value }));
      setBanner({ type: "success", text: value ? "Доступ в панель включён" : "Доступ в панель отключён" });
    } catch (e: any) {
      setBanner({ type: "error", text: String(e?.message || e || "Не удалось обновить доступ") });
    } finally {
      setAccessSaving(false);
    }
  }
  async function handlePersonalPinRegenerate() {
    if (!item || pinBusy) return;
    setPinBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/pin`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItem(prev => prev ? { ...prev, pinCode: data?.pinCode || prev.pinCode } : prev);
      setBanner({ type: 'success', text: 'Персональный PIN обновлён' });
    } catch (e: any) {
      setBanner({ type: 'error', text: String(e?.message || e || 'Не удалось обновить PIN') });
    } finally {
      setPinBusy(false);
    }
  }

  async function handleAccessSave() {
    if (!item || !accessChanged) return;
    setAccessSubmitLoading(true);
    setBanner(null);
    try {
      const payload: Record<string, any> = {
        email: accessForm.email.trim(),
        role: accessForm.role,
      };
      if (item.firstName || item.lastName) {
        payload.login = [item.firstName, item.lastName].filter(Boolean).join(" ");
      }
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setItem(updated);
      setBanner({ type: "success", text: "Данные доступа сохранены" });
    } catch (e: any) {
      setBanner({ type: "error", text: String(e?.message || e || "Не удалось сохранить изменения") });
    } finally {
      setAccessSubmitLoading(false);
    }
  }

  async function handleEditSave() {
    if (!item) return;
    setEditSaving(true);
    setBanner(null);
    try {
      const payload = {
        firstName: editForm.firstName.trim() || null,
        lastName: editForm.lastName.trim() || null,
        position: editForm.position.trim() || null,
        phone: editForm.phone.trim() || null,
        comment: editForm.comment.trim() || null,
        login: [editForm.firstName.trim(), editForm.lastName.trim()].filter(Boolean).join(" ") || item.login || null,
      };
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setItem(updated);
      setEditOpen(false);
      setBanner({ type: "success", text: "Карточка сотрудника обновлена" });
    } catch (e: any) {
      setBanner({ type: "error", text: String(e?.message || e || "Не удалось сохранить карточку сотрудника") });
    } finally {
      setEditSaving(false);
    }
  }

  async function handlePasswordSave() {
    if (!item || passwordSaving) return;
    setPasswordError("");
    const next = passwordForm.next.trim();
    const confirm = passwordForm.confirm.trim();
    const current = passwordForm.current.trim();
    if (next.length < 6) {
      setPasswordError("Пароль должен содержать минимум 6 символов");
      return;
    }
    if (next !== confirm) {
      setPasswordError("Пароли не совпадают");
      return;
    }
    setPasswordSaving(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: next, currentPassword: current || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      await res.json();
      setPasswordForm({ current: "", next: "", confirm: "" });
      setPasswordOpen(false);
      setBanner({ type: "success", text: "Пароль обновлён" });
    } catch (e: any) {
      const msg = String(e?.message || e || "Не удалось сменить пароль");
      setPasswordError(msg);
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleAddOutlet() {
    if (!item || !newOutletId || addAccessLoading) return;
    setAddAccessLoading(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId: newOutletId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const addedPayload = await res.json();
      const added: AccessRow | null = addedPayload && typeof addedPayload === 'object'
        ? {
            id: String(addedPayload?.id ?? `${addedPayload?.outletId || ''}`),
            outletId: String(addedPayload?.outletId ?? ''),
            outletName: String(addedPayload?.outletName ?? addedPayload?.outletId ?? ''),
            pinCode: addedPayload?.pinCode ?? null,
            lastTxnAt: addedPayload?.lastTxnAt ?? null,
            transactionsTotal: addedPayload?.transactionsTotal ?? null,
            status: addedPayload?.status ?? null,
          }
        : null;
      if (added) setAccesses((prev) => [...prev, added]);
      setNewOutletId("");
      setBanner({ type: "success", text: "Точка добавлена" });
    } catch (e: any) {
      setBanner({ type: "error", text: String(e?.message || e || "Не удалось добавить точку") });
    } finally {
      setAddAccessLoading(false);
    }
  }

  async function handleRegenerate(outletId: string) {
    if (!item || accessActionOutlet) return;
    setAccessActionOutlet(outletId);
    setBanner(null);
    try {
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access/${encodeURIComponent(outletId)}/regenerate-pin`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAccesses((prev) => prev.map((row) => (row.outletId === outletId ? { ...row, pinCode: data?.pinCode || row.pinCode } : row)));
      setBanner({ type: "success", text: "PIN-код обновлён" });
    } catch (e: any) {
      setBanner({ type: "error", text: String(e?.message || e || "Не удалось обновить PIN") });
    } finally {
      setAccessActionOutlet(null);
    }
  }

  async function handleRevoke(outletId: string) {
    if (!item || accessActionOutlet) return;
    if (!window.confirm("Отозвать доступ к выбранной точке?")) return;
    setAccessActionOutlet(outletId);
    setBanner(null);
    try {
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access/${encodeURIComponent(outletId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setAccesses((prev) => prev.filter((row) => row.outletId !== outletId));
      setBanner({ type: "success", text: "Доступ отозван" });
    } catch (e: any) {
      setBanner({ type: "error", text: String(e?.message || e || "Не удалось отозвать доступ") });
    } finally {
      setAccessActionOutlet(null);
    }
  }

  async function handleFire() {
    if (!item || firing || item.isOwner) return;
    if (!window.confirm("Уволить сотрудника? Он потеряет доступ к панели")) return;
    setFiring(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FIRED", canAccessPortal: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setItem(updated);
      setAccessForm((prev) => ({ ...prev, canAccessPortal: false }));
      setBanner({ type: "success", text: "Сотрудник помечен как уволенный" });
    } catch (e: any) {
      setBanner({ type: "error", text: String(e?.message || e || "Не удалось обновить статус") });
    } finally {
      setFiring(false);
    }
  }

  const displayName = getDisplayName(item);
  const secondaryLine = item?.position || item?.phone || item?.email || "—";
  const statusBadge = item?.status === "ACTIVE" ? "Работает" : item?.status === "FIRED" ? "Уволен" : item?.status || "";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {banner && (
        <div
          style={{
            borderRadius: 12,
            padding: "12px 16px",
            background: banner.type === "success" ? "rgba(34,197,94,.15)" : "rgba(248,113,113,.16)",
            border: `1px solid ${banner.type === "success" ? "rgba(34,197,94,.35)" : "rgba(248,113,113,.35)"}`,
            color: banner.type === "success" ? "#4ade80" : "#fca5a5",
          }}
        >
          {banner.text}
        </div>
      )}
      {error && (
        <div style={{ color: "#f87171", border: "1px solid rgba(248,113,113,.35)", borderRadius: 12, padding: "12px 16px" }}>{error}</div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 24,
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(10,14,24,.55)",
          border: "1px solid rgba(255,255,255,.05)",
          borderRadius: 18,
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 82,
                height: 82,
                borderRadius: "50%",
                background: "rgba(255,255,255,.08)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              {item?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                displayName.slice(0, 1).toUpperCase()
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              title="Редактировать профиль"
              style={{
                position: "absolute",
                right: -4,
                bottom: -4,
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--brand-primary)",
                color: "#0b0f19",
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              ✎
            </button>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{displayName}</div>
              {(item?.isOwner || (item?.role || "").toUpperCase() === "MERCHANT") && (
                <span
                  title="Владелец мерчанта"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "var(--brand-primary)",
                    color: "#0b0f19",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  А
                </span>
              )}
              {statusBadge && (
                <span
                  style={{
                    marginLeft: 6,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: item?.status === "ACTIVE" ? "rgba(34,197,94,.18)" : "rgba(248,113,113,.18)",
                    color: item?.status === "ACTIVE" ? "#4ade80" : "#fca5a5",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {statusBadge}
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, opacity: 0.75 }}>Группа доступа: {getRoleLabel(item?.role)}</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>Email: {item?.email || "—"}</div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>Телефон: {item?.phone || "—"}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "flex-end" }}>
          <Button variant="primary" onClick={() => setEditOpen(true)} disabled={!item}>
            Редактировать
          </Button>
          <button
            className="btn"
            onClick={() => setPasswordOpen(true)}
            disabled={!canChangePassword || !accessForm.canAccessPortal}
            title={canChangePassword ? "Сменить пароль" : "Доступно только для собственного профиля"}
            style={{ opacity: canChangePassword ? 1 : 0.6 }}
          >
            Сменить пароль
          </button>
          <button
            className="btn"
            onClick={() => {
              if (hasTransactions) window.location.href = `/operations?staffId=${encodeURIComponent(staffId)}`;
            }}
            disabled={!hasTransactions}
            title={hasTransactions ? "Открыть операции по сотруднику" : "Нет транзакций"}
            style={{ opacity: hasTransactions ? 1 : 0.6 }}
          >
            Посмотреть транзакции
          </button>
          <Button variant="danger" onClick={handleFire} disabled={!item || item.isOwner || firing}>
            {firing ? "Увольняем…" : "Уволить"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title="Доступы" subtitle="Доступ в панель мерчанта и права" />
        <CardBody>
          {loading && !item ? (
            <Skeleton height={160} />
          ) : (
              <div style={{ display: "grid", gap: 18 }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                background: "rgba(255,255,255,.03)",
                borderRadius: 12,
                padding: "12px 14px",
              }}>
                <div style={{ fontSize: 13, opacity: 0.75 }}>Персональный PIN</div>
                <code style={{ fontVariantNumeric: "tabular-nums", padding: "4px 10px", borderRadius: 8, background: "rgba(255,255,255,.06)", fontSize: 16 }}>
                  {item?.pinCode || "—"}
                </code>
                <button
                  className="btn"
                  onClick={() => {
                    if (!item?.pinCode) return;
                    navigator.clipboard?.writeText(item.pinCode).then(() => setBanner({ type: "success", text: "PIN скопирован" })).catch(() => {});
                  }}
                  disabled={!item?.pinCode}
                >
                  Копировать
                </button>
                <button
                  className="btn"
                  onClick={handlePersonalPinRegenerate}
                  disabled={pinBusy}
                  title="Сгенерировать новый персональный PIN"
                >
                  ⟳ Обновить PIN
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
                <Toggle
                  checked={accessForm.canAccessPortal}
                  onChange={(value) => handlePortalToggle(value)}
                  label="Доступ в админ-панель"
                  disabled={!canTogglePortal || accessSaving}
                  title={canTogglePortal ? undefined : "Для владельца доступ всегда включён"}
                />
                <div style={{ fontSize: 12, opacity: 0.7 }}>Последняя активность: {formatActivityDate(item?.lastActivityAt)}</div>
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Группа доступа</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={accessForm.role}
                      disabled={item?.isOwner}
                      onChange={(e) => setAccessForm((prev) => ({ ...prev, role: e.target.value }))}
                      style={{ padding: "10px 12px", borderRadius: 8, flex: 1 }}
                    >
                      {groupOptions.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-ghost"
                      onClick={ensureGroupsLoaded}
                      disabled={groupsLoading}
                      title="Обновить список групп доступа"
                    >
                      ⟳
                    </button>
                    <a
                      href="/settings/access"
                      className="btn btn-ghost"
                      title="Перейти к редактированию групп доступа"
                    >
                      ＋
                    </a>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>E-mail</label>
                  <input
                    value={accessForm.email}
                    onChange={(e) => setAccessForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="E-mail для входа"
                    style={{ padding: "10px 12px", borderRadius: 8 }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => load()} disabled={accessSubmitLoading}>
                  Сбросить
                </button>
                <Button variant="primary" onClick={handleAccessSave} disabled={!accessChanged || accessSubmitLoading}>
                  {accessSubmitLoading ? "Сохраняем…" : "Сохранить"}
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Связанные торговые точки" subtitle="Права кассира по точкам" />
        <CardBody>
          {loading && !item ? (
            <Skeleton height={200} />
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(260px, 1fr) auto" }}>
                <select
                  value={newOutletId}
                  onChange={(e) => setNewOutletId(e.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 8 }}
                >
                  <option value="">Выберите торговую точку…</option>
                  {outlets
                    .filter((outlet) => !accesses.some((row) => row.outletId === outlet.id))
                    .map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>
                        {outlet.name}
                      </option>
                    ))}
                </select>
                <Button variant="primary" onClick={handleAddOutlet} disabled={!newOutletId || addAccessLoading}>
                  {addAccessLoading ? "Добавляем…" : "Добавить точку для кассира"}
                </Button>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 2fr) minmax(140px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) 120px",
                    fontSize: 12,
                    textTransform: "uppercase",
                    opacity: 0.6,
                    padding: "4px 12px",
                  }}
                >
                  <div>Торговая точка</div>
                  <div>Транзакций всего</div>
                  <div>Последняя транзакция</div>
                  <div>Пин-код</div>
                  <div>Действия</div>
                </div>
                {accesses.map((row) => (
                  <div
                    key={row.outletId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 2fr) minmax(140px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) 120px",
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 12px",
                      borderRadius: 12,
                      background: "rgba(10,14,24,.45)",
                      border: "1px solid rgba(255,255,255,.06)",
                    }}
                  >
                    <div>{row.outletName}</div>
                    <div>{row.transactionsTotal ?? 0}</div>
                    <div>{formatDateTime(row.lastTxnAt)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <code style={{ background: "rgba(255,255,255,.05)", padding: "4px 8px", borderRadius: 6 }}>{row.pinCode || "—"}</code>
                      {row.pinCode && (
                        <button
                          className="btn"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(row.pinCode || "");
                              setBanner({ type: "success", text: "PIN скопирован" });
                            } catch {}
                          }}
                        >
                          Копировать
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn"
                        onClick={() => handleRegenerate(row.outletId)}
                        disabled={accessActionOutlet === row.outletId}
                        title="Обновить PIN"
                      >
                        ⟳
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleRevoke(row.outletId)}
                        disabled={accessActionOutlet === row.outletId}
                        title="Отозвать доступ"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {!accesses.length && <div style={{ opacity: 0.7, padding: "8px 12px" }}>Нет точек, добавьте кассира в торговую точку</div>}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {editOpen && (
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
            zIndex: 70,
          }}
        >
          <div
            style={{
              width: "min(640px, 96vw)",
              background: "rgba(12,16,26,0.96)",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,.08)",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Редактировать сотрудника</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Измените данные профиля</div>
              </div>
              <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Имя</label>
                  <input value={editForm.firstName} onChange={(e) => setEditForm((prev) => ({ ...prev, firstName: e.target.value }))} style={{ padding: "10px 12px", borderRadius: 8 }} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Фамилия</label>
                  <input value={editForm.lastName} onChange={(e) => setEditForm((prev) => ({ ...prev, lastName: e.target.value }))} style={{ padding: "10px 12px", borderRadius: 8 }} />
                </div>
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Должность</label>
                  <input value={editForm.position} onChange={(e) => setEditForm((prev) => ({ ...prev, position: e.target.value }))} style={{ padding: "10px 12px", borderRadius: 8 }} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Телефон</label>
                  <input value={editForm.phone} onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} style={{ padding: "10px 12px", borderRadius: 8 }} />
                </div>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, opacity: 0.75 }}>Комментарий</label>
                <textarea value={editForm.comment} onChange={(e) => setEditForm((prev) => ({ ...prev, comment: e.target.value }))} style={{ padding: "10px 12px", borderRadius: 8, minHeight: 100, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <button className="btn" onClick={() => setEditOpen(false)} disabled={editSaving}>
                Отмена
              </button>
              <Button variant="primary" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? "Сохраняем…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {passwordOpen && (
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
            zIndex: 70,
          }}
        >
          <div
            style={{
              width: "min(460px, 92vw)",
              background: "rgba(12,16,26,0.96)",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,.08)",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Сменить пароль</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Введите текущий и новый пароль</div>
              </div>
              <button className="btn btn-ghost" onClick={() => setPasswordOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, opacity: 0.75 }}>Текущий пароль</label>
                <input
                  type="password"
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, current: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: 8 }}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, opacity: 0.75 }}>Новый пароль</label>
                <input
                  type="password"
                  value={passwordForm.next}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, next: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: 8 }}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, opacity: 0.75 }}>Повторить новый пароль</label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: 8 }}
                />
              </div>
              {passwordError && <div style={{ color: "#f87171", fontSize: 13 }}>{passwordError}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <button className="btn" onClick={() => setPasswordOpen(false)} disabled={passwordSaving}>
                Отмена
              </button>
              <Button variant="primary" onClick={handlePasswordSave} disabled={passwordSaving}>
                {passwordSaving ? "Обновляем…" : "Сменить"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
