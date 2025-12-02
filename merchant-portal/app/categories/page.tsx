"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";

type Category = {
  id: string;
  name: string;
  code?: string | null;
  externalProvider?: string | null;
  externalId?: string | null;
  parentId?: string | null;
  order: number;
};

export default function CategoriesPage() {
  const [items, setItems] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/catalog/categories");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((cat) => {
      const haystack = `${cat.name} ${cat.code ?? ""} ${cat.externalId ?? ""} ${cat.externalProvider ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [items, search]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить категорию?")) return;
    try {
      const res = await fetch(`/api/portal/catalog/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Категории</h1>
          <div style={{ opacity: 0.7, fontSize: 14 }}>Данные из реального каталога без моков.</div>
        </div>
        <a href="/categories/new" style={{ textDecoration: "none" }}>
          <Button variant="primary">Добавить категорию</Button>
        </a>
      </div>

      <Card>
        <CardHeader
          title="Фильтр"
          subtitle={loading ? "Загрузка..." : `Найдено: ${filtered.length}`}
        />
        <CardBody>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Поиск (название, код, внешний ID)</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Например, кофе"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? "Обновляем..." : "Обновить"}
            </Button>
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
        <CardHeader title="Список категорий" />
        <CardBody>
          {loading ? (
            <div>Загрузка...</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Название</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Код</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Внешняя система</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Внешний ID</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Родитель</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Порядок</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((cat) => (
                    <tr key={cat.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "8px 6px" }}>{cat.name}</td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>{cat.code || "—"}</td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>{cat.externalProvider || "—"}</td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>{cat.externalId || "—"}</td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                        {cat.parentId ? items.find((p) => p.id === cat.parentId)?.name || cat.parentId : "—"}
                      </td>
                      <td style={{ padding: "8px 6px", opacity: 0.9 }}>{cat.order}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        <button
                          onClick={() => handleDelete(cat.id)}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(239,68,68,0.4)",
                            color: "#ef4444",
                            padding: "6px 10px",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7} style={{ padding: 12, opacity: 0.7 }}>
                        Нет категорий
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
