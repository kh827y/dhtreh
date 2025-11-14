"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button, Icons } from "@loyalty/ui";
import { type CustomerRecord, getFullName } from "./data";
import { normalizeCustomer } from "./normalize";
import { CustomerFormModal, type CustomerFormPayload } from "./customer-form-modal";

const { Plus, Upload, Edit3, Gift, ChevronLeft, ChevronRight, Search, Trash2 } = Icons;

type Filters = {
  index: string;
  login: string;
  name: string;
  email: string;
  frequency: string;
  averageCheck: string;
  birthday: string;
  age: string;
};

const initialFilters: Filters = {
  index: "",
  login: "",
  name: "",
  email: "",
  frequency: "",
  averageCheck: "",
  birthday: "",
  age: "",
};

const PAGE_SIZE = 8;

type LevelOption = { id: string; name: string; isInitial?: boolean };

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = React.useState<CustomerRecord[]>([]);
  const [filters, setFilters] = React.useState<Filters>(initialFilters);
  const [page, setPage] = React.useState(1);
  const [toast, setToast] = React.useState<string | null>(null);
  const [modalState, setModalState] = React.useState<{ mode: "create" | "edit"; customer?: CustomerRecord } | null>(null);
  const [levelsCatalog, setLevelsCatalog] = React.useState<LevelOption[]>([]);

  // Хелпер для запросов к локальному прокси /api/customers
  async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    if (!res.ok) throw new Error(text || res.statusText);
    if (ct.includes("application/json") || ct.includes("+json")) {
      try {
        return text ? ((JSON.parse(text) as unknown) as T) : ((undefined as unknown) as T);
      } catch {
        // fallthrough to heuristic parsing
      }
    }
    const trimmed = (text || "").trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return (JSON.parse(trimmed) as unknown) as T;
      } catch {
        // ignore
      }
    }
    return ((undefined as unknown) as T);
  }

  // Загрузка списка клиентов при монтировании
  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const data = await api<any[]>("/api/customers");
        if (!aborted) setCustomers(Array.isArray(data) ? data.map(normalizeCustomer) : []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const payload = await api<any>("/api/portal/loyalty/tiers");
        const source: any[] = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];
        const normalized = source
          .map((row) => ({
            id: typeof row?.id === "string" ? row.id : row?.id != null ? String(row.id) : "",
            name: typeof row?.name === "string" ? row.name : "",
            isInitial: Boolean(row?.isInitial),
            isHidden: Boolean(row?.isHidden),
            threshold: Number(row?.thresholdAmount ?? 0) || 0,
          }))
          .filter((item) => item.id && item.name)
          .sort((a, b) => {
            if (a.threshold === b.threshold) {
              return a.name.localeCompare(b.name);
            }
            return a.threshold - b.threshold;
          })
          .map((item) => ({
            id: item.id,
            name: item.isHidden ? `${item.name} (скрытый)` : item.name,
            isInitial: item.isInitial,
          }));
        if (!aborted) setLevelsCatalog(normalized);
      } catch (error) {
        console.error(error);
        if (!aborted) setLevelsCatalog([]);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  const filteredCustomers = React.useMemo(() => {
    return customers.filter((customer, index) => {
      const rowNumber = index + 1;
      if (filters.index && !String(rowNumber).includes(filters.index.trim())) return false;
      if (filters.login) {
        const haystack = (customer.phone || customer.login || "").toLowerCase();
        if (!haystack.includes(filters.login.trim().toLowerCase())) return false;
      }
      if (filters.name) {
        const fullName = getFullName(customer).toLowerCase();
        if (!fullName.includes(filters.name.trim().toLowerCase())) return false;
      }
      if (filters.email && !(customer.email || "").toLowerCase().includes(filters.email.trim().toLowerCase())) return false;
      if (filters.frequency) {
        const freq = formatVisitFrequency(customer).toLowerCase();
        if (!freq.includes(filters.frequency.trim().toLowerCase())) return false;
      }
      if (filters.averageCheck) {
        const min = Number(filters.averageCheck);
        if (!Number.isNaN(min) && customer.averageCheck < min) return false;
      }
      if (filters.birthday) {
        if ((customer.birthday || "").slice(0, 10) !== filters.birthday) return false;
      }
      if (filters.age) {
        const expected = Number(filters.age);
        if (!Number.isNaN(expected) && customer.age !== expected) return false;
      }
      return true;
    });
  }, [customers, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = filteredCustomers.length ? (currentPage - 1) * PAGE_SIZE : 0;
  const pageItems = filteredCustomers.slice(startIndex, startIndex + PAGE_SIZE);
  const shownFrom = filteredCustomers.length ? startIndex + 1 : 0;
  const shownTo = filteredCustomers.length ? startIndex + pageItems.length : 0;

  React.useEffect(() => {
    setPage(1);
  }, [filters.index, filters.login, filters.name, filters.email, filters.frequency, filters.averageCheck, filters.birthday, filters.age]);

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  React.useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const existingLogins = React.useMemo(
    () => customers.map((customer) => customer.phone || customer.login),
    [customers],
  );
  const defaultLevelId = React.useMemo(() => {
    const initial = levelsCatalog.find((lvl) => lvl.isInitial);
    return initial?.id ?? levelsCatalog[0]?.id ?? null;
  }, [levelsCatalog]);

  function openCreateModal() {
    setModalState({ mode: "create" });
  }

  function openEditModal(customer: CustomerRecord) {
    setModalState({ mode: "edit", customer });
  }

  async function handleDelete(customer: CustomerRecord) {
    if (!customer?.id) return;
    const ok = window.confirm(`Удалить клиента ${getFullName(customer) || customer.login}?\nДействие нельзя отменить.`);
    if (!ok) return;
    try {
      await api(`/api/customers/${encodeURIComponent(customer.id)}`, { method: 'DELETE' });
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      // Подстраховка: перечитать список с сервера
      try {
        const fresh = await api<any[]>("/api/customers");
        if (Array.isArray(fresh)) setCustomers(fresh.map(normalizeCustomer));
      } catch {}
      setToast("Клиент удалён");
    } catch (e: any) {
      setToast(e?.message || 'Не удалось удалить клиента');
    }
  }

  async function handleModalSubmit(payload: CustomerFormPayload) {
    if (!modalState) return;

    const trimmedName = payload.firstName.trim();
    const baseBody = {
      phone: payload.login.trim(),
      email: payload.email.trim() || undefined,
      firstName: trimmedName || undefined,
      name: trimmedName || undefined,
      birthday: payload.birthday || undefined,
      gender: payload.gender,
      tags: parseTags(payload.tags),
      comment: payload.comment.trim() || undefined,
      levelId: payload.levelId || undefined,
    };

    if (modalState.mode === "create") {
      try {
        const created = await api<any>("/api/customers", {
          method: "POST",
          body: JSON.stringify(baseBody),
        });
        const normalized = normalizeCustomer(created);
        setCustomers((prev) => [normalized, ...prev]);
        try {
          const fresh = await api<any[]>("/api/customers");
          if (Array.isArray(fresh)) setCustomers(fresh.map(normalizeCustomer));
        } catch {}
        setToast("Клиент создан");
      } catch (e: any) {
        setToast(e?.message || "Ошибка при создании клиента");
      }
    } else if (modalState.mode === "edit" && modalState.customer) {
      const { customer } = modalState;
      try {
        const saved = await api<any>(`/api/customers/${encodeURIComponent(customer.id)}`, {
          method: "PUT",
          body: JSON.stringify(baseBody),
        });
        const normalized = normalizeCustomer(saved ?? { ...customer, ...baseBody });
        setCustomers((prev) => prev.map((item) => (item.id === customer.id ? normalized : item)));
        try {
          const fresh = await api<any[]>("/api/customers");
          if (Array.isArray(fresh)) setCustomers(fresh.map(normalizeCustomer));
        } catch {}
        setToast("Данные клиента обновлены");
      } catch (e: any) {
        setToast(e?.message || "Ошибка при сохранении клиента");
      }
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {toast && (
        <div style={toastStyle} role="status">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader
          title="Клиенты"
          subtitle="Список участников программы лояльности"
          actions={
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Button onClick={openCreateModal} leftIcon={<Plus size={16} />}>Добавить клиента</Button>
              <Button type="button" variant="secondary" leftIcon={<Upload size={16} />} onClick={() => router.push("/customers/import")}>
                Импортировать клиентов
              </Button>
            </div>
          }
        />
        <CardBody style={{ display: "grid", gap: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>#</th>
                  <th style={headerCellStyle}>Телефон</th>
                  <th style={headerCellStyle}>Имя</th>
                  <th style={headerCellStyle}>Электронная почта</th>
                  <th style={headerCellStyle}>Частота визитов</th>
                  <th style={headerCellStyle}>Средний чек</th>
                  <th style={headerCellStyle}>День рождения</th>
                  <th style={headerCellStyle}>Возраст</th>
                  <th style={headerCellStyle} aria-label="Действия" />
                </tr>
                <tr>
                  <th style={filterCellStyle}>
                    <div style={filterInputWrapperStyle}>
                      <Search size={14} style={{ opacity: 0.6 }} />
                      <input
                        style={filterInputStyle}
                        value={filters.index}
                        onChange={(event) => setFilters((prev) => ({ ...prev, index: event.target.value }))}
                        placeholder="№"
                      />
                    </div>
                  </th>
                  <th style={filterCellStyle}>
                    <div style={filterInputWrapperStyle}>
                      <Search size={14} style={{ opacity: 0.6 }} />
                      <input
                        style={filterInputStyle}
                        value={filters.login}
                        onChange={(event) => setFilters((prev) => ({ ...prev, login: event.target.value }))}
                        placeholder="Телефон"
                      />
                    </div>
                  </th>
                  <th style={filterCellStyle}>
                    <div style={filterInputWrapperStyle}>
                      <Search size={14} style={{ opacity: 0.6 }} />
                      <input
                        style={filterInputStyle}
                        value={filters.name}
                        onChange={(event) => setFilters((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Имя клиента"
                      />
                    </div>
                  </th>
                  <th style={filterCellStyle}>
                    <div style={filterInputWrapperStyle}>
                      <Search size={14} style={{ opacity: 0.6 }} />
                      <input
                        style={filterInputStyle}
                        value={filters.email}
                        onChange={(event) => setFilters((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="Email"
                      />
                    </div>
                  </th>
                  <th style={filterCellStyle}>
                    <div style={filterInputWrapperStyle}>
                      <Search size={14} style={{ opacity: 0.6 }} />
                      <input
                        style={filterInputStyle}
                        value={filters.frequency}
                        onChange={(event) => setFilters((prev) => ({ ...prev, frequency: event.target.value }))}
                        placeholder="Напр. еженедельно"
                      />
                    </div>
                  </th>
                  <th style={filterCellStyle}>
                    <input
                      style={filterInputStyle}
                      type="number"
                      min={0}
                      value={filters.averageCheck}
                      onChange={(event) => setFilters((prev) => ({ ...prev, averageCheck: event.target.value }))}
                      placeholder="от"
                    />
                  </th>
                  <th style={filterCellStyle}>
                    <input
                      style={filterInputStyle}
                      type="date"
                      value={filters.birthday}
                      onChange={(event) => setFilters((prev) => ({ ...prev, birthday: event.target.value }))}
                    />
                  </th>
                  <th style={filterCellStyle}>
                    <input
                      style={filterInputStyle}
                      type="number"
                      min={0}
                      value={filters.age}
                      onChange={(event) => setFilters((prev) => ({ ...prev, age: event.target.value }))}
                      placeholder="Возраст"
                    />
                  </th>
                  <th style={filterCellStyle} />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((customer, index) => (
                  <tr key={customer.id} style={rowStyle}>
                    <td style={cellStyle}>{startIndex + index + 1}</td>
                    <td style={cellStyle}>
                      <Link href={`/customers/${customer.id}`} style={linkStyle}>
                        {customer.phone || customer.login}
                      </Link>
                    </td>
                    <td style={cellStyle}>
                      <Link href={`/customers/${customer.id}`} style={linkStyle}>
                        {getFullName(customer) || "—"}
                      </Link>
                    </td>
                    <td style={cellStyle}>{customer.email || "—"}</td>
                    <td style={cellStyle}>{formatVisitFrequency(customer)}</td>
                    <td style={cellStyle}>{formatCurrency(customer.averageCheck)}</td>
                    <td style={cellStyle}>{formatDate(customer.birthday)}</td>
                    <td style={cellStyle}>{customer.age || "—"}</td>
                    <td style={{ ...cellStyle, width: 112 }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <Link
                          href={`/customers/complimentary?phone=${encodeURIComponent(customer.login)}`}
                          title="Начислить комплиментарные баллы"
                          style={iconButtonStyle}
                        >
                          <Gift size={16} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditModal(customer)}
                          title="Редактировать"
                          style={iconButtonStyle}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(customer)}
                          title="Удалить"
                          style={{ ...iconButtonStyle, color: '#fca5a5', borderColor: 'rgba(248,113,113,0.35)' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!pageItems.length && (
            <div style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>Клиенты не найдены. Попробуйте изменить фильтры.</div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Показаны записи {shownFrom}-{shownTo} из {filteredCustomers.length}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={currentPage === 1}
                leftIcon={<ChevronLeft size={14} />}
              >
                Назад
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={currentPage === totalPages || !filteredCustomers.length}
                rightIcon={<ChevronRight size={14} />}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <CustomerFormModal
        open={Boolean(modalState)}
        mode={modalState?.mode ?? "create"}
        initialValues={
          modalState?.customer
            ? mapCustomerToForm(modalState.customer)
            : { levelId: defaultLevelId }
        }
        loginToIgnore={modalState?.customer?.login}
        levels={levelsCatalog}
        onClose={() => setModalState(null)}
        onSubmit={handleModalSubmit}
        existingLogins={existingLogins}
      />
    </div>
  );
}

function formatVisitFrequency(customer: CustomerRecord): string {
  const value = customer.visitFrequencyDays;
  if (value == null || value <= 0) return "—";
  return value.toLocaleString("ru-RU");
}

function parseTags(tags: string): string[] {
  return tags
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value?: string): string {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ru-RU");
  } catch {
    return "—";
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
}

function mapCustomerToForm(customer: CustomerRecord): Partial<CustomerFormPayload> {
  const birthdayValue = customer.birthday ? customer.birthday.slice(0, 10) : "";
  return {
    login: customer.phone || customer.login,
    email: customer.email ?? "",
    firstName: getFullName(customer) || "",
    tags: customer.tags.join(", "),
    birthday: birthdayValue,
    levelId: customer.levelId ?? null,
    gender: customer.gender,
    comment: customer.comment ?? "",
  };
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 900,
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

const filterCellStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.14)",
};

const filterInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.45)",
  color: "inherit",
};

const filterInputWrapperStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "rgba(15,23,42,0.35)",
  borderRadius: 10,
  padding: "0 8px",
  border: "1px solid rgba(148,163,184,0.18)",
};

const rowStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(148,163,184,0.1)",
};

const cellStyle: React.CSSProperties = {
  padding: "12px 10px",
  fontSize: 14,
};

const linkStyle: React.CSSProperties = {
  color: "#a5b4fc",
  textDecoration: "none",
};

const iconButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(15,23,42,0.4)",
  color: "inherit",
  cursor: "pointer",
};

const toastStyle: React.CSSProperties = {
  position: "fixed",
  top: 96,
  right: 24,
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.4)",
  color: "#bbf7d0",
  padding: "12px 16px",
  borderRadius: 12,
  zIndex: 99,
  fontSize: 14,
  boxShadow: "0 16px 60px rgba(15,118,110,0.35)",
};
