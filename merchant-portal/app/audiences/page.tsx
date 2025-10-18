"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
import { Plus, Users, Edit2, RefreshCcw, Trash2, X, Search } from "lucide-react";
import Toggle from "../../components/Toggle";
import TagSelect from "../../components/TagSelect";
import RangeSlider from "../../components/RangeSlider";

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  return text ? (JSON.parse(text) as T) : ((undefined as unknown) as T);
}

type NumberRange = { min?: number | null; max?: number | null };
type BirthdayRange = { from?: string | null; to?: string | null };

type AudienceFilters = {
  gender?: string[];
  outletIds?: string[];
  tierIds?: string[];
  devicePlatforms?: string[];
  registrationDays?: NumberRange;
  lastPurchaseDays?: NumberRange;
  visits?: NumberRange;
  averageCheck?: NumberRange;
  totalSpent?: NumberRange;
  age?: NumberRange;
  birthday?: BirthdayRange;
};

type AudienceRecord = {
  id: string;
  name: string;
  description?: string | null;
  customerCount: number;
  isActive: boolean;
  isSystem?: boolean;
  archivedAt?: string | null;
  lastEvaluatedAt?: string | null;
  filters: AudienceFilters | null;
  updatedAt?: string | null;
};

type OutletOption = { id: string; name: string };
type TierOption = { id: string; name: string };

type AudienceMember = {
  id: string;
  name: string;
  phone: string;
  birthday: string | null;
  createdAt: string | null;
};

type AudienceFormState = {
  name: string;
  description: string;
  isActive: boolean;
  gender: { enabled: boolean; values: string[] };
  outlets: { enabled: boolean; values: string[] };
  tiers: { enabled: boolean; values: string[] };
  device: { enabled: boolean; values: string[] };
  registrationDays: { enabled: boolean; range: [number | null, number | null] };
  lastPurchaseDays: { enabled: boolean; range: [number | null, number | null] };
  visits: { enabled: boolean; range: [number | null, number | null] };
  averageCheck: { enabled: boolean; range: [number | null, number | null] };
  totalSpent: { enabled: boolean; range: [number | null, number | null] };
  age: { enabled: boolean; range: [number | null, number | null] };
  birthday: { enabled: boolean; from: string | null; to: string | null };
};

type Dictionaries = {
  outlets: OutletOption[];
  tiers: TierOption[];
};

type AudienceFormPayload = {
  name: string;
  description?: string;
  isActive: boolean;
  filters: AudienceFilters;
};

const DEVICE_OPTIONS = [
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
];

const GENDER_OPTIONS = [
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
];

const defaultFormState: AudienceFormState = {
  name: "",
  description: "",
  isActive: true,
  gender: { enabled: false, values: [] },
  outlets: { enabled: false, values: [] },
  tiers: { enabled: false, values: [] },
  device: { enabled: false, values: [] },
  registrationDays: { enabled: false, range: [null, null] },
  lastPurchaseDays: { enabled: false, range: [null, null] },
  visits: { enabled: false, range: [null, null] },
  averageCheck: { enabled: false, range: [null, null] },
  totalSpent: { enabled: false, range: [null, null] },
  age: { enabled: false, range: [null, null] },
  birthday: { enabled: false, from: null, to: null },
};

function rangeToTuple(range?: NumberRange | null): [number | null, number | null] {
  return [range?.min ?? null, range?.max ?? null];
}

function normalizeRange(range: [number | null, number | null]): NumberRange | null {
  const [min, max] = range;
  const minValue = min != null ? Number(min) : null;
  const maxValue = max != null ? Number(max) : null;
  if (minValue == null && maxValue == null) return null;
  const result: NumberRange = {};
  if (minValue != null && Number.isFinite(minValue)) result.min = minValue;
  if (maxValue != null && Number.isFinite(maxValue)) result.max = maxValue;
  if (result.min == null && result.max == null) return null;
  return result;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "";
  return value.toLocaleString("ru-RU");
}

function formatRange(range?: NumberRange | null, unit?: string): string {
  if (!range) return "";
  const { min, max } = range;
  if (min != null && max != null) {
    if (min === max) return `${formatNumber(min)}${unit ? ` ${unit}` : ""}`;
    return `${formatNumber(min)}–${formatNumber(max)}${unit ? ` ${unit}` : ""}`;
  }
  if (min != null) return `от ${formatNumber(min)}${unit ? ` ${unit}` : ""}`;
  if (max != null) return `до ${formatNumber(max)}${unit ? ` ${unit}` : ""}`;
  return "";
}

function formatCurrencyRange(range?: NumberRange | null): string {
  const label = formatRange(range, "₽");
  return label.replace(" ₽", "₽");
}

function formatFilters(
  filters: AudienceFilters | null,
  dictionaries: Dictionaries,
): string[] {
  if (!filters) return [];
  const parts: string[] = [];
  if (filters.gender?.length) {
    parts.push(
      `Пол: ${filters.gender
        .map((g) => (g === "male" ? "Мужской" : g === "female" ? "Женский" : g))
        .join(", ")}`,
    );
  }
  if (filters.outletIds?.length) {
    const names = filters.outletIds
      .map((id) => dictionaries.outlets.find((o) => o.id === id)?.name || id)
      .join(", ");
    parts.push(`Точки: ${names}`);
  }
  if (filters.tierIds?.length) {
    const names = filters.tierIds
      .map((id) => dictionaries.tiers.find((t) => t.id === id)?.name || id)
      .join(", ");
    parts.push(`Уровни: ${names}`);
  }
  if (filters.devicePlatforms?.length) {
    const names = filters.devicePlatforms
      .map((d) => (d === "ios" ? "iOS" : d === "android" ? "Android" : d))
      .join(", ");
    parts.push(`Устройства: ${names}`);
  }
  if (filters.registrationDays) {
    const label = formatRange(filters.registrationDays, "дней");
    if (label) parts.push(`С регистрации: ${label}`);
  }
  if (filters.lastPurchaseDays) {
    const label = formatRange(filters.lastPurchaseDays, "дней");
    if (label) parts.push(`С последней покупки: ${label}`);
  }
  if (filters.visits) {
    const label = formatRange(filters.visits, "покупок");
    if (label) parts.push(`Количество покупок: ${label}`);
  }
  if (filters.averageCheck) {
    const label = formatCurrencyRange(filters.averageCheck);
    if (label) parts.push(`Средний чек: ${label}`);
  }
  if (filters.totalSpent) {
    const label = formatCurrencyRange(filters.totalSpent);
    if (label) parts.push(`Сумма покупок: ${label}`);
  }
  if (filters.age) {
    const label = formatRange(filters.age, "лет");
    if (label) parts.push(`Возраст: ${label}`);
  }
  if (filters.birthday) {
    const { from, to } = filters.birthday;
    if (from && to) parts.push(`День рождения: ${from} – ${to}`);
    else if (from) parts.push(`День рождения после ${from}`);
    else if (to) parts.push(`День рождения до ${to}`);
  }
  return parts;
}

function filtersToFormState(filters: AudienceFilters | null): AudienceFormState {
  const state: AudienceFormState = JSON.parse(JSON.stringify(defaultFormState));
  if (!filters) return state;
  if (filters.gender?.length) {
    state.gender.enabled = true;
    state.gender.values = filters.gender;
  }
  if (filters.outletIds?.length) {
    state.outlets.enabled = true;
    state.outlets.values = filters.outletIds;
  }
  if (filters.tierIds?.length) {
    state.tiers.enabled = true;
    state.tiers.values = filters.tierIds;
  }
  if (filters.devicePlatforms?.length) {
    state.device.enabled = true;
    state.device.values = filters.devicePlatforms;
  }
  if (filters.registrationDays) {
    state.registrationDays.enabled = true;
    state.registrationDays.range = rangeToTuple(filters.registrationDays);
  }
  if (filters.lastPurchaseDays) {
    state.lastPurchaseDays.enabled = true;
    state.lastPurchaseDays.range = rangeToTuple(filters.lastPurchaseDays);
  }
  if (filters.visits) {
    state.visits.enabled = true;
    state.visits.range = rangeToTuple(filters.visits);
  }
  if (filters.averageCheck) {
    state.averageCheck.enabled = true;
    state.averageCheck.range = rangeToTuple(filters.averageCheck);
  }
  if (filters.totalSpent) {
    state.totalSpent.enabled = true;
    state.totalSpent.range = rangeToTuple(filters.totalSpent);
  }
  if (filters.age) {
    state.age.enabled = true;
    state.age.range = rangeToTuple(filters.age);
  }
  if (filters.birthday) {
    state.birthday.enabled = true;
    state.birthday.from = filters.birthday.from ?? null;
    state.birthday.to = filters.birthday.to ?? null;
  }
  return state;
}

function formStateToFilters(state: AudienceFormState): AudienceFilters {
  const filters: AudienceFilters = {};
  if (state.gender.enabled && state.gender.values.length)
    filters.gender = state.gender.values;
  if (state.outlets.enabled && state.outlets.values.length)
    filters.outletIds = state.outlets.values;
  if (state.tiers.enabled && state.tiers.values.length)
    filters.tierIds = state.tiers.values;
  if (state.device.enabled && state.device.values.length)
    filters.devicePlatforms = state.device.values;
  if (state.registrationDays.enabled) {
    const range = normalizeRange(state.registrationDays.range);
    if (range) filters.registrationDays = range;
  }
  if (state.lastPurchaseDays.enabled) {
    const range = normalizeRange(state.lastPurchaseDays.range);
    if (range) filters.lastPurchaseDays = range;
  }
  if (state.visits.enabled) {
    const range = normalizeRange(state.visits.range);
    if (range) filters.visits = range;
  }
  if (state.averageCheck.enabled) {
    const range = normalizeRange(state.averageCheck.range);
    if (range) filters.averageCheck = range;
  }
  if (state.totalSpent.enabled) {
    const range = normalizeRange(state.totalSpent.range);
    if (range) filters.totalSpent = range;
  }
  if (state.age.enabled) {
    const range = normalizeRange(state.age.range);
    if (range) filters.age = range;
  }
  if (state.birthday.enabled) {
    const from = state.birthday.from?.trim();
    const to = state.birthday.to?.trim();
    if (from || to) filters.birthday = { from: from || null, to: to || null };
  }
  return filters;
}

function mapAudience(row: any): AudienceRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? "Без названия"),
    description: row.description ?? null,
    customerCount: Number(row.customerCount ?? 0),
    isActive: row.isActive !== false,
    isSystem: Boolean(row.isSystem),
    archivedAt: row.archivedAt ?? null,
    lastEvaluatedAt: row.lastEvaluatedAt ?? null,
    filters: (row.filters as AudienceFilters | null) ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

function mapOutletList(data: any): OutletOption[] {
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items
    .map((item: any) => ({ id: String(item.id), name: String(item.name ?? "Без названия") }))
    .filter((item: OutletOption) => item.id);
}

function mapTierList(data: any): TierOption[] {
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items
    .map((item: any) => ({ id: String(item.id), name: String(item.name ?? "Без названия") }))
    .filter((item: TierOption) => item.id);
}

const AudienceMembersModal: React.FC<{
  audience: AudienceRecord;
  onClose: () => void;
}> = ({ audience, onClose }) => {
  const [members, setMembers] = React.useState<AudienceMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<any>(`/api/customers?segmentId=${encodeURIComponent(audience.id)}&limit=200`)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
        const mapped = list.map((item: any) => ({
          id: String(item.id),
          name: String(item.name || item.phone || item.id || ""),
          phone: String(item.phone || ""),
          birthday: item.birthday ? String(item.birthday) : null,
          createdAt: item.createdAt ? String(item.createdAt) : null,
        }));
        setMembers(mapped);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [audience.id]);

  const filteredMembers = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(term) ||
        member.phone.toLowerCase().includes(term),
    );
  }, [members, search]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.74)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 120,
      }}
    >
      <div
        style={{
          width: "min(720px, 96vw)",
          maxHeight: "92vh",
          background: "rgba(12,16,26,0.96)",
          borderRadius: 22,
          border: "1px solid rgba(148,163,184,0.18)",
          boxShadow: "0 28px 80px rgba(2,6,23,0.5)",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid rgba(148,163,184,0.16)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Состав аудитории</div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>{audience.name}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 24, display: "grid", gap: 16 }}>
          <div style={{ position: "relative", maxWidth: 320 }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по имени или телефону"
              style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 10 }}
            />
            <Search
              size={16}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }}
            />
          </div>
          {loading ? (
            <Skeleton height={180} />
          ) : error ? (
            <div style={{ padding: 16, background: "rgba(220,38,38,0.12)", borderRadius: 12 }}>{error}</div>
          ) : filteredMembers.length ? (
            <div style={{ maxHeight: 360, overflowY: "auto", borderRadius: 14, border: "1px solid rgba(148,163,184,0.16)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.7 }}>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>№</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Имя</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Телефон</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>День рождения</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Регистрация</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member, index) => (
                    <tr key={member.id} style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                      <td style={{ padding: "8px 12px" }}>{index + 1}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <a
                          href={`/customers/${encodeURIComponent(member.id)}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {member.name}
                        </a>
                      </td>
                      <td style={{ padding: "8px 12px" }}>{member.phone || "—"}</td>
                      <td style={{ padding: "8px 12px" }}>
                        {member.birthday ? new Date(member.birthday).toLocaleDateString("ru-RU") : "—"}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {member.createdAt ? new Date(member.createdAt).toLocaleDateString("ru-RU") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 16, opacity: 0.7 }}>Участники не найдены</div>
          )}
        </div>
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid rgba(148,163,184,0.16)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  );
};
type AudienceFormModalProps = {
  mode: "create" | "edit";
  audience: AudienceRecord | null;
  dictionaries: Dictionaries;
  onSubmit: (payload: AudienceFormPayload) => Promise<void>;
  onArchive?: () => Promise<void>;
  onClose: () => void;
};

const AudienceFormModal: React.FC<AudienceFormModalProps> = ({
  mode,
  audience,
  dictionaries,
  onSubmit,
  onArchive,
  onClose,
}) => {
  const readOnly = Boolean(audience?.isSystem);
  const [state, setState] = React.useState<AudienceFormState>(() => {
    const initial = filtersToFormState(audience?.filters ?? null);
    initial.name = audience?.name ?? "";
    initial.description = audience?.description ?? "";
    initial.isActive = audience?.isActive ?? true;
    return initial;
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async () => {
    if (!state.name.trim()) {
      setError("Укажите название аудитории");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const filters = formStateToFilters(state);
      await onSubmit({
        name: state.name.trim(),
        description: state.description?.trim() || undefined,
        isActive: state.isActive,
        filters,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!onArchive) return;
    if (!confirm("Архивировать аудиторию?")) return;
    setSaving(true);
    try {
      await onArchive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
      return;
    }
  };

  const setRange = (
    key:
      | "registrationDays"
      | "lastPurchaseDays"
      | "visits"
      | "averageCheck"
      | "totalSpent"
      | "age",
    value: [number, number],
  ) => {
    setState((prev) => ({
      ...prev,
      [key]: { ...prev[key], range: [value[0], value[1]] },
    }));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.74)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 120,
      }}
    >
      <div
        style={{
          width: "min(960px, 96vw)",
          maxHeight: "94vh",
          overflow: "auto",
          background: "rgba(12,16,26,0.96)",
          borderRadius: 22,
          border: "1px solid rgba(148,163,184,0.18)",
          boxShadow: "0 28px 80px rgba(2,6,23,0.5)",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid rgba(148,163,184,0.16)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {mode === "create"
                ? "Создать аудиторию"
                : readOnly
                ? "Просмотр аудитории"
                : "Редактировать аудиторию"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>
              {mode === "edit" && audience
                ? `${audience.customerCount.toLocaleString("ru-RU")} участников`
                : ""}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 24, display: "grid", gap: 20 }}>
          {readOnly ? (
            <div style={{ padding: 12, borderRadius: 12, background: "rgba(148,163,184,0.12)", fontSize: 13 }}>
              Системная аудитория не редактируется.
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 13, opacity: 0.7 }}>Название *</label>
            <input
              value={state.name}
              onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Например, Постоянные гости"
              style={{ padding: 12, borderRadius: 10 }}
              disabled={readOnly || saving}
            />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 13, opacity: 0.7 }}>Описание</label>
            <textarea
              value={state.description}
              onChange={(event) => setState((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Добавьте заметку для коллег"
              rows={3}
              style={{ padding: 12, borderRadius: 10, resize: "vertical" }}
              disabled={readOnly || saving}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Toggle
              checked={state.isActive}
              onChange={(value) => setState((prev) => ({ ...prev, isActive: value }))}
              label={state.isActive ? "Активна" : "Выключена"}
              disabled={readOnly || saving}
            />
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <ToggleRow
              title="Пол"
              enabled={state.gender.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  gender: { ...prev.gender, enabled },
                }))
              }
            >
              <TagSelect
                allowMultiple
                options={GENDER_OPTIONS}
                value={state.gender.values}
                onChange={(values) =>
                  setState((prev) => ({
                    ...prev,
                    gender: { ...prev.gender, values },
                  }))
                }
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="Посещал точки"
              enabled={state.outlets.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  outlets: { ...prev.outlets, enabled },
                }))
              }
            >
              <TagSelect
                allowMultiple
                options={dictionaries.outlets.map((item) => ({ value: item.id, label: item.name }))}
                value={state.outlets.values}
                onChange={(values) =>
                  setState((prev) => ({
                    ...prev,
                    outlets: { ...prev.outlets, values },
                  }))
                }
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="Лояльность: уровень"
              enabled={state.tiers.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  tiers: { ...prev.tiers, enabled },
                }))
              }
            >
              <TagSelect
                allowMultiple
                options={dictionaries.tiers.map((tier) => ({ value: tier.id, label: tier.name }))}
                value={state.tiers.values}
                onChange={(values) =>
                  setState((prev) => ({
                    ...prev,
                    tiers: { ...prev.tiers, values },
                  }))
                }
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="Устройства"
              enabled={state.device.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  device: { ...prev.device, enabled },
                }))
              }
            >
              <TagSelect
                allowMultiple
                options={DEVICE_OPTIONS}
                value={state.device.values}
                onChange={(values) =>
                  setState((prev) => ({
                    ...prev,
                    device: { ...prev.device, values },
                  }))
                }
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="Дней с момента регистрации"
              enabled={state.registrationDays.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  registrationDays: { ...prev.registrationDays, enabled },
                }))
              }
            >
              <RangeSlider
                min={0}
                max={1000}
                value={[
                  state.registrationDays.range[0] ?? 0,
                  state.registrationDays.range[1] ?? 100,
                ]}
                onChange={(value) => setRange("registrationDays", value)}
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="Дней с последней покупки"
              enabled={state.lastPurchaseDays.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  lastPurchaseDays: { ...prev.lastPurchaseDays, enabled },
                }))
              }
            >
              <RangeSlider
                min={0}
                max={365}
                value={[
                  state.lastPurchaseDays.range[0] ?? 0,
                  state.lastPurchaseDays.range[1] ?? 30,
                ]}
                onChange={(value) => setRange("lastPurchaseDays", value)}
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="Количество покупок"
              enabled={state.visits.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  visits: { ...prev.visits, enabled },
                }))
              }
            >
              <RangeSlider
                min={0}
                max={100}
                value={[
                  state.visits.range[0] ?? 0,
                  state.visits.range[1] ?? 10,
                ]}
                onChange={(value) => setRange("visits", value)}
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="Средний чек"
              enabled={state.averageCheck.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  averageCheck: { ...prev.averageCheck, enabled },
                }))
              }
            >
              <DualInputRange
                prefix="₽"
                value={state.averageCheck.range}
                onChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    averageCheck: { ...prev.averageCheck, range: value },
                  }))
                }
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="Сумма покупок"
              enabled={state.totalSpent.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  totalSpent: { ...prev.totalSpent, enabled },
                }))
              }
            >
              <DualInputRange
                prefix="₽"
                value={state.totalSpent.range}
                onChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    totalSpent: { ...prev.totalSpent, range: value },
                  }))
                }
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="Возраст"
              enabled={state.age.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  age: { ...prev.age, enabled },
                }))
              }
            >
              <RangeSlider
                min={0}
                max={120}
                value={[
                  state.age.range[0] ?? 18,
                  state.age.range[1] ?? 60,
                ]}
                onChange={(value) => setRange("age", value)}
                disabled={readOnly || saving}
              />
            </ToggleRow>

            <ToggleRow
              title="День рождения"
              enabled={state.birthday.enabled}
              onToggle={(enabled) =>
                setState((prev) => ({
                  ...prev,
                  birthday: { ...prev.birthday, enabled },
                }))
              }
            >
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>С</span>
                  <input
                    type="date"
                    value={state.birthday.from ?? ""}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        birthday: { ...prev.birthday, from: event.target.value || null },
                      }))
                    }
                    style={{ padding: 10, borderRadius: 10 }}
                    disabled={readOnly || saving}
                  />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>По</span>
                  <input
                    type="date"
                    value={state.birthday.to ?? ""}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        birthday: { ...prev.birthday, to: event.target.value || null },
                      }))
                    }
                    style={{ padding: 10, borderRadius: 10 }}
                    disabled={readOnly || saving}
                  />
                </div>
              </div>
            </ToggleRow>
          </div>

          {error ? (
            <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>
          ) : null}
        </div>
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid rgba(148,163,184,0.16)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {mode === "edit" && !readOnly && onArchive ? (
            <Button variant="danger" onClick={handleArchive} disabled={saving} startIcon={<Trash2 size={16} />}>
              Архивировать
            </Button>
          ) : null}
          <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
            <button className="btn" onClick={onClose} disabled={saving}>
              Отмена
            </button>
            {!readOnly ? (
              <Button variant="primary" onClick={handleSubmit} disabled={saving} startIcon={<Users size={16} />}>
                {saving ? "Сохраняем…" : "Сохранить"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
const ToggleRow: React.FC<{
  title: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}> = ({ title, enabled, onToggle, children }) => (
  <div
    style={{
      border: "1px solid rgba(148,163,184,0.18)",
      borderRadius: 16,
      padding: 16,
      background: "rgba(148,163,184,0.06)",
      display: "grid",
      gap: 12,
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      <Toggle checked={enabled} onChange={onToggle} label={enabled ? "Вкл" : "Выкл"} />
    </div>
    {enabled ? <div>{children}</div> : null}
  </div>
);

const DualInputRange: React.FC<{
  value: [number | null, number | null];
  onChange: (value: [number | null, number | null]) => void;
  prefix?: string;
  disabled?: boolean;
}> = ({ value, onChange, prefix, disabled }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
    <span style={{ opacity: 0.7 }}>От</span>
    <input
      value={value[0] ?? ""}
      onChange={(event) =>
        onChange([event.target.value ? Number(event.target.value) : null, value[1]])
      }
      style={{ padding: 10, borderRadius: 10, width: 140 }}
      disabled={disabled}
      type="number"
      min={0}
    />
    <span style={{ opacity: 0.7 }}>до</span>
    <input
      value={value[1] ?? ""}
      onChange={(event) =>
        onChange([value[0], event.target.value ? Number(event.target.value) : null])
      }
      style={{ padding: 10, borderRadius: 10, width: 140 }}
      disabled={disabled}
      type="number"
      min={0}
    />
    {prefix ? <span style={{ opacity: 0.7 }}>{prefix}</span> : null}
  </div>
);

const AudiencesPage: React.FC = () => {
  const [audiences, setAudiences] = React.useState<AudienceRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [modalState, setModalState] = React.useState<{
    mode: "create" | "edit";
    audience: AudienceRecord | null;
  } | null>(null);
  const [membersAudience, setMembersAudience] = React.useState<AudienceRecord | null>(null);
  const [dictionaries, setDictionaries] = React.useState<Dictionaries>({ outlets: [], tiers: [] });

  const loadDictionaries = React.useCallback(async () => {
    try {
      const [outletsRes, tiersRes] = await Promise.allSettled([
        fetchJson<any>("/api/portal/outlets?limit=200"),
        fetchJson<any>("/api/portal/loyalty/tiers"),
      ]);
      const outlets =
        outletsRes.status === "fulfilled" ? mapOutletList(outletsRes.value) : [];
      const tiers = tiersRes.status === "fulfilled" ? mapTierList(tiersRes.value) : [];
      setDictionaries({ outlets, tiers });
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadAudiences = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchJson<any[]>("/api/portal/audiences");
      const rows = Array.isArray(list) ? list.map(mapAudience) : [];
      setAudiences(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAudiences([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadDictionaries();
    loadAudiences();
  }, [loadDictionaries, loadAudiences]);

  const filteredAudiences = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return audiences;
    return audiences.filter((audience) => audience.name.toLowerCase().includes(term));
  }, [audiences, search]);

  const handleSubmit = async (payload: AudienceFormPayload, audienceId?: string) => {
    if (audienceId) {
      await fetchJson(`/api/portal/audiences/${encodeURIComponent(audienceId)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: payload.name,
          description: payload.description ?? null,
          filters: payload.filters,
          isActive: payload.isActive,
          rules: { source: "portal" },
          tags: [],
        }),
      });
    } else {
      await fetchJson("/api/portal/audiences", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          description: payload.description ?? null,
          filters: payload.filters,
          isActive: payload.isActive,
          rules: { source: "portal" },
          tags: [],
        }),
      });
    }
    await loadAudiences();
    setModalState(null);
  };

  const handleArchive = async (audience: AudienceRecord) => {
    await fetchJson(`/api/portal/audiences/${encodeURIComponent(audience.id)}/archive`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await loadAudiences();
    setModalState(null);
  };

  const handleRefresh = async (audience: AudienceRecord) => {
    await fetchJson(`/api/portal/audiences/${encodeURIComponent(audience.id)}/refresh`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await loadAudiences();
  };

  const openCreate = () => setModalState({ mode: "create", audience: null });
  const openEdit = (audience: AudienceRecord) =>
    setModalState({ mode: "edit", audience });
  const openMembers = (audience: AudienceRecord) => setMembersAudience(audience);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Аудитории клиентов</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Сегментируйте клиентов по поведению и характеристикам, запускайте персональные коммуникации.
          </div>
        </div>
        <Button variant="primary" onClick={openCreate} startIcon={<Plus size={16} />}>
          Создать аудиторию
        </Button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 1 320px" }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию"
            style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 10 }}
          />
          <Search
            size={16}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }}
          />
        </div>
      </div>

      <Card>
        <CardHeader
          title="Аудитории"
          subtitle={
            loading
              ? "Загрузка…"
              : `${filteredAudiences.length.toLocaleString("ru-RU")} из ${audiences.length.toLocaleString("ru-RU")}`
          }
        />
        <CardBody>
          {error ? (
            <div style={{ padding: 16, background: "rgba(220,38,38,0.12)", borderRadius: 12 }}>{error}</div>
          ) : loading ? (
            <Skeleton height={220} />
          ) : filteredAudiences.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.65 }}>
                    <th style={{ padding: "10px 12px" }}>Название</th>
                    <th style={{ padding: "10px 12px" }}>Размер</th>
                    <th style={{ padding: "10px 12px" }}>Фильтры</th>
                    <th style={{ padding: "10px 12px" }}>Обновлено</th>
                    <th style={{ padding: "10px 12px" }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudiences.map((audience) => {
                    const filtersSummary = formatFilters(audience.filters, dictionaries);
                    const status = audience.archivedAt
                      ? "В архиве"
                      : audience.isActive
                      ? "Активна"
                      : "Выключена";
                    return (
                      <tr key={audience.id} style={{ borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                        <td style={{ padding: "12px" }}>
                          <div style={{ fontWeight: 600 }}>{audience.name}</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>{status}</div>
                        </td>
                        <td style={{ padding: "12px" }}>{audience.customerCount.toLocaleString("ru-RU")}</td>
                        <td style={{ padding: "12px" }}>
                          {filtersSummary.length ? (
                            <div style={{ display: "grid", gap: 4 }}>
                              {filtersSummary.map((item) => (
                                <div key={item} style={{ fontSize: 12, opacity: 0.8 }}>
                                  {item}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ opacity: 0.6 }}>Все клиенты</span>
                          )}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {audience.lastEvaluatedAt
                            ? new Date(audience.lastEvaluatedAt).toLocaleString("ru-RU")
                            : "—"}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Button
                              variant="secondary"
                              onClick={() => openMembers(audience)}
                              startIcon={<Users size={14} />}
                            >
                              Состав
                            </Button>
                            {!audience.isSystem ? (
                              <Button
                                variant="secondary"
                                onClick={() => openEdit(audience)}
                                startIcon={<Edit2 size={14} />}
                              >
                                Редактировать
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              onClick={() => handleRefresh(audience)}
                              startIcon={<RefreshCcw size={14} />}
                            >
                              Обновить
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 16, opacity: 0.7 }}>Аудитории не найдены</div>
          )}
        </CardBody>
      </Card>

      {modalState ? (
        <AudienceFormModal
          mode={modalState.mode}
          audience={modalState.audience}
          dictionaries={dictionaries}
          onClose={() => setModalState(null)}
          onSubmit={(payload) =>
            handleSubmit(payload, modalState.mode === "edit" ? modalState.audience?.id : undefined)
          }
          onArchive={modalState.audience ? () => handleArchive(modalState.audience) : undefined}
        />
      ) : null}

      {membersAudience ? (
        <AudienceMembersModal audience={membersAudience} onClose={() => setMembersAudience(null)} />
      ) : null}
    </div>
  );
};

export default AudiencesPage;
