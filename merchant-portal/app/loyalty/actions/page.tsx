"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Icons } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

const {
  Search,
  HelpCircle,
  MoreVertical,
  X,
  RefreshCw,
  Check,
  Calendar,
  Tag,
} = Icons;

type PromotionStatus = "UPCOMING" | "ACTIVE" | "PAST";

type Promotion = {
  id: string;
  name: string;
  status: PromotionStatus;
  code: string;
  roi: number;
  revenue: number;
  expenses: number;
  purchases: number;
  badges: string[];
  description: string;
  audience: string;
  productIds: string[];
  rule: string;
  startDate?: string | null;
  endDate?: string | null;
  usageLimit: string;
  enabled: boolean;
  type: string;
};

type Product = { id: string; name: string; category: string };

type AudienceOption = { value: string; label: string };

type RuleType = "FIXED" | "PERCENT" | "MULTIPLIER";

type CreateFormState = {
  enabled: boolean;
  name: string;
  products: string[];
  ruleType: RuleType;
  fixedPoints: string;
  percent: string;
  multiplier: string;
  startEnabled: boolean;
  startDate: string;
  endEnabled: boolean;
  endDate: string;
  audience: string;
  usageLimit: "UNLIMITED" | "ONCE" | "N";
  usageLimitValue: string;
};

const tabs: { id: PromotionStatus; label: string }[] = [
  { id: "UPCOMING", label: "Предстоящие" },
  { id: "ACTIVE", label: "Текущие" },
  { id: "PAST", label: "Прошедшие" },
];

const productCatalog: Product[] = [
  { id: "coffee-black", name: "Чёрный кофе 250 мл", category: "Напитки" },
  { id: "coffee-raf", name: "Раф ванильный", category: "Напитки" },
  { id: "cappuccino", name: "Капучино 300 мл", category: "Напитки" },
  { id: "croissant", name: "Круассан с миндалём", category: "Выпечка" },
  { id: "beans-ethiopia", name: "Зёрна Эфиопия, 1 кг", category: "Товары" },
  { id: "matcha", name: "Матча латте", category: "Напитки" },
  { id: "cheesecake", name: "Чизкейк Нью-Йорк", category: "Десерты" },
];

const productMap = new Map(productCatalog.map((item) => [item.id, item]));

const audienceOptions: AudienceOption[] = [
  { value: "all", label: "Все клиенты" },
  { value: "loyal", label: "Лояльные 60+ дней" },
  { value: "new", label: "Новые клиенты (30 дней)" },
  { value: "sleep", label: "Заснувшие 90 дней" },
];

const defaultForm: CreateFormState = {
  enabled: true,
  name: "",
  products: [],
  ruleType: "FIXED",
  fixedPoints: "150",
  percent: "15",
  multiplier: "2",
  startEnabled: false,
  startDate: "",
  endEnabled: false,
  endDate: "",
  audience: "",
  usageLimit: "UNLIMITED",
  usageLimitValue: "3",
};

const initialPromotions: Promotion[] = [
  {
    id: "promo-coffee-x2",
    name: "Двойные баллы на чёрный кофе",
    status: "ACTIVE",
    code: "ACT-1045",
    roi: 168,
    revenue: 384000,
    expenses: 142000,
    purchases: 512,
    badges: ["Акционные баллы на товары", "Бессрочная"],
    description: "Удваиваем начисления на линейку чёрного кофе для удержания постоянных гостей.",
    audience: "Лояльные 60+ дней",
    productIds: ["coffee-black", "cappuccino"],
    rule: "Баллы ×2 от уровня покупателя",
    startDate: null,
    endDate: null,
    usageLimit: "Без ограничений",
    enabled: true,
    type: "Акционные баллы на товары",
  },
  {
    id: "promo-croissant",
    name: "300 баллов за круассан",
    status: "UPCOMING",
    code: "ACT-2088",
    roi: 132,
    revenue: 192000,
    expenses: 83000,
    purchases: 286,
    badges: ["Акционные баллы на товары", "с 1 ноября"],
    description: "Стимулируем утренние визиты — дарим 300 баллов за круассаны и кофе.",
    audience: "Новые клиенты (30 дней)",
    productIds: ["croissant", "coffee-raf"],
    rule: "Фиксированное начисление: 300 баллов",
    startDate: new Date(new Date().getFullYear(), 10, 1).toISOString(),
    endDate: new Date(new Date().getFullYear(), 11, 15).toISOString(),
    usageLimit: "1 раз",
    enabled: true,
    type: "Акционные баллы на товары",
  },
  {
    id: "promo-beans",
    name: "15% баллами на зёрна",
    status: "PAST",
    code: "ACT-1772",
    roi: 118,
    revenue: 254000,
    expenses: 116000,
    purchases: 194,
    badges: ["Акционные баллы на товары", "завершена"],
    description: "Вернули интерес к продаже зёрен — баллы начислялись от стоимости покупки.",
    audience: "Все клиенты",
    productIds: ["beans-ethiopia"],
    rule: "Процент от цены: 15%",
    startDate: new Date(new Date().getFullYear(), 6, 1).toISOString(),
    endDate: new Date(new Date().getFullYear(), 7, 31).toISOString(),
    usageLimit: "N раз (5)",
    enabled: false,
    type: "Акционные баллы на товары",
  },
];

function formatMoney(value: number) {
  return value.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU");
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU");
}

function formatRange(from?: string | null, to?: string | null) {
  if (!from && !to) return "Бессрочно";
  if (from && to) return `${formatDate(from)} — ${formatDate(to)}`;
  if (from) return `с ${formatDate(from)}`;
  if (to) return `до ${formatDate(to)}`;
  return "—";
}

function generateCode() {
  return `ACT-${Math.floor(1000 + Math.random() * 9000)}`;
}

const tooltipTexts = {
  roi: "ROI = (Выручка − Расходы) / Расходы × 100%",
  revenue: "Выручка — оплаченные рублём покупки по акциям",
  expenses: "Расходы — начисленные и списанные акционные баллы",
  purchases: "Покупки — количество чеков с участием акции",
};

const usageLimitLabels: Record<CreateFormState["usageLimit"], string> = {
  UNLIMITED: "Без ограничений",
  ONCE: "1 раз",
  N: "N раз",
};

export default function ActionsPage() {
  const [tab, setTab] = React.useState<PromotionStatus>("ACTIVE");
  const [search, setSearch] = React.useState("");
  const [items, setItems] = React.useState<Promotion[]>(initialPromotions);
  const [selectedRows, setSelectedRows] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<Promotion | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [step, setStep] = React.useState<"type" | "form">("type");
  const [form, setForm] = React.useState<CreateFormState>(defaultForm);
  const [productQuery, setProductQuery] = React.useState("");

  const selectedProducts = form.products;

  const filteredItems = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (item.status !== tab) return false;
      if (!query) return true;
      return item.name.toLowerCase().includes(query);
    });
  }, [items, tab, search]);

  React.useEffect(() => {
    setSelectedRows([]);
  }, [tab, search]);

  const filteredProducts = React.useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return productCatalog.filter((product) => {
      if (selectedProducts.includes(product.id)) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q)
      );
    });
  }, [productQuery, selectedProducts]);

  const isFormValid = React.useMemo(() => {
    if (!form.name.trim()) return false;
    if (!form.audience) return false;
    if (!form.products.length) return false;
    if (form.ruleType === "FIXED" && Number(form.fixedPoints) <= 0) return false;
    if (form.ruleType === "PERCENT") {
      const percent = Number(form.percent);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return false;
    }
    if (form.ruleType === "MULTIPLIER" && Number(form.multiplier) < 1) return false;
    if (form.usageLimit === "N" && Number(form.usageLimitValue) <= 0) return false;
    return true;
  }, [form]);

  const handleToggleRow = (id: string) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
    );
  };

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(filteredItems.map((item) => item.id));
    } else {
      setSelectedRows([]);
    }
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setStep("type");
    setForm(defaultForm);
    setProductQuery("");
  };

  const handleCreateSubmit = () => {
    if (!isFormValid) return;
    const now = new Date();
    let status: PromotionStatus = "ACTIVE";
    if (!form.enabled) {
      status = "UPCOMING";
    } else {
      if (form.startEnabled && form.startDate) {
        const start = new Date(form.startDate);
        if (start > now) status = "UPCOMING";
      }
      if (form.endEnabled && form.endDate) {
        const end = new Date(form.endDate);
        if (end < now) status = "PAST";
      }
    }

    const badges = ["Акционные баллы на товары"];
    if (!form.endEnabled || !form.endDate) {
      badges.push("Бессрочная");
    } else {
      badges.push(`до ${formatDate(form.endDate)}`);
    }

    const rule =
      form.ruleType === "FIXED"
        ? `Фиксированное начисление: ${Number(form.fixedPoints)} баллов`
        : form.ruleType === "PERCENT"
          ? `Процент от цены: ${Number(form.percent)}%`
          : `Баллы ×${Number(form.multiplier)} от уровня покупателя`;

    const newPromotion: Promotion = {
      id: `local-${Date.now()}`,
      name: form.name.trim(),
      status,
      code: generateCode(),
      roi: 150,
      revenue: 120000,
      expenses: 48000,
      purchases: 120,
      badges,
      description: rule,
      audience:
        audienceOptions.find((option) => option.value === form.audience)?.label ||
        "Выбранная аудитория",
      productIds: [...form.products],
      rule,
      startDate: form.startEnabled && form.startDate ? form.startDate : null,
      endDate: form.endEnabled && form.endDate ? form.endDate : null,
      usageLimit:
        form.usageLimit === "N"
          ? `N раз (${Number(form.usageLimitValue)})`
          : usageLimitLabels[form.usageLimit],
      enabled: form.enabled,
      type: "Акционные баллы на товары",
    };

    setItems((prev) => [newPromotion, ...prev]);
    setTab(status);
    closeCreate();
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Акции</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Создавайте механики с особыми правилами начисления баллов</div>
        </div>
        <Button variant="primary" onClick={() => { setCreateOpen(true); setStep("type"); setForm(defaultForm); setProductQuery(""); }} leftIcon={<Tag size={16} />}>
          Создать акцию
        </Button>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className="btn"
            style={{
              background: tab === item.id ? "var(--brand-primary)" : "rgba(255,255,255,0.05)",
              color: tab === item.id ? "#0f172a" : "#f8fafc",
              fontWeight: tab === item.id ? 700 : 500,
              minWidth: 150,
              justifyContent: "center",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader
          title={`${tabs.find((item) => item.id === tab)?.label ?? ""}`}
          subtitle={`Всего: ${filteredItems.length} записей`}
        />
        <CardBody style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск по названию"
                  style={{
                    padding: "10px 12px 10px 34px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(15,23,42,0.6)",
                    color: "inherit",
                    minWidth: 240,
                  }}
                />
              </label>
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              Выбрано: {selectedRows.length} из {filteredItems.length}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  <th style={{ padding: "0 12px", width: 36 }}>
                    <input
                      type="checkbox"
                      checked={filteredItems.length > 0 && selectedRows.length === filteredItems.length}
                      onChange={(event) => handleToggleAll(event.target.checked)}
                    />
                  </th>
                  <th style={{ padding: "0 12px" }}>Акция</th>
                  <th style={{ padding: "0 12px" }}>ROI <HelpCircle size={14} style={{ opacity: 0.6 }} title={tooltipTexts.roi} /></th>
                  <th style={{ padding: "0 12px" }}>Выручка <HelpCircle size={14} style={{ opacity: 0.6 }} title={tooltipTexts.revenue} /></th>
                  <th style={{ padding: "0 12px" }}>Расходы <HelpCircle size={14} style={{ opacity: 0.6 }} title={tooltipTexts.expenses} /></th>
                  <th style={{ padding: "0 12px" }}>Покупок <HelpCircle size={14} style={{ opacity: 0.6 }} title={tooltipTexts.purchases} /></th>
                  <th style={{ padding: "0 12px", width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const productNames = item.productIds.map((id) => productMap.get(id)?.name || id);
                  const checked = selectedRows.includes(item.id);
                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "12px" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleRow(item.id)}
                        />
                      </td>
                      <td style={{ padding: "12px", minWidth: 220 }}>
                        <button
                          type="button"
                          onClick={() => setPreview(item)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            color: "inherit",
                            cursor: "pointer",
                            textAlign: "left",
                            display: "grid",
                            gap: 4,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{item.name}</span>
                          <span style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12, fontStyle: "italic", opacity: 0.7 }}>
                            {item.badges.map((badge) => (
                              <span key={badge} style={{ background: "rgba(99,102,241,0.18)", color: "#c7d2fe", padding: "2px 8px", borderRadius: 999 }}>{badge}</span>
                            ))}
                          </span>
                          <span style={{ fontSize: 12, opacity: 0.65 }}>{productNames.join(", ")}</span>
                        </button>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span>{item.roi}%</span>
                      </td>
                      <td style={{ padding: "12px" }}>{formatMoney(item.revenue)}</td>
                      <td style={{ padding: "12px" }}>{formatMoney(item.expenses)}</td>
                      <td style={{ padding: "12px" }}>{formatNumber(item.purchases)}</td>
                      <td style={{ padding: "12px" }}>
                        <RowMenu
                          enabled={item.enabled}
                          onSelect={(action) => {
                            if (action === "view") setPreview(item);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {!filteredItems.length && (
                  <tr>
                    <td colSpan={7} style={{ padding: 20, textAlign: "center", opacity: 0.6 }}>
                      Нет акций по выбранным условиям
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {createOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.72)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 80,
          }}
        >
          {step === "type" ? (
            <div
              style={{
                width: "min(720px, 96vw)",
                background: "rgba(12,16,26,0.98)",
                borderRadius: 18,
                border: "1px solid rgba(148,163,184,0.18)",
                boxShadow: "0 28px 80px rgba(2,6,23,0.55)",
                display: "grid",
                gridTemplateRows: "auto 1fr",
              }}
            >
              <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(148,163,184,0.14)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>Создание акции</div>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>Шаг 1 из 2 — выберите тип акции</div>
                </div>
                <button
                  type="button"
                  onClick={closeCreate}
                  style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.5)", color: "#fca5a5", borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}
                  aria-label="Закрыть"
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ padding: 24 }}>
                <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
                  <div
                    style={{
                      border: "1px solid rgba(99,102,241,0.35)",
                      borderRadius: 16,
                      padding: 20,
                      display: "grid",
                      gap: 12,
                      background: "rgba(79,70,229,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(79,70,229,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Tag size={18} />
                      </div>
                      <div style={{ fontWeight: 600 }}>Акционные баллы на товары</div>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>Особые правила начисления для выбранных товаров</div>
                    <Button
                      variant="primary"
                      onClick={() => setStep("form")}
                      leftIcon={<Check size={16} />}
                    >
                      Выбрать
                    </Button>
                  </div>
                  <div
                    style={{
                      border: "1px dashed rgba(148,163,184,0.4)",
                      borderRadius: 16,
                      padding: 20,
                      display: "grid",
                      placeItems: "center",
                      color: "rgba(148,163,184,0.8)",
                      minHeight: 160,
                    }}
                  >
                    <div style={{ textAlign: "center", fontSize: 13 }}>Скоро добавим новые типы акций</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                width: "min(880px, 96vw)",
                maxHeight: "92vh",
                overflow: "hidden",
                background: "rgba(12,16,26,0.98)",
                borderRadius: 18,
                border: "1px solid rgba(148,163,184,0.18)",
                boxShadow: "0 30px 90px rgba(2,6,23,0.6)",
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
              }}
            >
              <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(148,163,184,0.14)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>Создание акции</div>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>Шаг 2 из 2 — настройте акционные баллы на товары</div>
                </div>
                <button
                  type="button"
                  onClick={closeCreate}
                  style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.5)", color: "#fca5a5", borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}
                  aria-label="Закрыть"
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ padding: 24, overflowY: "auto", display: "grid", gap: 18 }}>
                <Toggle
                  checked={form.enabled}
                  onChange={(value) => setForm((prev) => ({ ...prev, enabled: value }))}
                  label="Включить акцию"
                />

                <div style={{ display: "grid", gap: 10 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Название акции</label>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Например: Двойные баллы на чёрный кофе"
                    style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.6)", color: "inherit" }}
                  />
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Выберите товары</label>
                  <div
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 12,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {selectedProducts.map((id) => {
                        const product = productMap.get(id);
                        return (
                          <span
                            key={id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 10px",
                              borderRadius: 999,
                              background: "rgba(99,102,241,0.18)",
                              color: "#c7d2fe",
                              fontSize: 12,
                            }}
                          >
                            {product?.name ?? id}
                            <button
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  products: prev.products.filter((productId) => productId !== id),
                                }))
                              }
                              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
                              aria-label="Удалить товар"
                            >
                              <X size={14} />
                            </button>
                          </span>
                        );
                      })}
                      <input
                        value={productQuery}
                        onChange={(event) => setProductQuery(event.target.value)}
                        placeholder="Найдите товар"
                        style={{
                          flex: 1,
                          minWidth: 160,
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          outline: "none",
                        }}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {filteredProducts.slice(0, 6).map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              products: prev.products.includes(product.id)
                                ? prev.products
                                : [...prev.products, product.id],
                            }))
                          }
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 10px",
                            borderRadius: 10,
                            background: "rgba(148,163,184,0.08)",
                            border: "1px solid rgba(148,163,184,0.16)",
                            color: "inherit",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ display: "grid", gap: 2, textAlign: "left" }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{product.name}</span>
                            <span style={{ fontSize: 11, opacity: 0.65 }}>{product.category}</span>
                          </span>
                          <Check size={16} />
                        </button>
                      ))}
                      {!filteredProducts.length && (
                        <div style={{ fontSize: 12, opacity: 0.6 }}>Товар не найден — сузьте запрос</div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Правила начисления баллов</div>
                  <div style={{ display: "grid", gap: 12 }}>
                    <label style={radioStyle}>
                      <input
                        type="radio"
                        name="rule"
                        checked={form.ruleType === "FIXED"}
                        onChange={() => setForm((prev) => ({ ...prev, ruleType: "FIXED" }))}
                      />
                      <span>Начислить фиксированное количество баллов</span>
                      <input
                        type="number"
                        value={form.fixedPoints}
                        onChange={(event) => setForm((prev) => ({ ...prev, fixedPoints: event.target.value }))}
                        min={1}
                        style={numberInputStyle}
                      />
                      <span style={{ fontSize: 12, opacity: 0.6 }}>Баллов</span>
                    </label>
                    <label style={radioStyle}>
                      <input
                        type="radio"
                        name="rule"
                        checked={form.ruleType === "PERCENT"}
                        onChange={() => setForm((prev) => ({ ...prev, ruleType: "PERCENT" }))}
                      />
                      <span>Процент от цены товара</span>
                      <input
                        type="number"
                        value={form.percent}
                        onChange={(event) => setForm((prev) => ({ ...prev, percent: event.target.value }))}
                        min={1}
                        max={100}
                        style={numberInputStyle}
                      />
                      <span style={{ fontSize: 12, opacity: 0.6 }}>%</span>
                    </label>
                    <label style={radioStyle}>
                      <input
                        type="radio"
                        name="rule"
                        checked={form.ruleType === "MULTIPLIER"}
                        onChange={() => setForm((prev) => ({ ...prev, ruleType: "MULTIPLIER" }))}
                      />
                      <span>Умножить уровень покупателя</span>
                      <input
                        type="number"
                        value={form.multiplier}
                        onChange={(event) => setForm((prev) => ({ ...prev, multiplier: event.target.value }))}
                        min={1}
                        step="0.1"
                        style={numberInputStyle}
                      />
                      <span style={{ fontSize: 12, opacity: 0.6 }}>Множитель</span>
                    </label>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Ограничения</div>
                  <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Дата начала</div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <Toggle
                          checked={form.startEnabled}
                          onChange={(value) => setForm((prev) => ({ ...prev, startEnabled: value }))}
                          label={form.startEnabled ? "Вкл" : "Выкл"}
                        />
                        <DatePicker
                          value={form.startDate}
                          onChange={(value) => setForm((prev) => ({ ...prev, startDate: value }))}
                          disabled={!form.startEnabled}
                          placeholder="Сразу"
                        />
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, startDate: "" }))}
                          style={resetButtonStyle}
                          aria-label="Очистить дату начала"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Дата окончания</div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <Toggle
                          checked={form.endEnabled}
                          onChange={(value) => setForm((prev) => ({ ...prev, endEnabled: value }))}
                          label={form.endEnabled ? "Вкл" : "Выкл"}
                        />
                        <DatePicker
                          value={form.endDate}
                          onChange={(value) => setForm((prev) => ({ ...prev, endDate: value }))}
                          disabled={!form.endEnabled}
                          placeholder="Бессрочно"
                        />
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, endDate: "" }))}
                          style={resetButtonStyle}
                          aria-label="Очистить дату окончания"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Кому доступна акция (аудитории)</span>
                      <button type="button" style={resetButtonStyle} title="Обновить список">
                        <RefreshCw size={14} />
                      </button>
                    </div>
                    <select
                      value={form.audience}
                      onChange={(event) => setForm((prev) => ({ ...prev, audience: event.target.value }))}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(15,23,42,0.6)",
                        color: "inherit",
                      }}
                    >
                      <option value="" disabled>
                        Выберите аудиторию
                      </option>
                      {audienceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Если не нашли подходящую аудиторию, можно {" "}
                      <a href="/audiences" style={{ color: "#818cf8" }}>
                        создать новую
                      </a>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <label style={{ fontSize: 12, opacity: 0.7 }}>Сколько раз покупатель может воспользоваться акцией</label>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <select
                        value={form.usageLimit}
                        onChange={(event) => setForm((prev) => ({ ...prev, usageLimit: event.target.value as CreateFormState["usageLimit"] }))}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(15,23,42,0.6)",
                          color: "inherit",
                          minWidth: 200,
                        }}
                      >
                        <option value="UNLIMITED">Без ограничений</option>
                        <option value="ONCE">1 раз</option>
                        <option value="N">N раз</option>
                      </select>
                      {form.usageLimit === "N" && (
                        <input
                          type="number"
                          min={1}
                          value={form.usageLimitValue}
                          onChange={(event) => setForm((prev) => ({ ...prev, usageLimitValue: event.target.value }))}
                          style={numberInputStyle}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: "18px 24px", borderTop: "1px solid rgba(148,163,184,0.14)", display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={closeCreate} style={{ background: "transparent", border: "1px solid rgba(148,163,184,0.4)", color: "inherit", borderRadius: 999, padding: "10px 18px", cursor: "pointer" }}>
                  Отмена
                </button>
                <Button variant="primary" onClick={handleCreateSubmit} disabled={!isFormValid}>
                  Создать
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {preview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.76)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 90,
          }}
        >
          <div
            style={{
              width: "min(640px, 94vw)",
              background: "rgba(12,16,26,0.97)",
              borderRadius: 18,
              border: "1px solid rgba(148,163,184,0.18)",
              boxShadow: "0 24px 72px rgba(2,6,23,0.55)",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              maxHeight: "90vh",
            }}
          >
            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(148,163,184,0.14)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{preview.name}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{preview.type} • {preview.code}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.5)", color: "#fca5a5", borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 24, overflowY: "auto", display: "grid", gap: 14, fontSize: 13.5 }}>
              <InfoRow label="Статус" value={tabs.find((item) => item.id === preview.status)?.label ?? preview.status} />
              <InfoRow label="Период" value={formatRange(preview.startDate, preview.endDate)} />
              <InfoRow label="Аудитория" value={preview.audience} />
              <InfoRow
                label="Товары"
                value={preview.productIds
                  .map((id) => productMap.get(id)?.name || id)
                  .join(", ")}
              />
              <InfoRow label="Правило начисления" value={preview.rule} />
              <InfoRow label="Ограничение" value={preview.usageLimit} />
              <InfoRow label="ROI" value={`${preview.roi}%`} />
              <InfoRow label="Выручка" value={formatMoney(preview.revenue)} />
              <InfoRow label="Расходы" value={formatMoney(preview.expenses)} />
              <InfoRow label="Покупок" value={formatNumber(preview.purchases)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const radioStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto auto",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(148,163,184,0.08)",
};

const numberInputStyle: React.CSSProperties = {
  width: 90,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(15,23,42,0.6)",
  color: "inherit",
};

const resetButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(148,163,184,0.28)",
  borderRadius: 999,
  padding: "6px 10px",
  color: "inherit",
  cursor: "pointer",
};

type InfoRowProps = { label: string; value: React.ReactNode };

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
    <span style={{ opacity: 0.6 }}>{label}</span>
    <span>{value}</span>
  </div>
);

type RowMenuProps = { onSelect: (action: string) => void; enabled: boolean };

const RowMenu: React.FC<RowMenuProps> = ({ onSelect, enabled }) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 999,
          padding: "6px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 200,
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 12,
            boxShadow: "0 18px 52px rgba(2,6,23,0.55)",
            display: "grid",
            gap: 4,
            padding: 6,
            zIndex: 100,
          }}
        >
          {[
            { id: "view", label: "Просмотр" },
            { id: "edit", label: "Редактировать" },
            { id: "toggle", label: enabled ? "Поставить на паузу" : "Запустить" },
            { id: "archive", label: "Перенести в архив" },
            { id: "duplicate", label: "Дублировать" },
            { id: "delete", label: "Удалить" },
          ].map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                onSelect(action.id);
                setOpen(false);
              }}
              style={{
                background: "transparent",
                border: "none",
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 10,
                color: action.id === "delete" ? "#fca5a5" : "inherit",
                cursor: "pointer",
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
};

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, disabled, placeholder }) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const formatted = value ? formatDate(value) : placeholder;
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.focus()}
        disabled={disabled}
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: disabled ? "rgba(15,23,42,0.3)" : "rgba(15,23,42,0.6)",
          color: "inherit",
          minWidth: 140,
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "center",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <Calendar size={14} />
        <span>{formatted}</span>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
};
