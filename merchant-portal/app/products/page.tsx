"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Badge, Skeleton } from "@loyalty/ui";
import { 
  ShoppingBag, 
  Plus, 
  Search, 
  Filter, 
  Package, 
  Tag, 
  Barcode, 
  Server, 
  Gift, 
  Eye, 
  EyeOff 
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  code?: string | null;
  barcode?: string | null;
  unit?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  visible: boolean;
  accruePoints: boolean;
  allowRedeem: boolean;
  externalProvider?: string | null;
  externalId?: string | null;
};

type Category = { id: string; name: string };

export default function ProductsPage() {
  const [items, setItems] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"all" | "visible" | "hidden">("all");
  const [points, setPoints] = React.useState<"all" | "with" | "without">("all");
  const [categoryId, setCategoryId] = React.useState("");
  const [externalProvider, setExternalProvider] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (status !== "all") qs.set("status", status);
      if (points === "with") qs.set("points", "with_points");
      if (points === "without") qs.set("points", "without_points");
      if (categoryId) qs.set("categoryId", categoryId);
      if (externalProvider.trim()) qs.set("externalProvider", externalProvider.trim());
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(`/api/portal/catalog/products${qs.toString() ? `?${qs.toString()}` : ""}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [status, points, categoryId, externalProvider, search]);

  React.useEffect(() => {
    fetch("/api/portal/catalog/categories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCategories(data.map((cat: any) => ({ id: cat.id, name: cat.name || cat.id })));
        }
      })
      .catch(() => null);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filteredCount = items.length;

  return (
    <div className="animate-in" style={{ display: "grid", gap: 24 }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
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
          <ShoppingBag size={24} />
        </div>
        <div>
          <h1 style={{ 
            fontSize: 28, 
            fontWeight: 800, 
            margin: 0,
            letterSpacing: "-0.02em",
          }}>
            Товары
          </h1>
          <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              Найдено: <strong style={{ color: "var(--fg)" }}>{filteredCount}</strong>
            </span>
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
           <a href="/products/new" style={{ textDecoration: "none" }}>
             <Button variant="primary" leftIcon={<Plus size={16} />}>Добавить товар</Button>
           </a>
        </div>
      </header>

      {/* Filters */}
      <Card>
        <CardBody style={{ padding: 20 }}>
          <div className="filter-grid">
            <div className="filter-block" style={{ flex: 1, minWidth: 240 }}>
               <span className="filter-label">Поиск (название, SKU, код)</span>
               <div style={{ position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-muted)" }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск..."
                    className="input"
                    style={{ paddingLeft: 38, width: "100%" }}
                  />
               </div>
            </div>
            <div className="filter-block">
               <span className="filter-label">Статус</span>
               <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="input"
                style={{ minWidth: 140 }}
              >
                <option value="all">Все</option>
                <option value="visible">Видимые</option>
                <option value="hidden">Скрытые</option>
              </select>
            </div>
            <div className="filter-block">
               <span className="filter-label">Баллы</span>
               <select
                value={points}
                onChange={(e) => setPoints(e.target.value as any)}
                className="input"
                style={{ minWidth: 160 }}
              >
                <option value="all">Все</option>
                <option value="with">Начисляют</option>
                <option value="without">Не начисляют</option>
              </select>
            </div>
            <div className="filter-block">
               <span className="filter-label">Категория</span>
               <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="input"
                style={{ minWidth: 180 }}
              >
                <option value="">Все категории</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-block">
               <span className="filter-label">Внешняя система</span>
               <input
                value={externalProvider}
                onChange={(e) => setExternalProvider(e.target.value)}
                placeholder="iiko / r_keeper"
                className="input"
                style={{ width: 160 }}
              />
            </div>
            <div style={{ paddingBottom: 2 }}>
              <Button variant="secondary" onClick={load} disabled={loading}>
                {loading ? "Обновляем..." : "Обновить"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {error && (
        <div style={{ padding: 16, borderRadius: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {/* List */}
      <Card>
        <CardHeader title="Каталог" />
        <CardBody style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 20 }}><Skeleton height={200} /></div>
          ) : (
            <div className="data-list">
              <div className="list-row products-grid" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="cell-label">ТОВАР</div>
                <div className="cell-label">КАТЕГОРИЯ</div>
                <div className="cell-label">КОДЫ</div>
                <div className="cell-label">ВНЕШНЯЯ СИСТЕМА</div>
                <div className="cell-label">БАЛЛЫ</div>
                <div className="cell-label">СТАТУС</div>
              </div>
              {items.map((product) => (
                <div key={product.id} className="list-row products-grid">
                  <div style={{ fontWeight: 600, color: "var(--fg)" }}>{product.name}</div>
                  <div style={{ fontSize: 13, color: "var(--fg-secondary)" }}>
                    {product.categoryName ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Tag size={14} className="text-muted" />
                        {product.categoryName}
                      </div>
                    ) : "—"}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {product.sku && <Badge variant="outline" className="text-xs">SKU {product.sku}</Badge>}
                    {product.code && <Badge variant="outline" className="text-xs">{product.code}</Badge>}
                    {product.barcode && <Badge variant="outline" className="text-xs"><Barcode size={12} style={{ marginRight: 4 }}/>{product.barcode}</Badge>}
                    {!product.sku && !product.code && !product.barcode && <span className="text-muted text-sm">—</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--fg-secondary)" }}>
                    {product.externalProvider || product.externalId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Server size={14} className="text-muted" />
                        <span>{product.externalProvider || "External"}</span>
                        {product.externalId && <span className="text-muted" style={{ fontSize: 11 }}>#{product.externalId}</span>}
                      </div>
                    ) : "—"}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {product.accruePoints ? (
                      <Badge variant="success" dot>Начисление</Badge>
                    ) : (
                      <Badge variant="secondary" className="opacity-50">Нет</Badge>
                    )}
                    {product.allowRedeem ? (
                      <Badge variant="primary" dot>Списание</Badge>
                    ) : (
                      <Badge variant="secondary" className="opacity-50">Нет</Badge>
                    )}
                  </div>
                  <div>
                    {product.visible ? (
                      <Badge variant="success" className="gap-1"><Eye size={12}/> Виден</Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 opacity-70"><EyeOff size={12}/> Скрыт</Badge>
                    )}
                  </div>
                </div>
              ))}
              {!items.length && (
                <div style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>
                  <Package size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <div>Товары не найдены</div>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
