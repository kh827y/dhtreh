"use client";

import React from "react";
import { Chart } from "@loyalty/ui";
import { 
  Clock, 
  Activity, 
  TrendingUp, 
  Filter,
  Info
} from "lucide-react";

// --- Types ---

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

// --- Constants ---

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
// Use short labels for heatmap rows to ensure alignment
const weekDayShortLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const weekDayFullLabels = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
const hourLabels = Array.from({ length: 24 }, (_, idx) => `${String(idx).padStart(2, "0")}:00`);

// --- Helpers ---

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
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function toNumber(value: number) {
  return Math.round(value).toLocaleString("ru-RU");
}

// --- Components ---

const ToggleGroup = <T extends string>({ 
  options, 
  value, 
  onChange 
}: { 
  options: { value: T; label: string }[]; 
  value: T; 
  onChange: (val: T) => void; 
}) => (
  <div className="toggle-group">
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`toggle-btn ${value === opt.value ? "active" : ""}`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const Skeleton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <div className={["skeleton", className].filter(Boolean).join(" ")} style={style} />
);

const recencySkeletonHeights = [90, 140, 120, 180, 150, 200, 130, 170, 140, 160, 120, 100];

const RecencyChartSkeleton = () => (
  <div className="h-[360px] rounded-2xl border border-default/70 bg-surface p-6 flex flex-col gap-6" style={{ overflow: 'hidden', isolation: 'isolate' }}>
    <div className="flex items-center justify-between gap-4" style={{ overflow: 'hidden' }}>
      <Skeleton className="h-4 w-28 rounded-full" />
      <Skeleton className="h-4 w-16 rounded-full" />
    </div>
    <div className="flex-1 flex items-end gap-3" style={{ overflow: 'hidden' }}>
      {recencySkeletonHeights.map((height, idx) => (
        <Skeleton key={idx} className="flex-1 rounded-lg" style={{ height }} />
      ))}
    </div>
    <div className="flex justify-between text-xs text-muted" style={{ overflow: 'hidden' }}>
      <Skeleton className="h-3 w-12 rounded-full" />
      <Skeleton className="h-3 w-16 rounded-full" />
      <Skeleton className="h-3 w-12 rounded-full" />
    </div>
  </div>
);

const ColumnChartSkeleton = ({ columns = 7 }: { columns?: number }) => {
  const pattern = [60, 110, 90, 130, 80, 120, 70];

  return (
    <div className="chart-skeleton" style={{ overflow: 'hidden', isolation: 'isolate' }}>
      <div className="chart-skeleton-header" style={{ overflow: 'hidden' }}>
        <Skeleton className="h-4 w-28 rounded-full" />
        <div className="flex items-center gap-2" style={{ overflow: 'hidden' }}>
          <Skeleton className="h-3 w-10 rounded-full" />
          <Skeleton className="h-3 w-14 rounded-full" />
        </div>
      </div>
      <div className="chart-skeleton-body" style={{ overflow: 'hidden', isolation: 'isolate' }}>
        <div className="chart-skeleton-bars" style={{ overflow: 'hidden' }}>
          {Array.from({ length: columns }).map((_, idx) => {
            const height = pattern[idx % pattern.length] + (idx % 3) * 10;
            const opacity = 0.7 + ((idx % 4) * 0.05);
            return <div key={idx} className="chart-skeleton-bar" style={{ height, opacity }} />;
          })}
        </div>
      </div>
      <div className="chart-skeleton-axis" style={{ overflow: 'hidden' }}>
        <Skeleton className="h-3 w-10 rounded-full" />
        <Skeleton className="h-3 w-10 rounded-full" />
        <Skeleton className="h-3 w-10 rounded-full" />
      </div>
    </div>
  );
};

const HeatmapSkeleton = () => (
  <div className="time-heatmap-wrapper pb-4 time-heatmap-loading" style={{ overflow: 'hidden', isolation: 'isolate' }}>
    <div className="time-heatmap heatmap-skeleton-shell" style={{ overflow: 'hidden' }}>
      <div className="heatmap-skeleton-header" style={{ overflow: 'hidden' }}>
        <Skeleton className="h-4 w-28 rounded-full" />
        <div className="flex items-center gap-2" style={{ overflow: 'hidden' }}>
          <Skeleton className="h-3 w-12 rounded-full" />
          <Skeleton className="h-3 w-16 rounded-full" />
        </div>
      </div>

      <div className="time-heatmap-grid" style={{ overflow: 'hidden' }}>
        <div className="time-heatmap-corner" style={{ overflow: 'hidden' }}>
          <Skeleton className="h-3 w-16 rounded-full" />
        </div>
        {hourLabels.map((label) => (
          <div key={label} style={{ overflow: 'hidden' }}>
            <Skeleton className="h-3 w-full rounded-full heatmap-skeleton-hour" />
          </div>
        ))}

        {weekDayShortLabels.map((day) => (
          <React.Fragment key={day}>
            <div className="time-heatmap-day heatmap-skeleton-day" style={{ overflow: 'hidden', isolation: 'isolate' }}>
              <Skeleton className="h-3 w-12 rounded-full mb-2" />
              <Skeleton className="h-2 w-20 rounded-full" />
            </div>
            {hourLabels.map((_, hourIdx) => (
              <div key={`${day}-${hourIdx}`} className="time-heatmap-cell heatmap-skeleton-cell" style={{ overflow: 'hidden', isolation: 'isolate' }} />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  </div>
);

// --- Page Component ---

export default function AnalyticsTimePage() {
  const [grouping, setGrouping] = React.useState<RecencyGrouping>("day");
  const [limit, setLimit] = React.useState(recencyLimits.day.default);
  const [committedLimit, setCommittedLimit] = React.useState(recencyLimits.day.default);
  const [recency, setRecency] = React.useState<RecencyResponse | null>(null);
  const [recencyLoading, setRecencyLoading] = React.useState(true);
  const [recencyError, setRecencyError] = React.useState("");

  const [activityPeriod, setActivityPeriod] = React.useState(activityPeriods[0]?.value ?? "week");
  const [activity, setActivity] = React.useState<TimeActivityResponse | null>(null);
  const [activityLoading, setActivityLoading] = React.useState(true);
  const [activityError, setActivityError] = React.useState("");

  // Recency Fetch Effect
  React.useEffect(() => {
    // When grouping changes, reset limit to default
    const defaults = recencyLimits[grouping].default;
    setLimit(defaults);
    setCommittedLimit(defaults);
    // Clear data to show fresh skeleton on grouping change
    setRecency(null);
    setRecencyLoading(true);
  }, [grouping]);

  // Handler for slider release
  const handleSliderCommit = React.useCallback(() => {
    const cfg = recencyLimits[grouping];
    const clamped = Math.max(cfg.min, Math.min(cfg.max, limit));
    if (clamped !== committedLimit) {
      setCommittedLimit(clamped);
    }
  }, [grouping, limit, committedLimit]);

  React.useEffect(() => {
    const cfg = recencyLimits[grouping];
    const clamped = Math.max(cfg.min, Math.min(cfg.max, committedLimit));

    let cancelled = false;
    const controller = new AbortController();
    setRecencyLoading(true);
    setRecencyError("");

    // Note: We do NOT setRecency(null) here if we are just changing the limit (slider),
    // so the chart stays visible while loading.
    
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
        if (!recency) setRecency(null); // Clear only if we had no data
      })
      .finally(() => {
        if (!cancelled) setRecencyLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [grouping, committedLimit]);

  // Activity Fetch Effect
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

  // Chart Options
  const recencyOption = React.useMemo(() => {
    if (!recency) return null;
    const buckets = recency.buckets;
    const labels = recency.group === "day"
        ? buckets.map((bucket) => String(bucket.value))
        : buckets.map((bucket) => bucket.label);
    const values = buckets.map((bucket) => bucket.customers);
    
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: 'rgba(51, 65, 85, 0.5)',
        textStyle: { color: '#f8fafc' },
        formatter: (params: any) => {
          const point = params?.[0];
          if (!point) return "";
          const bucket = buckets[point.dataIndex];
          if (!bucket) return "";
          const title = recency.group === "day" ? `${bucket.value} день` : bucket.label;
          return `
            <div style="font-weight: 600; margin-bottom: 4px">${title}</div>
            <div style="display: flex; align-items: center; gap: 8px">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: #6366f1"></div>
              <span style="opacity: 0.8">Клиентов:</span>
              <span style="font-weight: 500">${bucket.customers.toLocaleString("ru-RU")}</span>
            </div>
          `;
        },
        axisPointer: { type: "line", lineStyle: { color: '#6366f1', type: 'dashed' } },
      },
      grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { type: 'dashed', color: 'rgba(148, 163, 184, 0.15)' } },
        axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (value: number) => Math.round(value).toLocaleString("ru-RU") },
      },
      series: [
        {
          type: "line",
          smooth: true,
          showSymbol: false,
          symbolSize: 8,
          data: values,
          lineStyle: { width: 3, color: "#6366f1" },
          itemStyle: { color: "#6366f1", borderWidth: 2, borderColor: '#fff' },
          areaStyle: { 
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99, 102, 241, 0.4)' },
                { offset: 1, color: 'rgba(99, 102, 241, 0.0)' }
              ]
            }
          },
        },
      ],
    } as const;
  }, [recency]);

  const createBarChartOption = React.useCallback((
    data: any[], 
    labels: string[], 
    options: {
      xLabelRotate?: number;
      xLabelInterval?: number | 'auto';
      xLabelFormatter?: (value: string, index: number) => string;
      gridOverrides?: Partial<{ left: number; right: number; top: number; bottom: number; containLabel: boolean }>;
    } = {}
  ) => {
    const { 
      xLabelRotate = 0, 
      xLabelInterval = 'auto',
      xLabelFormatter,
      gridOverrides = {}
    } = options;

    const baseGrid = { left: 12, right: 12, top: 12, bottom: 26, containLabel: true };

    const avgCheck = data.map((row) => row.averageCheck);
    const orders = data.map((row) => row.orders);
    const revenue = data.map((row) => row.revenue);
    
    const maxAvgCheck = Math.max(1, ...avgCheck);
    const maxOrders = Math.max(1, ...orders);
    const maxRevenue = Math.max(1, ...revenue);
    
    const normalize = (values: number[], max: number) =>
      values.map((value) => ({ value: max > 0 ? value / max : 0, real: value }));

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(51, 65, 85, 0.5)',
        textStyle: { color: '#f8fafc' },
        axisPointer: { type: "shadow" },
        formatter: (params: any[]) => {
          const index = params?.[0]?.dataIndex ?? 0;
          const point = data[index];
          if(!point) return "";
          const label = labels[index];
          return `
            <div style="font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px">${label}</div>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px">
              <div style="display: flex; justify-content: space-between; gap: 16px">
                <span style="color: #38bdf8">● Средний чек</span>
                <span style="font-weight: 500">${toCurrency(point.averageCheck)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px">
                <span style="color: #22c55e">● Продажи</span>
                <span style="font-weight: 500">${toNumber(point.orders)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px">
                <span style="color: #f97316">● Выручка</span>
                <span style="font-weight: 500">${toCurrency(point.revenue)}</span>
              </div>
            </div>
          `;
        },
      },
      grid: { ...baseGrid, ...gridOverrides },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { 
          color: '#94a3b8', 
          fontSize: 11, 
          interval: xLabelInterval,
          rotate: xLabelRotate,
          formatter: xLabelFormatter,
          margin: 12,
        },
      },
      yAxis: [
        { show: false, min: 0, max: 1 },
        { show: false, min: 0, max: 1 },
        { show: false, min: 0, max: 1 }
      ],
      series: [
        {
          name: "Средний чек",
          type: "bar",
          data: normalize(avgCheck, maxAvgCheck),
          barWidth: "20%",
          itemStyle: { color: "#38bdf8", borderRadius: [4, 4, 0, 0] },
          yAxisIndex: 0,
        },
        {
          name: "Количество продаж",
          type: "bar",
          data: normalize(orders, maxOrders),
          barWidth: "20%",
          itemStyle: { color: "#22c55e", borderRadius: [4, 4, 0, 0] },
          barGap: '30%',
          yAxisIndex: 1,
        },
        {
          name: "Выручка",
          type: "bar",
          data: normalize(revenue, maxRevenue),
          barWidth: "20%",
          itemStyle: { color: "#f97316", borderRadius: [4, 4, 0, 0] },
          yAxisIndex: 2,
        },
      ],
    } as const;
  }, []);

  const dayOfWeekOption = React.useMemo(() => {
    if (!activity) return null;
    const dayData = weekDayLabels.map((_, idx) => activity.dayOfWeek.find((item) => item.day === idx + 1) ?? { day: idx + 1, orders: 0, customers: 0, revenue: 0, averageCheck: 0 });
    return createBarChartOption(dayData, weekDayLabels);
  }, [activity, createBarChartOption]);

  const hoursOption = React.useMemo(() => {
    if (!activity) return null;
    const hourData = hourLabels.map((_, idx) => activity.hours.find((item) => item.hour === idx) ?? { hour: idx, orders: 0, customers: 0, revenue: 0, averageCheck: 0 });
    // Show every вторую подпись, чтобы избежать наложения на узких экранах
    return createBarChartOption(hourData, hourLabels, { 
      xLabelInterval: 0,
      xLabelFormatter: (_label, idx) => (idx % 2 === 0 ? hourLabels[idx] ?? "" : ""),
      gridOverrides: { bottom: 36 }
    });
  }, [activity, createBarChartOption]);

  // Heatmap Data
  const heatmapMatrix = React.useMemo(() => {
    if (!activity) return null;
    const map = new Map<string, HeatmapCell>();
    for (const cell of activity.heatmap) {
      map.set(`${cell.day}:${cell.hour}`, cell);
    }
    return weekDayShortLabels.map((_, dayIdx) => {
      return hourLabels.map((_, hourIdx) => {
        const item = map.get(`${dayIdx + 1}:${hourIdx}`);
        return item || { day: dayIdx + 1, hour: hourIdx, orders: 0, averageCheck: 0, revenue: 0 } as HeatmapCell;
      });
    });
  }, [activity]);

  const heatmapMaxOrders = React.useMemo(() => {
    if (!heatmapMatrix) return 1;
    return Math.max(1, ...heatmapMatrix.flat().map((cell) => cell.orders ?? 0));
  }, [heatmapMatrix]);

  const renderHeatmap = () => {
    if (activityLoading) return <HeatmapSkeleton />;
    if (!heatmapMatrix) return <div className="h-40 flex items-center justify-center text-muted">Нет данных</div>;
    
    return (
      <div className="time-heatmap-wrapper pb-4">
        <div className="time-heatmap">
          <div className="time-heatmap-grid">
            <div className="time-heatmap-corner text-xs text-secondary">День/час</div>
            {hourLabels.map((label, i) => (
              <div key={label} className="time-heatmap-hour">
                <span className={i % 2 === 0 ? "" : "muted"}>{label.replace(":00", "")}</span>
              </div>
            ))}

            {heatmapMatrix.map((row, dayIdx) => (
              <React.Fragment key={dayIdx}>
                <div className="time-heatmap-day">
                  <span className="time-heatmap-day-short">{weekDayShortLabels[dayIdx]}</span>
                  <span className="time-heatmap-day-long">{weekDayFullLabels[dayIdx]}</span>
                </div>
                {row.map((cell, hourIdx) => {
                  const hasOrders = (cell.orders || 0) > 0;
                  const intensity = hasOrders ? Math.min(1, (cell.orders || 0) / heatmapMaxOrders) : 0;
                  const baseOpacity = hasOrders ? 0.25 + intensity * 0.55 : 0.07;
                  const bg = hasOrders
                    ? `linear-gradient(135deg, rgba(99,102,241,${baseOpacity}) 0%, rgba(14,165,233,${baseOpacity * 0.9}) 100%)`
                    : "var(--bg-elevated)";
                  const borderColor = hasOrders
                    ? `rgba(99, 102, 241, ${0.2 + intensity * 0.4})`
                    : "var(--border-default)";
                  const shadow = hasOrders
                    ? `0 10px 22px -14px rgba(99,102,241,${0.8 * intensity})`
                    : "inset 0 0 0 1px var(--border-subtle)";

                  return (
                    <div
                      key={hourIdx}
                      className="time-heatmap-cell group"
                      style={{ background: bg, borderColor, boxShadow: shadow }}
                    >
                      <span className="time-heatmap-cell-value">{hasOrders ? cell.orders : ""}</span>

                      <div className="time-heatmap-tooltip">
                        <div className="time-tooltip-title">
                          {weekDayFullLabels[dayIdx]}, {hourLabels[hourIdx]}
                        </div>
                        <div className="time-tooltip-row">
                          <span>Продажи</span>
                          <span>{cell.orders}</span>
                        </div>
                        <div className="time-tooltip-row">
                          <span>Выручка</span>
                          <span className="revenue">{toCurrency(cell.revenue)}</span>
                        </div>
                        <div className="time-tooltip-row">
                          <span>Ср. чек</span>
                          <span className="avg">{toCurrency(cell.averageCheck)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const recencyLimitConfig = recencyLimits[grouping];
  const sliderLabel = formatRecencyRange(grouping, limit);
  const sliderProgress = ((limit - recencyLimitConfig.min) / (recencyLimitConfig.max - recencyLimitConfig.min)) * 100;
  const hasRecencyData = Boolean(recencyOption);

  return (
    <div className="min-h-screen pb-20 animate-in time-analytics-page">
      {/* Page Header */}
      <header className="mb-10">
        <h1 className="text-3xl md:text-4xl font-extrabold text-primary tracking-tight mb-2">
          Временная аналитика
        </h1>
        <p className="text-lg text-secondary max-w-2xl">
          Исследуйте активность клиентов во времени: от часов посещения до периодов удержания.
        </p>
      </header>

      <div className="space-y-8">
        
        {/* SECTION 1: RECENCY */}
        <section>
          <div className="glass-card p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-brand-subtle text-brand rounded-lg">
                    <Clock size={24} />
                  </div>
                  <h2 className="text-xl font-bold text-primary">
                    Время с последней покупки
                  </h2>
                </div>
                <p className="text-secondary text-sm max-w-md">
                  Сколько времени проходит между покупками и как распределяется база по давности визита.
                </p>
              </div>

              <div className="flex flex-col items-end gap-4">
                <ToggleGroup 
                  options={recencyGroupingOptions} 
                  value={grouping} 
                  onChange={setGrouping} 
                />
                <div className="text-right">
                  <div className="text-sm text-secondary">Всего клиентов в выборке</div>
                  <div className="text-2xl font-bold text-primary" style={{ overflow: 'hidden' }}>
                    {recencyLoading && !recency ? (
                      <Skeleton className="h-7 w-24 rounded-md" style={{ display: 'inline-block' }} />
                    ) : recency ? (
                      recency.totalCustomers.toLocaleString("ru-RU")
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              {recencyLoading && !hasRecencyData ? (
                <RecencyChartSkeleton />
              ) : recencyError ? (
                <div className="h-[360px] flex items-center justify-center rounded-2xl border border-destructive/40 bg-surface text-red-500">
                  {recencyError}
                </div>
              ) : hasRecencyData ? (
                <div className="h-[360px] rounded-2xl overflow-hidden border border-default/70 bg-surface">
                  <Chart option={recencyOption as any} height={360} />
                </div>
              ) : (
                <div className="h-[360px] rounded-2xl border border-default/70 bg-surface" />
              )}
            </div>

            {/* Enhanced Slider Section */}
            <div className="mt-8 time-slider-panel rounded-xl p-5 md:p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md">
                    <Filter size={16} />
                  </div>
                  <span className="font-bold text-primary">
                    Глубина анализа: <span className="text-brand text-lg ml-1">{sliderLabel}</span>
                  </span>
                </div>
                <div className="text-sm text-muted bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                  Максимум: {formatRecencyRange(grouping, recencyLimitConfig.max)}
                </div>
              </div>
              
              <div className="relative time-slider">
                <div className="time-slider-track">
                  <div 
                    className="time-slider-fill"
                    style={{ width: `${sliderProgress}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={recencyLimitConfig.min}
                  max={recencyLimitConfig.max}
                  step={recencyLimitConfig.step}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  onMouseUp={handleSliderCommit}
                  onTouchEnd={handleSliderCommit}
                  className="time-slider-input"
                />
              </div>
              <div className="flex justify-between text-xs text-muted mt-2 font-medium">
                 <span>{formatRecencyRange(grouping, recencyLimitConfig.min)}</span>
                 <span>{formatRecencyRange(grouping, recencyLimitConfig.max)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: ACTIVITY */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-subtle rounded-lg">
                <Activity size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-primary">Активность покупателей</h2>
                <p className="text-sm text-secondary">В какие дни и часы клиенты покупают чаще всего</p>
              </div>
            </div>
            <ToggleGroup 
              options={activityPeriods} 
              value={activityPeriod} 
              onChange={setActivityPeriod} 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Day of Week */}
            <div className="glass-card p-6 flex flex-col">
              <div className="mb-6">
                <h3 className="font-bold text-lg text-primary mb-1">По дням недели</h3>
                <p className="text-xs text-secondary">Сравнение среднего чека, продаж и выручки</p>
              </div>
              <div className="flex-1 min-h-[300px]">
                {activityLoading ? (
                  <ColumnChartSkeleton columns={7} />
                ) : activity ? (
                  <Chart option={dayOfWeekOption as any} height={300} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted rounded-xl border border-default/60">
                    Нет данных
                  </div>
                )}
              </div>
            </div>

            {/* Hours */}
            <div className="glass-card p-6 flex flex-col">
              <div className="mb-6">
                <h3 className="font-bold text-lg text-primary mb-1">По часам суток</h3>
                <p className="text-xs text-secondary">Распределение нагрузки в течение дня</p>
              </div>
              <div className="flex-1 min-h-[300px]">
                {activityLoading ? (
                  <ColumnChartSkeleton columns={24} />
                ) : activity ? (
                  <Chart option={hoursOption as any} height={300} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted rounded-xl border border-default/60">
                    Нет данных
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: HEATMAP */}
        <section>
          <div className="glass-card p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-violet-subtle rounded-lg">
                <TrendingUp size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-primary">Тепловая карта продаж</h2>
                <p className="text-sm text-secondary">Детальный взгляд на пересечение дней недели и часов</p>
              </div>
            </div>

            <div className="bg-surface rounded-2xl p-5 md:p-6 border border-default shadow-sm relative">
              {renderHeatmap()}
            </div>
            
            <div className="mt-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs text-muted leading-relaxed max-w-4xl">
                <Info size={16} className="shrink-0" />
                <p>Наведите на ячейку, чтобы увидеть детальную информацию по продажам, выручке и среднему чеку за этот час.</p>
              </div>
              
              </div>
          </div>
        </section>

      </div>
    </div>
  );
}
