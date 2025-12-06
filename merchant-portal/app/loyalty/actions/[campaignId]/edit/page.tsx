"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";

type Option = { id: string; name: string };

function extractTargets(data: any) {
  const meta =
    data?.reward?.metadata ||
    data?.rewardMetadata ||
    data?.metadata ||
    {};
  const products =
    Array.isArray(meta.productIds) && meta.productIds.length
      ? meta.productIds
      : Array.isArray(meta.products)
        ? meta.products
        : [];
  const categories =
    Array.isArray(meta.categoryIds) && meta.categoryIds.length
      ? meta.categoryIds
      : Array.isArray(meta.categories)
        ? meta.categories
        : [];
  return { products, categories };
}

export default function CampaignEditPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const router = useRouter();
  const [products, setProducts] = React.useState<Option[]>([]);
  const [categories, setCategories] = React.useState<Option[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [status, setStatus] = React.useState("ACTIVE");
  const [type, setType] = React.useState("POINTS");
  const [rewardValue, setRewardValue] = React.useState("0");
  const [multiplier, setMultiplier] = React.useState("1");
  const [buyQty, setBuyQty] = React.useState("2");
  const [freeQty, setFreeQty] = React.useState("1");
  const [promoPrice, setPromoPrice] = React.useState("0");
  const [productIds, setProductIds] = React.useState<string[]>([]);
  const [categoryIds, setCategoryIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    fetch("/api/portal/catalog/products?status=visible")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.items)) {
          setProducts(
            data.items.map((p: any) => ({ id: p.id, name: p.name || p.id })),
          );
        }
      })
      .catch(() => null);
    fetch("/api/portal/catalog/categories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCategories(
            data.map((c: any) => ({ id: c.id, name: c.name || c.id })),
          );
        }
      })
      .catch(() => null);
  }, []);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage("");
      try {
        const res = await fetch(
          `/api/portal/loyalty/promotions/${encodeURIComponent(campaignId)}`,
        );
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setName(data?.name || "");
        setStatus(data?.status || "ACTIVE");
        setStartDate(data?.startDate ? data.startDate.slice(0, 10) : "");
        setEndDate(data?.endDate ? data.endDate.slice(0, 10) : "");
        const targets = extractTargets(data);
        setProductIds(targets.products || []);
        setCategoryIds(targets.categories || []);
        const reward = data?.reward || {};
        const rewardType =
          String(
            data?.type ||
              reward?.type ||
              data?.rewardMetadata?.kind ||
              reward?.metadata?.kind ||
              "POINTS",
          ).toUpperCase() || "POINTS";
        setType(rewardType);
        if (rewardType === "NTH_FREE") {
          setBuyQty(
            reward?.buyQty != null
              ? String(reward.buyQty)
              : String(reward?.value ?? reward?.metadata?.buyQty ?? 2),
          );
          setFreeQty(
            reward?.freeQty != null
              ? String(reward.freeQty)
              : String(reward?.metadata?.freeQty ?? 1),
          );
        } else if (rewardType === "FIXED_PRICE") {
          setPromoPrice(
            reward?.price != null
              ? String(reward.price)
              : String(reward?.value ?? data?.rewardValue ?? 0),
          );
        } else {
          setRewardValue(
            reward?.value != null ? String(reward.value) : String(data?.rewardValue ?? 0),
          );
          const mult =
            reward?.multiplier ??
            reward?.metadata?.multiplier ??
            data?.rewardMetadata?.multiplier ??
            1;
          setMultiplier(String(mult ?? 1));
        }
      } catch (e: any) {
        setMessage(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [campaignId]);

  const toggleInArray = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) => {
    setList((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const submit = async () => {
    if (!name.trim()) {
      setMessage("Введите название акции");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const baseReward: any = {
        metadata: {
          productIds,
          categoryIds,
        },
      };
      let reward: any = { ...baseReward, type };
      if (type === "NTH_FREE") {
        reward = {
          ...baseReward,
          type: "NTH_FREE",
          buyQty: Number(buyQty) || 0,
          freeQty: Number(freeQty) || 1,
        };
      } else if (type === "FIXED_PRICE") {
        reward = {
          ...baseReward,
          type: "FIXED_PRICE",
          price: Number(promoPrice) || 0,
          value: Number(promoPrice) || 0,
        };
      } else {
        reward = {
          ...baseReward,
          type: "POINTS",
          value: Number(rewardValue) || 0,
          multiplier: Number(multiplier) || 0,
        };
      }
      const payload: any = {
        name: name.trim(),
        status,
        type,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        reward,
        productIds,
        categoryIds,
      };
      const res = await fetch(
        `/api/portal/loyalty/promotions/${encodeURIComponent(campaignId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      router.push("/loyalty/actions");
    } catch (e: any) {
      setMessage(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Редактирование акции</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Акции по товарам: баллы, N-й бесплатно или акционная цена</div>
        </div>
        <a className="btn" href="/loyalty/actions" style={{ textDecoration: "none" }}>
          <Button variant="secondary">Назад</Button>
        </a>
      </div>

      <Card>
        <CardHeader title="Основные параметры" />
        <CardBody>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Название</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Статус</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              >
                <option value="ACTIVE">Активна</option>
                <option value="DRAFT">Черновик</option>
                <option value="PAUSED">Выключена</option>
                <option value="ARCHIVED">Архив</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Дата начала</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Дата окончания</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Тип акции</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value.toUpperCase())}
                style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
              >
                <option value="POINTS">Двойные баллы на товары</option>
                <option value="NTH_FREE">Каждый N-ый товар бесплатно</option>
                <option value="FIXED_PRICE">Акционная цена на товары</option>
              </select>
            </label>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Начисление" />
        <CardBody>
          {type === "POINTS" && (
            <>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Фиксированное начисление (баллы)</span>
                  <input
                    type="number"
                    value={rewardValue}
                    onChange={(e) => setRewardValue(e.target.value)}
                    placeholder="0"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Множитель (x2, x3...)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={multiplier}
                    onChange={(e) => setMultiplier(e.target.value)}
                    placeholder="2"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
                  />
                </label>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>
                Можно задать либо фиксированные баллы, либо множитель. Если баллы = 0 — используется только множитель.
              </div>
            </>
          )}
          {type === "NTH_FREE" && (
            <>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Покупок до подарка (например, 2 для 2+1)</span>
                  <input
                    type="number"
                    value={buyQty}
                    onChange={(e) => setBuyQty(e.target.value)}
                    placeholder="2"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Бесплатных товаров в наборе</span>
                  <input
                    type="number"
                    value={freeQty}
                    onChange={(e) => setFreeQty(e.target.value)}
                    placeholder="1"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
                  />
                </label>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>
                Клиент получает бесплатные товары при покупке набора. Например, 2+1: две оплаченные единицы и одна в подарок.
              </div>
            </>
          )}
          {type === "FIXED_PRICE" && (
            <>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Акционная цена за единицу</span>
                  <input
                    type="number"
                    value={promoPrice}
                    onChange={(e) => setPromoPrice(e.target.value)}
                    placeholder="199"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
                  />
                </label>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>
                Укажите конечную цену, по которой товар будет продаваться в рамках акции.
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Цели акции" />
        <CardBody>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Товары</div>
              <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto", padding: 8, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
                {products.map((p) => (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={productIds.includes(p.id)}
                      onChange={() =>
                        toggleInArray(productIds, setProductIds, p.id)
                      }
                    />{" "}
                    {p.name}
                  </label>
                ))}
                {!products.length && <div style={{ opacity: 0.7 }}>Список товаров пуст</div>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Категории</div>
              <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto", padding: 8, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
                {categories.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(c.id)}
                      onChange={() =>
                        toggleInArray(categoryIds, setCategoryIds, c.id)
                      }
                    />{" "}
                    {c.name}
                  </label>
                ))}
                {!categories.length && <div style={{ opacity: 0.7 }}>Список категорий пуст</div>}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {message && <div style={{ color: message.toLowerCase().includes("ош") ? "#ef4444" : "#10b981" }}>{message}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={() => router.push("/loyalty/actions")}>
          Отмена
        </Button>
        <Button variant="primary" disabled={busy} onClick={submit}>
          {busy ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
