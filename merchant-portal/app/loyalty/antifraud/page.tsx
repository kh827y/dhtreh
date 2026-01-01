"use client";

import React from "react";
import { AlertTriangle, Lock, Bell, Info, Save } from "lucide-react";
import { readApiError, readErrorMessage } from "lib/portal-errors";

type AntifraudApiPayload = {
  dailyCap?: number;
  monthlyCap?: number;
  maxPoints?: number;
  blockDaily?: boolean;
};

const DEFAULTS = {
  dailyFrequency: 3,
  monthlyFrequency: 15,
  maxPoints: 5000,
  blockOnDailyLimit: false,
};

function coerceInt(value: unknown, fallback: number): number {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function normalizePayload(payload: AntifraudApiPayload | null) {
  if (!payload || typeof payload !== "object") {
    return {
      dailyFrequency: DEFAULTS.dailyFrequency,
      monthlyFrequency: DEFAULTS.monthlyFrequency,
      maxPoints: DEFAULTS.maxPoints,
      blockOnDailyLimit: DEFAULTS.blockOnDailyLimit,
    };
  }

  const dailyFrequency = coerceInt(payload.dailyCap, DEFAULTS.dailyFrequency);
  const monthlyFrequency = coerceInt(payload.monthlyCap, DEFAULTS.monthlyFrequency);
  const maxPoints = coerceInt(payload.maxPoints, DEFAULTS.maxPoints);
  const blockOnDailyLimit =
    payload.blockDaily === undefined
      ? DEFAULTS.blockOnDailyLimit
      : Boolean(payload.blockDaily);

  return {
    dailyFrequency,
    monthlyFrequency,
    maxPoints,
    blockOnDailyLimit,
  };
}

export default function AntifraudPage() {
  const [dailyFrequency, setDailyFrequency] = React.useState(DEFAULTS.dailyFrequency);
  const [monthlyFrequency, setMonthlyFrequency] = React.useState(DEFAULTS.monthlyFrequency);
  const [maxPoints, setMaxPoints] = React.useState(DEFAULTS.maxPoints);
  const [blockOnDailyLimit, setBlockOnDailyLimit] = React.useState(DEFAULTS.blockOnDailyLimit);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [success, setSuccess] = React.useState<string>("");

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/portal/loyalty/antifraud", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(await readErrorMessage(res, "Не удалось загрузить настройки антифрода"));
        }
        const data = (await res.json().catch(() => null)) as AntifraudApiPayload | null;
        if (cancelled) return;
        const normalized = normalizePayload(data);
        setDailyFrequency(normalized.dailyFrequency);
        setMonthlyFrequency(normalized.monthlyFrequency);
        setMaxPoints(normalized.maxPoints);
        setBlockOnDailyLimit(normalized.blockOnDailyLimit);
      } catch (e: any) {
        if (cancelled) return;
        alert(readApiError(String(e?.message || e || "")) || "Не удалось загрузить настройки антифрода");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = React.useCallback(async () => {
    if (saving) return;

    const daily = coerceInt(dailyFrequency, DEFAULTS.dailyFrequency);
    const monthly = coerceInt(monthlyFrequency, DEFAULTS.monthlyFrequency);
    const points = coerceInt(maxPoints, DEFAULTS.maxPoints);

    if (daily < 1 || monthly < 1 || points < 1) {
      alert("Укажите значения не меньше 1");
      return;
    }

    setSaving(true);
    setSuccess("");
    try {
      const payload = {
        dailyCap: daily,
        monthlyCap: monthly,
        maxPoints: points,
        blockDaily: blockOnDailyLimit,
      };
      const res = await fetch("/api/portal/loyalty/antifraud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Не удалось сохранить настройки антифрода"));
      }
      const data = (await res.json().catch(() => null)) as AntifraudApiPayload | null;
      const normalized = normalizePayload(data || payload);
      setDailyFrequency(normalized.dailyFrequency);
      setMonthlyFrequency(normalized.monthlyFrequency);
      setMaxPoints(normalized.maxPoints);
      setBlockOnDailyLimit(normalized.blockOnDailyLimit);
      setSuccess("Настройки безопасности обновлены");
    } catch (e: any) {
      alert(readApiError(String(e?.message || e || "")) || "Не удалось сохранить настройки антифрода");
    } finally {
      setSaving(false);
    }
  }, [saving, dailyFrequency, monthlyFrequency, maxPoints, blockOnDailyLimit]);

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
          <h2 className="text-2xl font-bold text-gray-900">Защита от мошенничества</h2>
          <p className="text-gray-500 mt-1">
            Настройка порогов уведомлений и автоматических блокировок подозрительных операций.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          aria-busy={saving}
          className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Save size={18} />
          <span>Сохранить</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Notification Settings */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
            <Bell className="text-amber-500" size={20} />
            <h3 className="text-lg font-bold text-gray-900">Пороги уведомлений</h3>
          </div>

          <div className="space-y-6">
            <div className="bg-amber-50 p-3 rounded-lg flex items-start space-x-2 text-sm text-amber-800">
              <Info size={16} className="mt-0.5 flex-shrink-0" />
              <p>
                События, превышающие эти лимиты, отправят уведомление администратору, но{" "}
                <strong>не будут заблокированы</strong> автоматически (кроме дневного лимита при включенной блокировке).
              </p>
            </div>

            {/* Daily Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Частота начислений за день</label>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500">Более</span>
                <input
                  type="number"
                  min="1"
                  value={dailyFrequency}
                  onChange={(e) => {
                    if (loading) return;
                    setDailyFrequency(Number(e.target.value));
                  }}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-center font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
                <span className="text-sm text-gray-500">раз одному клиенту</span>
              </div>
            </div>

            {/* Monthly Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Частота начислений за месяц</label>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500">Более</span>
                <input
                  type="number"
                  min="1"
                  value={monthlyFrequency}
                  onChange={(e) => {
                    if (loading) return;
                    setMonthlyFrequency(Number(e.target.value));
                  }}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-center font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
                <span className="text-sm text-gray-500">раз одному клиенту</span>
              </div>
            </div>

            {/* Max Points Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Максимальное разовое начисление</label>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500">Более</span>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={maxPoints}
                    onChange={(e) => {
                      if (loading) return;
                      setMaxPoints(Number(e.target.value));
                    }}
                    className="w-32 border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-center font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">pts</span>
                </div>
                <span className="text-sm text-gray-500">за одну операцию</span>
              </div>
            </div>
          </div>
        </div>

        {/* Blocking Settings */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
            <Lock className="text-red-500" size={20} />
            <h3 className="text-lg font-bold text-gray-900">Активная защита</h3>
          </div>

          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div className="mr-4">
                <h4 className="font-medium text-gray-900">Блокировка дневного лимита</h4>
                <p className="text-sm text-gray-500 mt-1">
                  Если клиент превысит установленный порог ({dailyFrequency} начислений в день), последующие операции начисления будут
                  автоматически заблокированы до конца суток.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBlockOnDailyLimit((prev) => !prev)}
                role="switch"
                aria-checked={blockOnDailyLimit}
                aria-label="Блокировка дневного лимита"
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${blockOnDailyLimit ? "bg-red-500" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${blockOnDailyLimit ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {blockOnDailyLimit && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-100 flex items-start space-x-3 ">
                <AlertTriangle className="text-red-600 mt-0.5 flex-shrink-0" size={18} />
                <div className="text-sm text-red-800">
                  <p className="font-bold mb-1">Режим строгой блокировки включен</p>
                  <p>
                    Кассир увидит ошибку &quot;Превышен лимит операций&quot; при попытке начислить баллы сверх нормы.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
