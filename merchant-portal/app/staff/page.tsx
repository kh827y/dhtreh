"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { 
  Plus,
  Search,
  MapPin,
  UserCog,
  Shield,
  Clock,
  ChevronRight,
  Info,
  X
} from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";

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
  portalLoginEnabled?: boolean;
  isOwner: boolean;
  avatarUrl?: string | null;
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

const STAFF_PAGE_SIZE = 200;

function isCashierGroup(group?: { id?: string; name?: string; scope?: string | null }) {
  if (!group) return false;
  const id = String(group.id ?? "").trim().toLowerCase();
  const name = String(group.name ?? "").trim().toLowerCase();
  const scope = String(group.scope ?? "").trim().toUpperCase();
  return scope === "CASHIER" || id === "cashier" || name === "кассир";
}

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

function getPortalGroupLabel(staff: Staff): string | null {
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
  return null;
}

function hasPortalAccess(staff: Staff): boolean {
  if (staff.isOwner) return true;
  if (typeof staff.portalLoginEnabled === "boolean") {
    return staff.portalLoginEnabled;
  }
  return Boolean(staff.portalAccessEnabled && staff.canAccessPortal);
}

function getGroupBadgeStyle(groupName: string) {
  const upper = groupName.toUpperCase();
  if (upper === "ВЛАДЕЛЕЦ" || upper === "АДМИНИСТРАТОР") {
    return "bg-green-50 text-green-700 border-green-200";
  }
  return "bg-blue-50 text-blue-700 border-blue-200";
}

export default function StaffPage() {
  const router = useRouter();
  const [items, setItems] = React.useState<Staff[]>([]);
  const [outlets, setOutlets] = React.useState<Outlet[]>([]);
  const [groups, setGroups] = React.useState<AccessGroup[]>([]);
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
  const groupsLoadedRef = React.useRef(false);
  const groupsLoadingRef = React.useRef(false);

  const [tab, setTab] = React.useState<"ACTIVE" | "FIRED">("ACTIVE");
  const [groupFilter, setGroupFilter] = React.useState<string>("ALL");
  const [outletFilter, setOutletFilter] = React.useState<string>("ALL");
  const [onlyPortal, setOnlyPortal] = React.useState<boolean>(false);
  const [search, setSearch] = React.useState<string>("");
  const [tooltip, setTooltip] = React.useState<{ x: number; y: number; text: string } | null>(null);

  const [cFirstName, setCFirstName] = React.useState("");
  const [cLastName, setCLastName] = React.useState("");
  const [cPosition, setCPosition] = React.useState("");
  const [cPhone, setCPhone] = React.useState("");
  const [cComment, setCComment] = React.useState("");
  const [cPortal, setCPortal] = React.useState(false);
  const [cGroup, setCGroup] = React.useState<string>("");
  const [cEmail, setCEmail] = React.useState("");
  const [cPassword, setCPassword] = React.useState("");

  const uniqueGroups = React.useMemo(() => {
    const map = new Map<string, AccessGroup>();
    for (const g of groups) {
      if (!g) continue;
      const id = String((g as any).id ?? "").trim();
      const name = String((g as any).name ?? "").trim();
      const scope = String((g as any).scope ?? "").toUpperCase();
      if (!id || !name) continue;
      const nameLower = name.toLowerCase();
      if (nameLower === "владелец" || nameLower === "owner" || nameLower === "merchant") {
        continue;
      }
      if (scope && scope !== "PORTAL") continue;
      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          scope: (g as any).scope ?? null,
          isSystem: Boolean((g as any).isSystem),
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
      if (groupFilter !== "ALL") {
        const staffGroupIds = Array.isArray(staff.groups)
          ? staff.groups.map((group) => String(group?.id ?? "").trim()).filter(Boolean)
          : [];
        if (!staffGroupIds.includes(groupFilter)) return false;
      }
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
          staff.email,
          staff.phone,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase())
          .join(" ");
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, tab, groupFilter, outletFilter, onlyPortal, search]);

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

  const ensureGroupsLoaded = React.useCallback(async () => {
    if (groupsLoadedRef.current || groupsLoadingRef.current) return;
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
          memberCount: Number(g?.memberCount ?? g?.membersCount ?? 0) || 0,
        }))
        .filter((item) => item.id && item.name && !isCashierGroup(item));
      setGroups(normalized);
      groupsLoadedRef.current = true;
    } finally {
      groupsLoadingRef.current = false;
      setGroupsLoading(false);
    }
  }, []);

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

  const fetchAllOutlets = React.useCallback(async () => {
    const pageSize = 200;
    let page = 1;
    let total = 0;
    const items: Outlet[] = [];
    while (true) {
      const res = await fetch(`/api/portal/outlets?page=${page}&pageSize=${pageSize}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const payload = await res.json();
      const chunk: Outlet[] = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload)
          ? payload
          : [];
      items.push(
        ...chunk.map((outlet: any) => ({
          id: String(outlet?.id ?? ''),
          name: String(outlet?.name ?? outlet?.id ?? ''),
        })),
      );
      total = typeof payload?.total === "number" ? payload.total : items.length;
      if (chunk.length < pageSize || items.length >= total) break;
      page += 1;
    }
    return items;
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (outletFilter !== "ALL") qs.set("outletId", outletFilter);
      if (groupFilter !== "ALL") qs.set("groupId", groupFilter);
      if (onlyPortal) qs.set("portalOnly", "true");
      const trimmedSearch = search.trim();
      if (trimmedSearch) qs.set("search", trimmedSearch);
      const buildStaffUrl = (page: number) => {
        const params = new URLSearchParams(qs);
        params.set("page", String(page));
        params.set("pageSize", String(STAFF_PAGE_SIZE));
        return `/api/portal/staff?${params.toString()}`;
      };

      const staffRes = await fetch(buildStaffUrl(1));
      if (staffRes.status === 401 || staffRes.status === 403) {
        router.push('/login');
        return;
      }
      if (!staffRes.ok) throw new Error(await staffRes.text());
      const staffPayload = await staffRes.json();
      const outletsPayload = await fetchAllOutlets();

      const staffItemsRaw: Staff[] = Array.isArray(staffPayload?.items)
        ? staffPayload.items
        : Array.isArray(staffPayload)
          ? staffPayload
          : [];
      const totalPages = Number(staffPayload?.meta?.totalPages ?? 1) || 1;
      if (totalPages > 1) {
        for (let page = 2; page <= totalPages; page += 1) {
          const pageRes = await fetch(buildStaffUrl(page));
          if (pageRes.status === 401 || pageRes.status === 403) {
            router.push('/login');
            return;
          }
          if (!pageRes.ok) throw new Error(await pageRes.text());
          const pagePayload = await pageRes.json();
          const pageItems: Staff[] = Array.isArray(pagePayload?.items)
            ? pagePayload.items
            : Array.isArray(pagePayload)
              ? pagePayload
              : [];
          staffItemsRaw.push(...pageItems);
        }
      }
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
      setOutlets(outletsPayload);
    } catch (e: any) {
      setError(normalizeErrorMessage(e, "Не удалось загрузить данных"));
    } finally {
      setLoading(false);
    }
  }, [fetchAllOutlets, groupFilter, onlyPortal, outletFilter, router, search, tab]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    ensureGroupsLoaded();
  }, [ensureGroupsLoaded]);

  React.useEffect(() => {
    if (showCreate) {
      setCreateError("");
    }
  }, [showCreate]);

  const canSubmitCreate = React.useMemo(() => {
    const emailValue = cEmail.trim();
    const emailValid = emailValue.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
    if (!cFirstName.trim()) return false;
    if (cPortal) {
      return Boolean(cGroup && emailValid && cPassword.trim().length >= 6);
    }
    return Boolean(!cEmail.trim() || emailValid);
  }, [cFirstName, cPortal, cGroup, cEmail, cPassword]);

  async function handleCreate() {
    if (!canSubmitCreate) return;
    setSubmitting(true);
    setCreateError("");
    try {
      const normalizedGroup = cGroup.trim();
      const emailValue = cEmail.trim().toLowerCase();
      const hasEmail = Boolean(emailValue);
      const payload: Record<string, any> = {
        firstName: cFirstName.trim(),
        lastName: cLastName.trim() || undefined,
        position: cPosition.trim() || undefined,
        phone: cPhone.trim() || undefined,
        comment: cComment.trim() || undefined,
        canAccessPortal: cPortal,
        portalAccessEnabled: cPortal,
        email: hasEmail ? emailValue : undefined,
        status: 'ACTIVE',
      };
      if (hasEmail) {
        payload.login = emailValue;
      }
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
      setCreateError(normalizeErrorMessage(e, "Не удалось создать сотрудника"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      {error && !loading ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Сотрудники</h2>
          <p className="text-gray-500 mt-1">Управление персоналом и правами доступа.</p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span>Добавить сотрудника</span>
        </button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setTab("ACTIVE")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              tab === "ACTIVE"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Работают
            <span
              className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                tab === "ACTIVE" ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500"
              }`}
            >
              {counters.active}
            </span>
          </button>
          <button
            onClick={() => setTab("FIRED")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              tab === "FIRED"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Уволены
            <span
              className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                tab === "FIRED" ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500"
              }`}
            >
              {counters.fired}
            </span>
          </button>
        </nav>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
          <div className="relative flex-1 w-full xl:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Поиск по имени, телефону или email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <Shield size={16} className="text-gray-400" />
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-4"
              >
                <option value="ALL">Все группы</option>
                {uniqueGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <MapPin size={16} className="text-gray-400" />
              <select
                value={outletFilter}
                onChange={(e) => setOutletFilter(e.target.value)}
                className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-4"
              >
                <option value="ALL">Все точки</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={onlyPortal}
                onChange={(e) => setOnlyPortal(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700 whitespace-nowrap">С доступом в панель</span>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Имя</th>
                <th className="px-6 py-4 font-semibold">Торговые точки</th>
                <th className="px-6 py-4 font-semibold">
                  <div className="flex items-center gap-1 w-fit">
                    <span>Активность</span>
                    <div
                      className="cursor-help text-gray-400 hover:text-gray-600 transition-colors"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                          text: "Время последней операции с баллами или входа в панель управления",
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <Info size={14} />
                    </div>
                  </div>
                </th>
                <th className="px-6 py-4 font-semibold">Доступ в панель</th>
                <th className="px-6 py-4 font-semibold text-right w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Загрузка…
                  </td>
                </tr>
              ) : uniqueItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <UserCog size={48} className="mx-auto text-gray-300 mb-4" />
                    <p>Сотрудники не найдены.</p>
                  </td>
                </tr>
              ) : (
                uniqueItems.map((staff) => {
                  const displayName = getDisplayName(staff);
                  const portalsAccess = hasPortalAccess(staff);
                  const groupLabel = getPortalGroupLabel(staff);
                  const accesses = Array.isArray(staff.accesses) ? staff.accesses : [];
                  const activeAccesses = accesses.filter((access) => access.status === "ACTIVE");
                  const outletNames = activeAccesses
                    .map((access) => access.outletName)
                    .filter(Boolean) as string[];
                  const avatarUrl =
                    typeof staff.avatarUrl === "string" ? staff.avatarUrl.trim() : "";
                  const outletFallback =
                    outletNames.length === 0 && activeAccesses.length
                      ? `${activeAccesses.length} точек`
                      : null;

                  return (
                    <tr
                      key={staff.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer group"
                      onClick={() => router.push(`/staff/${encodeURIComponent(staff.id)}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-sm overflow-hidden">
                            {avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (displayName || "?").slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{displayName}</div>
                            <div className="text-xs text-gray-500">
                              {staff.phone || staff.email || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {outletNames.length > 0 ? (
                            outletNames.map((name, idx) => (
                              <span
                                key={`${staff.id}-outlet-${idx}`}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                              >
                                {name}
                              </span>
                            ))
                          ) : outletFallback ? (
                            <span className="text-gray-500 text-xs">{outletFallback}</span>
                          ) : (
                            <span className="text-gray-400 text-xs italic">Не назначено</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center text-gray-900">
                            <Clock size={14} className="mr-1.5 text-gray-400" />
                            <span>{formatActivityDate(staff.lastActivityAt)}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 mt-0.5">Последняя активность</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {portalsAccess ? (
                          groupLabel ? (
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getGroupBadgeStyle(
                                groupLabel,
                              )}`}
                            >
                              {groupLabel}
                            </span>
                          ) : (
                            <span className="text-gray-500 text-xs">Доступ</span>
                          )
                        ) : (
                          <span className="text-gray-400 text-xs">Нет доступа</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight className="text-gray-300 group-hover:text-gray-500 transition-colors" size={20} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[150] flex items-center justify-center p-4 ">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-[101]">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                <h3 className="text-xl font-bold text-gray-900">Новый сотрудник</h3>
                <button
                  onClick={() => {
                    setShowCreate(false);
                    resetCreateForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Имя <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={cFirstName}
                      onChange={(e) => setCFirstName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Фамилия</label>
                    <input
                      type="text"
                      value={cLastName}
                      onChange={(e) => setCLastName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                  <input
                    type="text"
                    placeholder="+7"
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="example@mail.com"
                    value={cEmail}
                    onChange={(e) => setCEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
                  <textarea
                    rows={2}
                    value={cComment}
                    onChange={(e) => setCComment(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <label className="flex items-center space-x-3 cursor-pointer mb-4">
                    <div
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        cPortal ? "bg-purple-600" : "bg-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={cPortal}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setCPortal(next);
                          if (next && groups.length === 0 && !groupsLoading) ensureGroupsLoaded();
                        }}
                        className="sr-only"
                      />
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          cPortal ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </div>
                    <span className="font-medium text-gray-900">Доступ в панель управления</span>
                  </label>

                  {cPortal && (
                    <div className="space-y-4  pl-1">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">
                          Группа доступа
                        </label>
                        <select
                          value={cGroup}
                          onChange={(e) => setCGroup(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Выберите роль</option>
                          {uniqueGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">
                            Логин (email)
                          </label>
                          <input
                            type="email"
                            value={cEmail}
                            onChange={(e) => setCEmail(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Пароль</label>
                          <input
                            type="password"
                            value={cPassword}
                            onChange={(e) => setCPassword(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {createError && <div className="text-sm text-red-600">{createError}</div>}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowCreate(false);
                    resetCreateForm();
                  }}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!canSubmitCreate || submitting}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
                >
                  {submitting ? "Создание..." : "Создать"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {tooltip &&
        createPortal(
          <div
            className="fixed z-[9999] px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl pointer-events-none max-w-xs text-center"
            style={{
              top: tooltip.y - 8,
              left: tooltip.x,
              transform: "translate(-50%, -100%)",
            }}
          >
            {tooltip.text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-gray-900"></div>
          </div>,
          document.body,
        )}
    </div>
  );
}
