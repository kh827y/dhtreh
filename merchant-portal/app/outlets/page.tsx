"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Store, Plus, MapPin, Monitor, Users, Edit, Trash2 } from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";

type OutletItem = {
  id: string;
  name: string;
  works: boolean;
  devices: Array<{ id: string; code: string }>;
  staffCount: number;
  reviewsShareLinks?: { yandex?: string | null; twogis?: string | null; google?: string | null } | null;
};

type OutletListResponse = {
  items?: OutletItem[];
  total?: number;
};

type TabKey = "active" | "inactive";

export default function OutletsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<TabKey>("active");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [activeOutlets, setActiveOutlets] = React.useState<OutletItem[]>([]);
  const [inactiveOutlets, setInactiveOutlets] = React.useState<OutletItem[]>([]);
  const [activeTotal, setActiveTotal] = React.useState(0);
  const [inactiveTotal, setInactiveTotal] = React.useState(0);

  const fetchOutletsByStatus = React.useCallback(async (status: string) => {
    const pageSize = 50;
    let page = 1;
    let total = 0;
    const items: OutletItem[] = [];
    while (true) {
      const res = await fetch(`/api/portal/outlets?status=${encodeURIComponent(status)}&page=${page}&pageSize=${pageSize}`);
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Не удалось загрузить торговые точки");
      }
      const data = (await res.json()) as OutletListResponse;
      const chunk = Array.isArray(data.items) ? data.items : [];
      items.push(...chunk);
      total = typeof data.total === "number" ? data.total : items.length;
      if (chunk.length < pageSize || items.length >= total) break;
      page += 1;
    }
    return { items, total };
  }, []);

  const fetchOutlets = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activeData, inactiveData] = await Promise.all([
        fetchOutletsByStatus("ACTIVE"),
        fetchOutletsByStatus("INACTIVE"),
      ]);
      setActiveOutlets(activeData.items);
      setInactiveOutlets(inactiveData.items);
      setActiveTotal(activeData.total);
      setInactiveTotal(inactiveData.total);
    } catch (e: any) {
      setError(normalizeErrorMessage(e, "Не удалось загрузить торговые точки"));
      setActiveOutlets([]);
      setInactiveOutlets([]);
      setActiveTotal(0);
      setInactiveTotal(0);
    } finally {
      setLoading(false);
    }
  }, [fetchOutletsByStatus]);

  React.useEffect(() => {
    fetchOutlets();
  }, [fetchOutlets]);

  const displayedOutlets = activeTab === "active" ? activeOutlets : inactiveOutlets;

  const handleDeleteOutlet = async (id: string) => {
    if (!confirm("Вы уверены? Это действие нельзя отменить.")) return;
    try {
      const res = await fetch(`/api/portal/outlets/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Не удалось удалить точку");
      }
      await fetchOutlets();
    } catch (e: any) {
      setError(normalizeErrorMessage(e, "Не удалось удалить точку"));
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Торговые точки</h2>
          <p className="text-gray-500 mt-1">Управление магазинами, кассами и ссылками на отзывы.</p>
        </div>

        <button
          onClick={() => router.push("/outlets/new")}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span>Добавить точку</span>
        </button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("active")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "active"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Работают
            <span
              className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                activeTab === "active" ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500"
              }`}
            >
              {activeTotal}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("inactive")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "inactive"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Не работают
            <span
              className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                activeTab === "inactive" ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500"
              }`}
            >
              {inactiveTotal}
            </span>
          </button>
        </nav>
      </div>

      {error && !loading && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-400">Загрузка...</div>
        ) : displayedOutlets.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500">Нет торговых точек в этом разделе.</div>
        ) : (
          displayedOutlets.map((outlet) => (
            <div
              key={outlet.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-6 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                    <Store size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg leading-tight mb-2">{outlet.name}</h3>
                    <span
                      className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
                        outlet.works ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {outlet.works ? "Активна" : "Не активна"}
                    </span>
                  </div>
                </div>
                <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => router.push(`/outlets/${encodeURIComponent(outlet.id)}`)}
                    className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    aria-label="Редактировать"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDeleteOutlet(outlet.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label="Удалить"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-gray-600">
                    <Monitor size={16} className="mr-2" />
                    <span>Устройства</span>
                  </div>
                  <span className="font-medium text-gray-900">{outlet.devices?.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-gray-600">
                    <Users size={16} className="mr-2" />
                    <span>Сотрудники</span>
                  </div>
                  <span className="font-medium text-gray-900">{outlet.staffCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-gray-600">
                    <MapPin size={16} className="mr-2" />
                    <span>Ссылки на отзывы</span>
                  </div>
                  <div className="flex space-x-1">
                    {outlet.reviewsShareLinks?.yandex && <div className="w-2 h-2 rounded-full bg-red-500" title="Yandex" />}
                    {outlet.reviewsShareLinks?.twogis && <div className="w-2 h-2 rounded-full bg-green-500" title="2GIS" />}
                    {outlet.reviewsShareLinks?.google && <div className="w-2 h-2 rounded-full bg-blue-500" title="Google" />}
                    {!outlet.reviewsShareLinks?.yandex &&
                      !outlet.reviewsShareLinks?.twogis &&
                      !outlet.reviewsShareLinks?.google && <span className="text-xs text-gray-400">-</span>}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
