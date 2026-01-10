"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Monitor, Users, Save, ArrowLeft, X } from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,63}$/;
const STAFF_PAGE_SIZE = 100;
const isValidHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

type Device = { id: string; code: string };

type ReviewLinks = {
  yandex: string;
  gis: string;
  google: string;
};

type StaffItem = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  login?: string | null;
  email?: string | null;
};

const staffLabel = (staff: StaffItem) => {
  const nameParts = [staff.firstName, staff.lastName].filter(Boolean).map((value) => String(value || "").trim());
  const fullName = nameParts.join(" ").trim();
  if (fullName) return fullName;
  return staff.login || staff.email || staff.id;
};

type EditOutletPageProps = { basePath?: string };

export default function EditOutletPage({ basePath }: EditOutletPageProps) {
  const params = useParams<{ id: string }>();
  const outletId = params?.id as string;
  const router = useRouter();
  const listPath = (basePath || "/outlets").replace(/\/$/, "") || "/outlets";

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [isActive, setIsActive] = React.useState(true);
  const [name, setName] = React.useState("");
  const [reviewLinks, setReviewLinks] = React.useState<ReviewLinks>({
    yandex: "",
    gis: "",
    google: "",
  });
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [newDeviceInput, setNewDeviceInput] = React.useState("");
  const [deviceError, setDeviceError] = React.useState<string | null>(null);
  const [staff, setStaff] = React.useState<StaffItem[]>([]);
  const [staffTotal, setStaffTotal] = React.useState<number | null>(null);

  const validateReviewLinks = () => {
    const invalid: string[] = [];
    const yandex = reviewLinks.yandex.trim();
    const gis = reviewLinks.gis.trim();
    const google = reviewLinks.google.trim();
    if (yandex && !isValidHttpUrl(yandex)) invalid.push("Яндекс");
    if (gis && !isValidHttpUrl(gis)) invalid.push("2ГИС");
    if (google && !isValidHttpUrl(google)) invalid.push("Google");
    if (invalid.length) {
      return `Некорректная ссылка для отзывов: ${invalid.join(", ")}`;
    }
    return null;
  };

  const loadOutlet = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/outlets/${encodeURIComponent(outletId)}`, { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Не удалось загрузить точку");
      }
      const data = await res.json();
      setIsActive(Boolean(data?.works));
      setName(String(data?.name || ""));
      const links = data?.reviewsShareLinks && typeof data.reviewsShareLinks === "object" ? data.reviewsShareLinks : {};
      setReviewLinks({
        yandex: typeof links.yandex === "string" ? links.yandex : "",
        gis: typeof links.twogis === "string" ? links.twogis : "",
        google: typeof links.google === "string" ? links.google : "",
      });
      setDevices(Array.isArray(data?.devices) ? data.devices.map((d: any) => ({ id: String(d.id), code: String(d.code) })) : []);
    } catch (e: any) {
      setError(normalizeErrorMessage(e, "Не удалось загрузить точку"));
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  const loadStaff = React.useCallback(async () => {
    try {
      let page = 1;
      let total: number | null = null;
      const allItems: StaffItem[] = [];
      while (page <= 50) {
        const res = await fetch(
          `/api/portal/staff?outletId=${encodeURIComponent(outletId)}&pageSize=${STAFF_PAGE_SIZE}&page=${page}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          setStaffTotal(null);
          return;
        }
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        const totalRaw = Number(data?.meta?.total);
        if (Number.isFinite(totalRaw)) total = totalRaw;
        allItems.push(...items);
        if (!items.length) break;
        if (total !== null && allItems.length >= total) break;
        if (items.length < STAFF_PAGE_SIZE) break;
        page += 1;
      }
      setStaff(allItems);
      setStaffTotal(total ?? allItems.length);
    } catch {
      setStaff([]);
      setStaffTotal(null);
    }
  }, [outletId]);

  React.useEffect(() => {
    if (!outletId) return;
    loadOutlet();
    loadStaff();
  }, [loadOutlet, loadStaff, outletId]);

  const handleAddDevice = () => {
    const code = newDeviceInput.trim();
    if (!code) return;
    if (!DEVICE_ID_PATTERN.test(code)) {
      setDeviceError("Допустимы латинские буквы, цифры, точки, дефисы и подчёркивания (2–64 символа)");
      return;
    }
    if (devices.some((d) => d.code.toLowerCase() === code.toLowerCase())) {
      setDeviceError("Идентификатор должен быть уникальным");
      return;
    }
    setDevices((prev) => [...prev, { id: Date.now().toString(), code }]);
    setNewDeviceInput("");
    setDeviceError(null);
  };

  const handleRemoveDevice = (deviceId: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== deviceId));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Введите название точки");
      return;
    }
    const linkError = validateReviewLinks();
    if (linkError) {
      setError(linkError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        works: isActive,
        reviewsShareLinks: {
          yandex: reviewLinks.yandex.trim() || null,
          twogis: reviewLinks.gis.trim() || null,
          google: reviewLinks.google.trim() || null,
        },
        devices: devices.map((d) => ({ code: d.code })),
      };
      const res = await fetch(`/api/portal/outlets/${encodeURIComponent(outletId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        let message = raw;
        try {
          const parsed = JSON.parse(raw);
          message = parsed?.message || parsed?.error || raw;
        } catch {}
        throw new Error(message || "Не удалось сохранить точку");
      }
      router.push(listPath);
    } catch (e: any) {
      setError(normalizeErrorMessage(e, "Не удалось сохранить точку"));
    } finally {
      setSaving(false);
    }
  };

  const staffCount = staffTotal ?? staff.length;
  const staffHasMore = staffTotal !== null && staffTotal > staff.length;

  return (
    <div className="p-8 max-w-[1200px] mx-auto ">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push(listPath)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Редактирование точки</h2>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-white px-3 py-1.5 rounded-lg border border-gray-200">
            <span className={`text-sm font-medium mr-3 ${isActive ? "text-green-600" : "text-gray-500"}`}>
              {isActive ? "Работает" : "Не работает"}
            </span>
            <button
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                isActive ? "bg-green-500" : "bg-gray-300"
              }`}
              disabled={saving}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          <button
            onClick={handleSave}
            className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
            disabled={saving}
          >
            <Save size={18} />
            <span>{saving ? "Сохранение..." : "Сохранить"}</span>
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg mb-6">{error}</div>}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-gray-400 text-center">Загрузка...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Основная информация</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  placeholder="Например: Магазин на Ленина"
                />
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Ссылки на отзывы</h3>
              <p className="text-sm text-gray-500">Используются для перенаправления клиентов после высокой оценки качества обслуживания.</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Яндекс.Карты</label>
                  <div className="flex items-center relative">
                    <span className="absolute left-3 text-red-500 font-bold text-xs">Я</span>
                    <input
                      type="text"
                      value={reviewLinks.yandex}
                      onChange={(e) => setReviewLinks({ ...reviewLinks, yandex: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      placeholder="https://yandex.ru/maps/..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">2ГИС</label>
                  <div className="flex items-center relative">
                    <span className="absolute left-3 text-green-600 font-bold text-xs">2</span>
                    <input
                      type="text"
                      value={reviewLinks.gis}
                      onChange={(e) => setReviewLinks({ ...reviewLinks, gis: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      placeholder="https://2gis.ru/..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Google Maps</label>
                  <div className="flex items-center relative">
                    <span className="absolute left-3 text-blue-500 font-bold text-xs">G</span>
                    <input
                      type="text"
                      value={reviewLinks.google}
                      onChange={(e) => setReviewLinks({ ...reviewLinks, google: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      placeholder="https://google.com/maps/..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">Устройства (Кассы)</h3>
                <span className="text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded-full font-medium">
                  {devices.length}
                </span>
              </div>

              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newDeviceInput}
                  onChange={(e) => setNewDeviceInput(e.target.value)}
                  placeholder="Внешний ID (напр. POS-05)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleAddDevice()}
                />
                <button
                  onClick={handleAddDevice}
                  className="bg-purple-50 text-purple-600 p-2 rounded-lg hover:bg-purple-100 transition-colors"
                  aria-label="Добавить устройство"
                >
                  <Plus size={20} />
                </button>
              </div>
              {deviceError && <div className="text-xs text-red-500">{deviceError}</div>}

              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-[156px] overflow-y-auto custom-scrollbar">
                {devices.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">Устройств пока нет</div>
                ) : (
                  devices.map((dev) => (
                    <div key={dev.id} className="p-3 flex justify-between items-center hover:bg-gray-50">
                      <div className="flex items-center space-x-3">
                        <Monitor size={16} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">{dev.code}</span>
                      </div>
                      <button onClick={() => handleRemoveDevice(dev.id)} className="text-gray-400 hover:text-red-500">
                        <X size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">Сотрудники</h3>
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium">
                  {staffCount}
                </span>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-600 flex items-start space-x-2">
                <Users size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
                <p>Управление сотрудниками и привязка их к торговым точкам осуществляется в разделе "Сотрудники".</p>
              </div>
              {staffHasMore ? (
                <div className="text-xs text-gray-400">
                  Показаны первые {STAFF_PAGE_SIZE} из {staffTotal}. Полный список — в разделе "Сотрудники".
                </div>
              ) : null}
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-[156px] overflow-y-auto custom-scrollbar">
                {staff.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">Сотрудников пока нет</div>
                ) : (
                  staff.map((person) => (
                    <div key={person.id} className="p-3 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center space-x-3">
                        <Users size={16} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">{staffLabel(person)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
