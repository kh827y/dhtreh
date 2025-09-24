"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton, Icons } from "@loyalty/ui";
import { formatDateTime } from "../customers/utils";

const { Search, RefreshCw, Plus, X, ChevronDown, ChevronUp } = Icons;

type Audience = {
  id: string;
  name: string;
  description?: string | null;
  customerCount: number;
  isActive: boolean;
  archivedAt?: string | null;
  tags?: string[] | null;
  color?: string | null;
  lastEvaluatedAt?: string | null;
};

type ScopeFilter = "ACTIVE" | "ARCHIVED" | "ALL";

type Option = { value: string; label: string };

const DEFAULT_PRODUCT_OPTIONS: Option[] = [
  { value: "prod-1", label: "Лимонад" },
  { value: "prod-2", label: "Бургер" },
  { value: "prod-3", label: "Кофе" },
  { value: "prod-4", label: "Салат" },
];

const LEVEL_OPTIONS: Option[] = [
  { value: "bronze", label: "Bronze" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
];

const RFM_OPTIONS: Option[] = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
];

const DEVICE_OPTIONS: Option[] = [
  { value: "android", label: "Android" },
  { value: "ios", label: "iOS" },
];

const FALLBACK_OUTLETS: Option[] = [
  { value: "outlet-1", label: "Точка на Тверской" },
  { value: "outlet-2", label: "ТРЦ Авиапарк" },
  { value: "outlet-3", label: "МЕГА Химки" },
  { value: "outlet-4", label: "Онлайн" },
];

type AudienceFormResult = {
  name: string;
  filters: Record<string, any>;
  rules: Record<string, any>;
};

type CreateAudienceModalProps = {
  open: boolean;
  outlets: Option[];
  products: Option[];
  levels: Option[];
  rfmOptions: Option[];
  devices: Option[];
  submitting: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: AudienceFormResult) => Promise<void> | void;
};

export default function AudiencesPage() {
  const [items, setItems] = React.useState<Audience[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [scope, setScope] = React.useState<ScopeFilter>("ACTIVE");
  const [actionMessage, setActionMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = React.useState(false);
  const [outletOptions, setOutletOptions] = React.useState<Option[]>(FALLBACK_OUTLETS);
  const [productOptions] = React.useState<Option[]>(DEFAULT_PRODUCT_OPTIONS);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/audiences");
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Не удалось загрузить аудитории");
      }
      const payload = await res.json();
      const list = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
      setItems(list.map(normalizeAudience));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Не удалось загрузить аудитории");
      setError(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/portal/outlets?status=active");
        if (!response.ok) throw new Error("bad status");
        const payload = await response.json();
        const list = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
        if (cancelled) return;
        const mapped = list
          .map((item: any) => ({ value: String(item.id ?? item.outletId ?? ""), label: item.name ?? item.title ?? "" }))
          .filter((option: Option) => option.value && option.label);
        if (mapped.length) {
          setOutletOptions(mapped);
        }
      } catch {
        if (!cancelled) {
          setOutletOptions(FALLBACK_OUTLETS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((audience) => {
      if (scope === "ACTIVE" && (audience.archivedAt || !audience.isActive)) return false;
      if (scope === "ARCHIVED" && !audience.archivedAt) return false;
      if (query) {
        const haystack = [
          audience.name,
          audience.description ?? "",
          ...(audience.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, scope, search]);

  async function handleToggleActive(audience: Audience) {
    setActionLoading(audience.id);
    setActionMessage(null);
    try {
      const body = JSON.stringify({ active: !audience.isActive });
      const res = await fetch(`/api/portal/audiences/${audience.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Не удалось изменить статус аудитории");
      }
      setActionMessage({ type: "success", text: !audience.isActive ? "Аудитория активирована" : "Аудитория приостановлена" });
      await load();
    } catch (err: unknown) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : String(err ?? "Ошибка при обновлении статуса"),
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleArchive(audience: Audience) {
    if (audience.archivedAt) return;
    setActionLoading(audience.id);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/portal/audiences/${audience.id}/archive`, { method: "POST" });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Не удалось архивировать аудиторию");
      }
      setActionMessage({ type: "success", text: "Аудитория отправлена в архив" });
      await load();
    } catch (err: unknown) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : String(err ?? "Ошибка архивации") });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRefresh(audience: Audience) {
    setActionLoading(audience.id);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/portal/audiences/${audience.id}/refresh`, { method: "POST" });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Не удалось обновить метрики");
      }
      setActionMessage({ type: "success", text: "Метрики обновлены" });
      await load();
    } catch (err: unknown) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : String(err ?? "Ошибка обновления") });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateAudience(payload: AudienceFormResult) {
    try {
      setCreateSubmitting(true);
      setCreateError(null);
      const response = await fetch("/api/portal/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Не удалось создать аудиторию");
      }
      setCreateOpen(false);
      setActionMessage({ type: "success", text: "Аудитория создана" });
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Не удалось создать аудиторию");
      setCreateError(message);
    } finally {
      setCreateSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <CardHeader
          title="Аудитории"
          subtitle="Сегменты клиентов для таргетированных коммуникаций"
          actions={
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Button type="button" leftIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                Создать аудиторию
              </Button>
              <Button type="button" variant="secondary" leftIcon={<RefreshCw size={16} />} onClick={load}>
                Обновить список
              </Button>
            </div>
          }
        />
        <CardBody style={{ display: "grid", gap: 16 }}>
          <FiltersPanel search={search} scope={scope} onSearchChange={setSearch} onScopeChange={setScope} />

          {actionMessage && (
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border:
                  actionMessage.type === "success"
                    ? "1px solid rgba(34,197,94,0.4)"
                    : "1px solid rgba(248,113,113,0.4)",
                background:
                  actionMessage.type === "success"
                    ? "rgba(34,197,94,0.12)"
                    : "rgba(248,113,113,0.12)",
                color: actionMessage.type === "success" ? "#bbf7d0" : "#fecaca",
              }}
            >
              {actionMessage.text}
            </div>
          )}

          {error ? (
            <div style={errorBlockStyle} role="alert">
              {error}
            </div>
          ) : loading ? (
            <div style={{ display: "grid", gap: 12 }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} height={68} radius={12} />
              ))}
            </div>
          ) : filteredItems.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={headerCellStyle}>Название</th>
                    <th style={headerCellStyle}>Участников</th>
                    <th style={headerCellStyle}>Статус</th>
                    <th style={headerCellStyle}>Обновлено</th>
                    <th style={headerCellStyle}>Теги</th>
                    <th style={headerCellStyle}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((audience) => (
                    <tr key={audience.id} style={rowStyle}>
                      <td style={cellStyle}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontWeight: 600 }}>{audience.name}</span>
                          {audience.description && (
                            <span style={{ fontSize: 12, opacity: 0.7 }}>{audience.description}</span>
                          )}
                        </div>
                      </td>
                      <td style={cellStyle}>{audience.customerCount}</td>
                      <td style={cellStyle}>{renderStatus(audience)}</td>
                      <td style={cellStyle}>{formatDateTime(audience.lastEvaluatedAt)}</td>
                      <td style={cellStyle}>{formatTags(audience.tags)}</td>
                      <td style={cellStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleRefresh(audience)}
                            disabled={actionLoading === audience.id}
                          >
                            Обновить
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleToggleActive(audience)}
                            disabled={actionLoading === audience.id || Boolean(audience.archivedAt)}
                          >
                            {audience.isActive && !audience.archivedAt ? "Выключить" : "Включить"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleArchive(audience)}
                            disabled={actionLoading === audience.id || Boolean(audience.archivedAt)}
                          >
                            В архив
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 32, textAlign: "center", opacity: 0.65 }}>
              Аудитории не найдены. Измените фильтры или создайте новую аудиторию в админке.
            </div>
          )}
        </CardBody>
      </Card>

      <CreateAudienceModal
        open={createOpen}
        outlets={outletOptions}
        products={productOptions}
        levels={LEVEL_OPTIONS}
        rfmOptions={RFM_OPTIONS}
        devices={DEVICE_OPTIONS}
        submitting={createSubmitting}
        error={createError}
        onClose={() => {
          if (!createSubmitting) {
            setCreateOpen(false);
            setCreateError(null);
          }
        }}
        onSubmit={handleCreateAudience}
      />
    </div>
  );
}

type FiltersPanelProps = {
  search: string;
  scope: ScopeFilter;
  onSearchChange: (value: string) => void;
  onScopeChange: (value: ScopeFilter) => void;
};

function FiltersPanel({ search, scope, onSearchChange, onScopeChange }: FiltersPanelProps) {
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      <label style={fieldStyle}>
        <span style={labelStyle}>Поиск</span>
        <div style={searchInputWrapperStyle}>
          <Search size={16} style={{ opacity: 0.5 }} />
          <input
            style={searchInputStyle}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Название или тег аудитории"
          />
        </div>
      </label>
      <label style={fieldStyle}>
        <span style={labelStyle}>Статус</span>
        <select
          style={inputStyle}
          value={scope}
          onChange={(event) => onScopeChange(event.target.value as ScopeFilter)}
        >
          <option value="ACTIVE">Активные</option>
          <option value="ARCHIVED">Архив</option>
          <option value="ALL">Все</option>
        </select>
      </label>
    </div>
  );
}

function normalizeAudience(raw: any): Audience {
  if (!raw || typeof raw !== "object") {
    return {
      id: "",
      name: "Без названия",
      customerCount: 0,
      isActive: false,
      archivedAt: null,
      tags: [],
      color: null,
      lastEvaluatedAt: null,
    };
  }
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "Без названия"),
    description: raw.description ?? null,
    customerCount: Number(raw.customerCount ?? 0) || 0,
    isActive: Boolean(raw.isActive),
    archivedAt: raw.archivedAt ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags : null,
    color: raw.color ?? null,
    lastEvaluatedAt: raw.lastEvaluatedAt ?? null,
  };
}

function renderStatus(audience: Audience): string {
  if (audience.archivedAt) return "В архиве";
  return audience.isActive ? "Активна" : "Выключена";
}

function formatTags(tags?: string[] | null): string {
  if (!tags?.length) return "—";
  return tags.join(", ");
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 840,
  borderCollapse: "collapse",
};

const headerCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  opacity: 0.6,
  borderBottom: "1px solid rgba(148,163,184,0.24)",
};

const rowStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(148,163,184,0.12)",
};

const cellStyle: React.CSSProperties = {
  padding: "14px 10px",
  fontSize: 14,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.45)",
  color: "inherit",
};

const searchInputWrapperStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.45)",
};

const searchInputStyle: React.CSSProperties = {
  ...inputStyle,
  border: "none",
  background: "transparent",
  padding: "10px 0",
};

const errorBlockStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(248,113,113,0.4)",
  background: "rgba(248,113,113,0.12)",
  color: "#fecaca",
};

const audienceModalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.72)",
  backdropFilter: "blur(8px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const audienceModalStyle: React.CSSProperties = {
  width: "min(860px, 95vw)",
  maxHeight: "92vh",
  borderRadius: 18,
  background: "#0f172a",
  border: "1px solid rgba(148,163,184,0.22)",
  boxShadow: "0 40px 120px rgba(15,23,42,0.5)",
  display: "flex",
  flexDirection: "column",
};

const audienceModalHeaderStyle: React.CSSProperties = {
  padding: "22px 26px",
  borderBottom: "1px solid rgba(148,163,184,0.18)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
};

const audienceModalBodyStyle: React.CSSProperties = {
  padding: "22px 26px",
  display: "grid",
  gap: 18,
  overflowY: "auto",
};

const audienceModalFooterStyle: React.CSSProperties = {
  padding: "18px 26px",
  borderTop: "1px solid rgba(148,163,184,0.18)",
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  background: "rgba(15,23,42,0.45)",
};

const audienceCloseButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#f87171",
  cursor: "pointer",
  padding: 6,
  borderRadius: 999,
};

const toggleRowLayout: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const toggleLabelStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
};

const toggleSwitchBase: React.CSSProperties = {
  width: 48,
  height: 26,
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(30,41,59,0.9)",
  position: "relative",
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const toggleThumbStyle: React.CSSProperties = {
  position: "absolute",
  top: 3,
  left: 3,
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "#fff",
  transition: "transform 0.2s ease",
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(148,163,184,0.18)",
  color: "#e2e8f0",
  fontSize: 13,
};

const chipRemoveStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  color: "rgba(248,113,113,0.9)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};

const dropdownContainerStyle: React.CSSProperties = {
  position: "relative",
};

const dropdownListStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.95)",
  maxHeight: 220,
  overflowY: "auto",
  zIndex: 20,
  boxShadow: "0 20px 50px rgba(15,23,42,0.45)",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
};

const pillButtonBase: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.45)",
  color: "inherit",
  cursor: "pointer",
};

function CreateAudienceModal({
  open,
  outlets,
  products,
  levels,
  rfmOptions,
  devices,
  submitting,
  error,
  onClose,
  onSubmit,
}: CreateAudienceModalProps) {
  const [form, setForm] = React.useState(audienceInitialState);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      setForm(audienceInitialState);
      setFieldErrors({});
    }
  }, [open]);

  if (!open) return null;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) {
      errors.name = "Укажите название аудитории";
    }
    if (form.visitedEnabled && form.visitedOutlets.length === 0) {
      errors.visited = "Выберите минимум одну точку";
    }
    if (form.productEnabled && form.products.length === 0) {
      errors.products = "Выберите минимум один товар";
    }
    if (form.genderEnabled && !form.gender) {
      errors.gender = "Выберите пол";
    }
    const avgFrom = form.averageCheckFrom.trim() ? Number(form.averageCheckFrom) : null;
    const avgTo = form.averageCheckTo.trim() ? Number(form.averageCheckTo) : null;
    if (form.averageCheckEnabled) {
      if ((avgFrom != null && Number.isNaN(avgFrom)) || (avgTo != null && Number.isNaN(avgTo))) {
        errors.average = "Введите числа";
      } else if (avgFrom != null && avgTo != null && avgFrom > avgTo) {
        errors.average = "Значение 'от' не может быть больше 'до'";
      }
    }
    const totalFrom = form.totalSpentFrom.trim() ? Number(form.totalSpentFrom) : null;
    const totalTo = form.totalSpentTo.trim() ? Number(form.totalSpentTo) : null;
    if (form.totalSpentEnabled) {
      if ((totalFrom != null && Number.isNaN(totalFrom)) || (totalTo != null && Number.isNaN(totalTo))) {
        errors.total = "Введите числа";
      } else if (totalFrom != null && totalTo != null && totalFrom > totalTo) {
        errors.total = "Значение 'от' не может быть больше 'до'";
      }
    }
    if (form.levelEnabled && form.levels.length === 0) {
      errors.level = "Выберите уровень";
    }
    if (form.rfmRecencyEnabled && !form.rfmRecency) {
      errors.rfmRecency = "Выберите значение";
    }
    if (form.rfmFrequencyEnabled && !form.rfmFrequency) {
      errors.rfmFrequency = "Выберите значение";
    }
    if (form.rfmMonetaryEnabled && !form.rfmMonetary) {
      errors.rfmMonetary = "Выберите значение";
    }
    if (form.deviceEnabled && !form.device) {
      errors.device = "Выберите устройство";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function buildPayload(): AudienceFormResult {
    const filters: Record<string, any> = {};
    if (form.visitedEnabled && form.visitedOutlets.length) filters.outletIds = form.visitedOutlets;
    if (form.productEnabled && form.products.length) filters.productIds = form.products;
    if (form.genderEnabled) filters.gender = form.gender;
    if (form.ageEnabled) filters.ageRange = { from: form.age[0], to: form.age[1] };
    if (form.birthdayEnabled) filters.birthdayOffset = { from: form.birthday[0], to: form.birthday[1] };
    if (form.registrationEnabled) filters.registrationDays = { from: form.registration[0], to: form.registration[1] };
    if (form.lastPurchaseEnabled) filters.lastPurchaseDays = { from: form.lastPurchase[0], to: form.lastPurchase[1] };
    if (form.purchaseCountEnabled) filters.purchaseCount = { from: form.purchaseCount[0], to: form.purchaseCount[1] };
    if (form.averageCheckEnabled)
      filters.averageCheck = {
        from: form.averageCheckFrom.trim() ? Number(form.averageCheckFrom) : null,
        to: form.averageCheckTo.trim() ? Number(form.averageCheckTo) : null,
      };
    if (form.totalSpentEnabled)
      filters.totalSpent = {
        from: form.totalSpentFrom.trim() ? Number(form.totalSpentFrom) : null,
        to: form.totalSpentTo.trim() ? Number(form.totalSpentTo) : null,
      };
    if (form.levelEnabled && form.levels.length) filters.levels = form.levels;
    if (form.rfmRecencyEnabled) filters.rfmRecency = form.rfmRecency;
    if (form.rfmFrequencyEnabled) filters.rfmFrequency = form.rfmFrequency;
    if (form.rfmMonetaryEnabled) filters.rfmMonetary = form.rfmMonetary;
    if (form.deviceEnabled) filters.device = form.device;

    return {
      name: form.name.trim(),
      filters,
      rules: filters,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    await onSubmit(buildPayload());
  }

  return (
    <div style={audienceModalOverlayStyle} role="presentation">
      <form onSubmit={handleSubmit} style={audienceModalStyle} role="dialog" aria-modal="true">
        <div style={audienceModalHeaderStyle}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Создать аудиторию</div>
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              Включайте условия, чтобы настроить сегмент под вашу задачу.
            </div>
          </div>
          <button type="button" onClick={onClose} style={audienceCloseButtonStyle} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
        <div style={audienceModalBodyStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Название*</span>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Например, Постоянные гости"
            />
            {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
          </label>

          <Section>
            <ToggleRow label="Посещал точку" enabled={form.visitedEnabled} onToggle={(value) => update("visitedEnabled", value)} />
            {form.visitedEnabled && (
              <div style={{ display: "grid", gap: 8 }}>
                <MultiSelectControl
                  placeholder="Выберите точки"
                  options={outlets}
                  selected={form.visitedOutlets}
                  onChange={(next) => update("visitedOutlets", next)}
                />
                {fieldErrors.visited && <FieldError>{fieldErrors.visited}</FieldError>}
              </div>
            )}
          </Section>

          <Section>
            <ToggleRow label="Покупал товар" enabled={form.productEnabled} onToggle={(value) => update("productEnabled", value)} />
            {form.productEnabled && (
              <div style={{ display: "grid", gap: 8 }}>
                <MultiSelectControl
                  placeholder="Выберите товары"
                  options={products}
                  selected={form.products}
                  onChange={(next) => update("products", next)}
                />
                {fieldErrors.products && <FieldError>{fieldErrors.products}</FieldError>}
              </div>
            )}
          </Section>

          <Section>
            <ToggleRow label="Пол" enabled={form.genderEnabled} onToggle={(value) => update("genderEnabled", value)} />
            {form.genderEnabled && (
              <div style={{ display: "flex", gap: 12 }}>
                <PillButton active={form.gender === "male"} onClick={() => update("gender", "male")}>
                  Мужской
                </PillButton>
                <PillButton active={form.gender === "female"} onClick={() => update("gender", "female")}>
                  Женский
                </PillButton>
              </div>
            )}
          </Section>

          <Section>
            <ToggleRow label="Возраст" enabled={form.ageEnabled} onToggle={(value) => update("ageEnabled", value)} />
            {form.ageEnabled && <RangeField min={0} max={100} value={form.age} onChange={(next) => update("age", next)} />}
          </Section>

          <Section>
            <ToggleRow label="День рождения" enabled={form.birthdayEnabled} onToggle={(value) => update("birthdayEnabled", value)} />
            {form.birthdayEnabled && <RangeField min={0} max={365} value={form.birthday} onChange={(next) => update("birthday", next)} />}
          </Section>

          <Section>
            <ToggleRow
              label="Дней с момента регистрации"
              enabled={form.registrationEnabled}
              onToggle={(value) => update("registrationEnabled", value)}
            />
            {form.registrationEnabled && <RangeField min={0} max={365} value={form.registration} onChange={(next) => update("registration", next)} />}
          </Section>

          <Section>
            <ToggleRow
              label="Дней с последней покупки"
              enabled={form.lastPurchaseEnabled}
              onToggle={(value) => update("lastPurchaseEnabled", value)}
            />
            {form.lastPurchaseEnabled && <RangeField min={0} max={365} value={form.lastPurchase} onChange={(next) => update("lastPurchase", next)} />}
          </Section>

          <Section>
            <ToggleRow
              label="Количество покупок"
              enabled={form.purchaseCountEnabled}
              onToggle={(value) => update("purchaseCountEnabled", value)}
            />
            {form.purchaseCountEnabled && <RangeField min={0} max={1000} value={form.purchaseCount} onChange={(next) => update("purchaseCount", next)} />}
          </Section>

          <Section>
            <ToggleRow label="Средний чек" enabled={form.averageCheckEnabled} onToggle={(value) => update("averageCheckEnabled", value)} />
            {form.averageCheckEnabled && (
              <DualInputRow
                fromLabel="От"
                toLabel="до"
                fromValue={form.averageCheckFrom}
                toValue={form.averageCheckTo}
                onChange={(from, to) => {
                  update("averageCheckFrom", from);
                  update("averageCheckTo", to);
                }}
              />
            )}
            {fieldErrors.average && <FieldError>{fieldErrors.average}</FieldError>}
          </Section>

          <Section>
            <ToggleRow label="Сумма покупок" enabled={form.totalSpentEnabled} onToggle={(value) => update("totalSpentEnabled", value)} />
            {form.totalSpentEnabled && (
              <DualInputRow
                fromLabel="От"
                toLabel="до"
                fromValue={form.totalSpentFrom}
                toValue={form.totalSpentTo}
                onChange={(from, to) => {
                  update("totalSpentFrom", from);
                  update("totalSpentTo", to);
                }}
              />
            )}
            {fieldErrors.total && <FieldError>{fieldErrors.total}</FieldError>}
          </Section>

          <Section>
            <ToggleRow label="Уровень клиента" enabled={form.levelEnabled} onToggle={(value) => update("levelEnabled", value)} />
            {form.levelEnabled && (
              <div style={{ display: "grid", gap: 8 }}>
                <MultiSelectControl
                  placeholder="Выберите уровни"
                  options={levels}
                  selected={form.levels}
                  onChange={(next) => update("levels", next)}
                />
                {fieldErrors.level && <FieldError>{fieldErrors.level}</FieldError>}
              </div>
            )}
          </Section>

          <Section>
            <ToggleRow label="RFM Давность" enabled={form.rfmRecencyEnabled} onToggle={(value) => update("rfmRecencyEnabled", value)} />
            {form.rfmRecencyEnabled && (
              <SingleSelectControl
                placeholder="Выберите класс"
                options={rfmOptions}
                value={form.rfmRecency}
                onChange={(next) => update("rfmRecency", next)}
              />
            )}
            {fieldErrors.rfmRecency && <FieldError>{fieldErrors.rfmRecency}</FieldError>}
          </Section>

          <Section>
            <ToggleRow label="RFM Частота" enabled={form.rfmFrequencyEnabled} onToggle={(value) => update("rfmFrequencyEnabled", value)} />
            {form.rfmFrequencyEnabled && (
              <SingleSelectControl
                placeholder="Выберите класс"
                options={rfmOptions}
                value={form.rfmFrequency}
                onChange={(next) => update("rfmFrequency", next)}
              />
            )}
            {fieldErrors.rfmFrequency && <FieldError>{fieldErrors.rfmFrequency}</FieldError>}
          </Section>

          <Section>
            <ToggleRow label="RFM Деньги" enabled={form.rfmMonetaryEnabled} onToggle={(value) => update("rfmMonetaryEnabled", value)} />
            {form.rfmMonetaryEnabled && (
              <SingleSelectControl
                placeholder="Выберите класс"
                options={rfmOptions}
                value={form.rfmMonetary}
                onChange={(next) => update("rfmMonetary", next)}
              />
            )}
            {fieldErrors.rfmMonetary && <FieldError>{fieldErrors.rfmMonetary}</FieldError>}
          </Section>

          <Section>
            <ToggleRow label="Устройство" enabled={form.deviceEnabled} onToggle={(value) => update("deviceEnabled", value)} />
            {form.deviceEnabled && (
              <SingleSelectControl
                placeholder="Выберите устройство"
                options={devices}
                value={form.device}
                onChange={(next) => update("device", next)}
              />
            )}
            {fieldErrors.device && <FieldError>{fieldErrors.device}</FieldError>}
          </Section>

          {error && <FieldError>{error}</FieldError>}
        </div>
        <div style={audienceModalFooterStyle}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Создаём…" : "Создать"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gap: 12 }}>{children}</div>;
}

function ToggleRow({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: (value: boolean) => void }) {
  return (
    <div style={toggleRowLayout}>
      <span style={toggleLabelStyle}>{label}</span>
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        style={{
          ...toggleSwitchBase,
          background: enabled ? "rgba(129,140,248,0.35)" : toggleSwitchBase.background,
          borderColor: enabled ? "rgba(129,140,248,0.6)" : toggleSwitchBase.border as string,
        }}
        aria-pressed={enabled}
      >
        <span
          style={{
            ...toggleThumbStyle,
            transform: enabled ? "translateX(22px)" : "translateX(0)",
          }}
        />
      </button>
    </div>
  );
}

function RangeField({ min, max, value, onChange }: { min: number; max: number; value: RangeValue; onChange: (value: RangeValue) => void }) {
  const [from, to] = value;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={labelStyle}>От</span>
          <input
            style={inputStyle}
            type="number"
            min={min}
            max={to}
            value={from}
            onChange={(event) => {
              const next = Math.min(Number(event.target.value) || min, to);
              onChange([Math.max(min, next), to]);
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={labelStyle}>До</span>
          <input
            style={inputStyle}
            type="number"
            min={from}
            max={max}
            value={to}
            onChange={(event) => {
              const next = Math.max(Number(event.target.value) || max, from);
              onChange([from, Math.min(max, next)]);
            }}
          />
        </label>
      </div>
      <RangeSlider min={min} max={max} value={value} onChange={onChange} />
    </div>
  );
}

function RangeSlider({ min, max, value, onChange }: { min: number; max: number; value: RangeValue; onChange: (value: RangeValue) => void }) {
  const [from, to] = value;
  return (
    <div style={{ position: "relative", height: 32 }}>
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 0,
          right: 0,
          height: 4,
          borderRadius: 999,
          background: "rgba(148,163,184,0.25)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 14,
          height: 4,
          borderRadius: 999,
          background: "rgba(129,140,248,0.55)",
          left: `${((from - min) / (max - min)) * 100}%`,
          right: `${100 - ((to - min) / (max - min)) * 100}%`,
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={from}
        onChange={(event) => {
          const next = Math.min(Number(event.target.value) || min, to);
          onChange([next, to]);
        }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, width: "100%", background: "none" }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={to}
        onChange={(event) => {
          const next = Math.max(Number(event.target.value) || max, from);
          onChange([from, next]);
        }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, width: "100%", background: "none" }}
      />
    </div>
  );
}

function MultiSelectControl({
  placeholder,
  options,
  selected,
  onChange,
}: {
  placeholder: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggleValue(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function clear() {
    onChange([]);
  }

  const selectedOptions = selected
    .map((value) => options.find((option) => option.value === value))
    .filter((option): option is Option => Boolean(option));

  return (
    <div style={dropdownContainerStyle} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          ...inputStyle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {selectedOptions.length === 0 ? (
            <span style={{ opacity: 0.6 }}>{placeholder}</span>
          ) : (
            selectedOptions.map((option) => (
              <span key={option.value} style={chipStyle}>
                {option.label}
                <button
                  type="button"
                  style={chipRemoveStyle}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleValue(option.value);
                  }}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {selectedOptions.length > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                clear();
              }}
              style={chipRemoveStyle}
            >
              ×
            </button>
          )}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>
      {open && (
        <div style={dropdownListStyle}>
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <div
                key={option.value}
                style={{
                  ...dropdownItemStyle,
                  background: checked ? "rgba(129,140,248,0.18)" : "transparent",
                  color: checked ? "#c7d2fe" : "inherit",
                }}
                onClick={() => toggleValue(option.value)}
              >
                <input type="checkbox" readOnly checked={checked} /> {option.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SingleSelectControl({
  placeholder,
  options,
  value,
  onChange,
}: {
  placeholder: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = options.find((option) => option.value === value);

  return (
    <div style={dropdownContainerStyle} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          ...inputStyle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
      >
        <span style={{ opacity: current ? 1 : 0.6 }}>{current ? current.label : placeholder}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div style={dropdownListStyle}>
          {options.map((option) => (
            <div
              key={option.value}
              style={{
                ...dropdownItemStyle,
                background: option.value === value ? "rgba(129,140,248,0.18)" : "transparent",
                color: option.value === value ? "#c7d2fe" : "inherit",
              }}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DualInputRow({
  fromLabel,
  toLabel,
  fromValue,
  toValue,
  onChange,
}: {
  fromLabel: string;
  toLabel: string;
  fromValue: string;
  toValue: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={labelStyle}>{fromLabel}</span>
        <input
          style={inputStyle}
          value={fromValue}
          onChange={(event) => onChange(event.target.value, toValue)}
          placeholder="0"
        />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={labelStyle}>{toLabel}</span>
        <input
          style={inputStyle}
          value={toValue}
          onChange={(event) => onChange(fromValue, event.target.value)}
          placeholder="0"
        />
      </label>
    </div>
  );
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...pillButtonBase,
        background: active ? "rgba(129,140,248,0.2)" : pillButtonBase.background,
        borderColor: active ? "rgba(129,140,248,0.6)" : pillButtonBase.border as string,
        color: active ? "#c7d2fe" : pillButtonBase.color,
      }}
    >
      {children}
    </button>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#fca5a5", fontSize: 12 }}>{children}</div>;
}
