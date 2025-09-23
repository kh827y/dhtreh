"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";
import RichTextEditor from "../../../components/RichTextEditor";

type TabKey = "BASICS" | "CATALOG" | "STOCK";

type Variant = {
  id: string;
  name: string;
  price: string;
  sku: string;
  characteristics: string;
};

type GalleryItem = {
  id: string;
  src: string;
  name: string;
};

type StockRow = {
  id: string;
  place: string;
  price: string;
  balance: string;
};

const CATEGORY_OPTIONS = ["Пицца", "Десерты", "Напитки", "Салаты", "Другое"];
const LINKED_PRODUCTS = [
  { id: "lk-1", title: "Маргарита (iiko)" },
  { id: "lk-2", title: "Пепперони (iiko)" },
  { id: "lk-3", title: "Чизкейк (iiko)" },
];
const TAG_OPTIONS = ["Новинка", "Популярный", "Острое", "Для вегетарианцев"];

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function CreateProductPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>("BASICS");
  const [toast, setToast] = React.useState("");

  const [name, setName] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [category, setCategory] = React.useState(CATEGORY_OPTIONS[0]);
  const [accruePoints, setAccruePoints] = React.useState(true);
  const [allowRedeem, setAllowRedeem] = React.useState(true);
  const [redeemPart, setRedeemPart] = React.useState(100);

  const [order, setOrder] = React.useState("100");
  const [linkedProduct, setLinkedProduct] = React.useState("");
  const [hasVariants, setHasVariants] = React.useState(false);
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [gallery, setGallery] = React.useState<GalleryItem[]>([]);
  const blobUrls = React.useRef<Set<string>>(new Set());
  const [description, setDescription] = React.useState("");
  const [showPrice, setShowPrice] = React.useState(true);
  const [price, setPrice] = React.useState("990");
  const [disableCart, setDisableCart] = React.useState(false);
  const [weight, setWeight] = React.useState("");
  const [weightUnits, setWeightUnits] = React.useState("г");
  const [height, setHeight] = React.useState("");
  const [width, setWidth] = React.useState("");
  const [depth, setDepth] = React.useState("");
  const [proteins, setProteins] = React.useState("");
  const [fats, setFats] = React.useState("");
  const [carbs, setCarbs] = React.useState("");
  const [calories, setCalories] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [visible, setVisible] = React.useState(true);

  const [stockRows, setStockRows] = React.useState<StockRow[]>([
    { id: createId(), place: "Основной склад", price: "990", balance: "24" },
  ]);
  const [stockMessage, setStockMessage] = React.useState("");

  const [basicError, setBasicError] = React.useState("");
  const [catalogError, setCatalogError] = React.useState("");

  React.useEffect(() => {
    return () => {
      blobUrls.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrls.current.clear();
    };
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleRedeemPartChange = (value: string) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      setRedeemPart(0);
      return;
    }
    const clamped = Math.min(100, Math.max(0, numeric));
    setRedeemPart(clamped);
  };

  const addVariant = () => {
    setVariants((prev) => [
      ...prev,
      { id: createId(), name: "", price: "", sku: "", characteristics: "" },
    ]);
  };

  const updateVariant = (id: string, patch: Partial<Variant>) => {
    setVariants((prev) => prev.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));
  };

  const removeVariant = (id: string) => {
    setVariants((prev) => prev.filter((variant) => variant.id !== id));
  };

  const addImages = (files: FileList | null) => {
    if (!files || !files.length) return;
    const next: GalleryItem[] = [];
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      blobUrls.current.add(url);
      next.push({ id: createId(), src: url, name: file.name });
    });
    setGallery((prev) => [...prev, ...next]);
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    addImages(event.dataTransfer?.files ?? null);
  };

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
  };

  const removeImage = (id: string) => {
    setGallery((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.src);
        blobUrls.current.delete(target.src);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const moveImage = (id: string, direction: -1 | 1) => {
    setGallery((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index === -1) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => {
      if (prev.includes(tag)) return prev.filter((value) => value !== tag);
      return [...prev, tag];
    });
  };

  const handleNextTab = () => {
    if (!name.trim()) {
      setBasicError("Укажите название товара");
      return;
    }
    setBasicError("");
    setToast("Черновик сохранён. Перейдите к характеристикам.");
    setTab("CATALOG");
  };

  const validateCatalog = () => {
    if (showPrice && (!price || Number(price) <= 0)) {
      setCatalogError("Введите цену товара");
      return false;
    }
    setCatalogError("");
    return true;
  };

  const handlePublish = () => {
    if (!validateCatalog()) return;
    setToast("Товар сохранён и опубликован (демо).");
    window.setTimeout(() => router.push("/products"), 600);
  };

  const handleDelete = () => {
    if (!window.confirm("Удалить товар?")) return;
    setToast("Товар удалён (демо).");
    window.setTimeout(() => router.push("/products"), 600);
  };

  const handleSaveStock = () => {
    for (const row of stockRows) {
      if (!row.place.trim()) {
        setStockMessage("Заполните названия складов/точек");
        return;
      }
      const priceNumber = Number(row.price);
      const balanceNumber = Number(row.balance);
      if (Number.isNaN(priceNumber) || priceNumber < 0) {
        setStockMessage("Цена должна быть неотрицательным числом");
        return;
      }
      if (Number.isNaN(balanceNumber) || balanceNumber < 0) {
        setStockMessage("Остаток должен быть неотрицательным числом");
        return;
      }
    }
    setStockMessage("Цены и остатки сохранены (демо).");
    setTimeout(() => setStockMessage(""), 4000);
  };

  const updateStockRow = (id: string, patch: Partial<StockRow>) => {
    setStockRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addStockRow = () => {
    setStockRows((prev) => [...prev, { id: createId(), place: "", price: "", balance: "" }]);
  };

  const removeStockRow = (id: string) => {
    setStockRows((prev) => prev.filter((row) => row.id !== id));
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Новый товар</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Заполните карточку и опубликуйте в каталоге.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={handleDelete}>
            Удалить товар
          </Button>
          <Button variant="secondary" onClick={() => setTab("BASICS")}>
            К основным данным
          </Button>
          <Button variant="primary" onClick={handlePublish}>
            Сохранить и опубликовать
          </Button>
        </div>
      </div>

      {toast && (
        <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(37,211,102,0.25)" }}>
          {toast}
        </div>
      )}

      <Card>
        <CardBody>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setTab("BASICS")}
              className={`btn ${tab === "BASICS" ? "btn-primary" : "btn-ghost"}`}
            >
              Основное
            </button>
            <button
              type="button"
              onClick={() => setTab("CATALOG")}
              className={`btn ${tab === "CATALOG" ? "btn-primary" : "btn-ghost"}`}
            >
              Каталог и характеристики
            </button>
            <button
              type="button"
              onClick={() => setTab("STOCK")}
              className={`btn ${tab === "STOCK" ? "btn-primary" : "btn-ghost"}`}
            >
              Цены и остатки
            </button>
          </div>
        </CardBody>
      </Card>

      {tab === "BASICS" && (
        <Card>
          <CardHeader title="Основное" subtitle="Название, категория и правила для баллов" />
          <CardBody style={{ display: "grid", gap: 16 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Название товара *</span>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например, Пицца Маргарита"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Артикул</span>
              <input
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                placeholder="Автогенерация, если оставить пустым"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Категория</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600 }}>Правила для баллов</div>
              <Toggle checked={accruePoints} onChange={setAccruePoints} label="Начислять баллы за товар" />
              <Toggle checked={allowRedeem} onChange={setAllowRedeem} label="Разрешить платить баллами за товар" />
              <label style={{ display: "grid", gap: 6, maxWidth: 240 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Какую часть товара можно оплатить баллами, %</span>
                <input
                  type="number"
                  value={redeemPart}
                  min={0}
                  max={100}
                  onChange={(event) => handleRedeemPartChange(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                />
              </label>
            </div>

            {basicError && (
              <div style={{ color: "#f87171", fontSize: 13 }}>{basicError}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" onClick={handleNextTab}>
                Далее
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === "CATALOG" && (
        <Card>
          <CardHeader title="Каталог и характеристики" subtitle="Описание, изображения, цена и параметры" />
          <CardBody style={{ display: "grid", gap: 20 }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Порядок показа</span>
                <input
                  type="number"
                  value={order}
                  onChange={(event) => setOrder(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Связанный товар в iiko (Delivery)</span>
                <select
                  value={linkedProduct}
                  onChange={(event) => setLinkedProduct(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                >
                  <option value="">Не выбрано</option>
                  {LINKED_PRODUCTS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Toggle
              checked={hasVariants}
              onChange={setHasVariants}
              label="Этот товар имеет варианты"
            />

            {hasVariants && (
              <div className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 600 }}>Варианты товара</div>
                  <Button variant="secondary" onClick={addVariant}>
                    Добавить вариант
                  </Button>
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {variants.map((variant) => (
                    <div key={variant.id} style={{ display: "grid", gap: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12 }}>
                      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 12, opacity: 0.7 }}>Название</span>
                          <input
                            value={variant.name}
                            onChange={(event) => updateVariant(variant.id, { name: event.target.value })}
                            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                          />
                        </label>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 12, opacity: 0.7 }}>Цена, ₽</span>
                          <input
                            type="number"
                            min={0}
                            value={variant.price}
                            onChange={(event) => updateVariant(variant.id, { price: event.target.value })}
                            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                          />
                        </label>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 12, opacity: 0.7 }}>Артикул</span>
                          <input
                            value={variant.sku}
                            onChange={(event) => updateVariant(variant.id, { sku: event.target.value })}
                            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                          />
                        </label>
                      </div>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, opacity: 0.7 }}>Характеристики</span>
                        <textarea
                          value={variant.characteristics}
                          onChange={(event) => updateVariant(variant.id, { characteristics: event.target.value })}
                          rows={2}
                          placeholder="Например: Размер XL, дополнительный сыр"
                          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit", resize: "vertical" }}
                        />
                      </label>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button variant="ghost" onClick={() => removeVariant(variant.id)}>
                          Удалить вариант
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!variants.length && (
                    <div style={{ fontSize: 13, opacity: 0.7 }}>Добавьте варианты, чтобы настроить размеры и модификации.</div>
                  )}
                </div>
              </div>
            )}

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              style={{
                border: "1px dashed rgba(255,255,255,0.2)",
                borderRadius: 12,
                padding: 20,
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontWeight: 600 }}>Изображения товара</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Перетащите файлы или загрузите (рекомендация 1000×1000)</div>
                </div>
                <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                  Загрузить
                  <input type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(event) => addImages(event.target.files)} />
                </label>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {gallery.map((item, index) => (
                  <div key={item.id} style={{ width: 140, display: "grid", gap: 6 }}>
                    <div style={{ position: "relative", width: "100%", height: 140, borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
                      <img src={item.src} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, wordBreak: "break-word" }}>{item.name}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button variant="ghost" onClick={() => moveImage(item.id, -1)} disabled={index === 0}>
                        ↑
                      </Button>
                      <Button variant="ghost" onClick={() => moveImage(item.id, 1)} disabled={index === gallery.length - 1}>
                        ↓
                      </Button>
                      <Button variant="ghost" onClick={() => removeImage(item.id)}>
                        ✕
                      </Button>
                    </div>
                  </div>
                ))}
                {!gallery.length && <div style={{ fontSize: 13, opacity: 0.7 }}>Галерея пока пуста.</div>}
              </div>
            </div>

            <RichTextEditor
              value={description}
              onChange={setDescription}
              label="Описание"
              placeholder="Расскажите о составе, особенностях подачи и преимуществах"
            />

            <div className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontWeight: 600 }}>Цена</div>
                <Toggle checked={showPrice} onChange={setShowPrice} label={showPrice ? "Показывать цену" : "Скрыть цену в карточке"} />
              </div>
              {showPrice && (
                <label style={{ display: "grid", gap: 4, maxWidth: 240 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Цена, ₽</span>
                  <input
                    type="number"
                    min={0}
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                  />
                </label>
              )}
              <Toggle checked={disableCart} onChange={setDisableCart} label="Запретить добавление в корзину" />
            </div>

            <div className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600 }}>Габариты</div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Вес</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={weight}
                      onChange={(event) => setWeight(event.target.value)}
                      placeholder="Например, 350"
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                    />
                    <select
                      value={weightUnits}
                      onChange={(event) => setWeightUnits(event.target.value)}
                      style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                    >
                      <option value="г">г</option>
                      <option value="кг">кг</option>
                    </select>
                  </div>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Высота, см</span>
                  <input
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Ширина, см</span>
                  <input
                    value={width}
                    onChange={(event) => setWidth(event.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Глубина, см</span>
                  <input
                    value={depth}
                    onChange={(event) => setDepth(event.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                  />
                </label>
              </div>
            </div>

            <div className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600 }}>Пищевая ценность (на 100 г/мл)</div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Белки, г</span>
                  <input
                    value={proteins}
                    onChange={(event) => setProteins(event.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Жиры, г</span>
                  <input
                    value={fats}
                    onChange={(event) => setFats(event.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Углеводы, г</span>
                  <input
                    value={carbs}
                    onChange={(event) => setCarbs(event.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Калорийность, ккал</span>
                  <input
                    value={calories}
                    onChange={(event) => setCalories(event.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                  />
                </label>
              </div>
            </div>

            <div className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600 }}>Маркерные теги</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {TAG_OPTIONS.map((tag) => {
                  const active = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <Toggle checked={visible} onChange={setVisible} label="Отображать товар в каталоге" />

            {catalogError && <div style={{ color: "#f87171", fontSize: 13 }}>{catalogError}</div>}
          </CardBody>
        </Card>
      )}

      {tab === "STOCK" && (
        <Card>
          <CardHeader title="Цены и остатки" subtitle="Настройте стоимость и остатки по складам и точкам" />
          <CardBody style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 12 }}>
              {stockRows.map((row) => (
                <div key={row.id} className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Склад / точка</span>
                      <input
                        value={row.place}
                        onChange={(event) => updateStockRow(row.id, { place: event.target.value })}
                        placeholder="Например, Основной склад"
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Цена, ₽</span>
                      <input
                        type="number"
                        min={0}
                        value={row.price}
                        onChange={(event) => updateStockRow(row.id, { price: event.target.value })}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Остаток</span>
                      <input
                        type="number"
                        min={0}
                        value={row.balance}
                        onChange={(event) => updateStockRow(row.id, { balance: event.target.value })}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button variant="ghost" onClick={() => removeStockRow(row.id)}>
                      Удалить строку
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" onClick={addStockRow}>
              Добавить строку
            </Button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="primary" onClick={handleSaveStock}>
                Сохранить цены и остатки
              </Button>
              <Button variant="secondary" onClick={() => setTab("CATALOG")}>
                К характеристикам
              </Button>
            </div>
            {stockMessage && <div style={{ color: stockMessage.includes("сохранены") ? "#4ade80" : "#f87171" }}>{stockMessage}</div>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
