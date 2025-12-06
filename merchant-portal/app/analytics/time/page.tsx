"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart, Skeleton, Button } from "@loyalty/ui";

type RecencyGrouping = "day" | "week" | "month";

type RecencyBucket = {
  index: number;
  value: number;
  label: string;
  customers: number;
};

type RecencyResponse = {
  group: RecencyGrouping;
  totalCustomers: number;
  buckets: RecencyBucket[];
};

type TimeActivityRow = {
  orders: number;
  customers: number;
  revenue: number;
  averageCheck: number;
};

type DayActivityRow = TimeActivityRow & { day: number };
type HourActivityRow = TimeActivityRow & { hour: number };
type HeatmapCell = TimeActivityRow & { day: number; hour: number };

type TimeActivityResponse = {
  dayOfWeek: DayActivityRow[];
  hours: HourActivityRow[];
  heatmap: HeatmapCell[];
};

const recencyGroupingOptions: Array<{ value: RecencyGrouping; label: string }> = [
  { value: "day", label: "По дням" },
  { value: "week", label: "По неделям" },
  { value: "month", label: "По месяцам" },
];

const recencyLimits: Record<RecencyGrouping, { min: number; max: number; default: number; step: number }> = {
  day: { min: 7, max: 365, default: 30, step: 1 },
  week: { min: 4, max: 52, default: 10, step: 1 },
  month: { min: 3, max: 12, default: 5, step: 1 },
};

const activityPeriods = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

const weekDayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const hourLabels = Array.from({ length: 24 }, (_, idx) => `${String(idx).padStart(2, "0")}:00`);

function pluralize(value: number, forms: [string, string, string]) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${value} ${forms[2]}`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4) return `${value} ${forms[1]}`;
  return `${value} ${forms[2]}`;
}

function formatRecencyRange(grouping: RecencyGrouping, value: number) {
  switch (grouping) {
    case "week":
      return pluralize(value, ["неделя", "недели", "недель"]);
    case "month":
      return pluralize(value, ["месяц", "месяца", "месяцев"]);
    default:
      return pluralize(value, ["день", "дня", "дней"]);
  }
}

function toCurrency(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function toNumber(value: number) {
  return Math.round(value).toLocaleString("ru-RU");
}

export default function AnalyticsTimePage() {
  const [grouping, setGrouping] = React.useState<RecencyGrouping>("day");
  const [limit, setLimit] = React.useState(recencyLimits.day.default);
  const [recency, setRecency] = React.useState<RecencyResponse | null>(null);
  const [recencyLoading, setRecencyLoading] = React.useState(true);
  const [recencyError, setRecencyError] = React.useState("");

  const [activityPeriod, setActivityPeriod] = React.useState(activityPeriods[0]?.value ?? "week");
  const [activity, setActivity] = React.useState<TimeActivityResponse | null>(null);
  const [activityLoading, setActivityLoading] = React.useState(true);
  const [activityError, setActivityError] = React.useState("");

  React.useEffect(() => {
    const defaults = recencyLimits[grouping].default;
    setLimit(defaults);
  }, [grouping]);

  React.useEffect(() => {
    const cfg = recencyLimits[grouping];
    const clamped = Math.max(cfg.min, Math.min(cfg.max, limit));

    let cancelled = false;
    const controller = new AbortController();
    setRecencyLoading(true);
    setRecencyError("");

    fetch(`/api/portal/analytics/time/recency?group=${grouping}&limit=${clamped}`, {
      method: "GET",
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || "Не удалось загрузить данные");
        return json as RecencyResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setRecency(data);
      })
      .catch((error: any) => {
        if (cancelled) return;
        if (error?.name === "AbortError") return;
        setRecencyError(String(error?.message || error));
        setRecency(null);
      })
      .finally(() => {
        if (!cancelled) setRecencyLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [grouping, limit]);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setActivityLoading(true);
    setActivityError("");

    const search = new URLSearchParams({ period: activityPeriod }).toString();

    fetch(`/api/portal/analytics/time/activity?${search}`, {
      method: "GET",
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || "Не удалось загрузить активность");
        return json as TimeActivityResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setActivity(data);
      })
      .catch((error: any) => {
        if (cancelled) return;
        if (error?.name === "AbortError") return;
        setActivityError(String(error?.message || error));
        setActivity(null);
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activityPeriod]);

  const recencyOption = React.useMemo(() => {
    if (!recency) return null;
    const buckets = recency.buckets;
    const labels =
      recency.group === "day"
        ? buckets.map((bucket) => String(bucket.value))
        : buckets.map((bucket) => bucket.label);
    const values = buckets.map((bucket) => bucket.customers);
    const catName =
      recency.group === "week"
        ? "Недель с последней покупки"
        : recency.group === "month"
        ? "Месяцев с последней покупки"
        : "Дней с последней покупки";

    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          const point = params?.[0];
          if (!point) return "";
          const bucket = buckets[point.dataIndex];
          if (!bucket) return "";
          const title = recency.group === "day" ? `${bucket.value} день` : bucket.label;
          return `${title}<br/>Клиентов: ${bucket.customers.toLocaleString("ru-RU")}`;
        },
        axisPointer: { type: "shadow" },
      },
      grid: { left: 36, right: 20, top: 30, bottom: 60 },
      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: false,
        name: catName,
        nameLocation: "center",
        nameGap: 40,
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: "value",
        name: "Клиентов",
        nameLocation: "center",
        nameGap: 45,
        axisLabel: { formatter: (value: number) => Math.round(value).toLocaleString("ru-RU") },
      },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          data: values,
          lineStyle: { width: 3, color: "#4f46e5" },
          itemStyle: { color: "#6366f1" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(99,102,241,0.35)" },
                { offset: 1, color: "rgba(99,102,241,0.05)" },
              ],
            },
          },
        },
      ],
    } as const;
  }, [recency]);

  const dayOfWeekOption = React.useMemo(() => {
    if (!activity) return null;
    const dayData = weekDayLabels.map((_, idx) => activity.dayOfWeek.find((item) => item.day === idx + 1) ?? { day: idx + 1, orders: 0, customers: 0, revenue: 0, averageCheck: 0 });
    const avgCheck = dayData.map((row) => row.averageCheck);
    const orders = dayData.map((row) => row.orders);
    const revenue = dayData.map((row) => row.revenue);
    const maxAvgCheck = Math.max(1, ...avgCheck);
    const maxOrders = Math.max(1, ...orders);
    const maxRevenue = Math.max(1, ...revenue);
    const normalize = (values: number[], max: number) =>
      values.map((value) => ({
        value: max > 0 ? value / max : 0,
        real: value,
      }));
    const normalizedAvgCheck = normalize(avgCheck, maxAvgCheck);
    const normalizedOrders = normalize(orders, maxOrders);
    const normalizedRevenue = normalize(revenue, maxRevenue);
    const buildYAxis = () => ({
      type: "value" as const,
      min: 0,
      max: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    });

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any[]) => {
          const index = params?.[0]?.dataIndex ?? 0;
          const point = dayData[index] ?? { averageCheck: 0, orders: 0, revenue: 0 };
          return [
            weekDayLabels[index],
            `Средний чек: ${toCurrency(point.averageCheck ?? 0)}`,
            `Количество продаж: ${toNumber(point.orders ?? 0)}`,
            `Выручка: ${toCurrency(point.revenue ?? 0)}`,
          ].join("<br/>");
        },
      },
      legend: { top: 0 },
      grid: { left: 10, right: 10, top: 40, bottom: 30 },
      xAxis: {
        type: "category",
        data: weekDayLabels,
        axisTick: { alignWithLabel: true },
        axisLine: { show: false },
      },
      yAxis: [buildYAxis(), buildYAxis(), buildYAxis()],
      series: [
        {
          name: "Средний чек",
          type: "bar",
          data: normalizedAvgCheck,
          barWidth: "20%",
          itemStyle: { color: "#38bdf8", borderRadius: 8 },
          yAxisIndex: 0,
        },
        {
          name: "Количество продаж",
          type: "bar",
          data: normalizedOrders,
          barWidth: "20%",
          itemStyle: { color: "#22c55e", borderRadius: 8 },
          yAxisIndex: 1,
        },
        {
          name: "Выручка",
          type: "bar",
          data: normalizedRevenue,
          barWidth: "20%",
          itemStyle: { color: "#f97316", borderRadius: 8 },
          yAxisIndex: 2,
        },
      ],
    } as const;
  }, [activity]);

  const hoursOption = React.useMemo(() => {
    if (!activity) return null;
    const hourData = hourLabels.map((_, idx) => activity.hours.find((item) => item.hour === idx) ?? { hour: idx, orders: 0, customers: 0, revenue: 0, averageCheck: 0 });
    const avgCheck = hourData.map((row) => row.averageCheck);
    const orders = hourData.map((row) => row.orders);
    const revenue = hourData.map((row) => row.revenue);
    const maxAvgCheck = Math.max(1, ...avgCheck);
    const maxOrders = Math.max(1, ...orders);
    const maxRevenue = Math.max(1, ...revenue);
    const normalize = (values: number[], max: number) =>
      values.map((value) => ({
        value: max > 0 ? value / max : 0,
        real: value,
      }));
    const normalizedAvgCheck = normalize(avgCheck, maxAvgCheck);
    const normalizedOrders = normalize(orders, maxOrders);
    const normalizedRevenue = normalize(revenue, maxRevenue);
    const buildYAxis = () => ({
      type: "value" as const,
      min: 0,
      max: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    });

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any[]) => {
          const index = params?.[0]?.dataIndex ?? 0;
          const point = hourData[index] ?? { averageCheck: 0, orders: 0, revenue: 0 };
          return [
            hourLabels[index],
            `Средний чек: ${toCurrency(point.averageCheck ?? 0)}`,
            `Количество продаж: ${toNumber(point.orders ?? 0)}`,
            `Выручка: ${toCurrency(point.revenue ?? 0)}`,
          ].join("<br/>");
        },
      },
      legend: { top: 0 },
      grid: { left: 10, right: 10, top: 40, bottom: 40 },
      xAxis: {
        type: "category",
        data: hourLabels,
        axisLabel: { interval: 1, rotate: 45 },
        axisLine: { show: false },
      },
      yAxis: [buildYAxis(), buildYAxis(), buildYAxis()],
      series: [
        {
          name: "Средний чек",
          type: "bar",
          data: normalizedAvgCheck,
          barWidth: "18%",
          itemStyle: { color: "#38bdf8", borderRadius: 6 },
          yAxisIndex: 0,
        },
        {
          name: "Количество продаж",
          type: "bar",
          data: normalizedOrders,
          barWidth: "18%",
          itemStyle: { color: "#22c55e", borderRadius: 6 },
          yAxisIndex: 1,
        },
        {
          name: "Выручка",
          type: "bar",
          data: normalizedRevenue,
          barWidth: "18%",
          itemStyle: { color: "#f97316", borderRadius: 6 },
          yAxisIndex: 2,
        },
      ],
    } as const;
  }, [activity]);

  const heatmapMatrix = React.useMemo(() => {
    if (!activity) return null;
    const map = new Map<string, HeatmapCell>();
    for (const cell of activity.heatmap) {
      map.set(`${cell.day}:${cell.hour}`, cell);
    }
    const rows = weekDayLabels.map((_, dayIdx) => {
      return hourLabels.map((_, hourIdx) => {
        const item = map.get(`${dayIdx + 1}:${hourIdx}`);
        if (!item) {
          return { day: dayIdx + 1, hour: hourIdx, orders: 0, averageCheck: 0, revenue: 0 } as HeatmapCell;
        }
        return item;
      });
    });
    return rows;
  }, [activity]);

  const heatmapMaxOrders = React.useMemo(() => {
    if (!heatmapMatrix) return 1;
    return Math.max(
      1,
      ...heatmapMatrix.flat().map((cell) => cell.orders ?? 0),
    );
  }, [heatmapMatrix]);

  const renderHeatmap = React.useCallback(() => {
    if (!heatmapMatrix) {
      return <div style={{ padding: "40px 0", opacity: 0.6 }}>Нет данных</div>;
    }
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px", textAlign: "left", opacity: 0.7 }}>День/Час</th>
              {hourLabels.map((label) => (
                <th key={label} style={{ padding: "6px 8px", textAlign: "center", opacity: 0.75 }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmapMatrix.map((row, rowIdx) => (
              <tr key={weekDayLabels[rowIdx]}>
                <td style={{ padding: "6px 8px", opacity: 0.75 }}>{weekDayLabels[rowIdx]}</td>
                {row.map((cell) => {
                  const intensity = Math.min(1, (cell.orders || 0) / heatmapMaxOrders);
                  const bgAlpha = 0.18 + intensity * 0.62;
                  const background = `rgba(99,102,241,${bgAlpha.toFixed(2)})`;
                  return (
                    <td
                      key={`${cell.day}-${cell.hour}`}
                      title={`Час: ${hourLabels[cell.hour]}\nСредний чек: ${toCurrency(cell.averageCheck || 0)}\nСумма продаж: ${toCurrency(cell.revenue || 0)}`}
                      style={{
                        padding: "6px 8px",
                        textAlign: "center",
                        background,
                        color: "#e2e8f0",
                        borderRadius: 6,
                        minWidth: 44,
                        fontWeight: 600,
                      }}
                    >
                      {toNumber(cell.orders || 0)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [heatmapMatrix, heatmapMaxOrders]);

  const recencyLimitConfig = recencyLimits[grouping];
  const sliderLabel = formatRecencyRange(grouping, limit);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Распределение по времени</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Распределение активности клиентов во времени за выбранный период</div>
        </div>
      </header>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {recencyGroupingOptions.map((option) => (
          <Button
            key={option.value}
            variant={grouping === option.value ? "primary" : "secondary"}
            size="sm"
            onClick={() => setGrouping(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Время с последней покупки"
          subtitle={recency ? `Всего клиентов: ${recency.totalCustomers.toLocaleString("ru-RU")}` : undefined}
        />
        <CardBody>
          {recencyLoading ? (
            <Skeleton height={320} />
          ) : recencyOption ? (
            <Chart option={recencyOption as any} height={340} />
          ) : (
            <div style={{ padding: "40px 0", opacity: 0.6 }}>Нет данных</div>
          )}
          {recencyError && <div style={{ color: "#f87171", marginTop: 12 }}>{recencyError}</div>}
          <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, opacity: 0.75 }}>
              <span>Отображаем: {sliderLabel}</span>
              <span>Максимум: {formatRecencyRange(grouping, recencyLimitConfig.max)}</span>
            </div>
            <input
              type="range"
              min={recencyLimitConfig.min}
              max={recencyLimitConfig.max}
              step={recencyLimitConfig.step}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        </CardBody>
      </Card>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, opacity: 0.75 }}>
          Выберите период для отображения на следующих показателях:
        </span>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {activityPeriods.map((item) => (
            <Button
              key={item.value}
              variant={activityPeriod === item.value ? "primary" : "secondary"}
              size="sm"
              onClick={() => setActivityPeriod(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader title="По дням недели" subtitle="Продажи, клиенты и средний чек за выбранный период" />
        <CardBody>
          {activityLoading ? (
            <Skeleton height={360} />
          ) : dayOfWeekOption ? (
            <Chart option={dayOfWeekOption as any} height={360} />
          ) : (
            <div style={{ padding: "40px 0", opacity: 0.6 }}>Нет данных</div>
          )}
          {activityError && <div style={{ color: "#f87171", marginTop: 12 }}>{activityError}</div>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="По часам" subtitle="Пиковые часы и средний чек внутри суток" />
        <CardBody>
          {activityLoading ? (
            <Skeleton height={360} />
          ) : hoursOption ? (
            <Chart option={hoursOption as any} height={360} />
          ) : (
            <div style={{ padding: "40px 0", opacity: 0.6 }}>Нет данных</div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Подробно по дням-часам" subtitle="В ячейках таблицы показано количество продаж. Наведите, чтобы увидеть средний чек и сумму продаж." />
        <CardBody>
          {activityLoading ? <Skeleton height={360} /> : renderHeatmap()}
        </CardBody>
      </Card>
    </div>
  );
}
