"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers,
  Plus,
  Search,
  Edit,
  Trash2,
  Folder,
  CornerDownRight,
  ArrowLeft,
  Save,
  ShoppingBag,
  Minus,
} from "lucide-react";
import { readErrorMessage } from "lib/portal-errors";

type CategoryStatus = "active" | "archived";

type Category = {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  status: CategoryStatus;
};

type Product = {
  id: string;
  name: string;
  categoryId: string | null;
};

type PortalCategoryRow = {
  id: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  status?: string | null;
};

type PortalProductRow = {
  id: string;
  name: string;
  categoryId?: string | null;
};

function normalizeStatus(raw: unknown): CategoryStatus {
  return String(raw || "").toUpperCase() === "ARCHIVED" ? "archived" : "active";
}

function mapPortalCategory(raw: any): Category {
  const row = raw as PortalCategoryRow;
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    description: row?.description ? String(row.description) : "",
    parentId: row?.parentId ? String(row.parentId) : null,
    status: normalizeStatus(row?.status),
  };
}

function mapPortalProduct(raw: any): Product {
  const row = raw as PortalProductRow;
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    categoryId: row?.categoryId ? String(row.categoryId) : null,
  };
}

const CategoriesPage: React.FC = () => {
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsSnapshot, setProductsSnapshot] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    parentId: "" as string | "",
    status: "active" as CategoryStatus,
  });

  const [productLinkSearch, setProductLinkSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [categoriesRes, productsRes] = await Promise.all([
        fetch("/api/portal/catalog/categories"),
        fetch("/api/portal/catalog/products"),
      ]);
      if (!categoriesRes.ok) {
        throw new Error(await readErrorMessage(categoriesRes, "Не удалось загрузить категории"));
      }
      if (!productsRes.ok) {
        throw new Error(await readErrorMessage(productsRes, "Не удалось загрузить товары"));
      }
      const categoriesPayload = await categoriesRes.json();
      const productsPayload = await productsRes.json();
      const nextCategories = Array.isArray(categoriesPayload) ? categoriesPayload.map(mapPortalCategory) : [];
      const nextProducts = Array.isArray(productsPayload?.items) ? productsPayload.items.map(mapPortalProduct) : [];
      setCategories(nextCategories);
      setProducts(nextProducts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || "Не удалось загрузить категории");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const getDescendantIds = useCallback(
    (catId: string, visited = new Set<string>()): string[] => {
      if (visited.has(catId)) return [];
      visited.add(catId);
      const children = categories.filter((c) => c.parentId === catId);
      let ids: string[] = [];
      children.forEach((child) => {
        ids.push(child.id);
        ids = ids.concat(getDescendantIds(child.id, visited));
      });
      return ids;
    },
    [categories],
  );

  const getRecursiveProductCount = useCallback(
    (catId: string) => {
      const allCategoryIds = [catId, ...getDescendantIds(catId)];
      return products.filter((p) => p.categoryId && allCategoryIds.includes(p.categoryId)).length;
    },
    [getDescendantIds, products],
  );

  const categoryTree = useMemo(() => {
    const tree: (Category & { children: Category[] })[] = [];
    const map: Record<string, Category & { children: Category[] }> = {};
    categories.forEach((cat) => {
      map[cat.id] = { ...cat, children: [] };
    });
    categories.forEach((cat) => {
      const node = map[cat.id];
      if (!node) return;
      const parent = cat.parentId ? map[cat.parentId] : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        tree.push(node);
      }
    });
    return tree;
  }, [categories]);

  const flattenedCategories = useMemo(() => {
    const result: (Category & { level: number })[] = [];
    const traverse = (nodes: (Category & { children?: Category[] })[], level: number) => {
      nodes.forEach((node) => {
        result.push({ ...node, level });
        if (node.children && node.children.length > 0) {
          traverse(node.children, level + 1);
        }
      });
    };
    traverse(categoryTree, 0);
    if (searchTerm.trim()) {
      const query = searchTerm.trim().toLowerCase();
      return result.filter((c) => c.name.toLowerCase().includes(query));
    }
    return result;
  }, [categoryTree, searchTerm]);

  const disallowedParentIds = useMemo(() => {
    if (!editingId) return new Set<string>();
    return new Set([editingId, ...getDescendantIds(editingId)]);
  }, [editingId, getDescendantIds]);

  const handleStartCreate = () => {
    const newId = Date.now().toString();
    setEditingId(newId);
    setProductsSnapshot([...products]);
    setFormData({ name: "", description: "", parentId: "", status: "active" });
    setProductLinkSearch("");
    setError(null);
    setView("create");
  };

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setProductsSnapshot([...products]);
    setFormData({
      name: cat.name,
      description: cat.description,
      parentId: cat.parentId || "",
      status: cat.status,
    });
    setProductLinkSearch("");
    setError(null);
    setView("edit");
  };

  const handleCancel = () => {
    setProducts(productsSnapshot);
    setView("list");
  };

  const handleDeleteCategory = async (id: string) => {
    const hasChildren = categories.some((c) => c.parentId === id);
    if (hasChildren) {
      alert("Нельзя удалить категорию, содержащую подкатегории. Сначала удалите или переместите их.");
      return;
    }
    if (!confirm('Вы уверены? Товары в этой категории станут "Без категории".')) return;
    setError(null);
    try {
      const res = await fetch(`/api/portal/catalog/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Не удалось удалить категорию"));
      }
      setCategories((prev) => prev.filter((cat) => cat.id !== id));
      setProducts((prev) => prev.map((prod) => (prod.categoryId === id ? { ...prod, categoryId: null } : prod)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || "Не удалось удалить категорию");
      setError(message);
    }
  };

  const handleSaveCategory = async () => {
    if (!formData.name.trim()) {
      setError("Введите название категории");
      return;
    }
    if (!editingId) {
      setError("Не удалось определить категорию");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      parentId: formData.parentId || null,
      status: formData.status === "archived" ? "ARCHIVED" : "ACTIVE",
      assignProductIds: products.filter((prod) => prod.categoryId === editingId).map((prod) => prod.id),
      unassignProductIds:
        view === "edit"
          ? productsSnapshot
              .filter((prod) => prod.categoryId === editingId)
              .filter((prod) => !products.some((item) => item.id === prod.id && item.categoryId === editingId))
              .map((prod) => prod.id)
          : [],
    };

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        view === "edit" ? `/api/portal/catalog/categories/${editingId}` : "/api/portal/catalog/categories",
        {
          method: view === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Не удалось сохранить категорию"));
      }
      await res.json().catch(() => null);

      await loadData();
      setView("list");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || "Не удалось сохранить категорию");
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkProduct = (prodId: string) => {
    setProducts((prev) => prev.map((p) => (p.id === prodId ? { ...p, categoryId: null } : p)));
  };

  const handleLinkProduct = (prodId: string) => {
    if (!editingId) return;
    setProducts((prev) => prev.map((p) => (p.id === prodId ? { ...p, categoryId: editingId } : p)));
  };

  const handleCreateProduct = async () => {
    if (!editingId) return;
    const name = prompt("Название товара:");
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        categoryId: view === "edit" ? editingId : null,
        externalId: null,
        accruePoints: true,
        allowRedeem: true,
        redeemPercent: 100,
      };
      const res = await fetch("/api/portal/catalog/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Не удалось создать товар"));
      }
      const data = await res.json().catch(() => null);
      const created = data ? mapPortalProduct(data) : { id: Date.now().toString(), name: payload.name, categoryId: payload.categoryId };
      const next = view === "create" ? { ...created, categoryId: editingId } : created;
      setProducts((prev) => [...prev, next]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || "Не удалось создать товар");
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const editorAttachedProducts = editingId ? products.filter((p) => p.categoryId === editingId) : [];
  const editorAvailableProducts = products.filter(
    (p) => p.categoryId !== editingId && p.name.toLowerCase().includes(productLinkSearch.toLowerCase()),
  );

  if (view === "create" || view === "edit") {
    return (
      <div className="p-8 max-w-[1600px] mx-auto  h-[calc(100vh-64px)] flex flex-col">
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
              aria-label="Назад"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {view === "create" ? "Новая категория" : "Редактирование"}
              </h2>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleSaveCategory}
              disabled={saving}
              className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-60"
            >
              <Save size={18} />
              <span>{saving ? "Сохранение..." : "Сохранить"}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg flex-shrink-0">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 flex-1 min-h-0">
          <div className="xl:col-span-4 space-y-6 overflow-y-auto pr-2">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <h3 className="font-bold text-gray-900 text-lg border-b border-gray-100 pb-3">Основное</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    placeholder="Например: Десерты"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Родительская категория</label>
                  <select
                    value={formData.parentId}
                    onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="">-- Корневая категория --</option>
                    {categories
                      .filter((c) => !disallowedParentIds.has(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                  <div className="flex items-center h-[42px]">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.status === "active"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            status: e.target.checked ? "active" : "archived",
                          })
                        }
                        className="sr-only peer"
                        aria-label="Статус категории"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      <span className="ml-3 text-sm font-medium text-gray-900">
                        {formData.status === "active" ? "Активна" : "В архиве"}
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                  <textarea
                    rows={6}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                    placeholder="Краткое описание..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="xl:col-span-8 h-full min-h-[500px]">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-full flex flex-col overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex-shrink-0">
                <h3 className="font-bold text-gray-900 text-lg">Состав категории</h3>
                <p className="text-gray-500 text-sm mt-1">
                  Управляйте списком товаров категории, выбирая их из списка доступных.
                </p>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 overflow-hidden">
                <div className="flex flex-col bg-gray-50/50 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10 flex-shrink-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-gray-700">Доступные товары</span>
                      <button
                        onClick={handleCreateProduct}
                        className="text-xs flex items-center bg-purple-50 text-purple-700 px-2 py-1 rounded hover:bg-purple-100 transition-colors"
                      >
                        <Plus size={12} className="mr-1" /> Создать
                      </button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        value={productLinkSearch}
                        onChange={(e) => setProductLinkSearch(e.target.value)}
                        placeholder="Поиск по всем товарам..."
                        className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {editorAvailableProducts.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-sm">
                        {productLinkSearch ? "Ничего не найдено" : "Нет доступных товаров"}
                      </div>
                    ) : (
                      editorAvailableProducts.map((prod) => (
                        <div
                          key={prod.id}
                          className="group flex items-center justify-between p-3 bg-white rounded border border-gray-100 hover:border-purple-300 hover:shadow-sm transition-all"
                        >
                          <div>
                            <div className="text-sm font-medium text-gray-900 break-words">{prod.name}</div>
                            <div className="text-xs text-gray-500">
                              {prod.categoryId && (
                                <span className="text-purple-600 bg-purple-50 px-1 rounded">Из др. категории</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleLinkProduct(prod.id)}
                            className="p-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-purple-600 hover:text-white transition-colors"
                            title="Добавить в категорию"
                            aria-label="Добавить в категорию"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col bg-white overflow-hidden">
                  <div className="p-4 border-b border-gray-100 sticky top-0 z-10 bg-white flex-shrink-0">
                    <div className="flex justify-between items-center h-[38px]">
                      <span className="text-sm font-bold text-gray-700">В этой категории</span>
                      <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full">
                        {editorAttachedProducts.length} поз.
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {editorAttachedProducts.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6 text-center">
                        <ShoppingBag size={40} className="mb-3 opacity-20" />
                        <p className="text-sm font-medium">Список пуст</p>
                        <p className="text-xs mt-1">Добавьте товары из списка слева</p>
                      </div>
                    ) : (
                      editorAttachedProducts.map((prod) => (
                        <div
                          key={prod.id}
                          className="group flex items-center justify-between p-3 bg-white rounded border border-gray-100 hover:border-red-200 hover:bg-red-50/10 transition-all"
                        >
                          <div>
                            <div className="text-sm font-medium text-gray-900 break-words">{prod.name}</div>
                          </div>
                          <button
                            onClick={() => handleUnlinkProduct(prod.id)}
                            className="p-1.5 rounded-full text-gray-300 hover:bg-red-100 hover:text-red-600 transition-colors"
                            title="Убрать из категории"
                            aria-label="Убрать из категории"
                          >
                            <Minus size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-8 ">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Категории товаров</h2>
          <p className="text-gray-500 mt-1">Создавайте структуру каталога для удобной навигации и отчетности.</p>
        </div>

        <button
          onClick={handleStartCreate}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span>Создать категорию</span>
        </button>
      </div>

      {error && !loading && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Поиск категорий..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="text-sm text-gray-500">Всего: {categories.length}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold w-1/3">Название</th>
                <th className="px-6 py-4 font-semibold">Описание</th>
                <th className="px-6 py-4 font-semibold text-center">Всего товаров</th>
                <th className="px-6 py-4 font-semibold text-center">Статус</th>
                <th className="px-6 py-4 font-semibold text-right w-24">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Загрузка категорий...
                  </td>
                </tr>
              ) : flattenedCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Layers size={48} className="mx-auto text-gray-300 mb-4" />
                    <p>Категории не найдены.</p>
                  </td>
                </tr>
              ) : (
                flattenedCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-3">
                      <div className="flex items-center" style={{ paddingLeft: `${cat.level * 24}px` }}>
                        {cat.level > 0 && (
                          <CornerDownRight size={16} className="text-gray-300 mr-2 flex-shrink-0" />
                        )}
                        <div
                          className={`p-1.5 rounded mr-3 ${cat.level === 0 ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500"}`}
                        >
                          <Folder size={16} />
                        </div>
                        <span className={`font-medium ${cat.level === 0 ? "text-gray-900" : "text-gray-700"}`}>
                          {cat.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-gray-500 truncate max-w-xs">{cat.description || "-"}</td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                        title="Включая подкатегории"
                      >
                        {getRecursiveProductCount(cat.id)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      {cat.status === "active" ? (
                        <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">Активна</span>
                      ) : (
                        <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded">Архив</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartEdit(cat)}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Редактировать"
                          aria-label="Редактировать"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Удалить"
                          aria-label="Удалить"
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
    </div>
  );
};

export default CategoriesPage;
