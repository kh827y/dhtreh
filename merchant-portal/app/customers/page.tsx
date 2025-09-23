"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CustomerFormModal from "./customer-form-modal";
import type { Customer, CustomerStatus, CustomerTag } from "./data";
import { mockCustomers, statusLabels, tagLabels } from "./data";

const statusFilters: Array<{ value: "ALL" | CustomerStatus; label: string }> = [
  { value: "ALL", label: "Все статусы" },
  { value: "ACTIVE", label: statusLabels.ACTIVE },
  { value: "INACTIVE", label: statusLabels.INACTIVE },
  { value: "BLOCKED", label: statusLabels.BLOCKED },
];

const tagFilters = Object.entries(tagLabels).map(([value, label]) => ({ value, label }));

export default function CustomersPage() {
  const [customers, setCustomers] = React.useState<Customer[]>(mockCustomers);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"ALL" | CustomerStatus>("ALL");
  const [tag, setTag] = React.useState<string>("ALL");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | undefined>(undefined);
  const [toast, setToast] = React.useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (status !== "ALL" && customer.status !== status) return false;
      if (tag !== "ALL" && !customer.tags.includes(tag as CustomerTag)) return false;
      if (term) {
        const haystack = `${customer.name} ${customer.phone} ${customer.email ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [customers, search, status, tag]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  React.useEffect(() => {
    const editId = searchParams?.get("edit");
    if (!editId) return;
    const existing = customers.find((customer) => customer.id === editId);
    if (existing) {
      setEditing(existing);
      setShowModal(true);
    }
  }, [customers, searchParams]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filtered.map((customer) => customer.id)));
  };

  const handleCreate = () => {
    setEditing(undefined);
    setShowModal(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditing(customer);
    setShowModal(true);
  };

  const handleSubmit = (payload: Partial<Customer>) => {
    setCustomers((prev) => {
      if (editing) {
        return prev.map((customer) =>
          customer.id === editing.id
            ? { ...customer, ...payload, id: editing.id, tags: payload.tags ?? customer.tags }
            : customer,
        );
      }
      const created: Customer = {
        id: `cust-${Date.now()}`,
        name: payload.name ?? "Новый клиент",
        phone: payload.phone ?? "",
        status: payload.status ?? "ACTIVE",
        totalPurchases: 0,
        totalAmount: 0,
        balance: 0,
        visits: 0,
        tags: payload.tags ?? [],
        email: payload.email,
        birthday: payload.birthday,
        level: payload.level,
      };
      return [created, ...prev];
    });
    setToast(editing ? "Данные клиента обновлены" : "Клиент добавлен");
  };

  const handleExport = () => {
    setToast("Экспорт клиентов запущен (демо)");
  };

  const handleTagAssign = (tagValue: CustomerTag) => {
    if (selectedIds.size === 0) return;
    setCustomers((prev) =>
      prev.map((customer) =>
        selectedIds.has(customer.id)
          ? { ...customer, tags: Array.from(new Set([...customer.tags, tagValue])) as CustomerTag[] }
          : customer,
      ),
    );
    setToast("Тег применён к выбранным клиентам");
    setSelectedIds(new Set());
  };

  const handleBlockSelected = (blocked: boolean) => {
    if (selectedIds.size === 0) return;
    setCustomers((prev) =>
      prev.map((customer) =>
        selectedIds.has(customer.id)
          ? { ...customer, status: blocked ? "BLOCKED" : "ACTIVE" }
          : customer,
      ),
    );
    setToast(blocked ? "Клиенты заблокированы" : "Статус клиентов восстановлен");
    setSelectedIds(new Set());
  };

  const allSelected = filtered.length > 0 && filtered.every((customer) => selectedIds.has(customer.id));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Клиенты</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>
            Управляйте аудиторией, сегментами и карточками клиентов
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/customers/import" className="btn btn-ghost">
            Импортировать
          </Link>
          <Button variant="secondary" onClick={handleExport}>
            Экспорт
          </Button>
          <Button variant="primary" onClick={handleCreate}>
            Добавить клиента
          </Button>
        </div>
      </div>

      {toast && (
        <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(37,211,102,0.25)" }}>
          {toast}
        </div>
      )}

      <Card>
        <CardHeader title="Фильтры" subtitle={`Показано: ${filtered.length}`} />
        <CardBody>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Поиск</span>
              <input
                type="search"
                placeholder="Имя, телефон или e-mail"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Статус</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
              >
                {statusFilters.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Тег</span>
              <select
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
              >
                <option value="ALL">Все теги</option>
                {tagFilters.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </CardBody>
      </Card>

      {selectedIds.size > 0 && (
        <Card style={{ border: "1px solid rgba(37,211,102,0.3)" }}>
          <CardBody style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600 }}>Выбрано клиентов: {selectedIds.size}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Массовые действия применяются ко всем выбранным строкам.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => handleTagAssign("vip")}>Назначить тег «VIP»</Button>
              <Button variant="secondary" onClick={() => handleBlockSelected(true)}>Заблокировать</Button>
              <Button variant="ghost" onClick={() => handleBlockSelected(false)}>Снять блокировку</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Список клиентов" />
        <CardBody>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, textTransform: "uppercase", opacity: 0.65 }}>
                  <th style={{ padding: "12px 8px" }}>
                    <input type="checkbox" checked={allSelected} onChange={(event) => toggleSelectAll(event.target.checked)} />
                  </th>
                  <th style={{ padding: "12px 8px" }}>Имя</th>
                  <th style={{ padding: "12px 8px" }}>Телефон</th>
                  <th style={{ padding: "12px 8px" }}>Покупок</th>
                  <th style={{ padding: "12px 8px" }}>Баллов</th>
                  <th style={{ padding: "12px 8px" }}>Уровень</th>
                  <th style={{ padding: "12px 8px" }}>Теги</th>
                  <th style={{ padding: "12px 8px" }}>Последний визит</th>
                  <th style={{ padding: "12px 8px", width: 120 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr
                    key={customer.id}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      background: selectedIds.has(customer.id) ? "rgba(37,211,102,0.12)" : undefined,
                    }}
                  >
                    <td style={{ padding: "12px 8px" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={() => toggleSelect(customer.id)}
                      />
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <Link href={`/customers/${customer.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontWeight: 600 }}>{customer.name}</span>
                          <span style={{ fontSize: 12, opacity: 0.7 }}>{statusLabels[customer.status]}</span>
                        </div>
                      </Link>
                    </td>
                    <td style={{ padding: "12px 8px" }}>{customer.phone}</td>
                    <td style={{ padding: "12px 8px" }}>{customer.totalPurchases}</td>
                    <td style={{ padding: "12px 8px" }}>{customer.balance}</td>
                    <td style={{ padding: "12px 8px" }}>{customer.level ?? "—"}</td>
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {customer.tags.length ? customer.tags.map((customerTag) => (
                          <span
                            key={customerTag}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "rgba(37,211,102,0.15)",
                              fontSize: 12,
                            }}
                          >
                            {tagLabels[customerTag]}
                          </span>
                        )) : <span style={{ opacity: 0.6 }}>—</span>}
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {customer.lastVisit ? new Date(customer.lastVisit).toLocaleString("ru-RU") : "—"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="btn btn-ghost" onClick={() => handleEdit(customer)}>
                          Редактировать
                        </button>
                        <Link href={`/customers/${customer.id}`} className="btn btn-ghost">
                          Профиль
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: "36px 0", textAlign: "center", opacity: 0.7 }}>
              Клиенты по заданным фильтрам не найдены
            </div>
          )}
        </CardBody>
      </Card>

      <CustomerFormModal
        open={showModal}
        initial={editing}
        onClose={() => {
          setShowModal(false);
          setEditing(undefined);
          router.replace("/customers");
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
