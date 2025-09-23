"use client";
import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";

type Category = {
  id: string;
  name: string;
  order: number;
  image?: string;
};

const INITIAL_CATEGORIES: Category[] = [
  {
    id: "c-1",
    name: "Пицца",
    order: 1,
    image: "https://images.unsplash.com/photo-1548365328-8b6db7cc1407?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "c-2",
    name: "Десерты",
    order: 2,
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "c-3",
    name: "Напитки",
    order: 3,
    image: "https://images.unsplash.com/photo-1464306076886-da185f07b294?auto=format&fit=crop&w=200&q=60",
  },
];

export default function CategoriesPage() {
  const [categories, setCategories] = React.useState<Category[]>(
    INITIAL_CATEGORIES.sort((a, b) => a.order - b.order)
  );

  const moveCategory = (id: string, direction: -1 | 1) => {
    setCategories((prev) => {
      const index = prev.findIndex((category) => category.id === id);
      if (index === -1) return prev;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, item);
      return copy.map((category, position) => ({ ...category, order: position + 1 }));
    });
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Категории</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Управляйте древовидным каталогом категорий и их порядком.</div>
        </div>
        <a href="/categories/new" style={{ textDecoration: "none" }}>
          <Button variant="primary">Создать категорию</Button>
        </a>
      </div>

      <Card>
        <CardHeader title="Список категорий" subtitle={`Всего: ${categories.length}`} />
        <CardBody>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, textTransform: "uppercase", opacity: 0.65 }}>
                  <th style={{ padding: "12px 8px" }}>Превью</th>
                  <th style={{ padding: "12px 8px" }}>Название категории</th>
                  <th style={{ padding: "12px 8px" }}>Порядок</th>
                  <th style={{ padding: "12px 8px", width: 160 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category, index) => (
                  <tr key={category.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: "12px 8px" }}>
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "rgba(255,255,255,0.05)",
                        }}
                      >
                        {category.image ? (
                          <img
                            src={category.image}
                            alt={category.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", opacity: 0.6 }}>
                            🗂️
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>{category.name}</td>
                    <td style={{ padding: "12px 8px" }}>{category.order}</td>
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button variant="ghost" disabled={index === 0} onClick={() => moveCategory(category.id, -1)}>
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={index === categories.length - 1}
                          onClick={() => moveCategory(category.id, 1)}
                        >
                          ↓
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
