"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import { useRouter } from "next/navigation";

type Promotion = {
  id: string;
  name: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  reward?: {
    value?: number;
    multiplier?: number;
  };
  rewardMetadata?: any;
  metadata?: any;
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Активна",
  PAUSED: "Выключена",
  DRAFT: "Черновик",
  COMPLETED: "Завершена",
  SCHEDULED: "Запланирована",
  ARCHIVED: "Архив",
};

function formatRange(from?: string | null, to?: string | null) {
  if (!from && !to) return "Бессрочно";
  const fmt = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString("ru-RU") : null;
  const f = fmt(from);
  const t = fmt(to);
  if (f && t) return `${f} — ${t}`;
  if (f) return `с ${f}`;
  if (t) return `до ${t}`;
  return "Бессрочно";
}

function deriveTargets(promo: Promotion) {
  const meta =
    promo.rewardMetadata && typeof promo.rewardMetadata === "object"
      ? (promo.rewardMetadata as any)
      : promo.metadata && typeof promo.metadata === "object"
        ? (promo.metadata as any)
        : {};
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
  return { products: products.length, categories: categories.length };
}

export default function ActionsPage() {
  const router = useRouter();
  const [items, setItems] = React.useState<Promotion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [showTypeModal, setShowTypeModal] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/loyalty/promotions?status=ALL");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      setSelected([]);
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
    return items.filter((p) => p.name.toLowerCase().includes(term));
  }, [items, search]);

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => setSelected(filtered.map((p) => p.id));

  const changeStatus = async (ids: string[], status: string) => {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/portal/loyalty/promotions/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }),
      ),
    );
    await load();
  };

  const archive = async (ids: string[]) => changeStatus(ids, "ARCHIVED");

  const disable = async (ids: string[]) => changeStatus(ids, "PAUSED");

  const enable = async (ids: string[]) => changeStatus(ids, "ACTIVE");

  const duplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/portal/loyalty/promotions/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      const promo = await res.json();
      const copy = {
        ...promo,
        name: `${promo.name || "Акция"} (копия)`,
        status: "DRAFT",
      };
      delete (copy as any).id;
      const createRes = await fetch("/api/portal/loyalty/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copy),
      });
      if (!createRes.ok) throw new Error(await createRes.text());
      await load();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  };

  const bulkToggle = async () => {
    const hasActive = selected.some(
      (id) => items.find((p) => p.id === id)?.status === "ACTIVE",
    );
    if (hasActive) {
      await disable(selected);
    } else {
      await enable(selected);
    }
  };

  const bulkDelete = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Удалить ${selected.length} акций?`)) return;
    await archive(selected);
  };

  const startCreate = (type: string) => {
    setShowTypeModal(false);
    router.push(`/loyalty/actions/new?type=${encodeURIComponent(type)}`);
  };

  const renderReward = (promo: Promotion) => {
    const rewardType = String(
      (promo as any)?.type ??
        (promo.reward as any)?.type ??
        (promo.rewardMetadata as any)?.kind ??
        "",
    ).toUpperCase();
    const meta =
      (promo.rewardMetadata && typeof promo.rewardMetadata === "object"
        ? (promo.rewardMetadata as any)
        : (promo.reward as any)?.metadata && typeof (promo.reward as any).metadata === "object"
          ? ((promo.reward as any).metadata as any)
          : {}) || {};
    if (rewardType.includes("NTH_FREE")) {
      const buy = meta.buyQty ?? meta.buy ?? meta.step ?? 0;
      const free = meta.freeQty ?? meta.free ?? 1;
      return `Каждый ${Number(buy) + Number(free) || 0}-й бесплатно (${buy}+${free})`;
    }
    if (rewardType.includes("FIXED_PRICE") || rewardType.includes("PRICE")) {
      const price = meta.price ?? promo.reward?.value ?? (promo as any).rewardValue ?? 0;
      return `Акционная цена: ${price}`;
    }
    const multiplier =
      promo.reward?.multiplier ??
      promo.rewardMetadata?.multiplier ??
      promo.rewardMetadata?.earnMultiplier ??
      0;
    return multiplier && multiplier > 0
      ? `×${multiplier}`
      : `${promo.reward?.value ?? 0} баллов`;
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Акции</h1>
          <div style={{ opacity: 0.7, fontSize: 14 }}>Реальные данные, без моков.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" onClick={() => setShowTypeModal(true)}>
            Создать акцию
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Фильтры"
          subtitle={loading ? "Загрузка..." : `Найдено: ${filtered.length}`}
        />
        <CardBody>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Поиск</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Название акции"
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
        <CardHeader title="Список акций" />
        <CardBody>
          {loading ? (
            <div>Загрузка...</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "8px 6px" }}>
                      <input
                        type="checkbox"
                        checked={selected.length > 0 && selected.length === filtered.length}
                        onChange={(e) =>
                          e.target.checked
                            ? setSelected(filtered.map((p) => p.id))
                            : setSelected([])
                        }
                      />
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Название</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Период</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Вознаграждение</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Товары / категории</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", opacity: 0.7 }}>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((promo) => {
                    const targets = deriveTargets(promo);
                    return (
                      <tr key={promo.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "8px 6px" }}>
                          <input
                            type="checkbox"
                            checked={selected.includes(promo.id)}
                            onChange={() => toggleSelect(promo.id)}
                          />
                        </td>
                        <td style={{ padding: "8px 6px", fontWeight: 600 }}>{promo.name}</td>
                        <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                          {formatRange(promo.startDate ?? null, promo.endDate ?? null)}
                        </td>
                    <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                          {renderReward(promo)}
                    </td>
                        <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                          {targets.products || targets.categories ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              {targets.products > 0 && <span>Товаров: {targets.products}</span>}
                              {targets.categories > 0 && <span>Категорий: {targets.categories}</span>}
                            </div>
                          ) : (
                            "Все товары"
                          )}
                        </td>
                        <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                          {statusLabels[promo.status] ?? promo.status}
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => disable([promo.id])}
                            >
                              Выключить
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => duplicate(promo.id)}
                            >
                              Дублировать
                            </Button>
                            <button
                              onClick={() => archive([promo.id])}
                              style={{
                                background: "transparent",
                                border: "1px solid rgba(239,68,68,0.5)",
                                color: "#ef4444",
                                padding: "6px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7} style={{ padding: 12, opacity: 0.7 }}>
                        Нет акций
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {showTypeModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 30,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 20,
              maxWidth: 520,
              width: "100%",
              display: "grid",
              gap: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Выберите тип акции</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Все типы работают с реальным API, без моков.</div>
              </div>
              <button
                aria-label="Закрыть"
                onClick={() => setShowTypeModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <Button variant="secondary" onClick={() => startCreate("POINTS")}>
                Двойные баллы на товары
              </Button>
              <Button variant="secondary" onClick={() => startCreate("NTH_FREE")}>
                Каждый N-ый товар бесплатно — 2+1 и другие комплекты
              </Button>
              <Button variant="secondary" onClick={() => startCreate("FIXED_PRICE")}>
                Акционная цена на товары
              </Button>
            </div>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "rgba(15,23,42,0.9)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            padding: "12px 16px",
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <strong>Выбрано: {selected.length}</strong>
            <Button variant="secondary" size="sm" onClick={selectAll}>
              Выбрать все
            </Button>
            <Button variant="secondary" size="sm" onClick={bulkToggle}>
              Включить/выключить
            </Button>
            <button
              onClick={bulkDelete}
              style={{
                background: "transparent",
                border: "1px solid rgba(239,68,68,0.5)",
                color: "#ef4444",
                padding: "8px 12px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Удалить
            </button>
          </div>
          <button
            onClick={() => setSelected([])}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: 16,
            }}
            aria-label="Очистить выбор"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
