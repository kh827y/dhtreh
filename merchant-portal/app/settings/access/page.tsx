"use client";
import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";

// Данные берём из бэкенда; локальное хранилище больше не используется

const MODULES = [
  { id: "staff", label: "Сотрудники" },
  { id: "outlets", label: "Торговые точки" },
  { id: "loyalty", label: "Программа лояльности" },
  { id: "analytics", label: "Аналитика" },
];

const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'] as const;

type CrudMatrix = {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
};

type ModulePermissions = Record<string, CrudMatrix>;

type AccessGroupRow = {
  id: string;
  name: string;
  membersCount: number;
  staffIds: string[];
  permissions: ModulePermissions;
};

type StaffOption = { id: string; name: string; email?: string | null };

function defaultPermissions(): ModulePermissions {
  return MODULES.reduce((acc, module) => {
    acc[module.id] = { create: true, read: true, update: true, delete: true };
    return acc;
  }, {} as ModulePermissions);
}

function mergeGroups(_base: AccessGroupRow[], remote: any[]): AccessGroupRow[] {
  const normalized: AccessGroupRow[] = (remote || [])
    .map((g: any, idx: number) => {
      const rawId = g?.id ?? g?.code ?? g?.role ?? '';
      const id = String(rawId).trim();
      const rawName = (g?.name ?? g?.label ?? g?.role ?? id) || `Группа ${idx + 1}`;
      const name = String(rawName).trim();
      if (!id) return null;
      return {
        id,
        name,
        membersCount: Number(g?.memberCount ?? g?.membersCount ?? 0) || 0,
        staffIds: [],
        permissions: defaultPermissions(),
      } as AccessGroupRow;
    })
    .filter(Boolean) as AccessGroupRow[];
  // deduplicate by id
  const map = new Map<string, AccessGroupRow>();
  for (const g of normalized) {
    if (!map.has(g.id)) map.set(g.id, g);
  }
  return Array.from(map.values());
}

function permissionsToList(perm: ModulePermissions) {
  const list: Array<{ resource: string; action: string; conditions?: string | null }> = [];
  for (const module of MODULES) {
    const p: CrudMatrix = perm[module.id] ?? ({ create: false, read: true, update: false, delete: false } as CrudMatrix);
    CRUD_ACTIONS.forEach((action) => {
      if (p[action]) list.push({ resource: module.id, action });
    });
  }
  return list;
}

function listToPermissions(list: Array<{ resource: string; action: string }>): ModulePermissions {
  const base = MODULES.reduce((acc, m) => { acc[m.id] = { create: false, read: false, update: false, delete: false }; return acc; }, {} as ModulePermissions);
  for (const row of (list || [])) {
    if (!row?.resource || !base[row.resource]) continue;
    const actions = row.action === 'manage' ? [...CRUD_ACTIONS] : [row.action];
    actions.forEach((action) => {
      if (CRUD_ACTIONS.includes(action as (typeof CRUD_ACTIONS)[number])) {
        (base[row.resource] as any)[action] = true;
      }
    });
  }
  return base;
}

export default function AccessSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [groups, setGroups] = React.useState<AccessGroupRow[]>([]);
  const [staff, setStaff] = React.useState<StaffOption[]>([]);
  const [banner, setBanner] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const [modalMode, setModalMode] = React.useState<"view" | "edit" | "create" | null>(null);
  const [draft, setDraft] = React.useState<AccessGroupRow | null>(null);
  const [staffToAdd, setStaffToAdd] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [groupsRes, staffRes] = await Promise.all([
        fetch("/api/portal/access-groups"),
        fetch("/api/portal/staff"),
      ]);
      if (!groupsRes.ok) {
        const errText = await groupsRes.text().catch(() => "");
        throw new Error(errText || "Не удалось получить группы доступа");
      }
      if (!staffRes.ok) {
        const errText = await staffRes.text().catch(() => "");
        throw new Error(errText || "Не удалось получить сотрудников");
      }

      const groupsPayload = await groupsRes.json().catch(() => ({}));
      const staffPayload = await staffRes.json().catch(() => ({}));

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

      const groupsWithMembers = mergeGroups([], remoteGroups).map((group) => ({
        ...group,
        staffIds: staffRows
          .filter(
            (member: any) =>
              Array.isArray(member?.groups) && member.groups.some((gr: any) => String(gr?.id) === group.id),
          )
          .map((member: any) => String(member?.id ?? ""))
          .filter((value: string) => Boolean(value)),
        permissions: listToPermissions(
          (remoteGroups.find((candidate) => String(candidate?.id) === group.id)?.permissions) || [],
        ),
      }));

      setGroups(groupsWithMembers);
      setStaff(staffList);
      setBanner((prev) => (prev?.type === "error" ? null : prev));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Неизвестная ошибка загрузки";
      setGroups([]);
      setStaff([]);
      setBanner({ type: "error", text: message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setDraft({ id: "", name: "", membersCount: 0, staffIds: [], permissions: defaultPermissions() });
    setStaffToAdd("");
    setModalMode("create");
  };

  const openView = (group: AccessGroupRow) => {
    setDraft(group);
    setStaffToAdd("");
    setModalMode("view");
  };

  const openEdit = (group: AccessGroupRow) => {
    setDraft({ ...group, membersCount: group.staffIds.length || group.membersCount });
    setStaffToAdd("");
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setDraft(null);
    setStaffToAdd("");
  };

  function updateDraftPermissions(moduleId: string, key: keyof CrudMatrix, value: boolean) {
    if (!draft) return;
    setDraft({
      ...draft,
      permissions: {
        ...draft.permissions,
        [moduleId]: { ...draft.permissions[moduleId], [key]: value },
      },
    });
  }

  function addStaffToDraft() {
    if (!draft || !staffToAdd) return;
    if (draft.staffIds.includes(staffToAdd)) return;
    setDraft({ ...draft, staffIds: [...draft.staffIds, staffToAdd], membersCount: draft.staffIds.length + 1 });
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
      const res = await fetch(`/api/portal/access-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || "Не удалось удалить группу");
      }
      setBanner({ type: "success", text: "Группа удалена" });
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ошибка удаления группы";
      setBanner({ type: "error", text: message });
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
      if (modalMode === "create") {
        const payload = { name: draft.name.trim(), permissions: permissionsToList(draft.permissions) };
        const r = await fetch(`/api/portal/access-groups`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error(await r.text());
        const created = await r.json();
        const gid = created?.id || draft.id;
        const membersRes = await fetch(`/api/portal/access-groups/${encodeURIComponent(gid)}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ staffIds: draft.staffIds }) });
        if (!membersRes.ok) throw new Error(await membersRes.text());
        setBanner({ type: "success", text: "Группа создана" });
      } else if (modalMode === "edit") {
        const payload = { name: draft.name.trim(), permissions: permissionsToList(draft.permissions) };
        const r = await fetch(`/api/portal/access-groups/${encodeURIComponent(draft.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error(await r.text());
        const membersRes = await fetch(`/api/portal/access-groups/${encodeURIComponent(draft.id)}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ staffIds: draft.staffIds }) });
        if (!membersRes.ok) throw new Error(await membersRes.text());
        setBanner({ type: "success", text: "Группа обновлена" });
      }
      closeModal();
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ошибка сохранения";
      setBanner({ type: "error", text: message });
    } finally {
      setBusy(false);
    }
  };

  const staffLabel = (id: string) => {
    const row = staff.find((member) => member.id === id);
    return row ? `${row.name}${row.email ? ` (${row.email})` : ""}` : id;
  };

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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Группы доступа</div>
          <div style={{ fontSize: 14, opacity: 0.75 }}>Управляйте ролями и разрешениями сотрудников</div>
        </div>
        <Button variant="primary" onClick={openCreate}>
          Создать группу доступа
        </Button>
      </div>

      <Card>
        <CardHeader title="Список групп" subtitle="Название, участники и действия" />
        <CardBody>
          {loading ? (
            <Skeleton height={220} />
          ) : groups.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px minmax(220px, 2fr) 160px 160px",
                  fontSize: 12,
                  textTransform: "uppercase",
                  opacity: 0.6,
                  padding: "4px 12px",
                }}
              >
                <div>№</div>
                <div>Название</div>
                <div>Участников</div>
                <div>Действия</div>
              </div>
              {groups.map((group, index) => (
                <div
                  key={group.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px minmax(220px, 2fr) 160px 160px",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(10,14,24,.45)",
                    border: "1px solid rgba(255,255,255,.06)",
                  }}
                >
                  <div>{index + 1}</div>
                  <div>{group.name}</div>
                  <div>{group.staffIds.length || group.membersCount}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" title="Просмотреть" onClick={() => openView(group)}>
                      R
                    </button>
                    <button className="btn" title="Редактировать" onClick={() => openEdit(group)}>
                      U
                    </button>
                    <button className="btn" title="Удалить" onClick={() => handleDelete(group.id)}>
                      D
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ opacity: 0.7, padding: "12px" }}>Группы доступа не найдены</div>
          )}
        </CardBody>
      </Card>

      {modalMode && draft && (
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
            zIndex: 80,
          }}
        >
          <div
            style={{
              width: "min(720px, 96vw)",
              background: "rgba(12,16,26,0.96)",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,.08)",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              maxHeight: "92vh",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {modalMode === "create" ? "Новая группа доступа" : modalMode === "edit" ? "Редактировать группу" : "Просмотр группы"}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Настройте разрешения и участников</div>
              </div>
              <button className="btn btn-ghost" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 20, overflowY: "auto" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, opacity: 0.75 }}>Название группы</label>
                <input
                  value={draft.name}
                  disabled={modalMode === "view"}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  style={{ padding: "10px 12px", borderRadius: 8 }}
                />
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 13, opacity: 0.75 }}>Права доступа (CRUD по разделам)</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {MODULES.map((module) => (
                    <div
                      key={module.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(180px, 1fr) repeat(4, 80px)",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        border: "1px solid rgba(255,255,255,.08)",
                        borderRadius: 12,
                      }}
                    >
                      <div>{module.label}</div>
                      {(["create", "read", "update", "delete"] as Array<keyof CrudMatrix>).map((action) => (
                        <label key={action} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={draft.permissions[module.id]?.[action] ?? false}
                            disabled={modalMode === "view"}
                            onChange={(e) => updateDraftPermissions(module.id, action, e.target.checked)}
                          />
                          {action.toUpperCase()}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, opacity: 0.75 }}>Участники группы</div>
                  {modalMode !== "view" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <select value={staffToAdd} onChange={(e) => setStaffToAdd(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8 }}>
                        <option value="">Выберите сотрудника…</option>
                        {staff
                          .filter((member) => !draft.staffIds.includes(member.id))
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                      </select>
                      <Button variant="primary" onClick={addStaffToDraft} disabled={!staffToAdd}>
                        Добавить
                      </Button>
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {draft.staffIds.length ? (
                    draft.staffIds.map((id) => (
                      <div
                        key={id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,.04)",
                        }}
                      >
                        <span>{staffLabel(id)}</span>
                        {modalMode !== "view" && (
                          <button className="btn" onClick={() => removeStaffFromDraft(id)}>
                            Удалить
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div style={{ opacity: 0.7 }}>Пока никто не добавлен</div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <button className="btn" onClick={closeModal} disabled={busy}>
                Закрыть
              </button>
              {modalMode !== "view" && (
                <Button variant="primary" onClick={handleSave} disabled={busy}>
                  {busy ? "Сохраняем…" : "Сохранить"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
