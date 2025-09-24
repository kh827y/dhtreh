"use client";

import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardBody, Button, Icons, Skeleton } from "@loyalty/ui";
import {
  normalizeCustomer,
  type CustomerRecord,
  formatPhone,
  formatCurrency,
  formatDateTime,
  formatSegments,
  formatVisits,
} from "./utils";

const { Search, RefreshCw, ChevronLeft, ChevronRight } = Icons;

const PAGE_SIZE = 20;

type CustomersResponse = {
  total: number;
  items: CustomerRecord[];
};

type GenderFilter = "ALL" | "male" | "female";

type FiltersState = {
  search: string;
  gender: GenderFilter;
  minVisits: string;
  maxVisits: string;
};

const initialFilters: FiltersState = {
  search: "",
  gender: "ALL",
  minVisits: "",
  maxVisits: "",
};

export default function CustomersPage() {
  const [filters, setFilters] = React.useState<FiltersState>(initialFilters);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const [items, setItems] = React.useState<CustomerRecord[]>([]);
  const [refreshToken, setRefreshToken] = React.useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromRecord = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toRecord = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String((page - 1) * PAGE_SIZE));
      const trimmedSearch = filters.search.trim();
      if (trimmedSearch) {
        qs.set("search", trimmedSearch);
      }
      if (filters.gender !== "ALL") {
        qs.set("gender", filters.gender);
      }
      if (filters.minVisits.trim()) {
        qs.set("minVisits", String(Math.max(Number(filters.minVisits) || 0, 0)));
      }
      if (filters.maxVisits.trim()) {
        qs.set("maxVisits", String(Math.max(Number(filters.maxVisits) || 0, 0)));
      }

      const response = await fetch(`/api/portal/customers?${qs.toString()}`);
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Не удалось загрузить клиентов");
      }
      const data = (await response.json()) as Partial<CustomersResponse> | undefined;
      const list = Array.isArray(data?.items) ? data!.items : [];
      setItems(list.map(normalizeCustomer));
      setTotal(Number.isFinite(Number(data?.total)) ? Number(data?.total) : list.length);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Не удалось загрузить клиентов");
      setError(message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters.gender, filters.maxVisits, filters.minVisits, filters.search, page, refreshToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [filters.gender, filters.maxVisits, filters.minVisits, filters.search]);

  function handleChange<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <CardHeader
          title="Клиенты"
          subtitle="Список участников программы лояльности"
          actions={
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Button
                type="button"
                variant="secondary"
                leftIcon={<RefreshCw size={16} />}
                onClick={() => setRefreshToken((token) => token + 1)}
              >
                Обновить список
              </Button>
              <Button type="button" variant="secondary" disabled>
                Импортировать клиентов
              </Button>
            </div>
          }
        />
        <CardBody style={{ display: "grid", gap: 16 }}>
          <FiltersPanel filters={filters} onChange={handleChange} />

          {error ? (
            <div style={errorBlockStyle} role="alert">
              {error}
            </div>
          ) : (
            <CustomersTable loading={loading} items={items} page={page} />
          )}

          {!loading && !items.length && !error && (
            <div style={{ padding: 32, textAlign: "center", opacity: 0.65 }}>
              Клиенты не найдены. Измените условия поиска и попробуйте снова.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Показаны записи {fromRecord}-{toRecord} из {total}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1 || loading}
                leftIcon={<ChevronLeft size={14} />}
              >
                Назад
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages || loading}
                rightIcon={<ChevronRight size={14} />}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

type FiltersPanelProps = {
  filters: FiltersState;
  onChange: <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => void;
};

function FiltersPanel({ filters, onChange }: FiltersPanelProps) {
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      <label style={fieldLabelStyle}>
        <span style={labelTextStyle}>Поиск</span>
        <div style={searchInputWrapperStyle}>
          <Search size={16} style={{ opacity: 0.5 }} />
          <input
            style={searchInputStyle}
            value={filters.search}
            onChange={(event) => onChange("search", event.target.value)}
            placeholder="Имя, телефон или email"
          />
        </div>
      </label>
      <label style={fieldLabelStyle}>
        <span style={labelTextStyle}>Минимум визитов</span>
        <input
          style={inputStyle}
          type="number"
          min={0}
          value={filters.minVisits}
          onChange={(event) => onChange("minVisits", event.target.value)}
          placeholder="от 0"
        />
      </label>
      <label style={fieldLabelStyle}>
        <span style={labelTextStyle}>Максимум визитов</span>
        <input
          style={inputStyle}
          type="number"
          min={0}
          value={filters.maxVisits}
          onChange={(event) => onChange("maxVisits", event.target.value)}
          placeholder="до"
        />
      </label>
      <label style={fieldLabelStyle}>
        <span style={labelTextStyle}>Пол</span>
        <select
          style={inputStyle}
          value={filters.gender}
          onChange={(event) => onChange("gender", event.target.value as GenderFilter)}
        >
          <option value="ALL">Любой</option>
          <option value="male">Мужчины</option>
          <option value="female">Женщины</option>
        </select>
      </label>
    </div>
  );
}

type CustomersTableProps = {
  loading: boolean;
  items: CustomerRecord[];
  page: number;
};

function CustomersTable({ loading, items, page }: CustomersTableProps) {
  if (loading) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} height={52} radius={12} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={headerCellStyle}>#</th>
            <th style={headerCellStyle}>Телефон</th>
            <th style={headerCellStyle}>Имя</th>
            <th style={headerCellStyle}>Email</th>
            <th style={headerCellStyle}>Визитов</th>
            <th style={headerCellStyle}>Средний чек</th>
            <th style={headerCellStyle}>Последняя покупка</th>
            <th style={headerCellStyle}>Сегменты</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} style={rowStyle}>
              <td style={cellStyle}>{(page - 1) * PAGE_SIZE + index + 1}</td>
              <td style={cellStyle}>
                <Link href={`/customers/${item.id}`} style={linkStyle}>
                  {formatPhone(item.phone)}
                </Link>
              </td>
              <td style={cellStyle}>
                <Link href={`/customers/${item.id}`} style={linkStyle}>
                  {item.name?.trim() || "—"}
                </Link>
              </td>
              <td style={cellStyle}>{item.email || "—"}</td>
              <td style={cellStyle}>{formatVisits(item.stats)}</td>
              <td style={cellStyle}>{formatCurrency(item.stats?.avgCheck)}</td>
              <td style={cellStyle}>{formatDateTime(item.stats?.lastOrderAt)}</td>
              <td style={cellStyle}>{formatSegments(item.segments)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 900,
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

const linkStyle: React.CSSProperties = {
  color: "#a5b4fc",
  textDecoration: "none",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.65,
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
