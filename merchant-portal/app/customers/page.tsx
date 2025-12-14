"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button, Icons, Badge } from "@loyalty/ui";
import { type CustomerRecord, getFullName } from "./data";
import { normalizeCustomer } from "./normalize";
import { CustomerFormModal, type CustomerFormPayload } from "./customer-form-modal";
import { UsersRound, UserPlus, Upload as UploadIcon, Search, Edit3, Trash2, ChevronLeft, ChevronRight, Filter } from "lucide-react";

const { Plus } = Icons;

type Filters = {
  login: string;
  name: string;
  email: string;
  frequencyFrom: string;
  frequencyTo: string;
  averageCheck: string;
  birthday: string;
  age: string;
};

const initialFilters: Filters = {
  login: "",
  name: "",
  email: "",
  frequencyFrom: "",
  frequencyTo: "",
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
    return customers.filter((customer) => {
      if (filters.login) {
        const haystack = (customer.phone || customer.login || "").toLowerCase();
        if (!haystack.includes(filters.login.trim().toLowerCase())) return false;
      }
      if (filters.name) {
        const fullName = getFullName(customer).toLowerCase();
        if (!fullName.includes(filters.name.trim().toLowerCase())) return false;
      }
      if (filters.email && !(customer.email || "").toLowerCase().includes(filters.email.trim().toLowerCase())) return false;

      const freqDays = customer.visitFrequencyDays;
      if (filters.frequencyFrom) {
        const min = Number(filters.frequencyFrom);
        if (!Number.isNaN(min)) {
          if (freqDays == null || freqDays < min) return false;
        }
      }
      if (filters.frequencyTo) {
        const max = Number(filters.frequencyTo);
        if (!Number.isNaN(max)) {
          if (freqDays == null || freqDays > max) return false;
        }
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
  }, [filters.login, filters.name, filters.email, filters.frequencyFrom, filters.frequencyTo, filters.averageCheck, filters.birthday, filters.age]);

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
    setModalState(null);
  }

  return (
<div className="animate-in" style={{ display: "grid", gap: 24 }}>
  {toast && (
    <div style={{
      position: "fixed",
      top: 96,
      right: 24,
      background: "rgba(16, 185, 129, 0.15)",
      border: "1px solid rgba(16, 185, 129, 0.4)",
      color: "var(--success-light)",
      padding: "14px 20px",
      borderRadius: "var(--radius-md)",
      zIndex: 99,
      fontSize: 14,
      fontWeight: 500,
      boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
      display: "flex",
      alignItems: "center",
      gap: 10,
      backdropFilter: "blur(8px)"
    }} role="status">
      {toast}
    </div>
  )}

  {/* Page Header */}
  <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: "var(--radius-lg)",
        background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.1))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--brand-primary-light)",
      }}>
        <UsersRound size={24} />
      </div>
      <div>
        <h1 style={{ 
          fontSize: 28, 
          fontWeight: 800, 
          margin: 0,
          letterSpacing: "-0.02em",
        }}>
          Клиенты
        </h1>
        <p style={{ 
          fontSize: 14, 
          color: "var(--fg-muted)", 
          margin: "6px 0 0",
        }}>
          Список участников программы лояльности ({filteredCustomers.length})
        </p>
      </div>
    </div>
    
    <div style={{ display: "flex", gap: 10 }}>
      <Button onClick={openCreateModal} leftIcon={<UserPlus size={16} />}>
        Добавить клиента
      </Button>
      <Button type="button" variant="secondary" leftIcon={<UploadIcon size={16} />} onClick={() => router.push("/customers/import")}>
        Импорт
      </Button>
    </div>
  </header>

  {/* Filters */}
  <Card>
    <CardBody style={{ padding: 20 }}>
      <div className="filter-grid">
        <div className="filter-block" style={{ flex: 1, minWidth: 160 }}>
          <span className="filter-label">Телефон</span>
          <input
            className="input"
            style={{ width: "100%" }}
            value={filters.login}
            onChange={(e) => setFilters((prev) => ({ ...prev, login: e.target.value }))}
            placeholder="Телефон..."
          />
        </div>
        <div className="filter-block" style={{ flex: 1, minWidth: 160 }}>
          <span className="filter-label">Имя</span>
          <input
            className="input"
            style={{ width: "100%" }}
            value={filters.name}
            onChange={(e) => setFilters((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Имя..."
          />
        </div>
        <div className="filter-block" style={{ flex: 1, minWidth: 160 }}>
          <span className="filter-label">Email</span>
          <input
            className="input"
            style={{ width: "100%" }}
            value={filters.email}
            onChange={(e) => setFilters((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="Email..."
          />
        </div>
        <div className="filter-block">
          <span className="filter-label">Ср. чек</span>
          <input
            type="number"
            className="input"
            style={{ width: 120 }}
            value={filters.averageCheck}
            onChange={(e) => setFilters((prev) => ({ ...prev, averageCheck: e.target.value }))}
            placeholder="от..."
          />
        </div>
        <div className="filter-block">
          <span className="filter-label">Частота</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              className="input"
              style={{ width: 80 }}
              value={filters.frequencyFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, frequencyFrom: e.target.value }))}
              placeholder="От"
            />
            <input
              type="number"
              className="input"
              style={{ width: 80 }}
              value={filters.frequencyTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, frequencyTo: e.target.value }))}
              placeholder="До"
            />
          </div>
        </div>
        <div className="filter-block">
          <span className="filter-label">Дата рожд.</span>
          <input
            type="date"
            className="input"
            style={{ width: 140 }}
            value={filters.birthday}
            onChange={(e) => setFilters((prev) => ({ ...prev, birthday: e.target.value }))}
          />
        </div>
        <div className="filter-block">
          <span className="filter-label">Возраст</span>
          <input
            type="number"
            className="input"
            style={{ width: 80 }}
            value={filters.age}
            onChange={(e) => setFilters((prev) => ({ ...prev, age: e.target.value }))}
            placeholder="лет"
          />
        </div>
      </div>
    </CardBody>
  </Card>

  <Card>
    <CardBody style={{ padding: 0 }}>
      <div className="data-list">
         <div className="list-row customer-grid" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="cell-label">#</div>
            <div className="cell-label">ТЕЛЕФОН</div>
            <div className="cell-label">ИМЯ</div>
            <div className="cell-label">EMAIL</div>
            <div className="cell-label">ЧАСТОТА</div>
            <div className="cell-label">СР. ЧЕК</div>
            <div className="cell-label">ДАТА РОЖД.</div>
            <div className="cell-label">ВОЗРАСТ</div>
            <div className="cell-label" style={{ textAlign: "right" }}>ДЕЙСТВИЯ</div>
         </div>
         {pageItems.map((customer, index) => (
           <div key={customer.id} className="list-row customer-grid">
              <div style={{ color: "var(--fg-muted)", fontSize: 13 }}>{startIndex + index + 1}</div>
              <div>
                <Link href={`/customers/${customer.id}`} style={{ color: "var(--brand-primary-light)", fontWeight: 500, textDecoration: "none" }}>
                  {customer.phone || customer.login}
                </Link>
              </div>
              <div>
                <Link href={`/customers/${customer.id}`} style={{ color: "var(--fg)", fontWeight: 500, textDecoration: "none" }}>
                  {getFullName(customer) || "—"}
                </Link>
              </div>
              <div style={{ fontSize: 13, color: "var(--fg-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>{customer.email || "—"}</div>
              <div style={{ fontSize: 13, color: "var(--fg-secondary)" }}>{formatVisitFrequency(customer)}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{formatCurrency(customer.averageCheck)}</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{formatDate(customer.birthday)}</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{customer.age || "—"}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => openEditModal(customer)}
                  title="Редактировать"
                  className="btn-icon"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-secondary)", padding: 6, borderRadius: 6 }}
                >
                  <Edit3 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(customer)}
                  title="Удалить"
                  className="btn-icon"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--danger)", padding: 6, borderRadius: 6 }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
           </div>
         ))}
      </div>

      {!pageItems.length && (
        <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>
          <UsersRound size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
          <div>Клиенты не найдены. Попробуйте изменить фильтры.</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: 20, borderTop: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
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

function formatDate(value?: string | null): string {
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
