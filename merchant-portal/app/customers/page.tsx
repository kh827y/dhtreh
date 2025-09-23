"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button, Icons, Skeleton } from "@loyalty/ui";
import type { CustomerRecord } from "./data";
import { normalizeGender } from "./data";
import { CustomerFormModal, type CustomerFormPayload } from "./customer-form-modal";

const { Plus, Upload, Edit3, ChevronLeft, ChevronRight, Search } = Icons;

type Filters = {
  login: string;
  name: string;
  email: string;
  tag: string;
};

const initialFilters: Filters = {
  login: "",
  name: "",
  email: "",
  tag: "",
};

const PAGE_SIZE = 8;
const GROUPS = ["Стандарт", "Постоянные", "VIP", "Новые", "Сонные"];

type QuickSearchResult = { customerId: string; phone?: string | null; balance: number } | null;

type CustomersResponse = {
  items: CustomerRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export default function CustomersPage() {
  const router = useRouter();
  const [filters, setFilters] = React.useState<Filters>(initialFilters);
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<CustomersResponse>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [modalState, setModalState] = React.useState<{ mode: "create" | "edit"; customer?: CustomerRecord } | null>(null);
  const [quickPhone, setQuickPhone] = React.useState("");
  const [quickLoading, setQuickLoading] = React.useState(false);
  const [quickResult, setQuickResult] = React.useState<QuickSearchResult>(null);
  const [quickMessage, setQuickMessage] = React.useState("");

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const shownFrom = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const shownTo = data.total === 0 ? 0 : Math.min(data.total, page * PAGE_SIZE);

  const fetchCustomers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (filters.login.trim()) params.set("login", filters.login.trim());
      if (filters.name.trim()) params.set("name", filters.name.trim());
      if (filters.email.trim()) params.set("email", filters.email.trim());
      if (filters.tag.trim()) params.set("tag", filters.tag.trim());
      const res = await fetch(`/api/portal/customers?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Не удалось загрузить клиентов (${res.status})`);
      }
      const json = (await res.json()) as CustomersResponse;
      setData({
        items: (json.items || []).map((item) => ({
          ...item,
          gender: normalizeGender(item.gender),
        })),
        total: json.total,
        page: json.page,
        pageSize: json.pageSize,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [filters.login, filters.name, filters.email, filters.tag, page]);

  React.useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  React.useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function openCreateModal() {
    setModalState({ mode: "create" });
  }

  function openEditModal(customer: CustomerRecord) {
    setModalState({ mode: "edit", customer });
  }

  async function runQuickSearch() {
    const cleaned = quickPhone.replace(/\D+/g, "").trim();
    if (!cleaned) {
      setQuickMessage("Введите телефон клиента");
      setQuickResult(null);
      return;
    }

    setQuickLoading(true);
    setQuickMessage("");
    setQuickResult(null);
    try {
      const response = await fetch(`/api/portal/customer/search?phone=${encodeURIComponent(cleaned)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Ошибка поиска (${response.status})`);
      }
      const json = (await response.json()) as unknown;
      if (!json || typeof json !== "object") {
        setQuickMessage("Клиент не найден");
        return;
      }
      const parsed = json as { customerId?: string; phone?: string | null; balance?: number | string };
      if (!parsed.customerId) {
        setQuickMessage("Клиент не найден");
        return;
      }
      const balanceValue =
        typeof parsed.balance === "number" ? parsed.balance : Number(parsed.balance ?? Number.NaN);
      setQuickResult({
        customerId: parsed.customerId,
        phone: parsed.phone,
        balance: Number.isFinite(balanceValue) ? balanceValue : 0,
      });
    } catch (err) {
      console.error(err);
      setQuickMessage(err instanceof Error ? err.message : "Ошибка поиска");
    } finally {
      setQuickLoading(false);
    }
  }

  function handleQuickSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runQuickSearch();
  }

  async function handleModalSubmit(payload: CustomerFormPayload) {
    if (!modalState) return;
    const body = {
      login: payload.login.trim(),
      password: payload.password.trim() || undefined,
      passwordConfirm: payload.confirmPassword.trim() || undefined,
      email: payload.email.trim(),
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      tags: payload.tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      birthday: payload.birthday || undefined,
      group: payload.group,
      blockAccruals: payload.blockAccruals,
      gender: payload.gender,
      comment: payload.comment.trim(),
    };
    try {
      if (modalState.mode === "create") {
        const res = await fetch(`/api/portal/customers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Не удалось создать клиента");
        }
        setToast("Клиент создан");
      } else if (modalState.mode === "edit" && modalState.customer) {
        const res = await fetch(`/api/portal/customers/${encodeURIComponent(modalState.customer.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Не удалось обновить клиента");
        }
        setToast("Данные клиента обновлены");
      }
      setModalState(null);
      fetchCustomers();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Ошибка сохранения");
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
        <CardHeader title="Быстрый поиск" subtitle="Поиск клиента по номеру телефона" />
        <CardBody>
          <form onSubmit={handleQuickSearch} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(220px, 1fr) auto" }}>
              <input
                placeholder="Телефон клиента"
                value={quickPhone}
                onChange={(event) => {
                  setQuickPhone(event.target.value);
                  setQuickMessage("");
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(15,23,42,0.55)",
                  color: "inherit",
                }}
              />
              <Button type="submit" disabled={!quickPhone.trim() || quickLoading}>
                {quickLoading ? "Поиск…" : "Найти"}
              </Button>
            </div>
            {quickLoading ? (
              <Skeleton height={96} />
            ) : quickResult ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div>
                  <strong>ID клиента:</strong> {quickResult.customerId}
                </div>
                <div>
                  <strong>Телефон:</strong> {quickResult.phone || "—"}
                </div>
                <div>
                  <strong>Баланс:</strong> {quickResult.balance}
                </div>
                <Link
                  href={`/customers/${encodeURIComponent(quickResult.customerId)}`}
                  style={{ color: "#6366f1", fontWeight: 500 }}
                >
                  Открыть карточку клиента →
                </Link>
              </div>
            ) : (
              <div style={{ opacity: 0.7 }}>Введите телефон и нажмите «Найти»</div>
            )}
            {quickMessage && <div style={{ color: "#f87171" }}>{quickMessage}</div>}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Клиенты"
          subtitle="Список участников программы лояльности"
          actions={
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Button onClick={openCreateModal} leftIcon={<Plus size={16} />}>Добавить клиента</Button>
              <Button
                type="button"
                variant="secondary"
                leftIcon={<Upload size={16} />}
                onClick={() => router.push("/customers/import")}
              >
                Импортировать клиентов
              </Button>
            </div>
          }
        />
        <CardBody style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <FilterInput
              placeholder="Логин"
              value={filters.login}
              onChange={(value) => updateFilter("login", value)}
            />
            <FilterInput
              placeholder="Имя"
              value={filters.name}
              onChange={(value) => updateFilter("name", value)}
            />
            <FilterInput
              placeholder="Email"
              value={filters.email}
              onChange={(value) => updateFilter("email", value)}
            />
            <FilterInput
              placeholder="Тег"
              value={filters.tag}
              onChange={(value) => updateFilter("tag", value)}
            />
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>Загрузка...</div>
          ) : error ? (
            <div style={{ padding: 24, textAlign: "center", color: "#f87171" }}>{error}</div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>#</th>
                      <th style={headerCellStyle}>Логин (телефон)</th>
                      <th style={headerCellStyle}>Имя</th>
                      <th style={headerCellStyle}>Электронная почта</th>
                      <th style={headerCellStyle}>Частота визитов</th>
                      <th style={headerCellStyle}>Средний чек</th>
                      <th style={headerCellStyle}>Баланс</th>
                      <th style={headerCellStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      data.items.map((customer, index) => (
                        <tr key={customer.id} style={rowStyle}>
                          <td style={cellStyle}>{shownFrom + index}</td>
                          <td style={cellStyle}>
                            <Link href={`/customers/${customer.id}`} style={linkStyle}>
                              {customer.login || "—"}
                            </Link>
                          </td>
                          <td style={cellStyle}>
                            <Link href={`/customers/${customer.id}`} style={linkStyle}>
                              {formatName(customer) || "—"}
                            </Link>
                          </td>
                          <td style={cellStyle}>{customer.email || "—"}</td>
                          <td style={cellStyle}>{customer.visitFrequency}</td>
                          <td style={cellStyle}>{formatCurrency(customer.averageCheck)}</td>
                          <td style={cellStyle}>{formatPoints(customer.bonusBalance)}</td>
                          <td style={{ ...cellStyle, textAlign: "right" }}>
                            <button type="button" onClick={() => openEditModal(customer)} style={iconButtonStyle}>
                              <Edit3 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ opacity: 0.7, fontSize: 13 }}>Показаны записи {shownFrom}-{shownTo} из {data.total}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    variant="secondary"
                    leftIcon={<ChevronLeft size={16} />}
                    disabled={page <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  >
                    Назад
                  </Button>
                  <Button
                    variant="secondary"
                    rightIcon={<ChevronRight size={16} />}
                    disabled={page >= totalPages}
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  >
                    Вперёд
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {modalState && (
        <CustomerFormModal
          open
          mode={modalState.mode}
          initialValues={modalState.customer ? mapCustomerToForm(modalState.customer) : undefined}
          loginToIgnore={modalState.customer?.login ?? undefined}
          groups={GROUPS}
          onClose={() => setModalState(null)}
          onSubmit={handleModalSubmit}
        />
      )}
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const iconButtonStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  color: "inherit",
  cursor: "pointer",
  padding: 4,
};

const toastStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  background: "rgba(63, 98, 18, 0.3)",
  color: "#bbf7d0",
  border: "1px solid rgba(132, 204, 22, 0.4)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const headerCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  opacity: 0.6,
  borderBottom: "1px solid rgba(148,163,184,0.24)",
};

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  fontSize: 13,
};

const rowStyle: React.CSSProperties = {
  transition: "background 0.2s",
};

const FilterInput: React.FC<{ placeholder: string; value: string; onChange: (value: string) => void }> = ({
  placeholder,
  value,
  onChange,
}) => (
  <label style={{ position: "relative" }}>
    <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }} />
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      style={{
        padding: "8px 12px 8px 30px",
        borderRadius: 12,
        border: "1px solid rgba(148,163,184,0.18)",
        background: "rgba(15,23,42,0.55)",
        color: "inherit",
        minWidth: 160,
      }}
    />
  </label>
);

function formatName(customer: CustomerRecord): string {
  const parts = [customer.firstName, customer.lastName].filter(Boolean);
  return parts.join(" ");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value || 0);
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value || 0);
}

function mapCustomerToForm(customer: CustomerRecord): Partial<CustomerFormPayload> {
  return {
    login: customer.login || "",
    email: customer.email || "",
    firstName: customer.firstName || "",
    lastName: customer.lastName || "",
    tags: (customer.tags || []).join(", "),
    birthday: customer.birthday || "",
    group: customer.group || "Стандарт",
    blockAccruals: customer.blocked,
    gender: customer.gender,
    comment: customer.comment || "",
  };
}
