"use client";
import React from "react";
import {
  Shield,
  Plus,
  Users,
  Edit,
  Trash2,
  CheckCircle2,
  X,
  Save,
  Lock,
  ArrowLeft,
} from "lucide-react";
import { createPortal } from "react-dom";
import { normalizeErrorMessage } from "lib/portal-errors";

type PermissionEntry = {
  resource: string;
  action: string;
  conditions?: string | null;
};

type SectionPermission = {
  view: boolean;
  edit: boolean;
};

type SectionPermissions = Record<string, SectionPermission>;

type PermissionSection = {
  id: string;
  label: string;
  allowEdit?: boolean;
};

type AccessGroupRow = {
  id: string;
  name: string;
  description?: string | null;
  membersCount: number;
  staffIds: string[];
  permissions: SectionPermissions;
  fullAccess: boolean;
  isSystem?: boolean;
  isDefault?: boolean;
};

type StaffOption = { id: string; name: string; email?: string | null };

type MemberPreview = { id: string; name: string; avatar: string };

type ModalState = {
  name: string;
  members: MemberPreview[];
};

const ACCESS_GROUPS_CACHE_TTL_MS = 2000;
const STAFF_PAGE_SIZE = 200;
let accessGroupsCache: { ts: number; groupsPayload: any; staffPayload: any } | null =
  null;
let accessGroupsLoadPromise:
  | Promise<{ groupsPayload: any; staffPayload: any }>
  | null = null;

const SECTIONS: PermissionSection[] = [
  { id: "products", label: "Товары" },
  { id: "categories", label: "Категории" },
  { id: "audiences", label: "Аудитории" },
  { id: "customers", label: "Клиенты" },
  { id: "points_promotions", label: "Акции с баллами" },
  { id: "product_promotions", label: "Акции с товарами" },
  { id: "promocodes", label: "Промокоды" },
  { id: "staff", label: "Сотрудники" },
  { id: "telegram_notifications", label: "Уведомления в Telegram" },
  { id: "outlets", label: "Торговые точки" },
  { id: "broadcasts", label: "Рассылки (push и Telegram)" },
  { id: "access_groups", label: "Группы доступа" },
  { id: "system_settings", label: "Системные настройки" },
  { id: "feedback", label: "Обратная связь" },
  { id: "staff_motivation", label: "Мотивация персонала" },
  { id: "mechanic_birthday", label: "Механика: День рождения" },
  { id: "mechanic_auto_return", label: "Механика: Автовозврат" },
  { id: "mechanic_levels", label: "Механика: Уровни" },
  { id: "mechanic_redeem_limits", label: "Механика: Настройки бонусов за покупки" },
  { id: "mechanic_registration_bonus", label: "Механика: Бонус за регистрацию" },
  { id: "mechanic_ttl", label: "Механика: Срок действия" },
  { id: "mechanic_referral", label: "Механика: Реферальная программа" },
  { id: "cashier_panel", label: "Панель кассира" },
  { id: "import", label: "Импорт" },
  { id: "antifraud", label: "Защита от мошенничества" },
  { id: "integrations", label: "Интеграции" },
  { id: "rfm_analysis", label: "RFM анализ" },
  { id: "analytics", label: "Аналитика", allowEdit: false },
];

function isOwnerGroupName(name?: string | null) {
  if (!name) return false;
  const nameLower = name.trim().toLowerCase();
  return (
    nameLower === "владелец" || nameLower === "owner" || nameLower === "merchant"
  );
}

async function fetchAccessGroupsAndStaff(force = false) {
  if (force) {
    accessGroupsCache = null;
  }
  const now = Date.now();
  if (!force && accessGroupsCache && now - accessGroupsCache.ts < ACCESS_GROUPS_CACHE_TTL_MS) {
    return accessGroupsCache;
  }
  if (accessGroupsLoadPromise) {
    return accessGroupsLoadPromise;
  }
  const task = (async () => {
    const groupsRes = await fetch("/api/portal/access-groups");
    if (!groupsRes.ok) {
      const errText = await groupsRes.text().catch(() => "");
      const error = new Error(errText || "Группы доступа недоступны");
      (error as any).groupsUnavailable = true;
      throw error;
    }
    const groupsPayload = await groupsRes.json().catch(() => ({}));
    let staffRows: any[] = [];
    try {
      const staffRes = await fetch(
        `/api/portal/staff?page=1&pageSize=${STAFF_PAGE_SIZE}`,
      );
      if (staffRes.ok) {
        const staffPayload = await staffRes.json().catch(() => ({}));
        staffRows = Array.isArray(staffPayload?.items)
          ? staffPayload.items
          : Array.isArray(staffPayload)
            ? staffPayload
            : [];
        const totalPages = Number(staffPayload?.meta?.totalPages ?? 1) || 1;
        if (totalPages > 1) {
          for (let page = 2; page <= totalPages; page += 1) {
            const pageRes = await fetch(
              `/api/portal/staff?page=${page}&pageSize=${STAFF_PAGE_SIZE}`,
            );
            if (!pageRes.ok) break;
            const pagePayload = await pageRes.json().catch(() => ({}));
            const pageRows: any[] = Array.isArray(pagePayload?.items)
              ? pagePayload.items
              : Array.isArray(pagePayload)
                ? pagePayload
                : [];
            staffRows.push(...pageRows);
          }
        }
      }
    } catch {}
    return { groupsPayload, staffPayload: { items: staffRows } };
  })();
  accessGroupsLoadPromise = task;
  try {
    const data = await task;
    accessGroupsCache = { ts: Date.now(), ...data };
    return accessGroupsCache;
  } finally {
    if (accessGroupsLoadPromise === task) {
      accessGroupsLoadPromise = null;
    }
  }
}

const EDIT_ACTIONS = new Set(["create", "update", "delete", "manage", "*"]);

function blankPermissions(): SectionPermissions {
  return SECTIONS.reduce((acc, section) => {
    acc[section.id] = { view: false, edit: false };
    return acc;
  }, {} as SectionPermissions);
}

function normalizePermissionMap(list: PermissionEntry[]) {
  const map = new Map<string, Set<string>>();
  (list || []).forEach((entry) => {
    const resource = String(entry?.resource || "").toLowerCase().trim();
    const action = String(entry?.action || "").toLowerCase().trim();
    if (!resource || !action) return;
    if (!map.has(resource)) map.set(resource, new Set());
    map.get(resource)!.add(action);
  });
  return map;
}

function flagsFromActions(actions?: Set<string>): SectionPermission {
  if (!actions || actions.size === 0) return { view: false, edit: false };
  const actionList = Array.from(actions);
  const canEdit = actionList.some((action) => EDIT_ACTIONS.has(action));
  const canView = actionList.includes("read") || canEdit;
  return { view: canView, edit: canEdit };
}

function resolveSectionPermissions(
  map: Map<string, Set<string>>,
  section: PermissionSection,
): SectionPermission {
  const direct = flagsFromActions(map.get(section.id));
  let view = direct.view;
  let edit = direct.edit;
  if (section.allowEdit === false) {
    return { view: view || edit, edit: false };
  }
  return { view, edit };
}

function listToPermissions(list: PermissionEntry[]): {
  permissions: SectionPermissions;
  fullAccess: boolean;
} {
  const map = normalizePermissionMap(list || []);
  const fullAccessActions = map.get("__all__");
  const fullAccess =
    !!fullAccessActions &&
    Array.from(fullAccessActions).some((action) =>
      ["manage", "*"].includes(action),
    );
  const permissions = blankPermissions();
  SECTIONS.forEach((section) => {
    permissions[section.id] = resolveSectionPermissions(map, section);
  });
  return { permissions, fullAccess };
}

function permissionsToList(
  permissions: SectionPermissions,
  fullAccess: boolean,
): PermissionEntry[] {
  if (fullAccess) {
    return [{ resource: "__all__", action: "manage" }];
  }
  const list: PermissionEntry[] = [];
  SECTIONS.forEach((section) => {
    const perm = permissions[section.id] || { view: false, edit: false };
    const allowEdit = section.allowEdit !== false;
    if (allowEdit && perm.edit) {
      list.push({ resource: section.id, action: "manage" });
      return;
    }
    if (perm.view) {
      list.push({ resource: section.id, action: "read" });
    }
  });
  return list;
}

function mergeGroups(remote: any[], staffRows: any[]): AccessGroupRow[] {
  const normalized = (remote || [])
    .map((group: any, idx: number) => {
      const scope = String(group?.scope ?? "").toUpperCase();
      if (scope && scope !== "PORTAL") return null;
      const rawId = group?.id ?? group?.code ?? group?.role ?? "";
      const id = String(rawId).trim();
      const rawName =
        (group?.name ?? group?.label ?? group?.role ?? id) || `Группа ${idx + 1}`;
      const name = String(rawName).trim();
      if (isOwnerGroupName(name)) return null;
      if (!id || !name) return null;
      const mapped = listToPermissions(group?.permissions || []);
      const staffIds = staffRows
        .filter(
          (member: any) =>
            Array.isArray(member?.groups) &&
            member.groups.some((gr: any) => String(gr?.id) === id),
        )
        .map((member: any) => String(member?.id ?? ""))
        .filter((value: string) => Boolean(value));
      return {
        id,
        name,
        description:
          typeof group?.description === "string" ? group.description : null,
        membersCount: Number(group?.memberCount ?? group?.membersCount ?? 0) || 0,
        staffIds,
        permissions: mapped.permissions,
        fullAccess: mapped.fullAccess,
        isSystem: Boolean(group?.isSystem),
        isDefault: Boolean(group?.isDefault),
      } as AccessGroupRow;
    })
    .filter(Boolean) as AccessGroupRow[];
  const map = new Map<string, AccessGroupRow>();
  normalized.forEach((group) => {
    if (!map.has(group.id)) map.set(group.id, group);
  });
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ru"),
  );
}

export default function AccessSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [groups, setGroups] = React.useState<AccessGroupRow[]>([]);
  const [staff, setStaff] = React.useState<StaffOption[]>([]);
  const [groupsAvailable, setGroupsAvailable] = React.useState(true);
  const [banner, setBanner] = React.useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  const [view, setView] = React.useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<AccessGroupRow | null>(null);
  const [staffToAdd, setStaffToAdd] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  const [membersModal, setMembersModal] = React.useState<ModalState | null>(null);

  const load = React.useCallback(async (force = false) => {
    setLoading(true);
    try {
      const { groupsPayload, staffPayload } = await fetchAccessGroupsAndStaff(force);

      const remoteGroups: any[] = Array.isArray(groupsPayload?.items)
        ? groupsPayload.items
        : Array.isArray(groupsPayload)
          ? groupsPayload
          : [];
      const staffRows: any[] = Array.isArray(staffPayload?.items)
        ? staffPayload.items
        : Array.isArray(staffPayload)
          ? staffPayload
          : [];

      const staffList: StaffOption[] = staffRows.map((row: any) => ({
        id: String(row?.id ?? ""),
        name:
          [row?.firstName, row?.lastName].filter(Boolean).join(" ") ||
          row?.login ||
          row?.email ||
          String(row?.id ?? ""),
        email: row?.email || null,
      }));

      const mergedGroups = mergeGroups(remoteGroups, staffRows);
      setGroups(mergedGroups);
      setStaff(staffList);
      setGroupsAvailable(true);
      setBanner((prev) => (prev?.type === "error" ? null : prev));
    } catch (err: unknown) {
      const isUnavailable = Boolean((err as any)?.groupsUnavailable);
      const message = isUnavailable
        ? "Группы доступа недоступны. Проверьте поддержку на сервере."
        : normalizeErrorMessage(err, "Неизвестная ошибка загрузки");
      setGroups([]);
      setStaff([]);
      setGroupsAvailable(false);
      setBanner({ type: "error", text: message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    if (!groupsAvailable) return;
    setDraft({
      id: "",
      name: "",
      description: "",
      membersCount: 0,
      staffIds: [],
      permissions: blankPermissions(),
      fullAccess: false,
    });
    setStaffToAdd("");
    setEditingId(null);
    setView("create");
  };

  const openEdit = (group: AccessGroupRow) => {
    if (!groupsAvailable) return;
    setDraft({
      ...group,
      membersCount: group.staffIds.length || group.membersCount,
      permissions: { ...group.permissions },
      fullAccess: group.fullAccess,
    });
    setStaffToAdd("");
    setEditingId(group.id);
    setView("edit");
  };

  const closeEditor = () => {
    setView("list");
    setEditingId(null);
    setDraft(null);
    setStaffToAdd("");
  };

  function updateDraftPermissions(sectionId: string, key: "view" | "edit", value: boolean) {
    if (!draft) return;
    const nextPermissions = { ...draft.permissions };
    const current = nextPermissions[sectionId] || { view: false, edit: false };
    let nextView = key === "view" ? value : current.view;
    let nextEdit = key === "edit" ? value : current.edit;
    if (key === "edit" && value) nextView = true;
    if (key === "view" && !value) nextEdit = false;
    nextPermissions[sectionId] = { view: nextView, edit: nextEdit };
    setDraft({ ...draft, permissions: nextPermissions });
  }

  function addStaffToDraft() {
    if (!draft || !staffToAdd) return;
    if (draft.staffIds.includes(staffToAdd)) return;
    setDraft({
      ...draft,
      staffIds: [...draft.staffIds, staffToAdd],
      membersCount: draft.staffIds.length + 1,
    });
    setStaffToAdd("");
  }

  function removeStaffFromDraft(id: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      staffIds: draft.staffIds.filter((value) => value !== id),
      membersCount: Math.max(0, draft.staffIds.length - 1),
    });
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Удалить группу доступа?")) return;
    try {
      const res = await fetch(`/api/portal/access-groups/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || "Не удалось удалить группу");
      }
      setBanner({ type: "success", text: "Группа удалена" });
      await load(true);
    } catch (err: unknown) {
      setBanner({ type: "error", text: normalizeErrorMessage(err, "Ошибка удаления группы") });
    }
  }

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setBanner({ type: "error", text: "Укажите название группы" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        permissions: permissionsToList(draft.permissions, draft.fullAccess),
      };
      if (view === "create") {
        const r = await fetch(`/api/portal/access-groups`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(await r.text());
        const created = await r.json();
        const gid = created?.id || draft.id;
        const membersRes = await fetch(
          `/api/portal/access-groups/${encodeURIComponent(gid)}/members`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ staffIds: draft.staffIds }),
          },
        );
        if (!membersRes.ok) throw new Error(await membersRes.text());
        setBanner({ type: "success", text: "Группа создана" });
      } else if (view === "edit" && editingId) {
        const r = await fetch(`/api/portal/access-groups/${encodeURIComponent(editingId)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(await r.text());
        const membersRes = await fetch(
          `/api/portal/access-groups/${encodeURIComponent(editingId)}/members`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ staffIds: draft.staffIds }),
          },
        );
        if (!membersRes.ok) throw new Error(await membersRes.text());
        setBanner({ type: "success", text: "Группа обновлена" });
      }
      closeEditor();
      await load(true);
    } catch (err: unknown) {
      setBanner({ type: "error", text: normalizeErrorMessage(err, "Ошибка сохранения") });
    } finally {
      setBusy(false);
    }
  };

  const staffLabel = (id: string) => {
    const row = staff.find((member) => member.id === id);
    return row ? `${row.name}${row.email ? ` (${row.email})` : ""}` : id;
  };

  const openMembersModal = (group: AccessGroupRow) => {
    const members = staff
      .filter((member) => group.staffIds.includes(member.id))
      .map((member) => ({
        id: member.id,
        name: member.name,
        avatar: member.name.slice(0, 1).toUpperCase(),
      }));
    setMembersModal({ name: group.name, members });
  };

  if (view === "create" || view === "edit") {
    const locked = Boolean(draft && isOwnerGroupName(draft.name));
    return (
      <div className="p-8 max-w-[1200px] mx-auto ">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={closeEditor}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {view === "edit" ? "Редактирование группы" : "Новая группа"}
              </h2>
              <p className="text-sm text-gray-500">Настройка названия и прав доступа.</p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={busy}
            className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-60"
          >
            <Save size={18} />
            <span>{busy ? "Сохраняем…" : "Сохранить"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-bold text-gray-900 text-lg">Общая информация</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название группы <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={draft?.name || ""}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, name: e.target.value } : prev,
                    )
                  }
                  placeholder="Например: Маркетолог"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={locked}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  rows={4}
                  value={draft?.description || ""}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, description: e.target.value } : prev,
                    )
                  }
                  placeholder="Краткое описание обязанностей и прав..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  disabled={locked}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <h3 className="font-bold text-gray-900 text-lg">Права доступа</h3>
                <div className="flex items-center space-x-2">
                  <Shield size={18} className="text-purple-600" />
                  <span className="text-sm text-gray-500">Настройка ролей</span>
                </div>
              </div>

              <div className="bg-purple-50 p-5 rounded-lg border border-purple-100">
                <div className="flex items-start justify-between">
                  <div className="mr-4">
                    <label className="text-base font-bold text-purple-900 block mb-1">
                      Полный доступ (суперпользователь)
                    </label>
                    <p className="text-sm text-purple-700">
                      Группа получит права администратора. Все ограничения ниже будут игнорироваться.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(draft?.fullAccess)}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev ? { ...prev, fullAccess: e.target.checked } : prev,
                        )
                      }
                      className="sr-only peer"
                      disabled={locked}
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
                  </label>
                </div>
              </div>

              <div
                className={`space-y-3 transition-opacity duration-300 ${
                  draft?.fullAccess ? "opacity-50 pointer-events-none grayscale" : "opacity-100"
                }`}
              >
                {SECTIONS.map((section) => {
                  const perm = draft?.permissions?.[section.id] || {
                    view: false,
                    edit: false,
                  };
                  const allowEdit = section.allowEdit !== false;
                  return (
                    <div
                      key={section.id}
                      className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-lg border border-gray-100 bg-gray-50"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {section.label}
                      </div>
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-xs text-gray-500">
                          <input
                            type="checkbox"
                            checked={perm.view}
                            onChange={(e) =>
                              updateDraftPermissions(section.id, "view", e.target.checked)
                            }
                            className="rounded text-purple-600 focus:ring-purple-500"
                            disabled={locked}
                          />
                          Просмотр
                        </label>
                        {allowEdit ? (
                          <label className="flex items-center gap-2 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={perm.edit}
                              onChange={(e) =>
                                updateDraftPermissions(section.id, "edit", e.target.checked)
                              }
                              className="rounded text-purple-600 focus:ring-purple-500"
                              disabled={locked}
                            />
                            Изменение
                          </label>
                        ) : (
                          <span className="text-xs text-gray-400">Только просмотр</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 text-lg">Участники группы</h3>
                {!locked && (
                  <div className="flex items-center gap-2">
                    <select
                      value={staffToAdd}
                      onChange={(e) => setStaffToAdd(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Выберите сотрудника…</option>
                      {staff
                        .filter((member) => !draft?.staffIds.includes(member.id))
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={addStaffToDraft}
                      disabled={!staffToAdd}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
                    >
                      Добавить
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {draft?.staffIds.length ? (
                  draft.staffIds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100"
                    >
                      <span className="text-sm text-gray-700">{staffLabel(id)}</span>
                      {!locked && (
                        <button
                          onClick={() => removeStaffFromDraft(id)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">Пока никто не добавлен</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 ">
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

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Группы доступа</h2>
          <p className="text-gray-500 mt-1">
            Управление ролями сотрудников и ограничение прав доступа.
          </p>
        </div>

        <button
          onClick={openCreate}
          disabled={!groupsAvailable}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={18} />
          <span>Создать группу</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-gray-500">
          Загрузка…
        </div>
      ) : groups.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <div
              key={group.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full"
            >
              <div className="p-6 pb-4 flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-2.5 rounded-lg ${
                      group.fullAccess ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {group.fullAccess ? <Shield size={24} /> : <Lock size={24} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg leading-tight">
                      {group.name}
                    </h3>
                    {group.isSystem && (
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
                        Системная
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex space-x-1">
                  <button
                    onClick={() => openEdit(group)}
                    disabled={!groupsAvailable}
                    className={`p-1.5 text-gray-400 rounded-lg transition-colors ${
                      groupsAvailable
                        ? "hover:text-purple-600 hover:bg-purple-50"
                        : "opacity-40 cursor-not-allowed"
                    }`}
                    title="Редактировать"
                  >
                    <Edit size={18} />
                  </button>
                  {!group.isSystem && (
                    <button
                      onClick={() => handleDelete(group.id)}
                      disabled={!groupsAvailable}
                      className={`p-1.5 text-gray-400 rounded-lg transition-colors ${
                        groupsAvailable
                          ? "hover:text-red-600 hover:bg-red-50"
                          : "opacity-40 cursor-not-allowed"
                      }`}
                      title="Удалить"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div className="px-6 flex-1">
                <p className="text-sm text-gray-600 line-clamp-3">
                  {group.description || "Нет описания"}
                </p>
              </div>

              <div className="p-6 pt-4 mt-2">
                <div className="flex items-center space-x-2 mb-4">
                  {group.fullAccess ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle2 size={12} className="mr-1" />
                      Полный доступ
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      <Lock size={12} className="mr-1" />
                      Ограниченный доступ
                    </span>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center space-x-2">
                    <Users size={16} />
                    <span>{group.staffIds.length || group.membersCount} сотр.</span>
                  </div>
                  <button
                    onClick={() => openMembersModal(group)}
                    disabled={!groupsAvailable}
                    className={`font-medium text-xs ${
                      groupsAvailable
                        ? "text-purple-600 hover:text-purple-700"
                        : "text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Посмотреть состав
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-gray-500">
          {groupsAvailable
            ? "Группы доступа не найдены."
            : "Группы доступа недоступны."}
        </div>
      )}

      {membersModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[150] flex items-center justify-center p-4 ">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative z-[101]">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Состав группы</h3>
                  <p className="text-sm text-gray-500">{membersModal.name}</p>
                </div>
                <button
                  onClick={() => setMembersModal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-0 max-h-[60vh] overflow-y-auto">
                {membersModal.members.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Users size={48} className="mx-auto text-gray-300 mb-3" />
                    <p>В этой группе пока нет сотрудников.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {membersModal.members.map((member) => (
                      <div
                        key={member.id}
                        className="p-4 flex items-center space-x-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {member.avatar}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{member.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                <button
                  onClick={() => setMembersModal(null)}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 font-medium"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
