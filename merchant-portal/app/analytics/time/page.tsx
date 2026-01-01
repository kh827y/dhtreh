"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown } from "lucide-react";
import {
  ActivityMetric,
  RecencyGrouping,
  RecencyResponse,
  TimeActivityResponse,
  hourLabels,
  toDayOfWeekData,
  toHeatmapData,
  toHourOfDayData,
  toRecencyChartData,
  weekDayLabels,
} from "./utils";
import { normalizeErrorMessage } from "lib/portal-errors";

const recencyUnits: Array<{ value: RecencyGrouping; label: string }> = [
  { value: "day", label: "дни" },
  { value: "week", label: "недели" },
  { value: "month", label: "месяцы" },
];

const recencyConfig: Record<
  RecencyGrouping,
  { min: number; max: number; defaultValue: number }
> = {
  day: { min: 5, max: 90, defaultValue: 30 },
  week: { min: 4, max: 26, defaultValue: 12 },
  month: { min: 3, max: 12, defaultValue: 12 },
};

const activityPeriods = [
  { value: "week", label: "Эта неделя" },
  { value: "month", label: "Этот месяц" },
  { value: "quarter", label: "Этот квартал" },
  { value: "year", label: "Этот год" },
] as const;

type ActivityPeriod = (typeof activityPeriods)[number]["value"];

const metricLabels: Record<ActivityMetric, string> = {
  sales: "Продажи",
  revenue: "Выручка",
  avg_check: "Ср. чек",
};

const formatNumber = (value: number) =>
  Math.round(value || 0).toLocaleString("ru-RU");
const formatCurrency = (value: number) =>
  `₽${Math.round(value || 0).toLocaleString("ru-RU")}`;

const getHeatmapColor = (value: number, max: number) => {
  if (max <= 0) return "#F9FAFB";
  const intensity = Math.min(value / max, 1);
  if (intensity < 0.2) return "#F3E8FF";
  if (intensity < 0.4) return "#E9D5FF";
  if (intensity < 0.6) return "#C084FC";
  if (intensity < 0.8) return "#9333EA";
  return "#6B21A8";
};

const ChartSkeleton = ({ className }: { className?: string }) => (
  <div
    className={`w-full h-full rounded-lg border border-gray-100 bg-gray-50 animate-pulse ${className || ""}`}
  />
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="h-full w-full rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-500 text-sm px-4">
    {message}
  </div>
);

const ErrorBox = ({ message }: { message: string }) => (
  <div className="h-full w-full rounded-lg border border-red-200 bg-red-50 flex items-center justify-center text-red-700 px-4 text-sm">
    {message}
  </div>
);

const pluralize = (value: number, forms: [string, string, string]) => {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = value % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
};

const recencyUnitTitle: Record<RecencyGrouping, string> = {
  day: "дней",
  week: "недель",
  month: "месяцев",
};

const formatRecencyText = (value: number, unit: RecencyGrouping) => {
  const absValue = Math.max(0, Math.round(value));
  const forms =
    unit === "day"
      ? ["день назад", "дня назад", "дней назад"]
      : unit === "week"
        ? ["неделю назад", "недели назад", "недель назад"]
        : ["месяц назад", "месяца назад", "месяцев назад"];
  return `${absValue} ${pluralize(absValue, forms)}`;
};

export default function AnalyticsTimePage() {
  const [recencyUnit, setRecencyUnit] = React.useState<RecencyGrouping>("day");
  const [recencyDepth, setRecencyDepth] = React.useState(
    recencyConfig.day.defaultValue,
  );
  const [appliedRecencyDepth, setAppliedRecencyDepth] = React.useState(
    recencyConfig.day.defaultValue,
  );
  const [recency, setRecency] = React.useState<RecencyResponse | null>(null);
  const [recencyLoading, setRecencyLoading] = React.useState(true);
  const [recencyError, setRecencyError] = React.useState("");

  const [activityPeriod, setActivityPeriod] =
    React.useState<ActivityPeriod>("month");
  const [activityMetric, setActivityMetric] =
    React.useState<ActivityMetric>("revenue");
  const [activity, setActivity] = React.useState<TimeActivityResponse | null>(
    null,
  );
  const [activityLoading, setActivityLoading] = React.useState(true);
  const [activityError, setActivityError] = React.useState("");

  const recencyTimer = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    const config = recencyConfig[recencyUnit];
    setRecencyDepth(config.defaultValue);
    setAppliedRecencyDepth(config.defaultValue);
  }, [recencyUnit]);

  React.useEffect(() => {
    if (recencyTimer.current) clearTimeout(recencyTimer.current);
    recencyTimer.current = setTimeout(() => {
      setAppliedRecencyDepth(recencyDepth);
    }, 200);
    return () => {
      if (recencyTimer.current) clearTimeout(recencyTimer.current);
    };
  }, [recencyDepth]);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const cfg = recencyConfig[recencyUnit];
    const limit = Math.min(
      cfg.max,
      Math.max(cfg.min, Math.round(appliedRecencyDepth)),
    );
    setRecencyLoading(true);
    setRecencyError("");

    fetch(
      `/api/portal/analytics/time/recency?group=${recencyUnit}&limit=${limit}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            json?.message || "Не удалось загрузить распределение",
          );
        }
        return json as RecencyResponse;
      })
      .then((data) => {
        if (!cancelled) setRecency(data);
      })
      .catch((error: any) => {
        if (cancelled || error?.name === "AbortError") return;
        setRecency(null);
        setRecencyError(
          normalizeErrorMessage(error, "Не удалось загрузить распределение"),
        );
      })
      .finally(() => {
        if (!cancelled) setRecencyLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [appliedRecencyDepth, recencyUnit]);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setActivityLoading(true);
    setActivityError("");

    fetch(
      `/api/portal/analytics/time/activity?period=${activityPeriod}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.message || "Не удалось загрузить активность");
        }
        return json as TimeActivityResponse;
      })
      .then((data) => {
        if (!cancelled) setActivity(data);
      })
      .catch((error: any) => {
        if (cancelled || error?.name === "AbortError") return;
        setActivity(null);
        setActivityError(
          normalizeErrorMessage(error, "Не удалось загрузить активность"),
        );
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activityPeriod]);

  const recencyChartData = React.useMemo(
    () => toRecencyChartData(recency),
    [recency],
  );
  const dayOfWeekData = React.useMemo(
    () => toDayOfWeekData(activity, activityMetric),
    [activity, activityMetric],
  );
  const hourOfDayData = React.useMemo(
    () => toHourOfDayData(activity, activityMetric),
    [activity, activityMetric],
  );
  const heatmap = React.useMemo(
    () => toHeatmapData(activity, activityMetric),
    [activity, activityMetric],
  );
  const heatmapMax = Math.max(1, heatmap.maxValue || 0);
  const hasActivityData = React.useMemo(() => {
    if (!activity) return false;
    return (
      activity.dayOfWeek?.some(
        (row) => row.orders || row.revenue || row.averageCheck,
      ) ||
      activity.hours?.some((row) => row.orders || row.revenue || row.averageCheck) ||
      activity.heatmap?.some((cell) => cell.orders || cell.revenue || cell.averageCheck)
    );
  }, [activity]);
  const recencyUnitLabel =
    recencyUnitTitle[recencyUnit] ||
    recencyUnits.find((u) => u.value === recencyUnit)?.label ||
    "";

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">
          Аналитика по времени
        </h2>
        <p className="text-gray-500">
          Анализ частоты покупок и временных паттернов поведения клиентов.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              Время с последней покупки
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Распределение клиентов по давности последнего заказа.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-gray-100 p-1 rounded-lg flex text-sm">
              {recencyUnits.map((unit) => (
                <button
                  key={unit.value}
                  onClick={() => setRecencyUnit(unit.value)}
                  className={`px-4 py-1.5 rounded-md capitalize transition-all ${
                    recencyUnit === unit.value
                      ? "bg-white shadow-sm text-gray-900 font-medium"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {unit.label}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-3 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
              <span className="text-sm text-gray-600 whitespace-nowrap">
                Глубина анализа:
              </span>
              <input
                type="range"
                min={recencyConfig[recencyUnit].min}
                max={recencyConfig[recencyUnit].max}
                value={recencyDepth}
                onChange={(e) => setRecencyDepth(Number(e.target.value))}
                className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
              <span className="text-sm font-semibold text-purple-700 w-8 text-right">
                {recencyDepth}
              </span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full">
          {recencyError ? (
            <ErrorBox message={recencyError} />
          ) : recencyLoading && !recencyChartData.length ? (
            <ChartSkeleton />
          ) : recencyChartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={recencyChartData}
                margin={{ top: 10, right: 8, left: 8, bottom: 24 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#F3F4F6"
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9CA3AF", fontSize: 12 }}
                  label={{
                    value: `Время (${recencyUnitLabel}) назад`,
                    position: "bottom",
                    offset: 10,
                    fill: "#9CA3AF",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9CA3AF", fontSize: 12 }}
                  tickFormatter={formatNumber}
                />
                <Tooltip
                  cursor={{ fill: "#F3F4F6" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow:
                      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  }}
                  formatter={(value: number) => [
                    `${formatNumber(value)} клиентов`,
                    "Кол-во",
                  ]}
                  labelFormatter={(_label, payload) => {
                    const point = payload?.[0]?.payload;
                    return formatRecencyText(point?.value ?? 0, recencyUnit);
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="#8B5CF6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ErrorBox message="Нет данных по давности покупок" />
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 border-b border-gray-100 pb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Активность клиентов</h3>
            <p className="text-xs text-gray-500 mt-1">
              Определение пикового времени покупок и активности.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <select
                className="appearance-none bg-white border border-gray-200 px-4 py-2 pr-8 rounded-lg text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={activityPeriod}
                onChange={(e) =>
                  setActivityPeriod(e.target.value as ActivityPeriod)
                }
              >
                {activityPeriods.map((period) => (
                  <option key={period.value} value={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>

            <div className="bg-gray-100 p-1 rounded-lg flex text-sm">
              <button
                onClick={() => setActivityMetric("sales")}
                className={`px-4 py-1.5 rounded-md capitalize transition-all ${
                  activityMetric === "sales"
                    ? "bg-white shadow-sm text-purple-700 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Продажи
              </button>
              <button
                onClick={() => setActivityMetric("revenue")}
                className={`px-4 py-1.5 rounded-md capitalize transition-all ${
                  activityMetric === "revenue"
                    ? "bg-white shadow-sm text-purple-700 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Выручка
              </button>
              <button
                onClick={() => setActivityMetric("avg_check")}
                className={`px-4 py-1.5 rounded-md capitalize transition-all ${
                  activityMetric === "avg_check"
                    ? "bg-white shadow-sm text-purple-700 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Ср. чек
              </button>
            </div>
          </div>
        </div>

        {activityError ? (
          <ErrorBox message={activityError} />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-56">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">
                  Активность по дням
                </h4>
                {activityLoading && !activity ? (
                  <ChartSkeleton />
                ) : !hasActivityData ? (
                  <EmptyState message="Нет данных за выбранный период" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayOfWeekData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F3F4F6"
                      />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#6B7280", fontSize: 12 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "#6B7280",
                          fontSize: 12,
                          formatter:
                            activityMetric === "sales"
                              ? formatNumber
                              : (val: number) => formatCurrency(val),
                        }}
                        tickFormatter={
                          activityMetric === "sales"
                            ? formatNumber
                            : (val: number) => formatCurrency(val)
                        }
                      />
                      <Tooltip
                        cursor={{ fill: "transparent" }}
                        contentStyle={{ borderRadius: "8px" }}
                        formatter={(value: number) =>
                          activityMetric === "sales"
                            ? formatNumber(value)
                            : formatCurrency(value)
                        }
                        labelFormatter={(label) =>
                          `День недели: ${label || ""}`
                        }
                      />
                      <Bar
                        dataKey="value"
                        name={metricLabels[activityMetric]}
                        fill="#60A5FA"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="h-56">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">
                  Активность по часам
                </h4>
                {activityLoading && !activity ? (
                  <ChartSkeleton />
                ) : !hasActivityData ? (
                  <EmptyState message="Нет данных за выбранный период" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourOfDayData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F3F4F6"
                      />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        interval={2}
                        tick={{ fill: "#6B7280", fontSize: 12 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={
                          activityMetric === "sales"
                            ? formatNumber
                            : (val: number) => formatCurrency(val)
                        }
                        tick={{ fill: "#6B7280", fontSize: 12 }}
                      />
                      <Tooltip
                        cursor={{ fill: "transparent" }}
                        contentStyle={{ borderRadius: "8px" }}
                        formatter={(value: number) =>
                          activityMetric === "sales"
                            ? formatNumber(value)
                            : formatCurrency(value)
                        }
                        labelFormatter={(label) => `${label}:00`}
                      />
                      <Bar
                        dataKey="value"
                        name={metricLabels[activityMetric]}
                        fill="#34D399"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-4">
                Тепловая карта (День x Час)
              </h4>
              {activityLoading ? (
                <div className="h-64">
                  <ChartSkeleton />
                </div>
              ) : !hasActivityData ? (
                <div className="h-64">
                  <EmptyState message="Нет данных для тепловой карты" />
                </div>
              ) : (
                <>
                  <div
                    className="overflow-x-auto"
                    style={{ overflowY: "visible" }}
                  >
                    <div className="min-w-[800px]">
                      <div className="grid grid-cols-[60px_repeat(24,minmax(0,1fr))] gap-1 mb-2">
                        <div className="text-xs text-gray-400 font-medium"></div>
                        {hourLabels.map((label) => (
                          <div
                            key={label}
                            className="text-[10px] text-gray-400 text-center font-medium"
                          >
                            {label}
                          </div>
                        ))}
                      </div>

                      {weekDayLabels.map((day, dIdx) => (
                        <div
                          key={day}
                          className="grid grid-cols-[60px_repeat(24,minmax(0,1fr))] gap-1 mb-1 items-center"
                        >
                          <div className="text-xs text-gray-600 font-medium">
                            {day}
                          </div>
                          {heatmap.cells
                            .filter((cell) => cell.dayIndex === dIdx)
                            .map((cell) => (
                              <div
                                key={`${cell.dayIndex}-${cell.hour}`}
                                className="h-8 rounded-sm hover:ring-2 hover:ring-blue-400 transition-all relative group cursor-default overflow-visible"
                                style={{
                                  backgroundColor: getHeatmapColor(
                                    cell.value,
                                    heatmapMax,
                                  ),
                                }}
                              >
                                <div
                                  className={`absolute left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-20 ${
                                    dIdx === 0
                                      ? "top-full mt-2"
                                      : "bottom-full mb-2"
                                  }`}
                                >
                                  {day} {cell.hour.toString().padStart(2, "0")}
                                  :00 —{" "}
                                  {activityMetric === "sales"
                                    ? formatNumber(cell.value)
                                    : formatCurrency(cell.value)}
                                </div>
                              </div>
                            ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end mt-2 items-center space-x-2 text-xs text-gray-500">
                    <span>Низк.</span>
                    <div className="w-24 h-2 rounded-full bg-gradient-to-r from-[#F3E8FF] to-[#6B21A8]" />
                    <span>Выс.</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
