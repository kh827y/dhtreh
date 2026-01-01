"use client";

import React from "react";
import { Award, UserPlus, User, Clock, Save, Power, Layout } from "lucide-react";
import { readApiError, readErrorMessage } from "lib/portal-errors";

type RatingPeriod = "week" | "month" | "quarter" | "year" | "custom";

type StaffMotivationApiPayload = {
  enabled?: boolean;
  pointsForNewCustomer?: number;
  pointsForExistingCustomer?: number;
  leaderboardPeriod?: RatingPeriod | string;
  customDays?: number | null;
};

type SettingsState = {
  enabled: boolean;
  newClientPoints: number;
  existingClientPoints: number;
  ratingPeriod: RatingPeriod;
  customDays: number;
};

const DEFAULT_STATE: SettingsState = {
  enabled: true,
  newClientPoints: 10,
  existingClientPoints: 1,
  ratingPeriod: "month",
  customDays: 30,
};

function clampNonNegativeInt(value: unknown, fallback: number): number {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function clampPositiveInt(value: unknown, fallback: number): number {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function normalizePeriod(value: unknown): RatingPeriod {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (
    normalized === "week" ||
    normalized === "month" ||
    normalized === "quarter" ||
    normalized === "year" ||
    normalized === "custom"
  ) {
    return normalized;
  }
  return DEFAULT_STATE.ratingPeriod;
}

function normalizeSettings(payload: StaffMotivationApiPayload | null): SettingsState {
  if (!payload || typeof payload !== "object") return DEFAULT_STATE;
  const ratingPeriod = normalizePeriod(payload.leaderboardPeriod);
  return {
    enabled: Boolean(payload.enabled),
    newClientPoints: clampNonNegativeInt(
      payload.pointsForNewCustomer,
      DEFAULT_STATE.newClientPoints,
    ),
    existingClientPoints: clampNonNegativeInt(
      payload.pointsForExistingCustomer,
      DEFAULT_STATE.existingClientPoints,
    ),
    ratingPeriod,
    customDays: clampPositiveInt(payload.customDays, DEFAULT_STATE.customDays),
  };
}

export default function StaffMotivationPage() {
  const [settings, setSettings] = React.useState<SettingsState>(DEFAULT_STATE);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [success, setSuccess] = React.useState<string>("");

  const fetchSettings = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/portal/staff-motivation", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Не удалось загрузить настройки"));
      }
      const data = (await response.json().catch(() => null)) as
        | StaffMotivationApiPayload
        | null;
      setSettings(normalizeSettings(data));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      alert(readApiError(message) || "Не удалось загрузить настройки мотивации персонала");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = React.useCallback(async () => {
    if (loading || saving) return;
    setSaving(true);
    setSuccess("");
    try {
      const payload = {
        enabled: settings.enabled,
        pointsForNewCustomer: clampNonNegativeInt(
          settings.newClientPoints,
          DEFAULT_STATE.newClientPoints,
        ),
        pointsForExistingCustomer: clampNonNegativeInt(
          settings.existingClientPoints,
          DEFAULT_STATE.existingClientPoints,
        ),
        leaderboardPeriod: settings.ratingPeriod,
        customDays:
          settings.ratingPeriod === "custom"
            ? clampPositiveInt(settings.customDays, DEFAULT_STATE.customDays)
            : null,
      };

      const response = await fetch("/api/portal/staff-motivation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Не удалось сохранить настройки"));
      }

      const data = (await response.json().catch(() => null)) as
        | StaffMotivationApiPayload
        | null;
      setSettings(normalizeSettings(data || payload));
      setSuccess("Настройки мотивации персонала сохранены!");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      alert(readApiError(message) || "Не удалось сохранить настройки мотивации персонала");
    } finally {
      setSaving(false);
    }
  }, [loading, saving, settings]);

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 ">
      {success ? (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 text-sm flex items-start space-x-3">
          <div className="font-semibold">Готово</div>
          <div className="flex-1 whitespace-pre-wrap break-words">{success}</div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Мотивация персонала</h2>
          <p className="text-gray-500 mt-1">Настройка вознаграждений и рейтингов для сотрудников.</p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          aria-disabled={loading || saving}
          className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Save size={18} />
          <span>Сохранить</span>
        </button>
      </div>

      {/* Main Toggle */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className={`p-3 rounded-full ${settings.enabled ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
            <Power size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Программа мотивации</h3>
            <p className="text-sm text-gray-500">
              {settings.enabled ? "Активна. Сотрудники получают очки за действия." : "Выключена. Очки не начисляются."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (loading || saving) return;
            setSettings((prev) => ({ ...prev, enabled: !prev.enabled }));
          }}
          aria-disabled={loading || saving}
          role="switch"
          aria-checked={settings.enabled}
          aria-label="Программа мотивации"
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${settings.enabled ? "bg-green-500" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm ${settings.enabled ? "translate-x-7" : "translate-x-1"}`} />
        </button>
      </div>

      <div className={`space-y-8 transition-opacity duration-300 ${settings.enabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
        {/* Points Settings */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
            <Award className="text-purple-600" size={20} />
            <h3 className="text-lg font-bold text-gray-900">Настройки начисления очков</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* New Client */}
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-white p-2 rounded-lg text-blue-600 shadow-sm">
                  <UserPlus size={20} />
                </div>
                <span className="font-semibold text-gray-900">За нового клиента</span>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-gray-600">Количество очков</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={settings.newClientPoints}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        newClientPoints: clampNonNegativeInt(e.target.value, prev.newClientPoints),
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-purple-500 focus:outline-none pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">pts</span>
                </div>
                <p className="text-xs text-gray-500">Начисляется, когда клиент совершает первую покупку с программой лояльности.</p>
              </div>
            </div>

            {/* Existing Client */}
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-white p-2 rounded-lg text-purple-600 shadow-sm">
                  <User size={20} />
                </div>
                <span className="font-semibold text-gray-900">За существующего клиента</span>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-gray-600">Количество очков</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={settings.existingClientPoints}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        existingClientPoints: clampNonNegativeInt(e.target.value, prev.existingClientPoints),
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-purple-500 focus:outline-none pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">pts</span>
                </div>
                <p className="text-xs text-gray-500">Начисляется, если у клиента уже были покупки по программе лояльности.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Display Settings */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
            <Layout className="text-purple-600" size={20} />
            <h3 className="text-lg font-bold text-gray-900">Рейтинг в панели кассира</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <label className="block font-medium text-gray-900 mb-2">Период отображения</label>
                <p className="text-sm text-gray-500 mb-3">За какой период отображать начисленные очки сотруднику в его интерфейсе.</p>

                <div className="space-y-2">
                  {[
                    { id: "week", label: "Неделя (текущая)" },
                    { id: "month", label: "Месяц (текущий)" },
                    { id: "quarter", label: "Квартал" },
                    { id: "year", label: "Год" },
                    { id: "custom", label: "Произвольный период (дней)" },
                  ].map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg border hover:bg-gray-50 transition-colors border-gray-200 has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50"
                    >
                      <input
                        type="radio"
                        name="period"
                        value={option.id}
                        checked={settings.ratingPeriod === option.id}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            ratingPeriod: normalizePeriod(e.target.value),
                          }))
                        }
                        className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                      />
                      <span className="text-sm font-medium text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {settings.ratingPeriod === "custom" && (
                <div className="ml-7 ">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Количество дней</label>
                  <div className="relative w-32">
                    <input
                      type="number"
                      min="1"
                      value={settings.customDays}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          customDays: clampPositiveInt(e.target.value, prev.customDays),
                        }))
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none pr-8"
                    />
                    <Clock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 rounded-xl p-6 flex flex-col justify-center items-center text-center border border-gray-200 border-dashed">
              <div className="bg-white p-4 rounded-lg shadow-sm w-64 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 uppercase font-bold">Ваш рейтинг</span>
                  <Award size={16} className="text-amber-500" />
                </div>
                <div className="text-3xl font-bold text-purple-600 mb-1">1,250</div>
                <div className="text-xs text-gray-400">
                  очков за{" "}
                  {settings.ratingPeriod === "custom"
                    ? `${settings.customDays} дн.`
                    : settings.ratingPeriod === "week"
                      ? "эту неделю"
                      : settings.ratingPeriod === "month"
                        ? "этот месяц"
                        : settings.ratingPeriod === "quarter"
                          ? "этот квартал"
                          : "этот год"}
                </div>
              </div>
              <p className="text-sm text-gray-500">Пример отображения в панели кассира</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
