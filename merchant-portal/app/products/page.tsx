"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";

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
  const pill = (text: string, bg: string) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: bg,
        color: "#0f172a",
        lineHeight: 1,
      }}
    >
      {text}
    </span>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Товары</h1>
          <div style={{ opacity: 0.7, fontSize: 14 }}>Реальный каталог: без моков и заглушек.</div>
        </div>
        <a href="/products/new" style={{ textDecoration: "none" }}>
          <Button variant="primary">Добавить товар</Button>
        </a>
      </div>

      <Card>
        <CardHeader title="Фильтры" subtitle={loading ? "Загрузка..." : `Найдено: ${filteredCount}`} />
        <CardBody>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Поиск (название, SKU, код, внешний ID)</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск..."
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Статус</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              >
                <option value="all">Все</option>
                <option value="visible">Видимые</option>
                <option value="hidden">Скрытые</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Начисление баллов</span>
              <select
                value={points}
                onChange={(e) => setPoints(e.target.value as any)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              >
                <option value="all">Все</option>
                <option value="with">Начисляют</option>
                <option value="without">Не начисляют</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Категория</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              >
                <option value="">Все</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Внешний провайдер</span>
              <input
                value={externalProvider}
                onChange={(e) => setExternalProvider(e.target.value)}
                placeholder="iiko / MoySklad / r_keeper"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={load} disabled={loading}>
                {loading ? "Обновляем..." : "Обновить"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {error && (
        <Card>
          <CardBody>
            <div style={{ color: "#ef4444" }}>{error}</div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Каталог" />
        <CardBody>
          {loading ? (
            <div>Загрузка...</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Товар</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Категория</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Коды</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Внешняя система</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Баллы</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((product) => (
                    <tr key={product.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "8px 6px", fontWeight: 600 }}>{product.name}</td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>{product.categoryName || "—"}</td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {product.sku && pill(`SKU ${product.sku}`, "rgba(59,130,246,0.25)")}
                          {product.code && pill(`Код ${product.code}`, "rgba(148,163,184,0.3)")}
                          {product.barcode && pill(`Штрихкод ${product.barcode}`, "rgba(148,163,184,0.3)")}
                        </div>
                      </td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                        {product.externalProvider || product.externalId ? (
                          <div style={{ display: "grid", gap: 2 }}>
                            <span>{product.externalProvider || "—"}</span>
                            <span style={{ opacity: 0.8, fontSize: 12 }}>{product.externalId || ""}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {product.accruePoints
                            ? pill("Начисление", "rgba(52,211,153,0.3)")
                            : pill("Без начисления", "rgba(148,163,184,0.3)")}
                          {product.allowRedeem
                            ? pill("Можно списывать", "rgba(56,189,248,0.25)")
                            : pill("Запрет списания", "rgba(148,163,184,0.3)")}
                        </div>
                      </td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                        {product.visible
                          ? pill("Виден", "rgba(52,211,153,0.3)")
                          : pill("Скрыт", "rgba(148,163,184,0.3)")}
                      </td>
                    </tr>
                  ))}
                  {!items.length && (
                    <tr>
                      <td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>
                        Нет товаров
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
