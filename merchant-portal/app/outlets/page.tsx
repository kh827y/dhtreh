"use client";
import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton, Badge } from "@loyalty/ui";
import { Store, Plus, Search, ChevronRight, XCircle, Building } from "lucide-react";

type OutletStatus = "WORKING" | "PAUSED";

type Outlet = {
  id: string;
  name: string;
  works?: boolean;
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
    <div className="animate-in" style={{ display: "grid", gap: 24 }}>
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
            <Store size={24} />
          </div>
          <div>
            <h1 style={{ 
              fontSize: 28, 
              fontWeight: 800, 
              margin: 0,
              letterSpacing: "-0.02em",
            }}>
              Торговые точки
            </h1>
            <p style={{ fontSize: 14, color: "var(--fg-muted)", margin: "6px 0 0" }}>
              Управляйте точками продаж и устройствами
            </p>
          </div>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <a href="/outlets/new" style={{ textDecoration: "none" }}>
            <Button variant="primary" leftIcon={<Plus size={16} />}>
              Добавить точку
            </Button>
          </a>
          <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{summary}</div>
        </div>
      </header>

      {/* Filters */}
      <Card>
        <CardBody style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            {/* Status tabs */}
            <div style={{ display: "flex", gap: 6 }}>
              {STATUS_TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "var(--radius-full)",
                      border: "1px solid",
                      borderColor: active ? "rgba(99, 102, 241, 0.5)" : "var(--border-default)",
                      background: active 
                        ? "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.1))"
                        : "transparent",
                      color: active ? "var(--brand-primary-light)" : "var(--fg-secondary)",
                      cursor: "pointer",
                      fontWeight: active ? 600 : 500,
                      fontSize: 13,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            
            {/* Search */}
            <div className="search-wrapper" style={{ flex: 1, minWidth: 200 }}>
              <Search size={16} style={{ color: "var(--fg-muted)" }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по названию..."
                style={{ 
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  color: "var(--fg)",
                  outline: "none",
                  fontSize: 14,
                }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Outlets Grid */}
      <div style={{ display: "grid", gap: 12 }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardBody style={{ padding: 20 }}>
                <div style={{ display: "flex", gap: 16 }}>
                  <Skeleton height={48} style={{ width: 48, borderRadius: "var(--radius-md)" }} />
                  <div style={{ flex: 1 }}>
                    <Skeleton height={20} style={{ width: "40%", marginBottom: 8 }} />
                    <Skeleton height={14} style={{ width: "60%" }} />
                  </div>
                </div>
              </CardBody>
            </Card>
          ))
        ) : items.length ? (
          items.map((outlet, index) => (
            <a 
              key={outlet.id} 
              href={`/outlets/${encodeURIComponent(outlet.id)}`} 
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Card 
                hover
                className="animate-in"
                style={{ 
                  animationDelay: `${index * 0.05}s`,
                  borderColor: outlet.works ? "rgba(16, 185, 129, 0.2)" : undefined,
                }}
              >
                <CardBody style={{ padding: 0 }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: 20,
                  }}>
                    {/* Icon */}
                    <div className="list-item-icon" style={{
                      background: outlet.works 
                        ? "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(52, 211, 153, 0.1))"
                        : undefined,
                      color: outlet.works ? "var(--success-light)" : undefined,
                    }}>
                      <Building size={24} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <h3 style={{ 
                          fontSize: 17, 
                          fontWeight: 600, 
                          margin: 0,
                          color: "var(--fg)",
                        }}>
                          {outlet.name}
                        </h3>
                      </div>
                      
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg-muted)" }}>
                        <Badge variant={outlet.works ? "success" : "default"} dot>
                          {statusLabel(outlet.works)}
                        </Badge>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="nav-arrow">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                </CardBody>
              </Card>
            </a>
          ))
        ) : (
          <Card>
            <CardBody style={{ padding: 48 }}>
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center", 
                gap: 16,
                textAlign: "center",
              }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: "var(--radius-lg)",
                  background: "rgba(255, 255, 255, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--fg-dim)",
                }}>
                  <Store size={28} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    Точки не найдены
                  </div>
                  <div style={{ fontSize: 14, color: "var(--fg-muted)" }}>
                    Попробуйте изменить параметры поиска
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
        
        {error && !loading && (
          <div style={{ 
            padding: 16, 
            borderRadius: "var(--radius-md)", 
            border: "1px solid rgba(239, 68, 68, 0.3)",
            background: "rgba(239, 68, 68, 0.1)",
            color: "var(--danger-light)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            <XCircle size={18} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
