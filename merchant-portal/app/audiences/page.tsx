"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton, Icons } from "@loyalty/ui";
import { formatDateTime } from "../customers/utils";

const { Search, RefreshCw } = Icons;

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

export default function AudiencesPage() {
  const [items, setItems] = React.useState<Audience[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [scope, setScope] = React.useState<ScopeFilter>("ACTIVE");
  const [actionMessage, setActionMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

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

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <CardHeader
          title="Аудитории"
          subtitle="Сегменты клиентов для таргетированных коммуникаций"
          actions={
            <Button type="button" variant="secondary" leftIcon={<RefreshCw size={16} />} onClick={load}>
              Обновить список
            </Button>
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
