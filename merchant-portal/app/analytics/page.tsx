"use client";

import React from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Check,
  Clock,
  Coins,
  CreditCard,
  TrendingDown,
  TrendingUp,
  UserPlus,
  ShoppingBag,
} from "lucide-react";
import {
  DashboardResponse,
  buildChartPoints,
  calcDelta,
  formatCurrency,
  formatDecimal,
  formatNumber,
  formatPeriodLabel,
  hasTimelineData,
} from "./summary-utils";
import { normalizeErrorMessage } from "lib/portal-errors";

type TimeFilter = "yesterday" | "week" | "month" | "quarter" | "year" | "custom";

const quickRanges: Array<{ value: TimeFilter; label: string }> = [
  { label: "Вчера", value: "yesterday" },
  { label: "Неделя", value: "week" },
  { label: "Месяц", value: "month" },
  { label: "Квартал", value: "quarter" },
  { label: "Год", value: "year" },
];

const kpiColors: Record<string, string> = {
  purple: "bg-purple-50 text-purple-600",
  emerald: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  orange: "bg-orange-50 text-orange-600",
};

export default function AnalyticsDashboardPage() {
  const [range, setRange] = React.useState<TimeFilter>("month");
  const [customRange, setCustomRange] = React.useState<{ from: string; to: string }>({ from: "", to: "" });
  const [appliedCustom, setAppliedCustom] = React.useState<{ from: string; to: string } | null>(null);
  const [chartMetric, setChartMetric] = React.useState<"revenue" | "registrations">("revenue");
  const [data, setData] = React.useState<DashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const activeFilter: TimeFilter = appliedCustom ? "custom" : range;

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      if (range === "custom" && !appliedCustom) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (appliedCustom) {
          params.set("from", appliedCustom.from);
          params.set("to", appliedCustom.to);
        } else {
          params.set("period", range);
        }
        const qs = params.toString();
        const res = await fetch(`/api/portal/analytics/dashboard${qs ? `?${qs}` : ""}`, {
          cache: "no-store",
          signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.message || "Не удалось загрузить отчёт");
        }
        setData(json as DashboardResponse);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(normalizeErrorMessage(err, "Не удалось загрузить отчёт"));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [appliedCustom, range],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const canApplyCustom =
    Boolean(customRange.from) &&
    Boolean(customRange.to) &&
    !Number.isNaN(new Date(customRange.from).getTime()) &&
    !Number.isNaN(new Date(customRange.to).getTime()) &&
    new Date(customRange.from).getTime() <= new Date(customRange.to).getTime();

  const applyCustomRange = React.useCallback(() => {
    if (!canApplyCustom) return;
    setAppliedCustom({ ...customRange });
  }, [canApplyCustom, customRange]);

  const kpis = React.useMemo(() => {
    if (!data) return [];
    const metrics = data.metrics;
    const prev = data.previousMetrics;
    return [
      {
        id: "revenue",
        label: "Выручка",
        value: formatCurrency(metrics.salesAmount),
        delta: calcDelta(metrics.salesAmount, prev.salesAmount),
        icon: <CreditCard size={20} />,
        color: "purple",
      },
      {
        id: "registrations",
        label: "Регистрации",
        value: `+${formatNumber(metrics.newCustomers)}`,
        delta: calcDelta(metrics.newCustomers, prev.newCustomers),
        icon: <UserPlus size={20} />,
        color: "emerald",
      },
      {
        id: "avg_check",
        label: "Средний чек",
        value: formatCurrency(metrics.averageCheck),
        delta: calcDelta(metrics.averageCheck, prev.averageCheck),
        icon: <TrendingUp size={20} />,
        color: "blue",
      },
      {
        id: "points",
        label: "Списано баллов",
        value: formatNumber(metrics.pointsBurned),
        delta: calcDelta(metrics.pointsBurned, prev.pointsBurned),
        icon: <Coins size={20} />,
        color: "orange",
      },
    ];
  }, [data]);

  const chartPoints = React.useMemo(() => (data ? buildChartPoints(data.timeline) : []), [data]);
  const periodLabel = React.useMemo(
    () => (formatPeriodLabel(data?.period) || "").replace(/\.*$/, ""),
    [data?.period],
  );
  const timelineHasData = data ? hasTimelineData(data.timeline) : false;
  const totalChecks = data ? Math.max(0, data.composition.newChecks + data.composition.repeatChecks) : 0;

  const formatDeltaText = (value: number | null) => {
    const rounded = Math.round((value ?? 0) * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded}%`;
  };

  const formatSignedDecimal = (value: number, suffix = "") => {
    const rounded = Math.round((value ?? 0) * 10) / 10;
    const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
    const abs = Math.abs(rounded);
    return `${sign}${formatDecimal(abs)}${suffix}`;
  };

  const retentionRate = data?.retention?.retentionRate ?? 0;
  const churnRate = data?.retention?.churnRate ?? Math.max(0, 100 - retentionRate);
  const retentionWidth = Math.min(100, Math.max(0, retentionRate));
  const churnWidth = Math.min(100 - retentionWidth, Math.max(0, churnRate));
  const averagePurchasesValue = data?.metrics.averagePurchasesPerCustomer ?? 0;
  const avgPurchasesWidth = Math.min(100, Math.max(0, averagePurchasesValue * 20));
  const visitDiff =
    (data?.metrics.visitFrequencyDays ?? 0) - (data?.previousMetrics.visitFrequencyDays ?? 0);
  const purchasesDiff =
    (data?.metrics.averagePurchasesPerCustomer ?? 0) -
    (data?.previousMetrics.averagePurchasesPerCustomer ?? 0);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center space-y-4 xl:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Сводный отчет</h2>
          <p className="text-gray-500 mt-1">
            Ключевые показатели эффективности за{" "}
            <span className="font-medium text-gray-900">
              {periodLabel || "выбранный период"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white p-1 rounded-xl border border-gray-200 flex flex-wrap shadow-sm">
            {quickRanges.map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  setRange(item.value);
                  setAppliedCustom(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeFilter === item.value
                    ? "bg-gray-900 text-white shadow-md"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </button>
            ))}

            <button
              onClick={() => setRange("custom")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeFilter === "custom"
                  ? "bg-gray-900 text-white shadow-md"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              Произвольный
            </button>
          </div>

          {activeFilter === "custom" && (
            <div className="flex items-center space-x-2 bg-white p-1.5 rounded-xl border border-purple-200 shadow-sm  ring-2 ring-purple-50">
              <div className="flex items-center px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs text-gray-400 mr-2">От</span>
                <input
                  type="date"
                  value={customRange.from}
                  onChange={(e) =>
                    setCustomRange((prev) => ({
                      ...prev,
                      from: e.target.value,
                      to: prev.to && prev.to < e.target.value ? e.target.value : prev.to,
                    }))
                  }
                  className="bg-transparent text-sm font-medium text-gray-900 focus:outline-none w-32"
                />
              </div>
              <div className="flex items-center px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs text-gray-400 mr-2">До</span>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={(e) =>
                    setCustomRange((prev) => ({
                      ...prev,
                      to: e.target.value,
                    }))
                  }
                  className="bg-transparent text-sm font-medium text-gray-900 focus:outline-none w-32"
                />
              </div>
              <button
                onClick={applyCustomRange}
                disabled={!canApplyCustom || loading}
                className={`p-2 rounded-lg transition-colors shadow-sm ${
                  canApplyCustom ? "bg-purple-600 text-white hover:bg-purple-700" : "bg-gray-200 text-gray-400"
                }`}
                title="Применить период"
              >
                <Check size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2.5 rounded-xl ${kpiColors[kpi.color] || "bg-gray-50 text-gray-600"}`}>
                {kpi.icon}
              </div>
              <div
                className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${
                  kpi.delta.direction === "up"
                    ? "bg-green-50 text-green-700"
                    : kpi.delta.direction === "down"
                      ? "bg-red-50 text-red-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {kpi.delta.direction === "up" ? (
                  <TrendingUp size={12} className="mr-1" />
                ) : kpi.delta.direction === "down" ? (
                  <TrendingDown size={12} className="mr-1" />
                ) : null}
                {formatDeltaText(kpi.delta.value)}
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">{kpi.label}</span>
              <div className="flex items-baseline mt-1">
                <h3 className="text-2xl font-bold text-gray-900">{loading ? "…" : kpi.value}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {chartMetric === "revenue" ? "Динамика выручки" : "Динамика регистраций"}
              </h3>
              <p className="text-xs text-gray-500 mt-1">Сравнение с предыдущим периодом</p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="bg-gray-100 p-1 rounded-lg flex text-xs font-medium">
                <button
                  onClick={() => setChartMetric("revenue")}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    chartMetric === "revenue"
                      ? "bg-white text-purple-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Выручка
                </button>
                <button
                  onClick={() => setChartMetric("registrations")}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    chartMetric === "registrations"
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Регистрации
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs font-medium mb-4">
            <div className="flex items-center text-gray-700">
              <span
                className={`w-2.5 h-2.5 rounded-sm mr-2 ${
                  chartMetric === "revenue" ? "bg-purple-600" : "bg-emerald-500"
                }`}
              ></span>
              Текущий период
            </div>
            <div className="flex items-center text-gray-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 mr-2 border border-gray-300"></span>
              Прошлый период
            </div>
          </div>

          <div className="flex-1 min-h-[300px]">
            {loading ? (
              <div className="h-[320px] w-full rounded-xl bg-gray-50 border border-gray-100 animate-pulse" />
            ) : timelineHasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartPoints} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#9CA3AF", fontSize: 12 }}
                    dy={10}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#9CA3AF", fontSize: 12 }}
                    tickFormatter={(value) => {
                      if (chartMetric !== "revenue") return value;
                      const numeric = Number(value);
                      if (!Number.isFinite(numeric)) return value;
                      if (Math.abs(numeric) < 1000) return formatNumber(numeric);
                      return `${formatDecimal(numeric / 1000)}k`;
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "registrations") return [`${value} чел.`, "Регистрации"];
                      if (name === "prevRegistrations") return [`${value} чел.`, "Прошлые регистрации"];
                      if (name === "revenue") return [`${value.toLocaleString()} ₽`, "Выручка"];
                      if (name === "prevRevenue") return [`${value.toLocaleString()} ₽`, "Прошлая выручка"];
                      return [value, name];
                    }}
                  />

                  {chartMetric === "revenue" && (
                    <>
                      <Area
                        type="monotone"
                        dataKey="prevRevenue"
                        stroke="#E5E7EB"
                        strokeWidth={2}
                        fill="transparent"
                        strokeDasharray="5 5"
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#8B5CF6"
                        strokeWidth={3}
                        fill="url(#colorRevenue)"
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </>
                  )}

                  {chartMetric === "registrations" && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="prevRegistrations"
                        stroke="#E5E7EB"
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="5 5"
                        isAnimationActive={false}
                      />
                      <Bar dataKey="registrations" fill="#34D399" barSize={20} radius={[4, 4, 0, 0]} />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl">
                Данные отсутствуют за выбранный период
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Структура продаж</h3>
          <p className="text-xs text-gray-500 mb-6">Доля покупок по типу клиента</p>

          <div className="flex-1 flex flex-col justify-center items-center">
            <div className="h-[220px] w-full relative">
              {loading ? (
                <div className="h-full w-full rounded-xl bg-gray-50 border border-gray-100 animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Повторные", value: data?.composition.repeatChecks ?? 0, color: "#8B5CF6" },
                        { name: "Новые", value: data?.composition.newChecks ?? 0, color: "#34D399" },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill="#8B5CF6" />
                      <Cell fill="#34D399" />
                    </Pie>
                    <Tooltip
                      cursor={{ fill: "transparent" }}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}

              {!loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-gray-900">{formatNumber(totalChecks)}</span>
                  <span className="text-xs text-gray-500">чеков</span>
                </div>
              )}
            </div>

            <div className="w-full mt-6 space-y-3">
              {[
                { name: "Повторные", value: data?.composition.repeatChecks ?? 0, color: "#8B5CF6" },
                { name: "Новые", value: data?.composition.newChecks ?? 0, color: "#34D399" },
              ].map((item) => {
                const percent = totalChecks > 0 ? Math.round((item.value / totalChecks) * 100) : 0;
                return (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></div>
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                    <div className="font-semibold text-gray-900">
                      {percent}%
                      <span className="text-gray-400 font-normal ml-1">({formatNumber(item.value)})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-[160px]">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Покупок на клиента</h3>
              <div className="mt-2 flex items-baseline space-x-2">
                <span className="text-3xl font-bold text-gray-900">
                  {data ? formatDecimal(data.metrics.averagePurchasesPerCustomer) : "—"}
                </span>
                <span
                  className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                    purchasesDiff > 0
                      ? "bg-green-50 text-green-600"
                      : purchasesDiff < 0
                        ? "bg-red-50 text-red-600"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {formatSignedDecimal(purchasesDiff)}
                </span>
              </div>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <ShoppingBag size={24} />
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-4">
            <div
              className="bg-indigo-500 h-1.5 rounded-full"
              style={{ width: `${avgPurchasesWidth}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Среднее количество чеков на одного уникального клиента за период.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-[160px]">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Частота визитов</h3>
              <div className="mt-2 flex items-baseline space-x-2">
                <span className="text-3xl font-bold text-gray-900">
                  {data && data.metrics.visitFrequencyDays != null
                    ? formatDecimal(data.metrics.visitFrequencyDays)
                    : "—"}
                </span>
                <span className="text-sm font-medium text-gray-400">дней</span>
              </div>
            </div>
            <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
              <Clock size={24} />
            </div>
          </div>
          <div className="flex items-center space-x-2 mt-2">
            <span
              className={`text-xs font-medium flex items-center ${
                visitDiff < 0
                  ? "text-green-600"
                  : visitDiff > 0
                    ? "text-amber-600"
                    : "text-gray-500"
              }`}
            >
              {visitDiff < 0 ? (
                <TrendingDown size={12} className="mr-1" />
              ) : visitDiff > 0 ? (
                <TrendingUp size={12} className="mr-1" />
              ) : null}
              {formatSignedDecimal(visitDiff, " дня")}
            </span>
            <span className="text-xs text-gray-400">к прошлому периоду</span>
          </div>
          <p className="text-xs text-gray-400 mt-auto pt-2">Чем меньше это число, тем чаще клиенты возвращаются к вам.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-[160px]">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Активная база</h3>
              <div className="mt-2 flex items-baseline space-x-2">
                <span className="text-3xl font-bold text-gray-900">
                  {data ? formatNumber(data.metrics.activeCustomers) : "—"}
                </span>
                <span className="text-sm font-medium text-gray-400">клиентов</span>
              </div>
            </div>
            <div className="p-3 bg-pink-50 text-pink-600 rounded-xl">
              <Activity size={24} />
            </div>
          </div>

          <div className="flex items-center justify-between mt-auto pt-2">
            <div className="text-xs">
              <span className="text-gray-500 block">Удержание (Retention)</span>
              <span className="text-gray-900 font-bold text-sm">
                {data ? formatDecimal(retentionRate) : "—"}%
              </span>
            </div>
            <div className="text-xs text-right">
              <span className="text-gray-500 block">Отток (Churn)</span>
              <span className="text-red-500 font-bold text-sm">
                {data ? formatDecimal(churnRate) : "—"}%
              </span>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 flex overflow-hidden">
            <div className="bg-green-500 h-full" style={{ width: `${retentionWidth}%` }}></div>
            <div className="bg-red-400 h-full" style={{ width: `${churnWidth}%` }}></div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 flex items-center gap-3">
          <TrendingDown size={18} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
