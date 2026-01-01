"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Plus,
  Search,
  Filter,
  AlertCircle,
  Edit,
  Trash2,
  Eye,
  ArrowLeft,
  Save,
  Calendar,
  ShoppingBag,
  DollarSign,
  Target,
  User,
  Check,
  Loader2,
  X,
  Phone,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createPortal } from "react-dom";
import { isAllCustomersAudience } from "../../lib/audience-utils";
import { readApiError } from "lib/portal-errors";

type Audience = {
  id: string;
  name: string;
  count: number;
  createdAt: string;
  description: string;
  filters: Record<string, unknown>;
  isSystem: boolean;
  isAllCustomers: boolean;
  systemKey?: string | null;
};

type AudienceFormData = {
  name: string;
  selectedOutlets: string[];
  targetType: "products" | "categories";
  selectedProducts: string[];
  selectedCategories: string[];
  gender: "all" | "M" | "F" | "U";
  ageFrom: string;
  ageTo: string;
  birthdayBefore: string;
  birthdayAfter: string;
  regDaysFrom: string;
  regDaysTo: string;
  lastPurchaseFrom: string;
  lastPurchaseTo: string;
  purchaseCountFrom: string;
  purchaseCountTo: string;
  avgCheckFrom: string;
  avgCheckTo: string;
  totalSpendFrom: string;
  totalSpendTo: string;
  selectedLevels: string[];
  selectedR: string[];
  selectedF: string[];
  selectedM: string[];
};

type OutletOption = { id: string; name: string };

type ProductItem = {
  id: string;
  name: string;
  categoryId?: string | null;
  category?: string | null;
};

type CategoryItem = {
  id: string;
  name: string;
  count: number;
};

type LevelOption = { id: string; name: string; thresholdAmount: number | null; isInitial: boolean };

type AudienceMember = {
  id: string;
  phone: string;
  name: string;
  levelId: string | null;
  levelName: string | null;
  daysSinceLastVisit: number | null;
  totalSpend: number;
};

const initialFormData: AudienceFormData = {
  name: "",
  selectedOutlets: [],
  targetType: "products",
  selectedProducts: [],
  selectedCategories: [],
  gender: "all",
  ageFrom: "",
  ageTo: "",
  birthdayBefore: "",
  birthdayAfter: "",
  regDaysFrom: "",
  regDaysTo: "",
  lastPurchaseFrom: "",
  lastPurchaseTo: "",
  purchaseCountFrom: "",
  purchaseCountTo: "",
  avgCheckFrom: "",
  avgCheckTo: "",
  totalSpendFrom: "",
  totalSpendTo: "",
  selectedLevels: [],
  selectedR: [],
  selectedF: [],
  selectedM: [],
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(readApiError(text) || res.statusText || "Ошибка запроса");
  }
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

function safeNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function formatDateRu(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU");
}

function formatLastPurchase(daysSinceLastVisit: number | null): string {
  if (daysSinceLastVisit === null || daysSinceLastVisit === undefined) return "—";
  const days = Math.max(0, Math.floor(daysSinceLastVisit));
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString("ru-RU");
}

function formatCurrency(value: number): string {
  return value.toLocaleString("ru-RU");
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : String(item ?? "")))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function parseRangeInput(value: unknown): { min?: number; max?: number } | null {
  if (Array.isArray(value) && value.length >= 2) {
    const min = safeNumber(value[0]);
    const max = safeNumber(value[1]);
    if (min === null && max === null) return null;
    return { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const min =
      safeNumber(obj.min) ??
      safeNumber(obj.from) ??
      safeNumber(obj.start) ??
      safeNumber(obj.gte);
    const max =
      safeNumber(obj.max) ??
      safeNumber(obj.to) ??
      safeNumber(obj.end) ??
      safeNumber(obj.lte);
    if (min === null && max === null) return null;
    return { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) };
  }
  const single = safeNumber(value);
  if (single !== null) return { min: single, max: single };
  return null;
}

function buildRangeFilter(minValue: string, maxValue: string): { min?: number; max?: number } | null {
  const min = parseNumberInput(minValue);
  const max = parseNumberInput(maxValue);
  if (min === null && max === null) return null;
  return { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) };
}

function formatRangeLabel(minValue: string, maxValue: string, suffix = ""): string {
  const min = parseNumberInput(minValue);
  const max = parseNumberInput(maxValue);
  if (min !== null && max !== null) return `${min}${suffix}–${max}${suffix}`;
  if (min !== null) return `от ${min}${suffix}`;
  if (max !== null) return `до ${max}${suffix}`;
  return "";
}

function summarizeList(values: string[], maxItems = 3): string {
  if (values.length <= maxItems) return values.join(", ");
  const visible = values.slice(0, maxItems).join(", ");
  return `${visible} и еще ${values.length - maxItems}`;
}

function buildAudienceDescription(
  formData: AudienceFormData,
  lookups: {
    outlets: OutletOption[];
    products: ProductItem[];
    categories: CategoryItem[];
    levels: LevelOption[];
  },
): string {
  const outletMap = new Map(lookups.outlets.map((outlet) => [outlet.id, outlet.name]));
  const productMap = new Map(lookups.products.map((product) => [product.id, product.name]));
  const categoryMap = new Map(lookups.categories.map((category) => [category.id, category.name]));
  const levelMap = new Map(lookups.levels.map((level) => [level.id, level.name]));

  const parts: string[] = [];

  if (formData.selectedOutlets.length) {
    const outletNames = formData.selectedOutlets.map((id) => outletMap.get(id) || id).filter(Boolean);
    parts.push(`Точки: ${summarizeList(outletNames)}`);
  }

  if (formData.targetType === "products" && formData.selectedProducts.length) {
    const productNames = formData.selectedProducts.map((id) => productMap.get(id) || id).filter(Boolean);
    parts.push(`Товары: ${summarizeList(productNames)}`);
  }

  if (formData.targetType === "categories" && formData.selectedCategories.length) {
    const categoryNames = formData.selectedCategories.map((id) => categoryMap.get(id) || id).filter(Boolean);
    parts.push(`Категории: ${summarizeList(categoryNames)}`);
  }

  if (formData.gender !== "all") {
    const genderLabel = formData.gender === "M" ? "Мужской" : formData.gender === "F" ? "Женский" : "Не указан";
    parts.push(`Пол: ${genderLabel}`);
  }

  const ageLabel = formatRangeLabel(formData.ageFrom, formData.ageTo);
  if (ageLabel) parts.push(`Возраст: ${ageLabel}`);

  if (formData.birthdayBefore || formData.birthdayAfter) {
    const before = formData.birthdayBefore ? `${formData.birthdayBefore} дн. до` : "";
    const after = formData.birthdayAfter ? `${formData.birthdayAfter} дн. после` : "";
    const combined = [before, after].filter(Boolean).join(", ");
    if (combined) parts.push(`ДР: ${combined}`);
  }

  const regLabel = formatRangeLabel(formData.regDaysFrom, formData.regDaysTo, " дн.");
  if (regLabel) parts.push(`Регистрация: ${regLabel}`);

  const lastPurchaseLabel = formatRangeLabel(formData.lastPurchaseFrom, formData.lastPurchaseTo, " дн.");
  if (lastPurchaseLabel) parts.push(`Последняя покупка: ${lastPurchaseLabel}`);

  const purchaseCountLabel = formatRangeLabel(formData.purchaseCountFrom, formData.purchaseCountTo);
  if (purchaseCountLabel) parts.push(`Покупок: ${purchaseCountLabel}`);

  const avgCheckLabel = formatRangeLabel(formData.avgCheckFrom, formData.avgCheckTo, " ₽");
  if (avgCheckLabel) parts.push(`Средний чек: ${avgCheckLabel}`);

  const totalSpendLabel = formatRangeLabel(formData.totalSpendFrom, formData.totalSpendTo, " ₽");
  if (totalSpendLabel) parts.push(`Сумма покупок: ${totalSpendLabel}`);

  if (formData.selectedLevels.length) {
    const levelNames = formData.selectedLevels.map((id) => levelMap.get(id) || id).filter(Boolean);
    parts.push(`Уровень: ${summarizeList(levelNames)}`);
  }

  const rfmParts: string[] = [];
  if (formData.selectedR.length) rfmParts.push(`R(${formData.selectedR.join(",")})`);
  if (formData.selectedF.length) rfmParts.push(`F(${formData.selectedF.join(",")})`);
  if (formData.selectedM.length) rfmParts.push(`M(${formData.selectedM.join(",")})`);
  if (rfmParts.length) parts.push(`RFM: ${rfmParts.join(" ")}`);

  const summary = parts.join(" · ").trim();
  if (!summary) return "Пользовательский сегмент";
  if (summary.length > 140) return `${summary.slice(0, 137)}…`;
  return summary;
}

function mapSegmentToAudience(segment: any): Audience {
  const filters = asRecord(segment?.filters) ?? {};
  const count =
    safeNumber(segment?.customerCount) ??
    safeNumber(segment?.metricsSnapshot?.estimatedCustomers) ??
    0;
  const descriptionRaw =
    typeof segment?.description === "string" ? segment.description.trim() : "";
  const description =
    descriptionRaw ||
    (Object.keys(filters).length ? "Сегмент по фильтрам" : "Пользовательский сегмент");

  return {
    id: String(segment?.id ?? ""),
    name: String(segment?.name || "Без названия"),
    count,
    createdAt: formatDateRu(segment?.createdAt),
    description,
    filters,
    isSystem: Boolean(segment?.isSystem),
    isAllCustomers: isAllCustomersAudience(segment),
    systemKey: segment?.systemKey ?? null,
  };
}

function filtersToFormData(filters?: Record<string, unknown> | null): AudienceFormData {
  const data: AudienceFormData = { ...initialFormData };
  if (!filters) return data;

  const outlets = parseStringArray(filters.outlets ?? filters.visitedOutlets);
  if (outlets.length) data.selectedOutlets = outlets;

  const productIds = parseStringArray(filters.productIds ?? filters.products ?? filters.productId);
  const categoryIds = parseStringArray(filters.categoryIds ?? filters.categories ?? filters.categoryId);
  if (categoryIds.length && !productIds.length) data.targetType = "categories";
  if (productIds.length) data.selectedProducts = productIds;
  if (categoryIds.length) data.selectedCategories = categoryIds;

  const genderValues = parseStringArray(filters.gender).map((value) => value.toLowerCase());
  if (genderValues.length === 1) {
    if (genderValues[0] === "male") data.gender = "M";
    else if (genderValues[0] === "female") data.gender = "F";
    else if (genderValues[0] === "unknown") data.gender = "U";
  }

  const ageRange = parseRangeInput(filters.age ?? filters.ageRange);
  if (ageRange?.min != null) data.ageFrom = String(ageRange.min);
  if (ageRange?.max != null) data.ageTo = String(ageRange.max);

  const birthdayRange = parseRangeInput(filters.birthdayOffset ?? filters.birthdayWindow ?? filters.birthday);
  if (birthdayRange?.max != null) data.birthdayBefore = String(Math.max(0, birthdayRange.max));
  if (birthdayRange?.min != null) {
    if (birthdayRange.min < 0) data.birthdayAfter = String(Math.abs(birthdayRange.min));
    else if (!data.birthdayBefore) data.birthdayBefore = String(birthdayRange.min);
  }

  const regRange = parseRangeInput(
    filters.registrationDays ??
      filters.registration ??
      (filters.registrationFrom !== undefined || filters.registrationTo !== undefined
        ? { min: filters.registrationFrom, max: filters.registrationTo }
        : undefined),
  );
  if (regRange?.min != null) data.regDaysFrom = String(regRange.min);
  if (regRange?.max != null) data.regDaysTo = String(regRange.max);

  const lastPurchaseRange = parseRangeInput(
    filters.lastPurchaseDays ?? filters.daysSinceLastPurchase ?? filters.lastPurchase,
  );
  if (lastPurchaseRange?.min != null) data.lastPurchaseFrom = String(lastPurchaseRange.min);
  if (lastPurchaseRange?.max != null) data.lastPurchaseTo = String(lastPurchaseRange.max);

  const purchaseCountRange = parseRangeInput(
    filters.purchaseCount ??
      filters.visits ??
      (filters.minVisits !== undefined || filters.maxVisits !== undefined
        ? { min: filters.minVisits, max: filters.maxVisits }
        : undefined),
  );
  if (purchaseCountRange?.min != null) data.purchaseCountFrom = String(purchaseCountRange.min);
  if (purchaseCountRange?.max != null) data.purchaseCountTo = String(purchaseCountRange.max);

  const avgCheckRange = parseRangeInput(filters.averageCheck ?? filters.avgCheck);
  if (avgCheckRange?.min != null) data.avgCheckFrom = String(avgCheckRange.min);
  if (avgCheckRange?.max != null) data.avgCheckTo = String(avgCheckRange.max);

  const totalRange = parseRangeInput(filters.totalSpent ?? filters.purchaseSum ?? filters.total);
  if (totalRange?.min != null) data.totalSpendFrom = String(totalRange.min);
  if (totalRange?.max != null) data.totalSpendTo = String(totalRange.max);

  const levelIds = parseStringArray(filters.levelIds ?? filters.levels ?? filters.level);
  if (levelIds.length) data.selectedLevels = levelIds;

  const recency = parseStringArray(
    filters.rfmRecency ?? filters.rfmRecencyScores ?? filters.rfmRecencyGroup ?? filters.rfmR,
  );
  if (recency.length) data.selectedR = recency;

  const frequency = parseStringArray(filters.rfmFrequency ?? filters.rfmFrequencyScores ?? filters.rfmF);
  if (frequency.length) data.selectedF = frequency;

  const monetary = parseStringArray(filters.rfmMonetary ?? filters.rfmMonetaryScores ?? filters.rfmM);
  if (monetary.length) data.selectedM = monetary;

  return data;
}

function formDataToFilters(formData: AudienceFormData): Record<string, unknown> {
  const filters: Record<string, unknown> = {};

  if (formData.selectedOutlets.length) {
    filters.outlets = formData.selectedOutlets.slice();
  }

  if (formData.targetType === "products" && formData.selectedProducts.length) {
    filters.productIds = formData.selectedProducts.slice();
  }

  if (formData.targetType === "categories" && formData.selectedCategories.length) {
    filters.categoryIds = formData.selectedCategories.slice();
  }

  if (formData.gender !== "all") {
    const genderMap: Record<string, string> = { M: "male", F: "female", U: "unknown" };
    filters.gender = [genderMap[formData.gender] || formData.gender];
  }

  const ageRange = buildRangeFilter(formData.ageFrom, formData.ageTo);
  if (ageRange) filters.age = ageRange;

  const birthdayBefore = parseNumberInput(formData.birthdayBefore);
  const birthdayAfter = parseNumberInput(formData.birthdayAfter);
  if (birthdayBefore !== null || birthdayAfter !== null) {
    const range: { min?: number; max?: number } = {};
    if (birthdayBefore !== null) range.max = Math.abs(birthdayBefore);
    if (birthdayAfter !== null) range.min = -Math.abs(birthdayAfter);
    filters.birthdayOffset = range;
  }

  const regRange = buildRangeFilter(formData.regDaysFrom, formData.regDaysTo);
  if (regRange) filters.registrationDays = regRange;

  const lastPurchaseRange = buildRangeFilter(formData.lastPurchaseFrom, formData.lastPurchaseTo);
  if (lastPurchaseRange) filters.lastPurchaseDays = lastPurchaseRange;

  const purchaseCountRange = buildRangeFilter(formData.purchaseCountFrom, formData.purchaseCountTo);
  if (purchaseCountRange) filters.purchaseCount = purchaseCountRange;

  const avgCheckRange = buildRangeFilter(formData.avgCheckFrom, formData.avgCheckTo);
  if (avgCheckRange) filters.averageCheck = avgCheckRange;

  const totalRange = buildRangeFilter(formData.totalSpendFrom, formData.totalSpendTo);
  if (totalRange) filters.totalSpent = totalRange;

  if (formData.selectedLevels.length) {
    filters.levelIds = formData.selectedLevels.slice();
  }

  if (formData.selectedR.length) {
    filters.rfmRecency = formData.selectedR.slice();
  }

  if (formData.selectedF.length) {
    filters.rfmFrequency = formData.selectedF.slice();
  }

  if (formData.selectedM.length) {
    filters.rfmMonetary = formData.selectedM.slice();
  }

  return filters;
}

function mapMember(row: any): AudienceMember {
  const totalSpend = safeNumber(row?.spendTotal) ?? 0;
  const daysSinceLastVisit = safeNumber(row?.daysSinceLastVisit);
  return {
    id: String(row?.id || ""),
    phone: row?.phone ? String(row.phone) : "",
    name: String(row?.name || row?.phone || row?.id || "—"),
    levelId: row?.levelId ? String(row.levelId) : null,
    levelName: row?.levelName ? String(row.levelName) : null,
    daysSinceLastVisit,
    totalSpend: Math.max(0, totalSpend),
  };
}

export default function AudiencesPage() {
  const router = useRouter();
  const [view, setView] = useState<"list" | "create">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<AudienceFormData>(initialFormData);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [viewingAudience, setViewingAudience] = useState<Audience | null>(null);
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersSearch, setMembersSearch] = useState("");
  const [modalPage, setModalPage] = useState(1);
  const modalItemsPerPage = 12;

  const loadAudiences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchJson<any[]>("/api/portal/audiences?includeSystem=1");
      const items = Array.isArray(list) ? list : [];
      const mapped = items
        .filter((segment) => !segment?.archivedAt)
        .map(mapSegmentToAudience);
      setAudiences(mapped);
    } catch (err) {
      setError(readApiError(err) || "Не удалось загрузить аудитории");
      setAudiences([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    if (catalogLoaded || catalogLoading) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const [outletsPayload, productsPayload, categoriesPayload, levelsPayload] = await Promise.all([
        fetchJson<any>("/api/portal/outlets?status=ACTIVE"),
        fetchJson<any>("/api/portal/catalog/products"),
        fetchJson<any>("/api/portal/catalog/categories"),
        fetchJson<any>("/api/portal/loyalty/tiers"),
      ]);

      const outletItems = Array.isArray(outletsPayload?.items)
        ? outletsPayload.items
        : Array.isArray(outletsPayload)
          ? outletsPayload
          : [];
      setOutlets(
        outletItems
          .map((outlet: any) => ({
            id: String(outlet?.id ?? ""),
            name: String(outlet?.name || outlet?.id || ""),
          }))
          .filter((item: OutletOption) => item.id && item.name),
      );

      const productItems = Array.isArray(productsPayload?.items)
        ? productsPayload.items
        : Array.isArray(productsPayload)
          ? productsPayload
          : [];
      const mappedProducts = productItems
        .map((product: any) => ({
          id: String(product?.id ?? ""),
          name: String(product?.name || product?.id || ""),
          categoryId: product?.categoryId ? String(product.categoryId) : null,
          category: product?.categoryName ? String(product.categoryName) : null,
        }))
        .filter((item: ProductItem) => item.id && item.name);
      setProducts(mappedProducts);

      const categoryItems = Array.isArray(categoriesPayload?.items)
        ? categoriesPayload.items
        : Array.isArray(categoriesPayload)
          ? categoriesPayload
          : [];
      const categoryCount = new Map<string, number>();
      for (const product of mappedProducts) {
        if (!product.categoryId) continue;
        categoryCount.set(product.categoryId, (categoryCount.get(product.categoryId) || 0) + 1);
      }
      setCategories(
        categoryItems
          .map((category: any) => ({
            id: String(category?.id ?? ""),
            name: String(category?.name || category?.id || ""),
            count: categoryCount.get(String(category?.id ?? "")) || 0,
            status: String(category?.status || ""),
          }))
          .filter((item: any) => item.id && item.name && item.status !== "ARCHIVED")
          .map(({ status, ...rest }: any) => rest as CategoryItem),
      );

      const levelItems = Array.isArray(levelsPayload?.items)
        ? levelsPayload.items
        : Array.isArray(levelsPayload)
          ? levelsPayload
          : [];
      setLevels(
        levelItems
          .map((level: any) => ({
            id: String(level?.id ?? ""),
            name: String(level?.name || level?.id || ""),
            thresholdAmount: safeNumber(level?.thresholdAmount),
            isInitial: Boolean(level?.isInitial),
          }))
          .filter((item: LevelOption) => item.id && item.name),
      );

      setCatalogLoaded(true);
    } catch (err) {
      setCatalogError(readApiError(err) || "Не удалось загрузить справочники");
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogLoaded, catalogLoading]);

  useEffect(() => {
    loadAudiences().catch(() => {});
  }, [loadAudiences]);

  useEffect(() => {
    if (view === "create") {
      loadCatalog().catch(() => {});
    }
  }, [view, loadCatalog]);

  const filteredAudiences = useMemo(
    () => audiences.filter((a) => a.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [audiences, searchTerm],
  );

  const audienceDescriptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const audience of audiences) {
      if (audience.description !== "Сегмент по фильтрам") continue;
      const form = filtersToFormData(audience.filters);
      const summary = buildAudienceDescription(form, { outlets, products, categories, levels });
      map.set(audience.id, summary);
    }
    return map;
  }, [audiences, outlets, products, categories, levels]);

  const visibleItems = useMemo(() => {
    const search = productSearch.toLowerCase();
    if (formData.targetType === "products") {
      return products.filter((item) => item.name.toLowerCase().includes(search));
    }
    return categories.filter((item) => item.name.toLowerCase().includes(search));
  }, [formData.targetType, productSearch, products, categories]);

  const toggleSelection = (list: string[], item: string) => {
    return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
  };

  const toggleProductSelection = (id: string) => {
    setFormData((prev) => {
      const list = prev.targetType === "products" ? prev.selectedProducts : prev.selectedCategories;
      const key = prev.targetType === "products" ? "selectedProducts" : "selectedCategories";
      const newList = list.includes(id) ? list.filter((i) => i !== id) : [...list, id];
      return { ...prev, [key]: newList } as AudienceFormData;
    });
  };

  const handleStartCreate = () => {
    setEditingId(null);
    setError(null);
    setFormError(null);
    setProductSearch("");
    setFormData(initialFormData);
    setView("create");
  };

  const handleStartEdit = (audience: Audience) => {
    if (audience.isAllCustomers) {
      setError("Системную аудиторию нельзя редактировать");
      return;
    }
    setEditingId(audience.id);
    setError(null);
    setFormError(null);
    setProductSearch("");
    setFormData({ ...filtersToFormData(audience.filters), name: audience.name });
    setView("create");
  };

  const handleDelete = async (audience: Audience) => {
    if (audience.isAllCustomers) {
      setError("Системную аудиторию нельзя удалить");
      return;
    }
    if (!confirm("Вы уверены, что хотите удалить эту аудиторию?")) return;
    setError(null);
    try {
      await fetchJson(`/api/portal/audiences/${encodeURIComponent(audience.id)}/archive`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadAudiences();
    } catch (err) {
      setError(readApiError(err) || "Не удалось удалить аудиторию");
    }
  };

  const handleSave = async () => {
    const trimmed = formData.name.trim();
    if (!trimmed) {
      setFormError("Введите название аудитории");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const filters = formDataToFilters(formData);
      const currentAudience = editingId ? audiences.find((item) => item.id === editingId) : null;
      const description =
        currentAudience?.description?.trim() ||
        buildAudienceDescription(formData, { outlets, products, categories, levels });
      const payload = {
        name: trimmed,
        description,
        rules: { ui: "audience-settings" },
        filters,
      };

      if (editingId) {
        await fetchJson(`/api/portal/audiences/${encodeURIComponent(editingId)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJson("/api/portal/audiences", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await loadAudiences();
      setEditingId(null);
      setView("list");
    } catch (err) {
      setFormError(readApiError(err) || "Не удалось сохранить аудиторию");
    } finally {
      setSaving(false);
    }
  };

  const openMembers = useCallback(
    async (audience: Audience, event?: React.MouseEvent<HTMLButtonElement>) => {
      event?.stopPropagation();
      setViewingAudience(audience);
      setIsMembersModalOpen(true);
      setMembersSearch("");
      setModalPage(1);
      setMembers([]);
      setMembersError(null);
      setMembersLoading(true);
      try {
        await loadCatalog();
        const qs = new URLSearchParams({ segmentId: audience.id, limit: "200" });
        const res = await fetchJson<any>(`/api/customers?${qs.toString()}`);
        const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
        setMembers(items.map(mapMember));
      } catch (err) {
        setMembersError(readApiError(err) || "Не удалось загрузить участников");
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    },
    [loadCatalog],
  );

  const closeMembers = () => {
    setIsMembersModalOpen(false);
    setViewingAudience(null);
    setMembers([]);
    setMembersSearch("");
    setMembersError(null);
    setMembersLoading(false);
    setModalPage(1);
  };

  const filteredMembers = useMemo(() => {
    const term = membersSearch.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (member) => member.phone.toLowerCase().includes(term) || member.name.toLowerCase().includes(term),
    );
  }, [membersSearch, members]);

  const paginatedMembers = useMemo(() => {
    const start = (modalPage - 1) * modalItemsPerPage;
    return filteredMembers.slice(start, start + modalItemsPerPage);
  }, [filteredMembers, modalPage, modalItemsPerPage]);

  const totalModalPages = Math.ceil(filteredMembers.length / modalItemsPerPage);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxButtons = 5;

    if (totalModalPages <= maxButtons) {
      for (let i = 1; i <= totalModalPages; i += 1) pages.push(i);
    } else {
      let start = Math.max(1, modalPage - 2);
      let end = Math.min(totalModalPages, start + maxButtons - 1);

      if (end === totalModalPages) {
        start = Math.max(1, end - maxButtons + 1);
      }

      for (let i = start; i <= end; i += 1) pages.push(i);
    }
    return pages;
  };

  const levelLookup = useMemo(() => {
    const byId = new Map<string, LevelOption>();
    const byName = new Map<string, LevelOption>();
    levels.forEach((level) => {
      byId.set(level.id, level);
      byName.set(level.name.toLowerCase(), level);
    });
    const initial = levels.find((level) => level.isInitial) || null;
    return { byId, byName, initial };
  }, [levels]);

  const levelRanks = useMemo(() => {
    const sorted = levels
      .filter((level) => !level.isInitial && typeof level.thresholdAmount === "number")
      .slice()
      .sort((a, b) => (a.thresholdAmount ?? 0) - (b.thresholdAmount ?? 0));
    const rankMap = new Map<string, "gold" | "silver" | "bronze">();
    const top = sorted[sorted.length - 1];
    const second = sorted[sorted.length - 2];
    const third = sorted[sorted.length - 3];
    if (top) rankMap.set(top.id, "gold");
    if (second) rankMap.set(second.id, "silver");
    if (third) rankMap.set(third.id, "bronze");
    return rankMap;
  }, [levels]);

  const resolveMemberLevel = (member: AudienceMember) => {
    if (member.levelId && levelLookup.byId.has(member.levelId)) {
      return levelLookup.byId.get(member.levelId) || null;
    }
    const nameKey = member.levelName?.toLowerCase();
    if (nameKey && levelLookup.byName.has(nameKey)) {
      return levelLookup.byName.get(nameKey) || null;
    }
    return null;
  };

  const getMemberLevelLabel = (member: AudienceMember) => {
    if (member.levelName) return member.levelName;
    const resolved = resolveMemberLevel(member);
    if (resolved?.name) return resolved.name;
    return levelLookup.initial?.name || "Base";
  };

  const getMemberLevelClass = (member: AudienceMember) => {
    const resolved = resolveMemberLevel(member);
    if (resolved?.isInitial) return "bg-gray-100 text-gray-700 border-gray-300";
    const rank = resolved ? levelRanks.get(resolved.id) : undefined;
    if (rank === "gold") return "bg-yellow-50 text-yellow-700 border-yellow-200";
    if (rank === "silver") return "bg-slate-100 text-slate-700 border-slate-200";
    if (rank === "bronze") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-gray-100 text-gray-700 border-gray-300";
  };

  const modalRangeStart =
    filteredMembers.length === 0 ? 0 : (modalPage - 1) * modalItemsPerPage + 1;
  const modalRangeEnd = Math.min(filteredMembers.length, modalPage * modalItemsPerPage);

  if (view === "create") {
    return (
      <div className="p-8 max-w-[1200px] mx-auto ">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button onClick={() => setView("list")} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {editingId ? "Редактирование аудитории" : "Новая аудитория"}
              </h2>
              <p className="text-sm text-gray-500">Настройте параметры сегментации клиентов.</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            <span>{saving ? "Сохранение..." : "Сохранить"}</span>
          </button>
        </div>

        {formError && (
          <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-lg text-sm mb-6 flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {catalogError && (
          <div className="bg-amber-50 border border-amber-100 text-amber-700 px-4 py-3 rounded-lg text-sm mb-6 flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5" />
            <span>{catalogError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Название аудитории <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                placeholder="Например: Покупатели кофе"
              />
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                <Target size={20} className="text-purple-600" />
                <h3>Точки и Товары</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Посещал точки</label>
                {catalogLoading ? (
                  <div className="text-sm text-gray-500">Загрузка точек...</div>
                ) : outlets.length ? (
                  <div className="flex flex-wrap gap-2">
                    {outlets.map((outlet) => (
                      <button
                        key={outlet.id}
                        onClick={() =>
                          setFormData({
                            ...formData,
                            selectedOutlets: toggleSelection(formData.selectedOutlets, outlet.id),
                          })
                        }
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          formData.selectedOutlets.includes(outlet.id)
                            ? "bg-purple-100 border-purple-200 text-purple-800"
                            : "bg-white border-gray-200 text-gray-600 hover:border-purple-200"
                        }`}
                      >
                        {outlet.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Точки не найдены</div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-medium text-gray-700">Покупал товары</label>
                  <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                    Выбрано: {formData.targetType === "products" ? formData.selectedProducts.length : formData.selectedCategories.length}
                  </span>
                </div>

                <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
                  <button
                    onClick={() => setFormData({ ...formData, targetType: "products" })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      formData.targetType === "products" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                    }`}
                  >
                    Товары
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, targetType: "categories" })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      formData.targetType === "categories" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                    }`}
                  >
                    Категории
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder={formData.targetType === "products" ? "Поиск товаров..." : "Поиск категорий..."}
                    className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto custom-scrollbar">
                  {catalogLoading ? (
                    <div className="p-4 text-center text-sm text-gray-500">Загрузка...</div>
                  ) : visibleItems.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">Ничего не найдено</div>
                  ) : (
                    visibleItems.map((item: any) => {
                      const isSelected =
                        formData.targetType === "products"
                          ? formData.selectedProducts.includes(item.id)
                          : formData.selectedCategories.includes(item.id);

                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleProductSelection(item.id)}
                          className={`p-2.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors ${
                            isSelected ? "bg-purple-50" : ""
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div
                              className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                                isSelected ? "bg-purple-200 text-purple-700" : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {item.name.charAt(0)}
                            </div>
                            <div>
                              <div
                                className={`text-sm ${isSelected ? "font-medium text-purple-900" : "text-gray-700"}`}
                              >
                                {item.name}
                              </div>
                              {formData.targetType === "products" && "category" in item && item.category && (
                                <div className="text-[10px] text-gray-400">{item.category}</div>
                              )}
                              {formData.targetType === "categories" && "count" in item && (
                                <div className="text-[10px] text-gray-400">{item.count} товаров</div>
                              )}
                            </div>
                          </div>
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                              isSelected ? "bg-purple-600 border-purple-600" : "border-gray-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check size={10} className="text-white" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                <User size={20} className="text-blue-500" />
                <h3>Демография</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Пол</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as AudienceFormData["gender"] })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="all">Любой</option>
                    <option value="M">Мужской</option>
                    <option value="F">Женский</option>
                    <option value="U">Не указан</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Возраст</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      placeholder="От"
                      value={formData.ageFrom}
                      onChange={(e) => setFormData({ ...formData, ageFrom: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="number"
                      placeholder="До"
                      value={formData.ageTo}
                      onChange={(e) => setFormData({ ...formData, ageTo: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  День рождения (период до/после дня рождения)
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Дней до</span>
                    <input
                      type="number"
                      value={formData.birthdayBefore}
                      onChange={(e) => setFormData({ ...formData, birthdayBefore: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg pl-24 pr-3 py-2 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Дней после</span>
                    <input
                      type="number"
                      value={formData.birthdayAfter}
                      onChange={(e) => setFormData({ ...formData, birthdayAfter: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg pl-24 pr-3 py-2 text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                <Calendar size={20} className="text-orange-500" />
                <h3>Активность</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Дней с регистрации</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    placeholder="От"
                    value={formData.regDaysFrom}
                    onChange={(e) => setFormData({ ...formData, regDaysFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    placeholder="До"
                    value={formData.regDaysTo}
                    onChange={(e) => setFormData({ ...formData, regDaysTo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Дней с последней покупки</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    placeholder="От"
                    value={formData.lastPurchaseFrom}
                    onChange={(e) => setFormData({ ...formData, lastPurchaseFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    placeholder="До"
                    value={formData.lastPurchaseTo}
                    onChange={(e) => setFormData({ ...formData, lastPurchaseTo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Количество покупок</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    placeholder="От"
                    value={formData.purchaseCountFrom}
                    onChange={(e) => setFormData({ ...formData, purchaseCountFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    placeholder="До"
                    value={formData.purchaseCountTo}
                    onChange={(e) => setFormData({ ...formData, purchaseCountTo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                <DollarSign size={20} className="text-green-600" />
                <h3>Финансы</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Средний чек (₽)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    placeholder="От"
                    value={formData.avgCheckFrom}
                    onChange={(e) => setFormData({ ...formData, avgCheckFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    placeholder="До"
                    value={formData.avgCheckTo}
                    onChange={(e) => setFormData({ ...formData, avgCheckTo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Сумма покупок (₽)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    placeholder="От"
                    value={formData.totalSpendFrom}
                    onChange={(e) => setFormData({ ...formData, totalSpendFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    placeholder="До"
                    value={formData.totalSpendTo}
                    onChange={(e) => setFormData({ ...formData, totalSpendTo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                <ShoppingBag size={20} className="text-pink-600" />
                <h3>Сегментация</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Уровень клиента</label>
                {catalogLoading ? (
                  <div className="text-sm text-gray-500">Загрузка уровней...</div>
                ) : levels.length ? (
                  <div className="flex flex-wrap gap-2">
                    {levels.map((level) => (
                      <button
                        key={level.id}
                        onClick={() =>
                          setFormData({
                            ...formData,
                            selectedLevels: toggleSelection(formData.selectedLevels, level.id),
                          })
                        }
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          formData.selectedLevels.includes(level.id)
                            ? "bg-yellow-100 border-yellow-200 text-yellow-800"
                            : "bg-white border-gray-200 text-gray-600 hover:border-yellow-200"
                        }`}
                      >
                        {level.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Уровни не найдены</div>
                )}
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">RFM Сегменты (1 = плохо, 5 = отлично)</label>

                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold w-4 text-gray-500">R</span>
                  <div className="flex space-x-1">
                    {["1", "2", "3", "4", "5"].map((val) => (
                      <button
                        key={val}
                        onClick={() => setFormData({ ...formData, selectedR: toggleSelection(formData.selectedR, val) })}
                        className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${
                          formData.selectedR.includes(val)
                            ? "bg-purple-600 text-white border-purple-600"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">Давность</span>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold w-4 text-gray-500">F</span>
                  <div className="flex space-x-1">
                    {["1", "2", "3", "4", "5"].map((val) => (
                      <button
                        key={val}
                        onClick={() => setFormData({ ...formData, selectedF: toggleSelection(formData.selectedF, val) })}
                        className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${
                          formData.selectedF.includes(val)
                            ? "bg-purple-600 text-white border-purple-600"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">Частота</span>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold w-4 text-gray-500">M</span>
                  <div className="flex space-x-1">
                    {["1", "2", "3", "4", "5"].map((val) => (
                      <button
                        key={val}
                        onClick={() => setFormData({ ...formData, selectedM: toggleSelection(formData.selectedM, val) })}
                        className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${
                          formData.selectedM.includes(val)
                            ? "bg-purple-600 text-white border-purple-600"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">Деньги</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Аудитории</h2>
          <p className="text-gray-500 mt-1">Создание сегментов клиентов для таргетированных рассылок и акций.</p>
        </div>

        <button
          onClick={handleStartCreate}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span>Создать аудиторию</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <AlertCircle size={18} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Поиск аудитории..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Filter size={16} />
            <span>{filteredAudiences.length} сегментов</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Название</th>
                <th className="px-6 py-4 font-semibold">Описание</th>
                <th className="px-6 py-4 font-semibold text-right">Размер</th>
                <th className="px-6 py-4 font-semibold text-right">Создана</th>
                <th className="px-6 py-4 font-semibold text-right w-32">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
                    <p>Загрузка аудиторий...</p>
                  </td>
                </tr>
              ) : filteredAudiences.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Users size={48} className="mx-auto text-gray-300 mb-4" />
                    <p>Аудитории не найдены.</p>
                  </td>
                </tr>
              ) : (
                filteredAudiences.map((audience) => (
                  <tr key={audience.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-purple-600 break-words">{audience.name}</td>
                    <td className="px-6 py-4 text-gray-600 max-w-md truncate">
                      {audienceDescriptions.get(audience.id) ?? audience.description}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {audience.count} чел.
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 text-xs">{audience.createdAt}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={(event) => openMembers(audience, event)}
                          title="Просмотр состава"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleStartEdit(audience)}
                          title={audience.isAllCustomers ? "Системную аудиторию нельзя редактировать" : "Редактировать"}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(audience)}
                          title={audience.isAllCustomers ? "Системную аудиторию нельзя удалить" : "Удалить"}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isMembersModalOpen &&
        viewingAudience &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl relative z-[101] flex flex-col max-h-[90vh] overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10 flex-shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                    <Users size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Состав аудитории: {viewingAudience.name}</h3>
                    <p className="text-sm text-gray-500">
                      Показано <span className="font-bold text-purple-600">{filteredMembers.length}</span> из{" "}
                      {viewingAudience.count} подходящих клиентов
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeMembers}
                  className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-4 border-b border-gray-100 bg-white flex-shrink-0">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={membersSearch}
                    onChange={(e) => {
                      setMembersSearch(e.target.value);
                      setModalPage(1);
                    }}
                    placeholder="Поиск в сегменте по имени или телефону..."
                    className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 font-semibold bg-gray-50">Клиент</th>
                      <th className="px-6 py-4 font-semibold bg-gray-50">Телефон</th>
                      <th className="px-6 py-4 font-semibold bg-gray-50 text-center">Уровень</th>
                      <th className="px-6 py-4 font-semibold bg-gray-50 text-center">Посл. покупка</th>
                      <th className="px-6 py-4 font-semibold bg-gray-50 text-right">LTV (Сумма)</th>
                      <th className="px-6 py-4 font-semibold bg-gray-50 text-right w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {!membersLoading && !membersError && paginatedMembers.length > 0 ? (
                      paginatedMembers.map((member) => (
                        <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">
                                {member.name.charAt(0)}
                              </div>
                              <span className="font-medium text-gray-900 break-words">{member.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <Phone size={12} className="text-gray-400" />
                              <span className="font-mono text-xs">{member.phone || "—"}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getMemberLevelClass(
                                member,
                              )}`}
                            >
                              {getMemberLevelLabel(member)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-gray-600 whitespace-nowrap text-xs">
                            <div className="flex items-center justify-center space-x-1">
                              <Clock size={12} className="text-gray-400" />
                              <span>{formatLastPurchase(member.daysSinceLastVisit)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-gray-900 whitespace-nowrap">
                            ₽{formatCurrency(member.totalSpend)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              title="Перейти в карточку"
                              className="text-purple-400 hover:text-purple-600 p-1 rounded-lg hover:bg-purple-50 transition-all"
                              onClick={() => {
                                router.push(`/customers?customerId=${encodeURIComponent(member.id)}`);
                                closeMembers();
                              }}
                            >
                              <ExternalLink size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          className={`px-6 py-20 text-center bg-white ${
                            membersError ? "text-red-500" : "text-gray-400"
                          }`}
                        >
                          <Search size={48} className="mx-auto opacity-20 mb-3" />
                          <p className="text-base">
                            {membersLoading
                              ? "Загрузка участников..."
                              : membersError
                                ? membersError
                                : "Клиенты не найдены"}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <AlertCircle size={14} className="text-purple-500" />
                  <span>
                    Показано {modalRangeStart}-{modalRangeEnd} из {filteredMembers.length}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setModalPage((p) => Math.max(1, p - 1))}
                    disabled={modalPage === 1}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex space-x-1">
                    {getPageNumbers().map((p, i) => (
                      <button
                        key={i}
                        onClick={() => typeof p === "number" && setModalPage(p)}
                        disabled={typeof p !== "number"}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                          modalPage === p
                            ? "bg-purple-600 text-white shadow-sm"
                            : p === "..."
                              ? "bg-transparent text-gray-400 cursor-default"
                              : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setModalPage((p) => Math.min(totalModalPages, p + 1))}
                    disabled={modalPage === totalModalPages || totalModalPages === 0}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={closeMembers}
                    className="ml-4 px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800 transition-colors shadow-sm"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
