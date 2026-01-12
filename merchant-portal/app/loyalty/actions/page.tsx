"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Power,
  Info,
  Calendar,
  Percent,
  Gift,
  Coins,
  ShoppingBag,
  X,
  ArrowLeft,
  Save,
  Clock,
  Users,
  Search,
  Check,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { createPortal } from "react-dom";
import { isAllCustomersAudience } from "../../../lib/audience-utils";
import { readApiError } from "lib/portal-errors";

type PromotionStatus = "active" | "disabled" | "ended";
type PromotionType = "double_points" | "buy_x_get_y" | "promo_price";
type PointsRuleType = "fixed" | "percent" | "multiplier";
type UsageLimit =
  | "unlimited"
  | "once_per_client"
  | "once_per_day"
  | "once_per_week"
  | "once_per_month";

interface PromotionConfig {
  targetType: "products" | "categories";
  selectedItemIds: string[];
  audience: string;
  usageLimit: UsageLimit;
  pointsRuleType: PointsRuleType;
  pointsValue: number;
  buyCount: number;
  freeCount: number;
  promoPrice: number;
  startImmediately: boolean;
  isIndefinite: boolean;
}

interface Promotion {
  id: string;
  title: string;
  type: PromotionType;
  startDate: string;
  endDate: string;
  status: PromotionStatus;
  revenue: number;
  cost: number;
  purchases: number;
  config: PromotionConfig;
  createdAt?: string | null;
  hasExplicitStartDate?: boolean;
}

type AudienceOption = {
  id: string;
  name: string;
  count: number;
  isAll: boolean;
};

type ProductOption = {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
};

type CategoryOption = {
  id: string;
  name: string;
  count: number;
};

const usageLimitValues = new Set<UsageLimit>([
  "unlimited",
  "once_per_client",
  "once_per_day",
  "once_per_week",
  "once_per_month",
]);

const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

const calculateROI = (revenue: number, cost: number): number => {
  if (cost === 0) return 0;
  return ((revenue - cost) / cost) * 100;
};

const formatDateInputValue = (date: Date) =>
  date.toLocaleDateString("en-CA");

const parseDateInputValue = (value: string): Date | null => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : null;
};

function safeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatDateRu(value: unknown, fallback: string) {
  if (!value) return fallback;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("ru-RU");
}

function resolvePromotionStatus(item: any): PromotionStatus {
  const status = String(item?.status || "").toUpperCase();
  const endAt = item?.endAt ? new Date(item.endAt) : null;
  if (endAt && Number.isFinite(endAt.getTime()) && endAt.getTime() < Date.now()) return "ended";
  if (status === "ACTIVE" || status === "SCHEDULED") return "active";
  return "disabled";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item == null ? "" : String(item)))
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUsageLimit(value: unknown): UsageLimit {
  const raw = String(value || "").trim();
  if (usageLimitValues.has(raw as UsageLimit)) return raw as UsageLimit;
  return "unlimited";
}

const defaultConfig: PromotionConfig = {
  targetType: "products",
  selectedItemIds: [],
  audience: "all",
  usageLimit: "unlimited",
  pointsRuleType: "multiplier",
  pointsValue: 2,
  buyCount: 2,
  freeCount: 1,
  promoPrice: 99,
  startImmediately: true,
  isIndefinite: false,
};

const PromotionsPage: React.FC = () => {
  const onNavigate = (view: string) => {
    if (view === "audiences") window.location.assign("/audiences");
  };
  const [view, setView] = useState<"list" | "create">("list");
  const [activeTab, setActiveTab] = useState<PromotionStatus>("active");

  // Creation/Edit Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCreatedAtIso, setEditingCreatedAtIso] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<PromotionType | null>(null);
  const [isTypeSelectionOpen, setIsTypeSelectionOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const [audiences, setAudiences] = useState<AudienceOption[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectionByTarget, setSelectionByTarget] = useState<{ products: string[]; categories: string[] }>({
    products: [],
    categories: [],
  });

  const allAudience = useMemo(() => audiences.find((a) => a.isAll) ?? null, [audiences]);
  const allAudienceId = allAudience?.id ?? "";
  const audienceOptions = useMemo(() => audiences.filter((a) => !a.isAll), [audiences]);

  // Form Data State
  const [formData, setFormData] = useState({
    title: "",
    isActive: false,
    startDate: formatDateInputValue(new Date()),
    endDate: formatDateInputValue(new Date(Date.now() + 86400000 * 7)),
    ...defaultConfig,
  });

  const getAudienceLabel = (id: string) => {
    if (id === "all") return "Все клиенты";
    const aud = audiences.find((a) => a.id === id);
    return aud ? aud.name : "Неизвестно";
  };

  const loadAudiences = async () => {
    const res = await fetch("/api/portal/audiences?includeSystem=1");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(readApiError(text) || "Не удалось загрузить аудитории");
    }
    const json = await res.json();
    const mapped: AudienceOption[] = Array.isArray(json)
      ? json.map((a: any) => ({
          id: String(a.id),
          name: String(a.name || "Без названия"),
          count: Math.max(0, safeNumber(a?._count?.customers ?? a?.customersCount ?? 0)),
          isAll: isAllCustomersAudience(a),
        }))
      : [];
    mapped.sort((a, b) => Number(b.isAll) - Number(a.isAll));
    setAudiences(mapped);
    return mapped.find((a) => a.isAll)?.id ?? "";
  };

  const loadCatalog = async () => {
    const [categoriesRes, productsRes] = await Promise.all([
      fetch("/api/portal/catalog/categories"),
      fetch("/api/portal/catalog/products"),
    ]);
    if (!categoriesRes.ok) {
      const text = await categoriesRes.text().catch(() => "");
      throw new Error(readApiError(text) || "Не удалось загрузить категории");
    }
    if (!productsRes.ok) {
      const text = await productsRes.text().catch(() => "");
      throw new Error(readApiError(text) || "Не удалось загрузить товары");
    }
    const categoriesPayload = await categoriesRes.json();
    const productsPayload = await productsRes.json();

    const categoryRows = Array.isArray(categoriesPayload) ? categoriesPayload : [];
    const productRows = Array.isArray(productsPayload?.items) ? productsPayload.items : [];

    const categoryNameMap = new Map<string, string>();
    categoryRows.forEach((c: any) => {
      categoryNameMap.set(String(c.id), String(c.name || c.id || ""));
    });

    const counts = new Map<string, number>();
    productRows.forEach((p: any) => {
      const catId = p?.categoryId ? String(p.categoryId) : null;
      if (!catId) return;
      counts.set(catId, (counts.get(catId) || 0) + 1);
    });

    const mappedCategories: CategoryOption[] = categoryRows.map((c: any) => ({
      id: String(c.id),
      name: String(c.name || c.id || ""),
      count: counts.get(String(c.id)) || 0,
    }));

    const mappedProducts: ProductOption[] = productRows.map((p: any) => {
      const categoryId = p?.categoryId ? String(p.categoryId) : null;
      return {
        id: String(p.id),
        name: String(p.name || p.id || ""),
        category: categoryId ? categoryNameMap.get(categoryId) || "Без категории" : "Без категории",
        categoryId,
      };
    });

    setCategories(mappedCategories);
    setProducts(mappedProducts);
  };

  const resolveCategoryName = React.useCallback(
    (categoryId?: string | null) => {
      if (!categoryId) return "Без категории";
      const category = categories.find((item) => item.id === categoryId);
      return category?.name || "Без категории";
    },
    [categories],
  );

  const ensureSelectedProductsLoaded = React.useCallback(
    async (selectedIds: string[]) => {
      if (!selectedIds.length) return;
      const existingIds = new Set(products.map((item) => item.id));
      const missingIds = selectedIds.filter((id) => !existingIds.has(id));
      if (!missingIds.length) return;
      const results = await Promise.all(
        missingIds.map(async (id) => {
          const res = await fetch(`/api/portal/catalog/products/${encodeURIComponent(id)}`);
          if (!res.ok) return null;
          const product = await res.json().catch(() => null);
          if (!product) return null;
          const categoryId = product?.categoryId ? String(product.categoryId) : null;
          const name = String(product?.name || product?.id || "").trim();
          if (!name) return null;
          return {
            id: String(product.id),
            name,
            category: resolveCategoryName(categoryId),
            categoryId,
          } as ProductOption;
        }),
      );
      const loaded = results.filter((item): item is ProductOption => Boolean(item));
      if (!loaded.length) return;
      setProducts((prev) => {
        const next = [...prev];
        const prevIds = new Set(prev.map((item) => item.id));
        loaded.forEach((item) => {
          if (!prevIds.has(item.id)) next.push(item);
        });
        return next;
      });
    },
    [products, resolveCategoryName],
  );

  const loadPromotions = async (audAllId: string) => {
    const res = await fetch("/api/portal/loyalty/promotions");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(readApiError(text) || "Не удалось загрузить акции");
    }
    const json = await res.json();
    const mapped: Promotion[] = Array.isArray(json)
      ? (json
          .map((item: any) => {
            const rewardMeta =
              item?.rewardMetadata && typeof item.rewardMetadata === "object" ? item.rewardMetadata : {};
            const productIds = normalizeStringArray(rewardMeta.productIds);
            const categoryIds = normalizeStringArray(rewardMeta.categoryIds);
            const rewardType = String(item?.rewardType || "").toUpperCase();
            if (rewardType !== "POINTS" && rewardType !== "DISCOUNT") return null;
            const kindRaw = String(rewardMeta.kind || "").toUpperCase();
            const hasTargets = productIds.length > 0 || categoryIds.length > 0;
            const isProductPromo = hasTargets || kindRaw === "NTH_FREE" || kindRaw === "FIXED_PRICE";
            if (!isProductPromo) return null;

            const type: PromotionType =
              kindRaw === "NTH_FREE"
                ? "buy_x_get_y"
                : kindRaw === "FIXED_PRICE"
                  ? "promo_price"
                  : "double_points";

            const metrics = item?.metrics ?? {};
            const revenue = Math.max(0, safeNumber(metrics?.revenueGenerated ?? metrics?.revenue ?? 0));
            const cost = Math.max(
              0,
              safeNumber(
                metrics?.discountTotal ??
                  metrics?.discounts ??
                  metrics?.pointsRedeemed ??
                  metrics?.pointsIssued ??
                  0,
              ),
            );
            const purchases = Math.max(
              0,
              Math.round(safeNumber(metrics?.purchasesCount ?? metrics?.purchases ?? metrics?.participantsCount ?? metrics?.totalUsage ?? 0)),
            );

            const createdAtIso = item?.createdAt ? String(item.createdAt) : null;
            const hasExplicitStartDate = Boolean(item?.startAt);
            const startDateValue = item?.startAt ?? createdAtIso;
            const startDate = startDateValue ? formatDateRu(startDateValue, "—") : "—";
            const endDate = item?.endAt ? formatDateRu(item.endAt, "—") : "Бессрочно";
            const status = resolvePromotionStatus(item);

            const audienceRaw = item?.segmentId ? String(item.segmentId) : "";
            const audience = audienceRaw && audAllId && audienceRaw === audAllId ? "all" : audienceRaw || "all";
            const usageLimitRaw = item?.metadata?.usageLimit ?? null;
            const usageLimit = normalizeUsageLimit(usageLimitRaw);
            const startImmediately = !hasExplicitStartDate;
            const isIndefinite = !item?.endAt;

            const ruleRaw = String(rewardMeta?.pointsRuleType ?? "").toLowerCase();
            let pointsRuleType: PointsRuleType = "multiplier";
            if (ruleRaw === "percent" || ruleRaw === "fixed" || ruleRaw === "multiplier") {
              pointsRuleType = ruleRaw as PointsRuleType;
            }

            const metaPointsValue = safeNumber(rewardMeta?.pointsValue);
            let pointsValue = 0;
            if (pointsRuleType === "multiplier") {
              pointsValue = metaPointsValue || 2;
            } else if (pointsRuleType === "percent") {
              pointsValue = metaPointsValue || 1;
            } else {
              pointsValue = metaPointsValue || 0;
            }

            const buyCount = Math.max(1, Math.trunc(safeNumber(rewardMeta?.buyQty ?? 2)));
            const freeCount = Math.max(1, Math.trunc(safeNumber(rewardMeta?.freeQty ?? 1)));
            const promoPrice = Math.max(0, safeNumber(rewardMeta?.price ?? 0));

            const targetType: PromotionConfig["targetType"] = productIds.length ? "products" : categoryIds.length ? "categories" : "products";
            const selectedItemIds = targetType === "products" ? productIds : categoryIds;

            return {
              id: String(item?.id ?? ""),
              title: String(item?.name ?? "Без названия"),
              type,
              startDate,
              endDate,
              status,
              revenue,
              cost,
              purchases,
              createdAt: createdAtIso,
              hasExplicitStartDate,
              config: {
                targetType,
                selectedItemIds,
                audience,
                usageLimit,
                pointsRuleType,
                pointsValue,
                buyCount,
                freeCount,
                promoPrice,
                startImmediately,
                isIndefinite,
              },
            };
          })
          .filter((promo: Promotion | null): promo is Promotion => promo !== null) as Promotion[])
      : [];
    setPromotions(mapped);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadCatalog();
      } catch (e: any) {
        if (mounted) alert(e?.message || "Не удалось загрузить каталог");
      }
      let audAllId = "";
      try {
        audAllId = await loadAudiences();
      } catch (e: any) {
        if (mounted) alert(e?.message || "Не удалось загрузить аудитории");
      }
      try {
        await loadPromotions(audAllId);
      } catch (e: any) {
        if (mounted) alert(e?.message || "Не удалось загрузить акции");
        if (mounted) setPromotions([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredPromotions = promotions.filter((p) => p.status === activeTab);

  const startCreation = (type: PromotionType) => {
    setSelectedType(type);
    setEditingId(null);
    setEditingCreatedAtIso(null);
    setIsTypeSelectionOpen(false);
    setSelectionByTarget({ products: [], categories: [] });

    setFormData({
      title: type === "double_points" ? "Акционные баллы" : type === "buy_x_get_y" ? "Акция 2+1" : "Специальная цена",
      isActive: false,
      startDate: formatDateInputValue(new Date()),
      endDate: formatDateInputValue(new Date(Date.now() + 86400000 * 7)),
      ...defaultConfig,
    });
    setProductSearch("");
    setView("create");
  };

  const handleEdit = (promo: Promotion) => {
    setSelectedType(promo.type);
    setEditingId(promo.id);
    setEditingCreatedAtIso(promo.createdAt ?? null);

    const parseDate = (dateStr: string) => {
      const today = new Date().toISOString().slice(0, 10);
      if (dateStr === "Бессрочно" || dateStr === "—") return today;
      const parts = dateStr.split(".");
      if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
      return dateStr;
    };

    const targetType = promo.config.targetType;
    const selectedItemIds = promo.config.selectedItemIds;

    setSelectionByTarget({
      products: targetType === "products" ? selectedItemIds : [],
      categories: targetType === "categories" ? selectedItemIds : [],
    });

    if (targetType === "products") {
      void ensureSelectedProductsLoaded(selectedItemIds);
    }

    setFormData({
      title: promo.title,
      isActive: promo.status === "active",
      startDate: parseDate(promo.startDate),
      endDate: parseDate(promo.endDate),
      targetType,
      selectedItemIds,
      audience: promo.config.audience,
      usageLimit: promo.config.usageLimit,
      pointsRuleType: promo.config.pointsRuleType,
      pointsValue: promo.config.pointsValue,
      buyCount: promo.config.buyCount,
      freeCount: promo.config.freeCount,
      promoPrice: promo.config.promoPrice,
      startImmediately: promo.config.startImmediately,
      isIndefinite: promo.config.isIndefinite,
    });

    setProductSearch("");
    setView("create");
  };

  const upsertPromotion = async (payload: any) => {
    const endpoint = editingId ? `/api/portal/loyalty/promotions/${encodeURIComponent(editingId)}` : "/api/portal/loyalty/promotions";
    const res = await fetch(endpoint, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(readApiError(text) || "Не удалось сохранить акцию");
    }
  };

  const handleSave = async () => {
    if (!selectedType) return;
    if (saving) return;
    const activeSelection = selectionByTarget[formData.targetType] ?? formData.selectedItemIds;
    if (!formData.title.trim()) {
      alert("Введите название акции");
      return;
    }
    if (selectedType === "double_points" && safeNumber(formData.pointsValue) <= 0) {
      alert("Укажите значение начисления");
      return;
    }
    if (selectedType === "buy_x_get_y" && (safeNumber(formData.buyCount) <= 0 || safeNumber(formData.freeCount) <= 0)) {
      alert("Укажите корректное количество товаров");
      return;
    }
    if (selectedType === "promo_price" && safeNumber(formData.promoPrice) <= 0) {
      alert("Укажите акционную цену");
      return;
    }
    if (!activeSelection.length) {
      alert("Выберите товары или категории");
      return;
    }
    if (formData.startDate && formData.endDate && !formData.isIndefinite) {
      const start = parseDateInputValue(formData.startDate);
      const end = parseDateInputValue(formData.endDate);
      if (start && end && start.getTime() > end.getTime()) {
        alert("Дата начала не может быть позже даты завершения");
        return;
      }
    }

    const startAt = formData.startImmediately ? null : parseDateInputValue(formData.startDate);
    const endAt = formData.isIndefinite ? null : parseDateInputValue(formData.endDate);
    const startIso = startAt && Number.isFinite(startAt.getTime()) ? startAt.toISOString() : null;
    const endIso = endAt && Number.isFinite(endAt.getTime()) ? endAt.toISOString() : null;

    const status = formData.isActive ? "ACTIVE" : "DRAFT";

    const selectedAudience = formData.audience || allAudienceId || "all";
    const audienceIdToSend =
      selectedAudience === "all" || (allAudienceId && selectedAudience === allAudienceId) ? null : selectedAudience;

    const productIds = formData.targetType === "products" ? activeSelection : [];
    const categoryIds = formData.targetType === "categories" ? activeSelection : [];

    const rewardMetadataBase = {
      productIds,
      categoryIds,
    };

    let rewardType: "POINTS" | "DISCOUNT" = "POINTS";
    let rewardValue = 0;
    let rewardMetadata: Record<string, any> = { ...rewardMetadataBase };

    if (selectedType === "buy_x_get_y") {
      rewardType = "DISCOUNT";
      rewardMetadata = {
        ...rewardMetadataBase,
        kind: "NTH_FREE",
        buyQty: Math.max(1, Math.trunc(safeNumber(formData.buyCount))),
        freeQty: Math.max(1, Math.trunc(safeNumber(formData.freeCount))),
      };
      rewardValue = 0;
    } else if (selectedType === "promo_price") {
      const price = Math.max(0, safeNumber(formData.promoPrice));
      rewardType = "DISCOUNT";
      rewardMetadata = {
        ...rewardMetadataBase,
        kind: "FIXED_PRICE",
        price,
      };
      rewardValue = Math.round(price);
    } else {
      const pointsValue = Math.max(0, safeNumber(formData.pointsValue));
      rewardMetadata = {
        ...rewardMetadataBase,
        pointsRuleType: formData.pointsRuleType,
        pointsValue,
      };
      rewardValue = 0;
    }

    const payload = {
      name: formData.title.trim(),
      description: "",
      status,
      startAt: startIso,
      endAt: endIso,
      segmentId: audienceIdToSend,
      rewardType,
      rewardValue,
      rewardMetadata,
      metadata: {
        usageLimit: formData.usageLimit,
      },
    };

    setSaving(true);
    try {
      await upsertPromotion(payload);
      await loadPromotions(allAudienceId);
      setView("list");
      setActiveTab(formData.isActive ? "active" : "disabled");
    } catch (e: any) {
      alert(e?.message || "Не удалось сохранить акцию");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Вы уверены, что хотите удалить эту акцию?")) return;
    const res = await fetch(`/api/portal/loyalty/promotions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      alert(readApiError(text) || "Не удалось удалить акцию");
      return;
    }
    await loadPromotions(allAudienceId);
  };

  const handleToggleStatus = async (id: string, currentStatus: PromotionStatus) => {
    if (currentStatus === "ended") return;
    const newStatus = currentStatus === "active" ? "PAUSED" : "ACTIVE";
    const res = await fetch(`/api/portal/loyalty/promotions/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      alert(readApiError(text) || "Не удалось изменить статус акции");
      return;
    }
    await loadPromotions(allAudienceId);
  };

  const toggleSelection = (id: string) => {
    setSelectionByTarget((prevSelection) => {
      const current = prevSelection[formData.targetType] ?? [];
      const exists = current.includes(id);
      const nextSelected = exists ? current.filter((item) => item !== id) : [...current, id];
      setFormData((prev) => ({ ...prev, selectedItemIds: nextSelected }));
      return { ...prevSelection, [formData.targetType]: nextSelected };
    });
  };

  const handleTargetSwitch = (nextTarget: PromotionConfig["targetType"]) => {
    if (nextTarget === formData.targetType) return;
    const nextSelected = selectionByTarget[nextTarget] ?? [];
    setFormData((prev) => ({
      ...prev,
      targetType: nextTarget,
      selectedItemIds: nextSelected,
    }));
  };

  const getIconForType = (type: PromotionType) => {
    switch (type) {
      case "double_points":
        return <Coins size={20} className="text-yellow-600" />;
      case "buy_x_get_y":
        return <Gift size={20} className="text-purple-600" />;
      case "promo_price":
        return <Percent size={20} className="text-red-600" />;
    }
  };

  const getTypeLabel = (type: PromotionType) => {
    switch (type) {
      case "double_points":
        return "Акционные баллы";
      case "buy_x_get_y":
        return "N-ый товар бесплатно";
      case "promo_price":
        return "Акционная цена";
    }
  };

  const visibleItems = useMemo(() => {
    if (formData.targetType === "products") {
      return products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
    }
    return categories.filter((c) => c.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [formData.targetType, productSearch, products, categories]);

  const renderCreateForm = () => {
    return (
      <div className="max-w-4xl mx-auto pb-10">
        {/* Creation Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button onClick={() => setView("list")} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{editingId ? "Редактирование акции" : "Создание акции"}</h2>
              <p className="text-sm text-gray-500">{getTypeLabel(selectedType!)}</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3 bg-white px-4 py-2 rounded-lg border border-gray-200">
              <span className={`text-sm font-medium ${formData.isActive ? "text-green-600" : "text-gray-500"}`}>
                {formData.isActive ? "Активна" : "Черновик"}
              </span>
              <button
                onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full focus:outline-none ${formData.isActive ? "bg-green-500" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white ${formData.isActive ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            <button
              onClick={handleSave}
              className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 shadow-sm"
            >
              <Save size={18} />
              <span>Сохранить</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Main Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. General Info */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-gray-900">Основная информация</h3>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700">Название акции</label>
                  <span className={`text-xs ${formData.title.length >= 60 ? "text-red-500" : "text-gray-400"}`}>
                    {formData.title.length}/60
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={60}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  placeholder="Например: Двойные баллы на утренний кофе"
                />
                <p className="text-xs text-gray-500 mt-1">Краткое название для отображения в списке.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Начало акции</label>
                  <div className="space-y-2">
                    <input
                      type="date"
                      disabled={formData.startImmediately}
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.startImmediately}
                        onChange={(e) => setFormData({ ...formData, startImmediately: e.target.checked })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-600">Начать сразу после создания</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Завершение</label>
                  <div className="space-y-2">
                    <input
                      type="date"
                      disabled={formData.isIndefinite}
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isIndefinite}
                        onChange={(e) => setFormData({ ...formData, isIndefinite: e.target.checked })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-600">Бессрочно</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Products Selector */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">Товары и Категории</h3>
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                  Выбрано: {formData.selectedItemIds.length}
                </span>
              </div>

              <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
                <button
                  onClick={() => handleTargetSwitch("products")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md ${formData.targetType === "products" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
                >
                  Товары
                </button>
                <button
                  onClick={() => handleTargetSwitch("categories")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md ${formData.targetType === "categories" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
                >
                  Категории
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={formData.targetType === "products" ? "Поиск товаров по названию..." : "Поиск категорий..."}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto custom-scrollbar">
                {visibleItems.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">Ничего не найдено</div>
                ) : (
                  visibleItems.map((item) => {
                    const isSelected = formData.selectedItemIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSelection(item.id)}
                        className={`p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer ${isSelected ? "bg-purple-50 hover:bg-purple-50" : ""}`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${isSelected ? "bg-purple-200 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                            {item.name.charAt(0)}
                          </div>
                          <div>
                            <div className={`text-sm font-medium ${isSelected ? "text-purple-900" : "text-gray-900"}`}>
                              {item.name}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center space-x-2">
                              {formData.targetType === "products" && "category" in item && (
                                <>
                                  <span className="bg-gray-100 px-1.5 rounded">{item.category}</span>
                                </>
                              )}
                              {formData.targetType === "categories" && "count" in item && <span>{item.count} товаров</span>}
                            </div>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? "bg-purple-600 border-purple-600" : "border-gray-300 bg-white"}`}>
                          {isSelected && <Check size={14} className="text-white" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. Mechanics Specific Settings */}
            <div className="bg-white p-6 rounded-xl border border-purple-100 shadow-sm space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full -mr-10 -mt-10 z-0"></div>
              <h3 className="text-lg font-bold text-gray-900 relative z-10">Настройка выгоды</h3>

              {/* TYPE: POINTS */}
              {selectedType === "double_points" && (
                <div className="space-y-6 relative z-10">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Правило начисления</label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => setFormData({ ...formData, pointsRuleType: "multiplier" })}
                        className={`p-3 border rounded-xl flex flex-col items-center justify-center space-y-2 ${formData.pointsRuleType === "multiplier" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 hover:border-purple-200"}`}
                      >
                        <span className="font-bold text-lg">X2</span>
                        <span className="text-xs">Множитель</span>
                      </button>
                      <button
                        onClick={() => setFormData({ ...formData, pointsRuleType: "percent" })}
                        className={`p-3 border rounded-xl flex flex-col items-center justify-center space-y-2 ${formData.pointsRuleType === "percent" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 hover:border-purple-200"}`}
                      >
                        <Percent size={20} />
                        <span className="text-xs">% от цены</span>
                      </button>
                      <button
                        onClick={() => setFormData({ ...formData, pointsRuleType: "fixed" })}
                        className={`p-3 border rounded-xl flex flex-col items-center justify-center space-y-2 ${formData.pointsRuleType === "fixed" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 hover:border-purple-200"}`}
                      >
                        <Coins size={20} />
                        <span className="text-xs">Фикс. баллы</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {formData.pointsRuleType === "multiplier"
                        ? "Значение множителя"
                        : formData.pointsRuleType === "percent"
                          ? "Процент начисления"
                          : "Количество баллов"}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={formData.pointsValue}
                        onChange={(e) => setFormData({ ...formData, pointsValue: Number(e.target.value) })}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                        {formData.pointsRuleType === "multiplier" ? "X" : formData.pointsRuleType === "percent" ? "%" : "B"}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {formData.pointsRuleType === "multiplier" && `Клиент получит в ${formData.pointsValue} раза больше баллов, чем по базовому тарифу.`}
                      {formData.pointsRuleType === "percent" && `Клиент получит ${formData.pointsValue}% от стоимости товара в виде баллов.`}
                      {formData.pointsRuleType === "fixed" && `За покупку товара будет начислено ровно ${formData.pointsValue} баллов.`}
                    </p>
                  </div>
                </div>
              )}

              {/* TYPE: BUNDLE */}
              {selectedType === "buy_x_get_y" && (
                <div className="grid grid-cols-2 gap-6 relative z-10">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Купить (N)</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={formData.buyCount}
                        onChange={(e) => setFormData({ ...formData, buyCount: Number(e.target.value) })}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">шт.</div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">В подарок (M)</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={formData.freeCount}
                        onChange={(e) => setFormData({ ...formData, freeCount: Number(e.target.value) })}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">шт.</div>
                    </div>
                  </div>
                  <div className="col-span-2 bg-blue-50 text-blue-800 p-3 rounded-lg text-sm flex items-start space-x-2">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <span>При покупке {formData.buyCount} товаров, клиент получит еще {formData.freeCount} бесплатно. В чеке будет {formData.buyCount + formData.freeCount} позиций.</span>
                  </div>
                </div>
              )}

              {/* TYPE: PRICE */}
              {selectedType === "promo_price" && (
                <div className="relative z-10">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Новая цена товара</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.promoPrice}
                      onChange={(e) => setFormData({ ...formData, promoPrice: Number(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none pl-8"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₽</div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Эта цена будет применена ко всем выбранным товарам на период акции.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Targeting & Limits */}
          <div className="space-y-6">
            {/* Audience */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg">
                  <Users size={20} className="text-gray-400" />
                  <h3>Аудитория</h3>
                </div>
                <button title="Перейти к аудиториям" className="text-purple-600 hover:text-purple-800" onClick={() => onNavigate("audiences")}> 
                  <ExternalLink size={16} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Выберите сегмент</label>
                <select
                  value={formData.audience}
                  onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="all">Все клиенты</option>
                  {audienceOptions.map((aud) => (
                    <option key={aud.id} value={aud.id}>
                      {aud.name} ({aud.count} чел.)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  {formData.audience === "all"
                    ? "Акция будет доступна всем зарегистрированным клиентам."
                    : `Акция доступна только клиентам из сегмента \"${audienceOptions.find((aud) => aud.id === formData.audience)?.name || ""}\".`}
                </p>
              </div>
            </div>

            {/* Limits */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg mb-2">
                <Clock size={20} className="text-gray-400" />
                <h3>Ограничения</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Частота использования</label>
                <select
                  value={formData.usageLimit}
                  onChange={(e) => setFormData({ ...formData, usageLimit: normalizeUsageLimit(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="unlimited">Без ограничений</option>
                  <option value="once_per_client">1 раз на клиента</option>
                  <option value="once_per_day">1 раз в сутки</option>
                  <option value="once_per_week">1 раз в неделю</option>
                  <option value="once_per_month">1 раз в месяц</option>
                </select>
              </div>

              <div className="p-3 bg-yellow-50 rounded-lg text-xs text-yellow-700 flex items-start space-x-2">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>Ограничение действует на уровне аккаунта клиента.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (view === "create") {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        {renderCreateForm()}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Акции с товарами</h2>
          <p className="text-gray-500 mt-1">Управление товарными акциями, скидками и бонусами.</p>
        </div>

        <button
          onClick={() => setIsTypeSelectionOpen(true)}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm"
        >
          <Plus size={18} />
          <span>Создать акцию</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(["active", "disabled", "ended"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab
                    ? "border-purple-500 text-purple-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }
              `}
            >
              {tab === "active" && "Активные"}
              {tab === "disabled" && "Выключенные"}
              {tab === "ended" && "Прошедшие"}
              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === tab ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500"}`}>
                {promotions.filter((p) => p.status === tab).length}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Grid */}
      {filteredPromotions.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-100 border-dashed">
          <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Здесь пока ничего нет</h3>
          <p className="text-gray-500">В этом разделе пока нет акций.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {filteredPromotions.map((promo) => {
            const roi = calculateROI(promo.revenue, promo.cost);
            return (
              <div key={promo.id} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md relative group">
                {/* Top Row: Status & Actions */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2 rounded-lg ${
                        promo.type === "double_points" ? "bg-yellow-50" : promo.type === "buy_x_get_y" ? "bg-purple-50" : "bg-red-50"
                      }`}
                    >
                      {getIconForType(promo.type)}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{getTypeLabel(promo.type)}</span>
                      <div className="flex items-center text-sm text-gray-400 mt-0.5">
                        <Calendar size={12} className="mr-1" />
                        {promo.startDate} - {promo.endDate}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEdit(promo)}
                      title="Редактировать"
                      className="p-2 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50"
                    >
                      <Pencil size={18} />
                    </button>
                    {promo.status !== "ended" && (
                      <button
                        onClick={() => handleToggleStatus(promo.id, promo.status)}
                        title={promo.status === "active" ? "Выключить" : "Включить"}
                        className={`p-2 rounded-lg ${promo.status === "active" ? "text-green-600 bg-green-50 hover:bg-green-100" : "text-gray-400 bg-gray-100 hover:bg-gray-200"}`}
                      >
                        <Power size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(promo.id)}
                      title="Удалить"
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Title & Badge */}
                <div className="mb-3 pr-4 mt-2 min-h-[2.5rem]">
                  <h3 className="text-lg font-bold text-gray-900 line-clamp-2 leading-tight break-words" title={promo.title}>
                    {promo.title}
                    <span className="inline-flex items-center ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 align-middle whitespace-nowrap">
                      <Users size={12} className="mr-1" />
                      {getAudienceLabel(promo.config.audience)}
                    </span>
                  </h3>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-50">
                  {/* ROI */}
                  <div>
                    <div className="relative group/tooltip w-fit flex items-center text-xs text-gray-500 mb-1 cursor-help">
                      <span>ROI</span>
                      <Info size={10} className="ml-1 text-gray-300" />
                      <div className="hidden group-hover/tooltip:block absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-20 shadow-xl pointer-events-none">
                        Насколько окупились ваши вложения. <br />
                        Формула: (Выручка - Расходы)/Расходы * 100%
                      </div>
                    </div>
                    <div className={`text-lg font-bold ${roi > 0 ? "text-green-600" : roi < 0 ? "text-red-500" : "text-gray-700"}`}>
                      {roi > 0 ? "+" : ""}
                      {roi.toFixed(0)}%
                    </div>
                  </div>

                  {/* Revenue */}
                  <div>
                    <div className="relative group/tooltip w-fit flex items-center text-xs text-gray-500 mb-1 cursor-help">
                      <span>Выручка</span>
                      <Info size={10} className="ml-1 text-gray-300" />
                      <div className="hidden group-hover/tooltip:block absolute bottom-full left-0 sm:left-1/2 sm:-translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-20 shadow-xl pointer-events-none">
                        Сумма чеков с применёнными акциями без учёта скидок и подарков. Возвраты не учитываются.
                      </div>
                    </div>
                    <div className="text-lg font-bold text-gray-900">{formatCurrency(promo.revenue)}</div>
                  </div>

                  {/* Cost */}
                  <div>
                    <div className="relative group/tooltip w-fit flex items-center text-xs text-gray-500 mb-1 cursor-help">
                      <span>Расходы</span>
                      <Info size={10} className="ml-1 text-gray-300" />
                      <div className="hidden group-hover/tooltip:block absolute bottom-full left-0 sm:left-1/2 sm:-translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-20 shadow-xl pointer-events-none">
                        Сумма скидок с применённых акций.
                      </div>
                    </div>
                    <div className="text-lg font-bold text-gray-900">{formatCurrency(promo.cost)}</div>
                  </div>

                  {/* Purchases */}
                  <div>
                    <div className="flex items-center text-xs text-gray-500 mb-1">
                      <span>Покупок</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">{promo.purchases}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Type Selection Modal */}
      {isTypeSelectionOpen &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-[101] overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="text-xl font-bold text-gray-900">Создать акцию</h3>
                <button onClick={() => setIsTypeSelectionOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-500 mb-4">Выберите тип механики для новой акции:</p>

                <button
                  onClick={() => startCreation("double_points")}
                  className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 flex items-start space-x-4 group"
                >
                  <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg group-hover:bg-yellow-100">
                    <Coins size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 group-hover:text-purple-700">Акционные баллы на товары</h4>
                    <p className="text-sm text-gray-500 mt-1">Клиенты получают дополнительные баллы за покупку определенных товаров.</p>
                  </div>
                </button>

                <button
                  onClick={() => startCreation("buy_x_get_y")}
                  className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 flex items-start space-x-4 group"
                >
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-100">
                    <Gift size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 group-hover:text-purple-700">Каждый N-ый товар бесплатно</h4>
                    <p className="text-sm text-gray-500 mt-1">Механики «2+1», «3-й в подарок» и другие комплектные акции.</p>
                  </div>
                </button>

                <button
                  onClick={() => startCreation("promo_price")}
                  className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 flex items-start space-x-4 group"
                >
                  <div className="p-3 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-100">
                    <Percent size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 group-hover:text-purple-700">Акционная цена на товары</h4>
                    <p className="text-sm text-gray-500 mt-1">Установите фиксированную цену на выбранные товары.</p>
                  </div>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default PromotionsPage;
