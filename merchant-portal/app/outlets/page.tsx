"use client";
import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";

type OutletStatus = "WORKING" | "PAUSED";

type Outlet = {
  id: string;
  name: string;
  address?: string | null;
  description?: string | null;
  phone?: string | null;
  works?: boolean;
  hidden?: boolean;
};

const STATUS_TABS: { id: OutletStatus | "ALL"; label: string }[] = [
  { id: "WORKING", label: "Работают" },
  { id: "PAUSED", label: "Не работают" },
];

export default function OutletsPage() {
  const [activeTab, setActiveTab] = React.useState<OutletStatus | "ALL">("WORKING");
  const [search, setSearch] = React.useState("");
  const [items, setItems] = React.useState<Outlet[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [total, setTotal] = React.useState(0);

  const statusLabel = (works?: boolean) => (works ? "Работает" : "Не работает");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (activeTab === "WORKING") qs.set("status", "active");
      if (activeTab === "PAUSED") qs.set("status", "inactive");
      const trimmed = search.trim();
      if (trimmed) qs.set("search", trimmed);
      const path = qs.toString() ? `/api/portal/outlets?${qs.toString()}` : "/api/portal/outlets";
      const res = await fetch(path);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const list: Outlet[] = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : [];
      setItems(list);
      setTotal(Number(data?.total) || list.length);
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось загрузить торговые точки"));
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(timeout);
  }, [load]);

  const summary = React.useMemo(() => {
    if (loading) return "Показано: —";
    return `Показано: ${items.length} из ${total}`;
  }, [items.length, loading, total]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Торговые точки</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Следите за статусом точек, редактируйте и подключайте интеграции.</div>
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          <a href="/outlets/new" style={{ textDecoration: "none" }}>
            <Button variant="primary">Добавить торговую точку</Button>
          </a>
          <div style={{ fontSize: 13, opacity: 0.75 }}>{summary}</div>
        </div>
      </div>

      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`btn ${activeTab === tab.id ? "btn-primary" : "btn-ghost"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Поиск по названию</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Например, Тили-Тесто"
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
            />
          </div>
        </CardBody>
      </Card>

      <div style={{ display: "grid", gap: 12 }}>
        {loading ? (
          <Card>
            <CardBody>
              <Skeleton height={120} />
            </CardBody>
          </Card>
        ) : items.length ? (
          items.map((outlet) => (
            <a key={outlet.id} href={`/outlets/${encodeURIComponent(outlet.id)}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div
                className="glass"
                style={{
                  padding: 20,
                  borderRadius: 14,
                  display: "grid",
                  gap: 8,
                  cursor: "pointer",
                  border: outlet.works ? "1px solid rgba(37,211,102,0.25)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600, fontSize: 18 }}>{outlet.name}</div>
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: outlet.works ? "rgba(37,211,102,0.15)" : "rgba(255,255,255,0.1)",
                      color: outlet.works ? "#4ade80" : "rgba(255,255,255,0.7)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {statusLabel(outlet.works)}
                  </div>
                </div>
                <div style={{ opacity: 0.8 }}>
                  {outlet.address || "Адрес не указан"}
                </div>
                {outlet.description ? (
                  <div style={{ opacity: 0.65, fontSize: 13 }}>{outlet.description}</div>
                ) : null}
                {outlet.phone ? (
                  <div style={{ opacity: 0.65, fontSize: 12 }}>Телефон: {outlet.phone}</div>
                ) : null}
              </div>
            </a>
          ))
        ) : (
          <div className="glass" style={{ padding: 28, borderRadius: 14, textAlign: "center", opacity: 0.75 }}>
            По заданным условиям точки не найдены.
          </div>
        )}
        {error && !loading ? (
          <div style={{ color: "#f87171" }}>{error}</div>
        ) : null}
      </div>
    </div>
  );
}
