"use client";
import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";

type OutletStatus = "WORKING" | "PAUSED";

type Outlet = {
  id: string;
  name: string;
  status: OutletStatus;
  city: string;
  street: string;
  house: string;
  description?: string;
};

const OUTLETS: Outlet[] = [
  {
    id: "o-1",
    name: "Тили-Тесто, Московской 56",
    status: "WORKING",
    city: "Новосибирск",
    street: "Московская",
    house: "56",
    description: "Вход со стороны двора, рядом парковка",
  },
  {
    id: "o-2",
    name: "Тили-Тесто, Ленина 12",
    status: "WORKING",
    city: "Новосибирск",
    street: "Ленина",
    house: "12",
    description: "На первой линии, 2 этаж",
  },
  {
    id: "o-3",
    name: "Даркстор, Берёзовая 3",
    status: "PAUSED",
    city: "Новосибирск",
    street: "Берёзовая",
    house: "3",
    description: "Склад с выдачей курьерам",
  },
];

const STATUS_TABS: { id: OutletStatus | "ALL"; label: string }[] = [
  { id: "WORKING", label: "Работают" },
  { id: "PAUSED", label: "Не работают" },
];

export default function OutletsPage() {
  const [activeTab, setActiveTab] = React.useState<OutletStatus | "ALL">("WORKING");
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return OUTLETS.filter((outlet) => {
      if (activeTab !== "ALL" && outlet.status !== activeTab) return false;
      if (!term) return true;
      const haystack = `${outlet.name} ${outlet.city} ${outlet.street} ${outlet.house}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [activeTab, search]);

  const highlight = (value: OutletStatus) => (value === "WORKING" ? "Работает" : "Не работает");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Торговые точки</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Следите за статусом точек, редактируйте и подключайте интеграции.</div>
        </div>
        <a href="/outlets/new" style={{ textDecoration: "none" }}>
          <Button variant="primary">Добавить торговую точку</Button>
        </a>
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
        {filtered.map((outlet) => (
          <div
            key={outlet.id}
            role="button"
            tabIndex={0}
            onClick={() => window.alert(`Переход в профиль точки ${outlet.name}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                window.alert(`Переход в профиль точки ${outlet.name}`);
              }
            }}
            className="glass"
            style={{
              padding: 20,
              borderRadius: 14,
              display: "grid",
              gap: 8,
              cursor: "pointer",
              border: outlet.status === "WORKING" ? "1px solid rgba(37,211,102,0.25)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{outlet.name}</div>
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: outlet.status === "WORKING" ? "rgba(37,211,102,0.15)" : "rgba(255,255,255,0.1)",
                  color: outlet.status === "WORKING" ? "#4ade80" : "rgba(255,255,255,0.7)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {highlight(outlet.status)}
              </div>
            </div>
            <div style={{ opacity: 0.8 }}>
              {outlet.city}, {outlet.street}, {outlet.house}
            </div>
            {outlet.description && <div style={{ opacity: 0.65, fontSize: 13 }}>{outlet.description}</div>}
          </div>
        ))}
        {!filtered.length && (
          <div className="glass" style={{ padding: 28, borderRadius: 14, textAlign: "center", opacity: 0.75 }}>
            По заданным условиям точки не найдены.
          </div>
        )}
      </div>
    </div>
  );
}
