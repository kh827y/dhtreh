"use client";
import React, { use } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Save,
  Camera,
  Ban,
  Trash2,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  ExternalLink,
  Store,
  Plus,
  X,
  CreditCard,
  History,
  RefreshCw,
} from "lucide-react";
import { ACCESS_DENIED_MESSAGE, normalizeErrorMessage } from "lib/portal-errors";

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

function mapAccessRows(accessData: any): AccessRow[] {
  const accessItems: any[] = Array.isArray(accessData?.items)
    ? accessData.items
    : Array.isArray(accessData)
      ? accessData
      : [];
  return accessItems.map((row: any) => ({
    id: String(row?.id ?? `${row?.outletId || ''}`),
    outletId: String(row?.outletId ?? ''),
    outletName: String(row?.outletName ?? row?.outletId ?? ''),
    pinCode: row?.pinCode ?? null,
    lastTxnAt: row?.lastTxnAt ?? null,
    transactionsTotal: row?.transactionsTotal ?? null,
    status: row?.status ?? null,
  }));
}

type Outlet = { id: string; name: string };

type AccessGroup = {
  id: string;
  name: string;
  scope?: string | null;
  membersCount?: number;
  isSystem?: boolean;
  isDefault?: boolean;
};

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

function isCashierGroup(group?: { id?: string; name?: string; scope?: string | null }) {
  if (!group) return false;
  const id = String(group.id ?? "").trim().toLowerCase();
  const name = String(group.name ?? "").trim().toLowerCase();
  const scope = String(group.scope ?? "").trim().toUpperCase();
  return scope === "CASHIER" || id === "cashier" || name === "кассир";
}

function getPortalGroupName(staff: Staff | null) {
  if (!staff) return "—";
  const groups = Array.isArray(staff.groups) ? staff.groups : [];
  const portalGroup =
    groups.find((group) => {
      const scope = String(group?.scope ?? "").toUpperCase();
      return !scope || scope === "PORTAL";
    }) || groups[0];
  if (portalGroup?.name) return portalGroup.name;
  if (staff.isOwner || (staff.role || "").toUpperCase() === "MERCHANT") {
    return "Владелец";
  }
  return "—";
}

function isAccessRevoked(status?: string | null) {
  return String(status || "").toUpperCase() === "REVOKED";
}

function mergeGroups(options: AccessGroup[], currentGroups?: StaffGroup[] | null) {
  const map = new Map<string, AccessGroup>();
  for (const group of options) {
    if (!group) continue;
    const id = String(group.id ?? "").trim();
    const name = String(group.name ?? "").trim();
    const scope = String(group.scope ?? "").toUpperCase();
    if (!id || !name) continue;
    const nameLower = name.toLowerCase();
    if (nameLower === "владелец" || nameLower === "owner" || nameLower === "merchant") {
      continue;
    }
    if (scope && scope !== "PORTAL") continue;
    if (isCashierGroup({ id, name, scope })) continue;
    if (!map.has(id)) {
      map.set(id, {
        id,
        name,
        scope: group.scope ?? null,
        isSystem: Boolean(group.isSystem),
        isDefault: Boolean(group.isDefault),
        membersCount: Number(group.membersCount ?? 0) || 0,
      });
    }
  }
  if (Array.isArray(currentGroups)) {
    for (const group of currentGroups) {
      if (!group) continue;
      const id = String(group.id ?? "").trim();
      if (isCashierGroup({ id, name: group.name, scope: group.scope })) continue;
      if (!id || map.has(id)) continue;
      const name = String(group.name ?? "").trim() || id;
      map.set(id, { id, name: name || id });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export default function StaffCardPage({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId: promisedStaffId } = use(params);
  const staffId = (typeof promisedStaffId === "string" ? promisedStaffId : "").toString();
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [item, setItem] = React.useState<Staff | null>(null);
  const [accesses, setAccesses] = React.useState<AccessRow[]>([]);
  const [outlets, setOutlets] = React.useState<Outlet[]>([]);
  const [groups, setGroups] = React.useState<AccessGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = React.useState(false);

  const [newOutletId, setNewOutletId] = React.useState("");
  const [isAddOutletOpen, setIsAddOutletOpen] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [editForm, setEditForm] = React.useState({ firstName: "", lastName: "", position: "", phone: "", comment: "" });
  const [saving, setSaving] = React.useState(false);

  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [passwordForm, setPasswordForm] = React.useState({ current: "", next: "", confirm: "" });
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState("");

  const [accessForm, setAccessForm] = React.useState({ email: "", groupId: "", canAccessPortal: false, password: "" });
  const [portalSectionOpen, setPortalSectionOpen] = React.useState(false);

  const groupsLoadedRef = React.useRef(false);
  const groupsLoadingRef = React.useRef(false);

  const [accessActionOutlet, setAccessActionOutlet] = React.useState<string | null>(null);
  const [addAccessLoading, setAddAccessLoading] = React.useState(false);
  const [firing, setFiring] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);

  const [banner, setBanner] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [error, setError] = React.useState("");
  const [auth, setAuth] = React.useState<{ actor: string; staffId: string | null; role: string | null } | null>(null);

  React.useEffect(() => {
    let active = true;
    const loadAuth = async () => {
      try {
        const res = await fetch("/api/portal/me");
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        const actor = String(data?.actor ?? "MERCHANT").toUpperCase();
        const staffIdValue = data?.staff?.id ? String(data.staff.id) : null;
        const staffRoleSource = data?.staff?.role ?? data?.role ?? null;
        const staffRoleValue = staffRoleSource ? String(staffRoleSource).toUpperCase() : null;
        setAuth({ actor, staffId: staffIdValue, role: staffRoleValue });
      } catch {}
    };
    loadAuth();
    return () => {
      active = false;
    };
  }, []);

  const ensureGroupsLoaded = React.useCallback(async (force = false) => {
    if (groupsLoadingRef.current) return;
    if (force) groupsLoadedRef.current = false;
    if (!force && groupsLoadedRef.current) return;
    groupsLoadingRef.current = true;
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
        }))
        .filter((item) => item.id && item.name);
      setGroups(normalized);
      groupsLoadedRef.current = true;
    } finally {
      groupsLoadingRef.current = false;
      setGroupsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    ensureGroupsLoaded();
  }, [ensureGroupsLoaded]);

  const refreshAccesses = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!staffId) return;
      try {
        const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access`);
        if (!res.ok) throw new Error(await res.text());
        const payload = await res.json();
        setAccesses(mapAccessRows(payload));
      } catch (e: any) {
        if (!options?.silent) {
          setBanner({ type: "error", text: normalizeErrorMessage(e, "Не удалось обновить список точек") });
        }
      }
    },
    [staffId],
  );

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
        const assignedGroups = Array.isArray(detail.groups) ? detail.groups : [];
        const preferredGroup = assignedGroups.find((group) => {
          const scope = String(group?.scope ?? "").toUpperCase();
          return scope === "PORTAL" || scope === "";
        }) || assignedGroups[0];
        const portalEnabled = !!(detail.isOwner || detail.portalAccessEnabled || detail.canAccessPortal);
        setPortalSectionOpen(portalEnabled);
        setAccessForm({
          email: detail.email || "",
          groupId: preferredGroup?.id ? String(preferredGroup.id) : "",
          canAccessPortal: portalEnabled,
          password: "",
        });
      }
      setAccesses(mapAccessRows(accessData));

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
      setError(normalizeErrorMessage(e, "Не удалось загрузить данные сотрудника"));
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

  const groupOptions = React.useMemo(
    () => mergeGroups(groups, item?.groups ?? null),
    [groups, item?.groups],
  );
  React.useEffect(() => {
    if (!portalSectionOpen) return;
    if (accessForm.groupId) return;
    if (!groupOptions.length) return;
    setAccessForm((prev) => ({ ...prev, groupId: groupOptions[0]?.id ?? "" }));
  }, [portalSectionOpen, accessForm.groupId, groupOptions]);
  const portalCurrentlyEnabled = !!(item?.isOwner || item?.portalAccessEnabled || item?.canAccessPortal);
  const actorType = auth?.actor ?? "MERCHANT";
  const isMerchantActor = actorType !== "STAFF";
  const isSelf = actorType === "STAFF" && auth?.staffId === staffId;
  const isMerchantStaffActor = actorType === "STAFF" && auth?.role === "MERCHANT";
  const canEditCredentials = isMerchantActor || isSelf || isMerchantStaffActor;
  const isMerchantStaff = !!(item?.isOwner || (item?.role || "").toUpperCase() === "MERCHANT");
  const canChangeGroup = !isMerchantStaff;
  const canTogglePortal = !item?.isOwner;
  const canChangePassword = canEditCredentials && portalCurrentlyEnabled;
  const hasTransactions = React.useMemo(() => {
    if (!item) return false;
    if (item.lastActivityAt) return true;
    return accesses.some((a) => (a.transactionsTotal || 0) > 0);
  }, [item, accesses]);

  const profileChanged = React.useMemo(() => {
    if (!item) return false;
    return (
      editForm.firstName.trim() !== (item.firstName || "") ||
      editForm.lastName.trim() !== (item.lastName || "") ||
      editForm.position.trim() !== (item.position || "") ||
      editForm.phone.trim() !== (item.phone || "") ||
      editForm.comment.trim() !== (item.comment || "")
    );
  }, [editForm, item]);

  const accessChanged = React.useMemo(() => {
    if (!item) return false;
    const normalizedEmail = (accessForm.email || "").trim();
    const emailChanged = canEditCredentials && normalizedEmail !== (item.email || "");
    const assignedGroups = Array.isArray(item.groups) ? item.groups : [];
    const currentPortal = !!(item.portalAccessEnabled || item.canAccessPortal || item.isOwner);
    const targetPortal = portalSectionOpen || !!item.isOwner;
    const portalChanged = canTogglePortal && currentPortal !== targetPortal;

    const nonPortalGroupIds = assignedGroups
      .filter((group) => {
        const scope = String(group?.scope ?? "").toUpperCase();
        return scope && scope !== "PORTAL";
      })
      .map((group) => String(group?.id ?? "").trim())
      .filter(Boolean);

    const currentGroupIds = new Set<string>(
      assignedGroups.map((group) => String(group?.id ?? "").trim()).filter(Boolean),
    );
    const fallbackGroupId = groupOptions[0]?.id ?? "";
    const selectedGroupId = targetPortal ? (accessForm.groupId || "").trim() || fallbackGroupId : "";
    const desiredGroupIds = new Set<string>(nonPortalGroupIds);
    if (targetPortal && selectedGroupId) desiredGroupIds.add(selectedGroupId);
    const desiredGroupIdList = Array.from(desiredGroupIds);
    const groupsChanged =
      canChangeGroup &&
      (desiredGroupIdList.length !== currentGroupIds.size ||
        desiredGroupIdList.some((id) => !currentGroupIds.has(id)));

    const passwordRequired = targetPortal && !currentPortal && !item.isOwner;
    const passwordTyped = (accessForm.password || "").trim().length > 0;
    const passwordChanged = canEditCredentials && passwordRequired && passwordTyped;

    return emailChanged || portalChanged || groupsChanged || passwordChanged;
  }, [
    accessForm.email,
    accessForm.groupId,
    accessForm.password,
    canChangeGroup,
    canEditCredentials,
    canTogglePortal,
    groupOptions,
    item,
    portalSectionOpen,
  ]);

  async function handleSaveAll() {
    if (!item || saving || (!profileChanged && !accessChanged)) return;
    setSaving(true);
    setBanner(null);
    try {
      const payload: Record<string, any> = {};
      if (profileChanged) {
        payload.firstName = editForm.firstName.trim() || null;
        payload.lastName = editForm.lastName.trim() || null;
        payload.position = editForm.position.trim() || null;
        payload.phone = editForm.phone.trim() || null;
        payload.comment = editForm.comment.trim() || null;
      }

      if (accessChanged) {
        const normalizedEmail = accessForm.email.trim().toLowerCase();
        const emailValid =
          !normalizedEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
        if (portalSectionOpen && !normalizedEmail) {
          setBanner({ type: "error", text: "Укажите email для доступа в портал" });
          return;
        }
        if (!emailValid) {
          setBanner({ type: "error", text: "Некорректный формат email" });
          return;
        }

        if (canEditCredentials) {
          if (normalizedEmail) {
            payload.email = normalizedEmail;
            payload.login = normalizedEmail;
          } else if (item.email) {
            payload.email = null;
          }
        }

        const assignedGroups = Array.isArray(item.groups) ? item.groups : [];
        const targetPortalEnabled = portalSectionOpen || !!item.isOwner;
        const currentPortalEnabled = !!(item.portalAccessEnabled || item.canAccessPortal || item.isOwner);
        const selectedGroupIdRaw = (accessForm.groupId || "").trim();
        const fallbackGroupId = groupOptions[0]?.id ?? "";
        const selectedGroupId = targetPortalEnabled ? selectedGroupIdRaw || fallbackGroupId : "";

        if (!item.isOwner && canTogglePortal) {
          payload.canAccessPortal = targetPortalEnabled;
          payload.portalAccessEnabled = targetPortalEnabled;
        }

        const nonPortalGroupIds = assignedGroups
          .filter((group) => {
            const scope = String(group?.scope ?? "").toUpperCase();
            return scope && scope !== "PORTAL";
          })
          .map((group) => String(group?.id ?? "").trim())
          .filter(Boolean);
        const desiredGroupIds = new Set<string>(nonPortalGroupIds);
        if (targetPortalEnabled && selectedGroupId) {
          desiredGroupIds.add(selectedGroupId);
        }

        const currentGroupIds = new Set<string>(
          assignedGroups.map((group) => String(group?.id ?? "").trim()).filter(Boolean),
        );
        const desiredGroupIdList = Array.from(desiredGroupIds);
        const groupsChanged =
          canChangeGroup &&
          (desiredGroupIdList.length !== currentGroupIds.size ||
            desiredGroupIdList.some((id) => !currentGroupIds.has(id)));

        if (groupsChanged) {
          payload.accessGroupIds = desiredGroupIdList;
        }

        const trimmedPassword = (accessForm.password || "").trim();
        const passwordRequired = targetPortalEnabled && !currentPortalEnabled && !item.isOwner;
        if (passwordRequired) {
          if (!canEditCredentials) {
            setBanner({ type: "error", text: ACCESS_DENIED_MESSAGE });
            return;
          }
          if (trimmedPassword.length < 6) {
            setBanner({ type: "error", text: "Пароль должен содержать минимум 6 символов" });
            return;
          }
          payload.password = trimmedPassword;
        }
      }

      if (!Object.keys(payload).length) return;

      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setItem(updated);
      setEditForm({
        firstName: updated?.firstName || "",
        lastName: updated?.lastName || "",
        position: updated?.position || "",
        phone: updated?.phone || "",
        comment: updated?.comment || "",
      });
      const updatedPortalEnabled = !!(
        updated?.isOwner || updated?.portalAccessEnabled || updated?.canAccessPortal
      );
      const updatedGroups = Array.isArray(updated?.groups) ? (updated.groups as StaffGroup[]) : [];
      const preferredGroup =
        updatedGroups.find((group) => {
          const scope = String(group?.scope ?? "").toUpperCase();
          return scope === "PORTAL" || scope === "";
        }) || updatedGroups[0];
      const nextGroupId = updatedPortalEnabled && preferredGroup?.id ? String(preferredGroup.id) : "";
      setPortalSectionOpen(updatedPortalEnabled);
      setAccessForm({
        email: updated?.email || "",
        groupId: updatedPortalEnabled ? nextGroupId : "",
        canAccessPortal: updatedPortalEnabled,
        password: "",
      });
      setBanner({ type: "success", text: "Изменения сохранены" });
    } catch (e: any) {
      setBanner({ type: "error", text: normalizeErrorMessage(e, "Не удалось сохранить изменения") });
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSave() {
    if (!item || passwordSaving) return;
    setPasswordError("");
    const next = passwordForm.next.trim();
    const confirm = passwordForm.confirm.trim();
    const current = passwordForm.current.trim();
    const requiresCurrent = isSelf && portalCurrentlyEnabled;
    if (next.length < 6) {
      setPasswordError("Пароль должен содержать минимум 6 символов");
      return;
    }
    if (next !== confirm) {
      setPasswordError("Пароли не совпадают");
      return;
    }
    if (requiresCurrent && !current) {
      setPasswordError("Введите текущий пароль");
      return;
    }
    setPasswordSaving(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: next,
          currentPassword: requiresCurrent ? current : undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await res.json();
      setPasswordForm({ current: "", next: "", confirm: "" });
      setPasswordOpen(false);
      setBanner({ type: "success", text: "Пароль обновлён" });
    } catch (e: any) {
      const msg = normalizeErrorMessage(e, "Не удалось сменить пароль");
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
      await refreshAccesses({ silent: true });
      setNewOutletId("");
      setIsAddOutletOpen(false);
      setBanner({ type: "success", text: "Точка добавлена" });
    } catch (e: any) {
      setBanner({ type: "error", text: normalizeErrorMessage(e, "Не удалось добавить точку") });
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
      await refreshAccesses({ silent: true });
      setBanner({ type: "success", text: "PIN-код обновлён" });
    } catch (e: any) {
      setBanner({ type: "error", text: normalizeErrorMessage(e, "Не удалось обновить PIN") });
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
      await refreshAccesses({ silent: true });
      setBanner({ type: "success", text: "Доступ отозван" });
    } catch (e: any) {
      setBanner({ type: "error", text: normalizeErrorMessage(e, "Не удалось отозвать доступ") });
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
        body: JSON.stringify({
          status: "FIRED",
          canAccessPortal: false,
          portalAccessEnabled: false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setItem(updated);
      setPortalSectionOpen(false);
      setAccessForm((prev) => ({
        ...prev,
        email: updated?.email || prev.email,
        groupId: "",
        canAccessPortal: false,
        password: "",
      }));
      setBanner({ type: "success", text: "Сотрудник помечен как уволенный" });
    } catch (e: any) {
      setBanner({ type: "error", text: normalizeErrorMessage(e, "Не удалось обновить статус") });
    } finally {
      setFiring(false);
    }
  }

  async function handleRestore() {
    if (!item || restoring) return;
    setRestoring(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setItem(updated);
      const portalEnabled = !!(
        updated?.isOwner || updated?.portalAccessEnabled || updated?.canAccessPortal
      );
      const assignedGroups = Array.isArray(updated?.groups)
        ? (updated.groups as StaffGroup[])
        : [];
      const preferredGroup = assignedGroups.find((group) => {
        const scope = String(group?.scope ?? "").toUpperCase();
        return scope === "PORTAL" || scope === "";
      }) || assignedGroups[0];
      const nextGroupId = portalEnabled && preferredGroup?.id ? String(preferredGroup.id) : "";
      setPortalSectionOpen(portalEnabled);
      setAccessForm({
        email: updated?.email || "",
        groupId: portalEnabled ? nextGroupId : "",
        canAccessPortal: portalEnabled,
        password: "",
      });
      setBanner({ type: "success", text: "Сотрудник восстановлен" });
    } catch (e: any) {
      setBanner({ type: "error", text: normalizeErrorMessage(e, "Не удалось восстановить сотрудника") });
    } finally {
      setRestoring(false);
    }
  }

  const displayName = getDisplayName(item);
  const groupLabel = getPortalGroupName(item);
  const statusBadge =
    item?.status === "ACTIVE" ? "Работает" : item?.status === "FIRED" ? "Уволен" : item?.status || "";
  const statusBadgeStyle =
    item?.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
  const canSave = Boolean(item) && (profileChanged || accessChanged) && !saving;
  const availableOutlets = outlets.filter(
    (outlet) => !accesses.some((row) => row.outletId === outlet.id && !isAccessRevoked(row.status)),
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 ">
      {banner && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border ${
            banner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {banner.text}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 leading-none">{displayName}</h2>
            <div className="flex items-center space-x-2 mt-1">
              {statusBadge && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadgeStyle}`}>
                  {statusBadge}
                </span>
              )}
              <span className="text-sm text-gray-500">{groupLabel}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={!canSave}
          className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-60"
        >
          <Save size={18} />
          <span>{saving ? "Сохраняем…" : "Сохранить"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex flex-col items-center">
              <div className="relative group cursor-pointer">
                <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center border-4 border-white shadow-sm overflow-hidden">
                  {item?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-bold text-gray-400">
                      {displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="text-white" size={24} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
                <input
                  type="text"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, firstName: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Фамилия</label>
                <input
                  type="text"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, lastName: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={accessForm.email}
                  onChange={(e) => setAccessForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:bg-gray-100"
                  disabled={!canEditCredentials}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
                <textarea
                  rows={3}
                  value={editForm.comment}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, comment: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                />
              </div>
            </div>

            {item?.status !== "FIRED" ? (
              <div className="pt-4 border-t border-gray-100">
                <button
                  onClick={handleFire}
                  disabled={!item || item.isOwner || firing}
                  className="w-full flex items-center justify-center space-x-2 text-red-600 bg-red-50 hover:bg-red-100 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  <Ban size={16} />
                  <span>{firing ? "Увольняем…" : "Уволить сотрудника"}</span>
                </button>
              </div>
            ) : (
              <div className="pt-4 border-t border-gray-100">
                <button
                  onClick={handleRestore}
                  disabled={!item || restoring}
                  className="w-full flex items-center justify-center space-x-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  <span>{restoring ? "Восстанавливаем…" : "Восстановить сотрудника"}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center space-x-2">
                <Shield className="text-purple-600" size={20} />
                <h3 className="font-bold text-gray-900">Доступ в панель</h3>
              </div>
              <label
                className={`relative inline-flex items-center ${
                  canTogglePortal ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={portalSectionOpen}
                  onChange={(e) => {
                    if (!canTogglePortal) return;
                    const value = e.target.checked;
                    setPortalSectionOpen(value);
                    setAccessForm((prev) => ({
                      ...prev,
                      canAccessPortal: value,
                      password: value ? prev.password : "",
                      groupId: value ? prev.groupId || groupOptions[0]?.id || "" : prev.groupId,
                    }));
                    if (value) ensureGroupsLoaded();
                  }}
                  className="sr-only peer"
                  disabled={!canTogglePortal}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {portalSectionOpen ? (
              <div className="space-y-4 ">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Группа доступа</label>
                  <select
                    value={accessForm.groupId}
                    disabled={!canChangeGroup}
                    onChange={(e) => setAccessForm((prev) => ({ ...prev, groupId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:bg-gray-100"
                  >
                    {groupOptions.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  {!canChangeGroup && (
                    <div className="mt-1 text-xs text-gray-500">Группа владельца не меняется.</div>
                  )}
                </div>

                <div className="p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Логин</label>
                    <input
                      type="email"
                      value={accessForm.email}
                      onChange={(e) => setAccessForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:bg-gray-100"
                      disabled={!canEditCredentials}
                    />
                  </div>

                  {!item?.isOwner && !portalCurrentlyEnabled && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Пароль</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={accessForm.password}
                          onChange={(e) => setAccessForm((prev) => ({ ...prev, password: e.target.value }))}
                          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm pr-10 focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:bg-gray-100"
                          disabled={!canEditCredentials}
                        />
                        <button
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          type="button"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {canChangePassword && (
                  <button
                    type="button"
                    onClick={() => setPasswordOpen(true)}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    Сменить пароль
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 text-sm">
                <Ban size={32} className="mx-auto text-gray-300 mb-2" />
                {ACCESS_DENIED_MESSAGE}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center space-x-2 mb-4">
              <History className="text-blue-500" size={20} />
              <h3 className="font-bold text-gray-900">История действий</h3>
            </div>
            <div className="text-sm text-gray-600 mb-4">
              Просмотр всех операций (начисления, списания), выполненных этим сотрудником.
            </div>
            <button
              onClick={() => {
                if (hasTransactions) window.location.href = `/operations?staffId=${encodeURIComponent(staffId)}`;
              }}
              className={`w-full flex items-center justify-center space-x-2 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasTransactions ? "hover:bg-gray-50" : "opacity-60 cursor-not-allowed"
              }`}
              disabled={!hasTransactions}
            >
              <span>Открыть журнал</span>
              <ExternalLink size={14} />
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center space-x-2">
                <Store className="text-green-600" size={20} />
                <h3 className="font-bold text-gray-900">Торговые точки</h3>
              </div>
              <button
                onClick={() => setIsAddOutletOpen(true)}
                className="p-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors"
                title="Привязать к точке"
                disabled={!availableOutlets.length}
              >
                <Plus size={18} />
              </button>
            </div>

            {isAddOutletOpen && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 ">
                <label className="block text-xs font-medium text-gray-500 mb-1">Выберите точку</label>
                <div className="flex space-x-2">
                  <select
                    value={newOutletId}
                    onChange={(e) => setNewOutletId(e.target.value)}
                    className="flex-1 text-sm border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">Выберите торговую точку…</option>
                    {availableOutlets.map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>
                        {outlet.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddOutlet}
                    disabled={!newOutletId || addAccessLoading}
                    className="px-3 py-1 bg-purple-600 text-white rounded-md text-sm disabled:opacity-60"
                  >
                    {addAccessLoading ? "..." : "OK"}
                  </button>
                  <button
                    onClick={() => setIsAddOutletOpen(false)}
                    className="px-2 py-1 text-gray-500 hover:text-gray-700"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {accesses.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Нет привязанных точек</div>
              ) : (
                accesses.map((assignment) => {
                  const revoked = isAccessRevoked(assignment.status);
                  const statusLabel = revoked ? "Доступ отозван" : "Активен";
                  const statusStyle = revoked
                    ? "bg-gray-100 text-gray-600 border-gray-200"
                    : "bg-emerald-100 text-emerald-700 border-emerald-200";
                  return (
                    <div
                      key={assignment.outletId}
                      className="bg-gray-50 rounded-lg border border-gray-200 p-4 relative group"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-gray-900 text-sm">{assignment.outletName}</h4>
                          <span
                            className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusStyle}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRevoke(assignment.outletId)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          disabled={accessActionOutlet === assignment.outletId || revoked}
                          title={revoked ? "Доступ уже отозван" : "Отозвать доступ"}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2 bg-white px-2 py-1 rounded border border-gray-200">
                          <KeyRound size={14} className="text-gray-400" />
                          <span className="font-mono font-bold text-lg tracking-widest text-gray-800">
                            {revoked ? "—" : assignment.pinCode || "—"}
                          </span>
                          <button
                            onClick={() => handleRegenerate(assignment.outletId)}
                            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-purple-600 transition-colors"
                            title="Сгенерировать новый PIN"
                            disabled={accessActionOutlet === assignment.outletId || revoked}
                          >
                            <RefreshCw size={12} />
                          </button>
                        </div>
                        <span className="text-xs text-gray-500">
                          {revoked ? "PIN скрыт для отозванного доступа" : "PIN-код для входа"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-200 pt-2">
                        <div className="flex items-center space-x-1" title="Количество транзакций">
                          <CreditCard size={12} />
                          <span>{assignment.transactionsTotal ?? 0} чек.</span>
                        </div>
                        <div className="flex items-center space-x-1" title="Последняя транзакция">
                          <History size={12} />
                          <span>{formatDateTime(assignment.lastTxnAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {passwordOpen &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[150] flex items-center justify-center p-4 ">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative z-[101]">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Сменить пароль</h3>
                  <p className="text-sm text-gray-500">
                    {isSelf ? "Введите текущий и новый пароль" : "Установите новый пароль"}
                  </p>
                </div>
                <button onClick={() => setPasswordOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {isSelf && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Текущий пароль</label>
                    <input
                      type="password"
                      value={passwordForm.current}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, current: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Новый пароль</label>
                  <input
                    type="password"
                    value={passwordForm.next}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, next: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Повторить новый пароль</label>
                  <input
                    type="password"
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                {passwordError && <div className="text-sm text-red-600">{passwordError}</div>}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
                <button
                  onClick={() => setPasswordOpen(false)}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                  disabled={passwordSaving}
                >
                  Отмена
                </button>
                <button
                  onClick={handlePasswordSave}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
                  disabled={passwordSaving}
                >
                  {passwordSaving ? "Обновляем…" : "Сменить"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
