"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingBag,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Save,
  ArrowLeft,
  Coins,
  Percent,
  Barcode,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { readErrorMessage } from "lib/portal-errors";

type Category = {
  id: string;
  name: string;
};

type ProductLoyaltySettings = {
  accruePoints: boolean;
  allowPointPayment: boolean;
  maxPaymentPercent: number;
};

type Product = {
  id: string;
  name: string;
  categoryId: string;
  externalId: string;
  loyalty: ProductLoyaltySettings;
};

type PortalProductRow = {
  id: string;
  name: string;
  categoryId?: string | null;
  externalId?: string | null;
  accruePoints?: boolean;
  allowRedeem?: boolean;
  redeemPercent?: number;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function mapPortalCategory(raw: any): Category {
  return {
    id: String(raw?.id ?? ""),
    name: String(raw?.name ?? ""),
  };
}

function mapPortalProduct(raw: any): Product {
  const row = raw as PortalProductRow;
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    categoryId: row?.categoryId ? String(row.categoryId) : "",
    externalId: row?.externalId ? String(row.externalId) : "",
    loyalty: {
      accruePoints: row?.accruePoints !== false,
      allowPointPayment: row?.allowRedeem !== false,
      maxPaymentPercent: clampPercent(Number(row?.redeemPercent ?? 100)),
    },
  };
}

const ProductsPage: React.FC = () => {
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    externalId: "",
    accruePoints: true,
    allowPointPayment: true,
    maxPaymentPercent: 100,
  });

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
      const message = err instanceof Error ? err.message : String(err || "Не удалось загрузить товары");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(query) ||
        product.externalId.toLowerCase().includes(query);
      const matchesCategory = filterCategory === "all" || product.categoryId === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, filterCategory]);

  const getCategoryName = (id: string) => categories.find((c) => c.id === id)?.name || "-";

  const handleStartCreate = () => {
    setEditingId(null);
    setFormData({
      name: "",
      categoryId: "",
      externalId: "",
      accruePoints: true,
      allowPointPayment: true,
      maxPaymentPercent: 100,
    });
    setError(null);
    setView("create");
  };

  const handleStartEdit = (product: Product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name,
      categoryId: product.categoryId,
      externalId: product.externalId,
      accruePoints: product.loyalty.accruePoints,
      allowPointPayment: product.loyalty.allowPointPayment,
      maxPaymentPercent: clampPercent(product.loyalty.maxPaymentPercent),
    });
    setError(null);
    setView("edit");
  };

  const handleSave = async () => {
    const name = formData.name.trim();
    if (!name) {
      setError("Введите название товара");
      return;
    }
    if (!formData.categoryId) {
      setError("Выберите категорию");
      return;
    }
    const payload = {
      name,
      categoryId: formData.categoryId,
      externalId: formData.externalId.trim() || null,
      accruePoints: formData.accruePoints,
      allowRedeem: formData.allowPointPayment,
      redeemPercent: formData.allowPointPayment ? clampPercent(formData.maxPaymentPercent) : 0,
    };

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        view === "edit" && editingId ? `/api/portal/catalog/products/${editingId}` : "/api/portal/catalog/products",
        {
          method: view === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Не удалось сохранить товар"));
      }
      const data = await res.json().catch(() => null);
      const nextProduct = data ? mapPortalProduct(data) : mapPortalProduct({ ...payload, id: editingId || Date.now().toString() });
      setProducts((prev) =>
        view === "edit" && editingId
          ? prev.map((item) => (item.id === editingId ? nextProduct : item))
          : [...prev, nextProduct],
      );
      setView("list");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || "Не удалось сохранить товар");
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить этот товар?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/portal/catalog/products/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Не удалось удалить товар"));
      }
      setProducts((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || "Не удалось удалить товар");
      setError(message);
    }
  };

  if (view === "create" || view === "edit") {
    return (
      <div className="p-8 max-w-[1200px] mx-auto ">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setView("list")}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
              aria-label="Назад"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {view === "create" ? "Новый товар" : "Редактирование товара"}
              </h2>
              <p className="text-sm text-gray-500">
                Заполните информацию о товаре и настройте правила лояльности.
              </p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-60"
          >
            <Save size={18} />
            <span>{saving ? "Сохранение..." : "Сохранить"}</span>
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-bold text-gray-900 text-lg border-b border-gray-100 pb-3">Основное</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Например: Капучино 0.3"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Категория <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                >
                  <option value="">Выберите категорию</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Внешний ID</label>
                <div className="relative">
                  <Barcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={formData.externalId}
                    onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
                    placeholder="ID из iiko, r_keeper, 1C..."
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Используется для синхронизации с кассовой системой.</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                <Coins size={20} className="text-purple-600" />
                <h3>Настройки лояльности</h3>
              </div>

              <div className="flex items-start justify-between">
                <div>
                  <span className="block font-medium text-gray-900">Начислять баллы</span>
                  <span className="text-sm text-gray-500">Клиент получит кэшбэк за покупку этого товара.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.accruePoints}
                    onChange={(e) => setFormData({ ...formData, accruePoints: e.target.checked })}
                    className="sr-only peer"
                    aria-label="Начислять баллы"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              <hr className="border-gray-100" />

              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="block font-medium text-gray-900">Разрешить оплату баллами</span>
                    <span className="text-sm text-gray-500">Можно ли списать баллы для скидки на этот товар.</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.allowPointPayment}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          allowPointPayment: e.target.checked,
                        })
                      }
                      className="sr-only peer"
                      aria-label="Разрешить оплату баллами"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                <div
                  className={`transition-opacity duration-200 ${!formData.allowPointPayment ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Какую часть товара можно оплатить баллами
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.maxPaymentPercent}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxPaymentPercent: clampPercent(Number(e.target.value)),
                        })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Percent size={16} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Например, 50% означает, что половину стоимости можно закрыть бонусами, а остальное — деньгами.
                  </p>
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
          <h2 className="text-2xl font-bold text-gray-900">Товары</h2>
          <p className="text-gray-500 mt-1">Каталог товаров и настройки правил списания баллов.</p>
        </div>

        <button
          onClick={handleStartCreate}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span>Добавить товар</span>
        </button>
      </div>

      {error && !loading && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Поиск по названию или ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Filter size={16} className="text-gray-400" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-48"
            >
              <option value="all">Все категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Название</th>
                <th className="px-6 py-4 font-semibold">Категория</th>
                <th className="px-6 py-4 font-semibold">Внешний ID</th>
                <th className="px-6 py-4 font-semibold text-center">Начисление</th>
                <th className="px-6 py-4 font-semibold text-center">Оплата баллами</th>
                <th className="px-6 py-4 font-semibold text-right w-24">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Загрузка товаров...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
                    <p>Товары не найдены.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-3 font-medium text-gray-900 break-words">
                      {product.name}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {getCategoryName(product.categoryId)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 font-mono text-xs break-all">
                      {product.externalId || "-"}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {product.loyalty.accruePoints ? (
                        <CheckCircle2 size={18} className="text-green-500 mx-auto" />
                      ) : (
                        <XCircle size={18} className="text-gray-300 mx-auto" />
                      )}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {product.loyalty.allowPointPayment ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                          до {product.loyalty.maxPaymentPercent}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                          Запрещено
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartEdit(product)}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Редактировать"
                          aria-label="Редактировать"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
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

export default ProductsPage;
