"use client";

import React from "react";
import { HelpCircle, Settings2, Sliders, X } from "lucide-react";
import {
  buildRfmCombinations,
  getCombinationBadgeClass,
  sumCombinations,
} from "./utils";
import { normalizeErrorMessage } from "lib/portal-errors";

type RfmRange = { min: number | null; max: number | null; count: number };
type RfmGroup = {
  score: number;
  recency: RfmRange;
  frequency: RfmRange;
  monetary: RfmRange;
};
type RfmDistributionRow = { class: string; customers: number };
type RfmSettingsState = {
  recencyMode: "auto" | "manual";
  recencyDays: number | null;
  frequencyMode: "auto" | "manual";
  frequencyThreshold: number | null;
  frequencySuggested: number | null;
  moneyMode: "auto" | "manual";
  moneyThreshold: number | null;
  moneySuggested: number | null;
};
type RfmAnalyticsResponse = {
  settings: RfmSettingsState;
  groups: RfmGroup[];
  distribution: RfmDistributionRow[];
  totals: { customers: number };
};

const defaultSettings: RfmSettingsState = {
  recencyMode: "auto",
  recencyDays: 90,
  frequencyMode: "auto",
  frequencyThreshold: 10,
  frequencySuggested: null,
  moneyMode: "auto",
  moneyThreshold: 50000,
  moneySuggested: null,
};

const currencyFormatter = new Intl.NumberFormat("ru-RU");

async function fetchAnalytics(): Promise<RfmAnalyticsResponse> {
  const res = await fetch("/api/portal/analytics/rfm", { cache: "no-store" });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || res.statusText);
  }
  return res.json() as Promise<RfmAnalyticsResponse>;
}

async function updateSettings(payload: {
  recencyMode: "auto" | "manual";
  recencyDays?: number;
  frequencyMode: "auto" | "manual";
  frequencyThreshold?: number;
  moneyMode: "auto" | "manual";
  moneyThreshold?: number;
}): Promise<RfmAnalyticsResponse> {
  const res = await fetch("/api/portal/analytics/rfm/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || res.statusText);
  }
  return res.json() as Promise<RfmAnalyticsResponse>;
}

export default function AnalyticsRfmPage() {
  const [analytics, setAnalytics] = React.useState<RfmAnalyticsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [showInfo, setShowInfo] = React.useState(true);
  const [saveNotice, setSaveNotice] = React.useState("");

  const [settings, setSettings] = React.useState<RfmSettingsState>(defaultSettings);
  const [draft, setDraft] = React.useState<RfmSettingsState>(defaultSettings);

  const normalizeSettings = React.useCallback((incoming: RfmSettingsState) => {
    return {
      ...incoming,
      recencyDays: incoming.recencyDays ?? defaultSettings.recencyDays,
      frequencyThreshold:
        incoming.frequencyThreshold ??
        incoming.frequencySuggested ??
        defaultSettings.frequencyThreshold,
      moneyThreshold:
        incoming.moneyThreshold ??
        incoming.moneySuggested ??
        defaultSettings.moneyThreshold,
    };
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    setSaveNotice("");
    try {
      const data = await fetchAnalytics();
      const normalizedSettings = normalizeSettings(data.settings);
      setAnalytics({ ...data, settings: normalizedSettings });
      setSettings(normalizedSettings);
      setDraft(normalizedSettings);
    } catch (error) {
      console.error("Не удалось загрузить RFM-аналитику", error);
      setAnalytics(null);
      setError(
        String((error as any)?.message || "Не удалось загрузить RFM-аналитику"),
      );
    } finally {
      setLoading(false);
    }
  }, [normalizeSettings]);

  React.useEffect(() => {
    load();
  }, [load]);

  const groups = analytics?.groups ?? [];
  const distribution = analytics?.distribution ?? [];
  const combinations = React.useMemo(
    () => buildRfmCombinations(distribution),
    [distribution],
  );
  const totalClients = React.useMemo(
    () => sumCombinations(combinations),
    [combinations],
  );

  const getAggregatedCounts = React.useCallback(
    (type: "r" | "f" | "m", score: number) => {
      return combinations
        .filter((c) => c[type] === score)
        .reduce((sum, curr) => sum + curr.count, 0);
    },
    [combinations],
  );

  const getRangeLabel = React.useCallback(
    (type: "r" | "f" | "m", score: number) => {
      const group = groups.find((g) => g.score === score);
      if (!group) return "—";

      if (type === "r") {
        const min = group.recency.min;
        const max = group.recency.max;
        if (min == null && max == null) return "—";
        if (min != null && max != null) {
          if (min === max) return `${Math.round(min)} дн.`;
          return `${Math.round(min)} - ${Math.round(max)} дн.`;
        }
        if (min != null) return `≥ ${Math.round(min)} дн.`;
        return `≤ ${Math.round(max as number)} дн.`;
      }

      if (type === "f") {
        const min = group.frequency.min;
        const max = group.frequency.max;
        if (min == null && max == null) return "—";
        if (min != null && max != null) {
          if (min === max) return `${Math.round(min)} зак.`;
          return `${Math.round(min)} - ${Math.round(max)} зак.`;
        }
        if (min != null) return `≥ ${Math.round(min)} зак.`;
        return `≤ ${Math.round(max as number)} зак.`;
      }

      const min = group.monetary.min;
      const max = group.monetary.max;
      if (min == null && max == null) return "—";
      if (min != null && max != null) {
        if (min === max) return `${currencyFormatter.format(Math.round(min))} ₽`;
        return `${currencyFormatter.format(Math.round(min))} - ${currencyFormatter.format(Math.round(max))} ₽`;
      }
      if (min != null) return `≥ ${currencyFormatter.format(Math.round(min))} ₽`;
      return `≤ ${currencyFormatter.format(Math.round(max as number))} ₽`;
    },
    [groups],
  );

  const dirty = React.useMemo(() => {
    return (
      draft.recencyMode !== settings.recencyMode ||
      draft.recencyDays !== settings.recencyDays ||
      draft.frequencyMode !== settings.frequencyMode ||
      (draft.frequencyMode === "manual" && draft.frequencyThreshold !== settings.frequencyThreshold) ||
      draft.moneyMode !== settings.moneyMode ||
      (draft.moneyMode === "manual" && draft.moneyThreshold !== settings.moneyThreshold)
    );
  }, [draft, settings]);

  const applySettings = React.useCallback(async () => {
    setSaveNotice("");
    if (draft.recencyMode === "manual") {
      if (draft.recencyDays == null || draft.recencyDays < 1) {
        return;
      }
    }
    if (draft.frequencyMode === "manual") {
      if (!draft.frequencyThreshold || draft.frequencyThreshold < 1) {
        return;
      }
    }
    if (draft.moneyMode === "manual") {
      if (draft.moneyThreshold == null || draft.moneyThreshold < 0) {
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        recencyMode: draft.recencyMode,
        ...(draft.recencyMode === "manual"
          ? { recencyDays: Math.max(1, Math.round(draft.recencyDays ?? 1)) }
          : {}),
        frequencyMode: draft.frequencyMode,
        ...(draft.frequencyMode === "manual"
          ? { frequencyThreshold: Math.max(1, Math.round(draft.frequencyThreshold ?? 1)) }
          : {}),
        moneyMode: draft.moneyMode,
        ...(draft.moneyMode === "manual"
          ? { moneyThreshold: Math.max(0, Math.round(draft.moneyThreshold ?? 0)) }
          : {}),
      } as const;
      const data = await updateSettings(payload);
      const normalizedSettings = normalizeSettings(data.settings);
      setAnalytics({ ...data, settings: normalizedSettings });
      setSettings(normalizedSettings);
      setDraft(normalizedSettings);
      setSaveNotice("Сегменты обновятся автоматически раз в сутки (обычно ночью).");
    } catch (error) {
      console.error("Не удалось сохранить настройки RFM", error);
      setError(normalizeErrorMessage(error, "Не удалось сохранить настройки"));
    } finally {
      setSaving(false);
    }
  }, [draft, normalizeSettings]);

  React.useEffect(() => {
    if (loading) return;
    if (saving) return;
    if (!dirty) return;
    const isManual =
      draft.recencyMode === "manual" ||
      draft.frequencyMode === "manual" ||
      draft.moneyMode === "manual";
    if (!isManual) return;

    const timeout = window.setTimeout(() => {
      void applySettings();
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [applySettings, dirty, draft, loading, saving]);

  const mode =
    draft.recencyMode === "manual" ||
    draft.frequencyMode === "manual" ||
    draft.moneyMode === "manual"
      ? "Manual"
      : "Auto";

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 ">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">RFM Анализ</h2>
        <p className="text-gray-500">
          Сегментация клиентов на основе покупательского поведения.
        </p>
      </div>

      {showInfo && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 relative">
          <button
            onClick={() => setShowInfo(false)}
            className="absolute top-4 right-4 text-blue-400 hover:text-blue-600"
          >
            <X size={18} />
          </button>
          <div className="flex items-start space-x-4">
            <div className="bg-blue-100 p-2 rounded-lg">
              <HelpCircle className="text-blue-600" size={24} />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-blue-900 text-lg">Что такое RFM?</h3>
              <p className="text-blue-800 text-sm max-w-4xl leading-relaxed">
                RFM — это маркетинговый метод, используемый для количественной
                оценки и группировки клиентов на основе давности (Recency),
                частоты (Frequency) и денежной суммы (Monetary) их транзакций для
                выявления лучших клиентов и проведения целевых кампаний.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <div className="bg-white/60 p-3 rounded-lg">
                  <span className="font-bold text-blue-900 block mb-1">
                    Давность (R)
                  </span>
                  <span className="text-xs text-blue-700">
                    Как давно клиент совершал покупку. Балл 5 = Недавно.
                  </span>
                </div>
                <div className="bg-white/60 p-3 rounded-lg">
                  <span className="font-bold text-blue-900 block mb-1">
                    Частота (F)
                  </span>
                  <span className="text-xs text-blue-700">
                    Как часто клиент совершает покупки. Балл 5 = Часто.
                  </span>
                </div>
                <div className="bg-white/60 p-3 rounded-lg">
                  <span className="font-bold text-blue-900 block mb-1">
                    Деньги (M)
                  </span>
                  <span className="text-xs text-blue-700">
                    Сколько денег тратит клиент. Балл 5 = Много.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {saveNotice && !error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          {saveNotice}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Settings2 size={18} className="text-gray-500" />
            <h3 className="font-semibold text-gray-900">Конфигурация</h3>
          </div>

          <div className="flex bg-gray-200 rounded-lg p-1">
            <button
              onClick={() => {
                setSaving(true);
                setError("");
                setSaveNotice("");
                setDraft((prev) => ({
                  ...prev,
                  recencyMode: "auto",
                  frequencyMode: "auto",
                  moneyMode: "auto",
                }));
                void updateSettings({
                  recencyMode: "auto",
                  frequencyMode: "auto",
                  moneyMode: "auto",
                })
                  .then((data) => {
                    const normalizedSettings = normalizeSettings(data.settings);
                    setAnalytics({ ...data, settings: normalizedSettings });
                    setSettings(normalizedSettings);
                    setDraft(normalizedSettings);
                    setSaveNotice("Сегменты обновятся автоматически раз в сутки (обычно ночью).");
                  })
                  .catch((err: any) => {
                    console.error("Не удалось сохранить настройки RFM", err);
                    setError(
                      String(
                        err?.message ||
                          "Не удалось сохранить настройки RFM",
                      ),
                    );
                  })
                  .finally(() => setSaving(false));
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                mode === "Auto"
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500"
              }`}
              disabled={loading || saving}
            >
              Авто
            </button>
            <button
              onClick={() => {
                setSaving(true);
                setError("");
                setSaveNotice("");
                setDraft((prev) => {
                  const recencyDays =
                    prev.recencyDays ?? settings.recencyDays ?? 90;
                  const frequencyThreshold =
                    prev.frequencyThreshold ??
                    settings.frequencyThreshold ??
                    settings.frequencySuggested ??
                    10;
                  const moneyThreshold =
                    prev.moneyThreshold ??
                    settings.moneyThreshold ??
                    settings.moneySuggested ??
                    50000;

                  return {
                    ...prev,
                    recencyMode: "manual",
                    frequencyMode: "manual",
                    moneyMode: "manual",
                    recencyDays,
                    frequencyThreshold,
                    moneyThreshold,
                  };
                });

                const recencyDays =
                  (draft.recencyDays ?? settings.recencyDays ?? 90) || 90;
                const frequencyThreshold =
                  (draft.frequencyThreshold ??
                    settings.frequencyThreshold ??
                    settings.frequencySuggested ??
                    10) || 10;
                const moneyThreshold =
                  (draft.moneyThreshold ??
                    settings.moneyThreshold ??
                    settings.moneySuggested ??
                    50000) || 50000;

                void updateSettings({
                  recencyMode: "manual",
                  recencyDays: Math.max(1, Math.round(recencyDays)),
                  frequencyMode: "manual",
                  frequencyThreshold: Math.max(
                    1,
                    Math.round(frequencyThreshold),
                  ),
                  moneyMode: "manual",
                  moneyThreshold: Math.max(0, Math.round(moneyThreshold)),
                })
                  .then((data) => {
                    const normalizedSettings = normalizeSettings(data.settings);
                    setAnalytics({ ...data, settings: normalizedSettings });
                    setSettings(normalizedSettings);
                    setDraft(normalizedSettings);
                    setSaveNotice("Сегменты обновятся автоматически раз в сутки (обычно ночью).");
                  })
                  .catch((err: any) => {
                    console.error("Не удалось сохранить настройки RFM", err);
                    setError(
                      String(
                        err?.message ||
                          "Не удалось сохранить настройки RFM",
                      ),
                    );
                  })
                  .finally(() => setSaving(false));
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                mode === "Manual"
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500"
              }`}
              disabled={loading || saving}
            >
              Вручную
            </button>
          </div>
        </div>

        <div
          className={`p-6 grid grid-cols-1 md:grid-cols-3 gap-8 transition-opacity duration-300 ${
            mode === "Auto"
              ? "opacity-50 pointer-events-none grayscale"
              : "opacity-100"
          }`}
        >
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700 flex justify-between">
              <span>Граница давности (R)</span>
              <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">
                Риск оттока
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={draft.recencyDays ?? ""}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    recencyDays: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                дней
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Клиенты, не покупавшие дольше этого срока, получают R=1.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700 flex justify-between">
              <span>Граница частоты (F)</span>
              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                Лояльный
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={draft.frequencyThreshold ?? ""}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    frequencyThreshold: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                заказов
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Клиенты с большим количеством заказов получают F=5.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700 flex justify-between">
              <span>Граница денег (M)</span>
              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                Лояльный
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={draft.moneyThreshold ?? ""}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    moneyThreshold: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                ₽
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Клиенты с тратами больше этой суммы получают M=5.
            </p>
          </div>
        </div>

        {mode === "Auto" && (
          <div className="px-6 pb-4 -mt-2">
            <p className="text-xs text-purple-600 font-medium flex items-center">
              <Sliders size={12} className="mr-1" />
              Используется автоматическая оптимизация границ на основе
              исторических данных.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-6">
            Распределение RFM групп
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Балл</th>
                  <th className="px-4 py-3">
                    <div className="font-bold text-gray-700">Давность (R)</div>
                    <div className="font-normal text-gray-400 capitalize">
                      Дней с посл. покупки
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div className="font-bold text-gray-700">Частота (F)</div>
                    <div className="font-normal text-gray-400 capitalize">
                      Всего транзакций
                    </div>
                  </th>
                  <th className="px-4 py-3 rounded-tr-lg">
                    <div className="font-bold text-gray-700">Деньги (M)</div>
                    <div className="font-normal text-gray-400 capitalize">
                      Сумма покупок
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[5, 4, 3, 2, 1].map((score) => (
                  <tr key={score} className="hover:bg-gray-50/50">
                    <td className="px-4 py-4 font-bold text-lg text-gray-900 w-16 text-center bg-gray-50/30">
                      {score}
                    </td>
                    {(["r", "f", "m"] as const).map((metric) => (
                      <td key={metric} className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="text-gray-900 font-medium">
                            {loading ? "—" : getRangeLabel(metric, score)}
                          </span>
                          <div className="flex items-center mt-1 space-x-2">
                            <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                              {loading
                                ? "—"
                                : `${getAggregatedCounts(metric, score)} клиентов`}
                            </span>
                          </div>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col h-[600px]">
          <h3 className="font-bold text-gray-900 mb-2">Детальные комбинации</h3>
          <p className="text-xs text-gray-500 mb-4">Сегменты по R-F-M баллам.</p>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white shadow-sm z-10">
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 text-left pl-2">Комбинация</th>
                  <th className="pb-2 text-right pr-2">Клиенты</th>
                  <th className="pb-2 text-right pr-2">Доля</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {combinations.map((combo) => {
                  const share =
                    totalClients > 0
                      ? ((combo.count / totalClients) * 100).toFixed(1)
                      : "0.0";
                  const badgeColor = getCombinationBadgeClass(combo);

                  return (
                    <tr
                      key={`${combo.r}-${combo.f}-${combo.m}`}
                      className="group hover:bg-gray-50"
                    >
                      <td className="py-2.5 pl-2">
                        <span
                          className={`font-mono font-bold px-2 py-1 rounded text-xs ${badgeColor}`}
                        >
                          {combo.r}-{combo.f}-{combo.m}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-medium text-gray-900 pr-2">
                        {combo.count}
                      </td>
                      <td className="py-2.5 text-right text-gray-500 text-xs pr-2">
                        {share}%
                      </td>
                    </tr>
                  );
                })}

                {!loading && combinations.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-6 text-center text-sm text-gray-500"
                    >
                      Нет данных для отображения.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
