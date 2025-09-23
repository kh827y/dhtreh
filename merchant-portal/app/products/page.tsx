"use client";
import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";

type Product = {
  id: string;
  name: string;
  category: string;
  image?: string;
  visible: boolean;
  accruePoints: boolean;
  allowRedeem: boolean;
  purchasesMonth: number;
  purchasesTotal: number;
  sku?: string;
};

const MOCK_PRODUCTS: Product[] = [
  {
    id: "p-1",
    name: "Маргарита",
    category: "Пицца",
    image: "https://images.unsplash.com/photo-1548365328-8b6db7cc1407?auto=format&fit=crop&w=200&q=60",
    visible: true,
    accruePoints: true,
    allowRedeem: true,
    purchasesMonth: 128,
    purchasesTotal: 1450,
    sku: "PZ-001",
  },
  {
    id: "p-2",
    name: "Чизкейк Нью-Йорк",
    category: "Десерты",
    image: "https://images.unsplash.com/photo-1542327897-37fa1ff59b4c?auto=format&fit=crop&w=200&q=60",
    visible: true,
    accruePoints: true,
    allowRedeem: false,
    purchasesMonth: 82,
    purchasesTotal: 820,
    sku: "DS-104",
  },
  {
    id: "p-3",
    name: "Салат Цезарь",
    category: "Салаты",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=200&q=60",
    visible: false,
    accruePoints: false,
    allowRedeem: false,
    purchasesMonth: 24,
    purchasesTotal: 460,
    sku: "SL-210",
  },
  {
    id: "p-4",
    name: "Лимонад ягодный",
    category: "Напитки",
    image: "https://images.unsplash.com/photo-1464306076886-da185f07b294?auto=format&fit=crop&w=200&q=60",
    visible: true,
    accruePoints: true,
    allowRedeem: true,
    purchasesMonth: 65,
    purchasesTotal: 540,
    sku: "DR-330",
  },
];

type StatusFilter = "ALL" | "VISIBLE" | "HIDDEN";
type PointsFilter = "ALL" | "WITH" | "WITHOUT";

export default function ProductsPage() {
  const [products, setProducts] = React.useState<Product[]>(MOCK_PRODUCTS);
  const [categoryFilter, setCategoryFilter] = React.useState<string>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [pointsFilter, setPointsFilter] = React.useState<PointsFilter>("ALL");
  const [search, setSearch] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [message, setMessage] = React.useState<string>("");

  const categories = React.useMemo(() => {
    const unique = new Set<string>();
    products.forEach((p) => unique.add(p.category));
    return Array.from(unique).sort();
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryFilter !== "ALL" && product.category !== categoryFilter) return false;
      if (statusFilter === "VISIBLE" && !product.visible) return false;
      if (statusFilter === "HIDDEN" && product.visible) return false;
      if (pointsFilter === "WITH" && !product.accruePoints) return false;
      if (pointsFilter === "WITHOUT" && product.accruePoints) return false;
      if (term) {
        const haystack = `${product.name} ${product.sku ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [products, categoryFilter, statusFilter, pointsFilter, search]);

  const hasSelection = selectedIds.size > 0;

  const toggleSelection = (id: string) => {
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
    setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
  };

  const applyBulkUpdate = (updater: (product: Product) => Product) => {
    setProducts((prev) => prev.map((product) => (selectedIds.has(product.id) ? updater(product) : product)));
    setMessage("Изменения сохранены для выбранных товаров.");
  };

  const handleBulkVisibility = (visible: boolean) => {
    applyBulkUpdate((product) => ({ ...product, visible }));
  };

  const handleBulkRedeem = (allowRedeem: boolean) => {
    applyBulkUpdate((product) => ({ ...product, allowRedeem }));
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`Удалить выбранные товары (${selectedIds.size})?`)) return;
    setProducts((prev) => prev.filter((product) => !selectedIds.has(product.id)));
    setSelectedIds(new Set());
    setMessage("Выбранные товары удалены.");
  };

  React.useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  React.useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      filteredProducts.forEach((product) => {
        if (prev.has(product.id)) next.add(product.id);
      });
      return next;
    });
  }, [filteredProducts]);

  const allSelected = filteredProducts.length > 0 && filteredProducts.every((product) => selectedIds.has(product.id));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Товары</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Управляйте каталогом, фильтрами и массовыми действиями.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/products/new" style={{ textDecoration: "none" }}>
            <Button variant="primary">Добавить товар</Button>
          </a>
        </div>
      </div>

      <Card>
        <CardHeader title="Фильтры" subtitle={`Найдено: ${filteredProducts.length} товаров`} />
        <CardBody>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              alignItems: "center",
            }}
          >
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Категория</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.2)", color: "inherit" }}
              >
                <option value="ALL">Все категории</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Статус</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.2)", color: "inherit" }}
              >
                <option value="ALL">Все товары</option>
                <option value="VISIBLE">Отображаются в каталоге</option>
                <option value="HIDDEN">Не отображаются в каталоге</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Правила баллов</span>
              <select
                value={pointsFilter}
                onChange={(event) => setPointsFilter(event.target.value as PointsFilter)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.2)", color: "inherit" }}
              >
                <option value="ALL">Все</option>
                <option value="WITH">С начислением баллов</option>
                <option value="WITHOUT">Без начисления баллов</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Поиск</span>
              <input
                type="search"
                placeholder="Название или артикул"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.2)", color: "inherit" }}
              />
            </label>
          </div>
        </CardBody>
      </Card>

      {hasSelection && (
        <Card style={{ border: "1px solid rgba(37, 211, 102, 0.35)" }}>
          <CardBody style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600 }}>Выбрано товаров: {selectedIds.size}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Выберите действие для применения.</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button variant="secondary" onClick={() => handleBulkVisibility(true)}>
                Показать в каталоге
              </Button>
              <Button variant="secondary" onClick={() => handleBulkVisibility(false)}>
                Скрыть в каталоге
              </Button>
              <Button variant="secondary" onClick={() => handleBulkRedeem(true)}>
                Разрешить оплату баллами
              </Button>
              <Button variant="secondary" onClick={() => handleBulkRedeem(false)}>
                Запретить оплату баллами
              </Button>
              <Button variant="ghost" onClick={handleBulkDelete}>
                Удалить
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {message && (
        <div
          className="glass"
          style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(37, 211, 102, 0.2)", background: "rgba(37,211,102,0.1)" }}
        >
          {message}
        </div>
      )}

      <Card>
        <CardHeader title="Каталог товаров" />
        <CardBody>
          {filteredProducts.length === 0 ? (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                gap: 16,
                padding: "48px 0",
                textAlign: "center",
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, rgba(37,211,102,0.35), rgba(37,211,102,0.15))",
                  display: "grid",
                  placeItems: "center",
                  color: "rgba(37,211,102,0.85)",
                  fontSize: 32,
                  fontWeight: 600,
                }}
              >
                🛒
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>Товары не найдены</div>
                <div style={{ opacity: 0.7 }}>Измените фильтры или добавьте первый товар.</div>
              </div>
              <a href="/products/new" style={{ textDecoration: "none" }}>
                <Button variant="primary">Добавить товар</Button>
              </a>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 840 }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: 12, textTransform: "uppercase", opacity: 0.65 }}>
                    <th style={{ padding: "12px 8px" }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) => toggleSelectAll(event.target.checked)}
                      />
                    </th>
                    <th style={{ padding: "12px 8px" }}>Превью</th>
                    <th style={{ padding: "12px 8px" }}>Название</th>
                    <th style={{ padding: "12px 8px" }}>Категория</th>
                    <th style={{ padding: "12px 8px" }}>Покупок за месяц</th>
                    <th style={{ padding: "12px 8px" }}>Покупок всего</th>
                    <th style={{ padding: "12px 8px" }}>Артикул</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr
                      key={product.id}
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        background: selectedIds.has(product.id) ? "rgba(37,211,102,0.1)" : undefined,
                      }}
                    >
                      <td style={{ padding: "12px 8px" }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelection(product.id)}
                        />
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 12,
                            overflow: "hidden",
                            background: "rgba(255,255,255,0.05)",
                          }}
                        >
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "grid",
                                placeItems: "center",
                                fontSize: 20,
                                opacity: 0.6,
                              }}
                            >
                              📦
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px", fontWeight: 600 }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <span>{product.name}</span>
                          <span style={{ fontSize: 12, opacity: 0.6 }}>
                            {product.visible ? "Отображается" : "Скрыт"} ·
                            {" "}
                            {product.accruePoints ? "Начисляет баллы" : "Без баллов"}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px" }}>{product.category}</td>
                      <td style={{ padding: "12px 8px" }}>{product.purchasesMonth}</td>
                      <td style={{ padding: "12px 8px" }}>{product.purchasesTotal}</td>
                      <td style={{ padding: "12px 8px" }}>{product.sku || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
