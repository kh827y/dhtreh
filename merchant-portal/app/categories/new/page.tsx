"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";

type CategoryOption = { id: string; name: string };

export default function CategoryCreatePage() {
  const [name, setName] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [code, setCode] = React.useState("");
  const [externalProvider, setExternalProvider] = React.useState("");
  const [externalId, setExternalId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [options, setOptions] = React.useState<CategoryOption[]>([]);

  React.useEffect(() => {
    fetch("/api/portal/catalog/categories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setOptions(
            data.map((cat: any) => ({ id: cat.id, name: cat.name || cat.id })),
          );
        }
      })
      .catch(() => null);
  }, []);

  const submit = async () => {
    if (!name.trim()) {
      setMessage("Заполните название");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const payload: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        parentId: parentId || undefined,
        code: code.trim() || undefined,
        externalProvider: externalProvider.trim() || undefined,
        externalId: externalId.trim() || undefined,
      };
      const res = await fetch("/api/portal/catalog/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage("Категория создана");
      setName("");
      setDescription("");
      setParentId("");
      setCode("");
      setExternalProvider("");
      setExternalId("");
    } catch (e: any) {
      setMessage(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Новая категория</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Сохраняется сразу в каталог</div>
        </div>
        <a href="/categories" style={{ textDecoration: "none" }}>
          <Button variant="secondary">Назад</Button>
        </a>
      </div>

      <Card>
        <CardHeader title="Основное" />
        <CardBody>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Название *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Напитки"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Родитель</span>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              >
                <option value="">Нет</option>
                {options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Код</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="CAT-001"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
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
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Внешний ID</span>
              <input
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="External ID"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Описание</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Опционально"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
          </div>
        </CardBody>
      </Card>

      {message && <div style={{ color: message.includes("создана") ? "#10b981" : "#ef4444" }}>{message}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={() => (window.location.href = "/categories")}>
          Отмена
        </Button>
        <Button variant="primary" disabled={busy} onClick={submit}>
          {busy ? "Сохранение..." : "Создать"}
        </Button>
      </div>
    </div>
  );
}
