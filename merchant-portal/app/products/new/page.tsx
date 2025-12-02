"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";

type Category = { id: string; name: string };

export default function ProductCreatePage() {
  const router = useRouter();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [code, setCode] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [externalProvider, setExternalProvider] = React.useState("");
  const [externalId, setExternalId] = React.useState("");
  const [accruePoints, setAccruePoints] = React.useState(true);
  const [allowRedeem, setAllowRedeem] = React.useState(true);
  const [visible, setVisible] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

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

  const submit = async () => {
    if (!name.trim()) {
      setMessage("Название обязательно");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const payload: any = {
        name: name.trim(),
        price: price ? Number(price) : 0,
        priceEnabled: true,
        categoryId: categoryId || undefined,
        sku: sku.trim() || undefined,
        code: code.trim() || undefined,
        barcode: barcode.trim() || undefined,
        unit: unit.trim() || undefined,
        externalProvider: externalProvider.trim() || undefined,
        externalId: externalId.trim() || undefined,
        accruePoints,
        allowRedeem,
        visible,
        hasVariants: false,
        disableCart: false,
      };
      const res = await fetch("/api/portal/catalog/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      router.push(`/products`);
      setMessage(`Товар создан: ${data?.name ?? ""}`);
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
          <div style={{ fontSize: 18, fontWeight: 700 }}>Новый товар</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Каталог синхронизирован с API</div>
        </div>
        <a className="btn" href="/products" style={{ textDecoration: "none" }}>
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
                placeholder="Например, Чёрный кофе"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Цена</span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Категория</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              >
                <option value="">Без категории</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>SKU</span>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="SKU"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Код</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Код товара"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Штрихкод</span>
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="EAN / UPC"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Единица измерения</span>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="шт / кг / л"
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
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Настройки лояльности" />
        <CardBody>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={accruePoints} onChange={(e) => setAccruePoints(e.target.checked)} /> Начислять баллы
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={allowRedeem} onChange={(e) => setAllowRedeem(e.target.checked)} /> Разрешить оплату баллами
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Показать в каталоге
            </label>
          </div>
        </CardBody>
      </Card>

      {message && <div style={{ color: message.includes("создан") ? "#10b981" : "#ef4444" }}>{message}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={() => router.push("/products")}>
          Отмена
        </Button>
        <Button variant="primary" disabled={busy} onClick={submit}>
          {busy ? "Сохранение..." : "Создать"}
        </Button>
      </div>
    </div>
  );
}
