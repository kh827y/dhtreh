"use client";

import React from "react";
import {
  MessageSquare,
  Star,
  Store,
  User,
  Monitor,
  Filter,
  MapPin,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Save,
  Power,
} from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";

type SelectOption = { value: string; label: string };

type ApiReviewItem = {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  customer?: { id: string; name?: string | null; phone?: string | null; email?: string | null } | null;
  staff?: { id: string; name?: string | null } | null;
  outlet?: { id: string; name?: string | null } | null;
  deviceId?: string | null;
};

type ReviewsApiResponse = {
  items?: ApiReviewItem[];
  total?: number;
  outlets?: Array<{ id: string; name?: string | null }>;
  staff?: Array<{ id: string; name?: string | null }>;
  stats?: { averageRating?: number | null } | null;
};

type ReviewRow = {
  id: string;
  clientName: string;
  rating: number;
  comment: string | null;
  sourceType: "staff" | "device";
  sourceName: string;
  outlet: string;
  date: string;
};

type DeviceInfo = {
  id: string;
  code: string;
  outletId: string;
  outletName: string;
};

const PAGE_SIZE = 8;
const REVIEW_ENABLED_DEFAULT = true;

const toInitial = (name: string) => {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
};

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildRulesBase = (source: any) => {
  if (source && typeof source === "object") {
    return { ...source } as Record<string, any>;
  }
  if (Array.isArray(source)) {
    return { rules: source } as Record<string, any>;
  }
  return {} as Record<string, any>;
};

export default function ReviewsPage() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [reviews, setReviews] = React.useState<ReviewRow[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [averageRating, setAverageRating] = React.useState(0);

  const [filterOutlet, setFilterOutlet] = React.useState("all");
  const [filterStaff, setFilterStaff] = React.useState("all");
  const [filterDevice, setFilterDevice] = React.useState("all");
  const [onlyWithComments, setOnlyWithComments] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);

  const [outletOptions, setOutletOptions] = React.useState<SelectOption[]>([
    { value: "all", label: "Все точки" },
  ]);
  const [staffOptions, setStaffOptions] = React.useState<SelectOption[]>([
    { value: "all", label: "Все сотрудники" },
  ]);
  const [deviceOptions, setDeviceOptions] = React.useState<SelectOption[]>([
    { value: "all", label: "Все устройства" },
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const [settingsSnapshot, setSettingsSnapshot] = React.useState<any | null>(null);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);

  const [isEnabled, setIsEnabled] = React.useState(true);
  const [offerExternal, setOfferExternal] = React.useState(true);
  const [minRating, setMinRating] = React.useState<string>("5");
  const [platforms, setPlatforms] = React.useState({
    yandex: true,
    google: false,
    gis: true,
  });

  const applyShareSettings = React.useCallback((data: any) => {
    const rulesBase = buildRulesBase(data?.rulesJson);
    const reviewRules =
      rulesBase?.reviews && typeof rulesBase.reviews === "object" ? rulesBase.reviews : {};
    const share =
      rulesBase?.reviewsShare && typeof rulesBase.reviewsShare === "object" ? rulesBase.reviewsShare : {};
    const enabledValue =
      reviewRules.enabled !== undefined ? Boolean(reviewRules.enabled) : REVIEW_ENABLED_DEFAULT;
    setIsEnabled(enabledValue);
    setOfferExternal(Boolean(share?.enabled));
    const threshold = Number(share?.threshold);
    const normalizedThreshold = Number.isFinite(threshold)
      ? Math.min(5, Math.max(1, Math.round(threshold)))
      : 5;
    setMinRating(normalizedThreshold === 5 ? "5" : `${normalizedThreshold}+`);
    const platformsData = share?.platforms && typeof share.platforms === "object" ? share.platforms : {};
    setPlatforms({
      yandex: Boolean(platformsData?.yandex?.enabled),
      google: Boolean(platformsData?.google?.enabled),
      gis: Boolean(platformsData?.twogis?.enabled),
    });
  }, []);

  const persistSettings = React.useCallback(
    async (rulesJson: Record<string, any>) => {
      const payload: Record<string, unknown> = { rulesJson };
      const res = await fetch("/api/portal/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Не удалось сохранить настройки");
      }
      const updated = await res.json();
      setSettingsSnapshot(updated);
      applyShareSettings(updated);
    },
    [applyShareSettings],
  );

  const handleToggleReviews = React.useCallback(
    async (nextValue: boolean) => {
      if (!settingsSnapshot) {
        setIsEnabled(nextValue);
        return;
      }
      const prev = isEnabled;
      setIsEnabled(nextValue);
      setSettingsSaving(true);
      setSettingsError(null);
      try {
        const rulesBase = buildRulesBase(settingsSnapshot.rulesJson);
        const reviewRules =
          rulesBase.reviews && typeof rulesBase.reviews === "object" ? { ...rulesBase.reviews } : {};
        reviewRules.enabled = nextValue;
        rulesBase.reviews = reviewRules;
        await persistSettings(rulesBase);
      } catch (err: any) {
        setIsEnabled(prev);
        setSettingsError(normalizeErrorMessage(err, "Не удалось сохранить настройки"));
      } finally {
        setSettingsSaving(false);
      }
    },
    [isEnabled, persistSettings, settingsSnapshot],
  );

  const handleSaveSettings = React.useCallback(async () => {
    if (!settingsSnapshot) {
      setSettingsError("Настройки еще загружаются");
      return;
    }
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const rulesBase = buildRulesBase(settingsSnapshot.rulesJson);
      const sharePlatforms =
        rulesBase.reviewsShare && typeof rulesBase.reviewsShare === "object"
          ? rulesBase.reviewsShare
          : {};
      const prevPlatforms =
        sharePlatforms?.platforms && typeof sharePlatforms.platforms === "object"
          ? sharePlatforms.platforms
          : {};
      const thresholdValue = Math.min(5, Math.max(1, parseInt(minRating, 10) || 5));
      rulesBase.reviewsShare = {
        enabled: offerExternal,
        threshold: thresholdValue,
        platforms: {
          yandex: { ...(prevPlatforms?.yandex ?? {}), enabled: platforms.yandex },
          twogis: { ...(prevPlatforms?.twogis ?? {}), enabled: platforms.gis },
          google: { ...(prevPlatforms?.google ?? {}), enabled: platforms.google },
        },
      };
      const reviewRules =
        rulesBase.reviews && typeof rulesBase.reviews === "object" ? { ...rulesBase.reviews } : {};
      reviewRules.enabled = isEnabled;
      rulesBase.reviews = reviewRules;
      await persistSettings(rulesBase);
    } catch (err: any) {
      setSettingsError(normalizeErrorMessage(err, "Не удалось сохранить настройки"));
    } finally {
      setSettingsSaving(false);
    }
  }, [isEnabled, minRating, offerExternal, persistSettings, platforms, settingsSnapshot]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        setSettingsSnapshot(data);
        applyShareSettings(data);
      } catch (err: any) {
        if (!cancelled) {
          setSettingsError(normalizeErrorMessage(err, "Не удалось загрузить настройки"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyShareSettings]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/outlets", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const outlets: SelectOption[] = [{ value: "all", label: "Все точки" }];
        const allDevices: DeviceInfo[] = [];
        if (Array.isArray(data?.items)) {
          data.items.forEach((outlet: any) => {
            if (outlet?.id) {
              outlets.push({ value: outlet.id, label: outlet.name || "Без названия" });
            }
            if (Array.isArray(outlet?.devices)) {
              const outletName = outlet?.name || "Без названия";
              const outletId = outlet?.id;
              outlet.devices.forEach((d: DeviceInfo) => {
                if (d?.code && outletId) {
                  allDevices.push({ ...d, outletId, outletName });
                }
              });
            }
          });
        }
        setOutletOptions(outlets);
        setDeviceOptions([
          { value: "all", label: "Все устройства" },
          ...allDevices.map((d) => ({ value: d.code, label: `${d.code} (${d.outletName})` })),
        ]);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((currentPage - 1) * PAGE_SIZE));
    params.set("includeStats", "1");
    if (onlyWithComments) params.set("withCommentOnly", "1");
    if (filterOutlet !== "all") params.set("outletId", filterOutlet);
    if (filterStaff !== "all") params.set("staffId", filterStaff);
    if (filterDevice !== "all") params.set("deviceId", filterDevice);

    let cancelled = false;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`/api/portal/reviews?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Не удалось загрузить отзывы");
        }
        const data = (await res.json()) as ReviewsApiResponse;
        if (cancelled) return;

        const normalizedReviews: ReviewRow[] = Array.isArray(data?.items)
          ? data.items
              .filter((item): item is ApiReviewItem => !!item && typeof item === "object")
              .map((item) => {
                const customerName =
                  (item.customer?.name && item.customer.name.trim()) ||
                  (item.customer?.phone && item.customer.phone.trim()) ||
                  (item.customer?.email && item.customer.email.trim()) ||
                  "—";
                const staffName = (item.staff?.name || "").trim();
                const deviceName = (item.deviceId || "").trim();
                const sourceType = staffName ? "staff" : "device";
                const sourceName = staffName || deviceName || "—";
                const outletName = (item.outlet?.name || "").trim() || "—";
                const comment = typeof item.comment === "string" ? item.comment.trim() : "";
                return {
                  id: item.id,
                  clientName: customerName,
                  rating: item.rating,
                  comment: comment.length > 0 ? comment : null,
                  sourceType,
                  sourceName,
                  outlet: outletName,
                  date: formatDateTime(item.createdAt),
                };
              })
          : [];

        setReviews(normalizedReviews);
        setTotalCount(typeof data?.total === "number" ? data.total : normalizedReviews.length);
        setAverageRating(
          typeof data?.stats?.averageRating === "number" && Number.isFinite(data.stats.averageRating)
            ? data.stats.averageRating
            : normalizedReviews.length
              ? normalizedReviews.reduce((acc, item) => acc + (item.rating || 0), 0) / normalizedReviews.length
              : 0,
        );

        if (Array.isArray(data?.staff)) {
          const nextStaff: SelectOption[] = [
            { value: "all", label: "Все сотрудники" },
            ...data.staff
              .filter((item): item is { id: string; name?: string | null } => !!item && typeof item === "object")
              .map((item) => ({
                value: item.id,
                label: (item.name || "").trim() || item.id,
              })),
          ];
          setStaffOptions(nextStaff);
        }
      } catch (err: any) {
        if (cancelled) return;
        setReviews([]);
        setTotalCount(0);
        setAverageRating(0);
        setError(normalizeErrorMessage(err, "Не удалось загрузить отзывы"));
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPage, filterDevice, filterOutlet, filterStaff, onlyWithComments]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterOutlet, filterStaff, filterDevice, onlyWithComments]);

  const statsAverage = totalCount > 0 ? averageRating.toFixed(1) : "0.0";

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Отзывы</h2>
        <p className="text-gray-500 mt-1">Мониторинг обратной связи от клиентов и управление репутацией.</p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className={`p-3 rounded-full ${isEnabled ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
            <Power size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Сбор отзывов</h3>
            <p className="text-sm text-gray-500">
              {isEnabled
                ? "Активно. Клиентам предлагается оценить обслуживание после покупки."
                : "Отключено. Сбор оценок и отзывов приостановлен."}
            </p>
          </div>
        </div>
        <button
          onClick={() => handleToggleReviews(!isEnabled)}
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${isEnabled ? "bg-green-500" : "bg-gray-300"}`}
          disabled={settingsSaving}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm ${isEnabled ? "translate-x-7" : "translate-x-1"}`}
          />
        </button>
      </div>

      <div className={`space-y-8 transition-opacity duration-300 ${isEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <MapPin className="text-purple-600" size={24} />
              <h3 className="text-lg font-bold text-gray-900">Сбор отзывов на картах</h3>
            </div>
            <button
              onClick={handleSaveSettings}
              className="flex items-center space-x-2 text-sm text-purple-600 font-medium hover:text-purple-800 bg-purple-50 px-3 py-1.5 rounded-lg transition-colors"
              disabled={settingsSaving}
            >
              <Save size={16} />
              <span>{settingsSaving ? "Сохранение..." : "Сохранить настройки"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <div>
                  <span className="block font-medium text-gray-900">Предлагать поделиться отзывом</span>
                  <span className="text-sm text-gray-500">Показывать предложение оставить отзыв на картах после высокой оценки.</span>
                </div>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${offerExternal ? "bg-green-500" : "bg-gray-300"}`}>
                  <input
                    type="checkbox"
                    checked={offerExternal}
                    onChange={(e) => setOfferExternal(e.target.checked)}
                    className="sr-only"
                  />
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${offerExternal ? "translate-x-6" : "translate-x-1"}`} />
                </div>
              </label>

              <div className={`transition-opacity duration-200 ${!offerExternal ? "opacity-50 pointer-events-none" : ""}`}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Минимальная оценка для предложения</label>
                <div className="flex space-x-2">
                  {["5", "4+", "3+", "2+", "1+"].map((val) => (
                    <button
                      key={val}
                      onClick={() => setMinRating(val)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        minRating === val
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
                      }`}
                    >
                      {val === "5" ? "⭐️ 5" : `⭐️ ${val}`}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Клиентам, поставившим оценку ниже выбранной, предложение оставить отзыв на картах показано не будет.
                </p>
              </div>
            </div>

            <div className={`space-y-4 transition-opacity duration-200 ${!offerExternal ? "opacity-50 pointer-events-none" : ""}`}>
              <span className="block text-sm font-medium text-gray-700">Платформы для размещения</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${platforms.yandex ? "border-red-200 bg-red-50" : "border-gray-200 hover:bg-gray-50"}`}>
                  <input
                    type="checkbox"
                    checked={platforms.yandex}
                    onChange={(e) => setPlatforms({ ...platforms, yandex: e.target.checked })}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span className="font-medium text-gray-900">Яндекс</span>
                </label>

                <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${platforms.gis ? "border-green-200 bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}>
                  <input
                    type="checkbox"
                    checked={platforms.gis}
                    onChange={(e) => setPlatforms({ ...platforms, gis: e.target.checked })}
                    className="rounded text-green-600 focus:ring-green-500"
                  />
                  <span className="font-medium text-gray-900">2ГИС</span>
                </label>

                <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${platforms.google ? "border-blue-200 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                  <input
                    type="checkbox"
                    checked={platforms.google}
                    onChange={(e) => setPlatforms({ ...platforms, google: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium text-gray-900">Google</span>
                </label>
              </div>
              <div className="flex items-center space-x-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                <ExternalLink size={14} />
                <span>Клиент сможет выбрать удобную платформу из отмеченных. Ссылки настраиваются в разделе &quot;Торговые точки&quot;.</span>
              </div>
              {settingsError && <div className="text-xs text-red-500">{settingsError}</div>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col xl:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-6 w-full xl:w-auto">
              <div className="flex items-center space-x-3">
                <div className="bg-white p-2 rounded-lg border border-gray-200 text-gray-500">
                  <Filter size={20} />
                </div>
                <div>
                  <span className="block text-xs text-gray-500 uppercase font-bold">Найдено</span>
                  <span className="text-lg font-bold text-gray-900">{totalCount}</span>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-300 hidden sm:block"></div>

              <div className="flex items-center space-x-3">
                <div className="bg-yellow-100 p-2 rounded-lg border border-yellow-200 text-yellow-600">
                  <Star size={20} className="fill-yellow-600" />
                </div>
                <div>
                  <span className="block text-xs text-gray-500 uppercase font-bold">Ср. оценка</span>
                  <span className="text-lg font-bold text-gray-900">{statsAverage}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 w-full xl:w-auto">
              <select
                value={filterOutlet}
                onChange={(e) => setFilterOutlet(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {outletOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={filterStaff}
                onChange={(e) => setFilterStaff(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {staffOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={filterDevice}
                onChange={(e) => setFilterDevice(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {deviceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={onlyWithComments}
                  onChange={(e) => setOnlyWithComments(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <div className="flex items-center space-x-1.5 text-sm text-gray-700">
                  <MessageCircle size={14} />
                  <span>Только с комментарием</span>
                </div>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 font-semibold w-48">Клиент</th>
                  <th className="px-6 py-4 font-semibold w-32">Оценка</th>
                  <th className="px-6 py-4 font-semibold min-w-[300px]">Комментарий</th>
                  <th className="px-6 py-4 font-semibold w-48">Источник</th>
                  <th className="px-6 py-4 font-semibold w-48">Точка</th>
                  <th className="px-6 py-4 font-semibold w-40 text-right">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      Загрузка...
                    </td>
                  </tr>
                ) : reviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      <MessageSquare size={48} className="mx-auto text-gray-300 mb-4" />
                      <p>{error || "Нет отзывов, соответствующих выбранным фильтрам."}</p>
                    </td>
                  </tr>
                ) : (
                  reviews.map((review) => (
                    <tr key={review.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold">
                            {toInitial(review.clientName)}
                          </div>
                          <span>{review.clientName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              size={14}
                              className={`${i < review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {review.comment ? (
                          <p className="text-gray-700 whitespace-normal break-words max-w-[400px]">
                            {review.comment}
                          </p>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Без комментария</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        <div className="flex items-center space-x-2">
                          {review.sourceType === "staff" ? (
                            <User size={14} className="text-blue-500" />
                          ) : (
                            <Monitor size={14} className="text-purple-500" />
                          )}
                          <span className="truncate max-w-[150px]" title={review.sourceName}>
                            {review.sourceName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        <div className="flex items-center space-x-2">
                          <Store size={14} className="text-gray-400" />
                          <span className="truncate max-w-[150px]" title={review.outlet}>
                            {review.outlet}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-500 text-xs whitespace-nowrap">{review.date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Показано {Math.min((currentPage - 1) * PAGE_SIZE + 1, totalCount)} - {Math.min(currentPage * PAGE_SIZE, totalCount)} из {totalCount}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-gray-900">Стр. {currentPage}</span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
