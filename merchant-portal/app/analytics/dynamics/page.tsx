"use client";

import React from "react";
import { Card, CardBody, Chart, Skeleton } from "@loyalty/ui";
import { Sparkles, LineChart, Coins, Clock4, RefreshCw } from "lucide-react";
import { useTimezone } from "../../../components/TimezoneProvider";

type DetailGrouping = "day" | "week" | "month";
type PeriodPreset = "yesterday" | "week" | "month" | "quarter" | "year" | "custom";

const presetOptions: Array<{ value: Exclude<PeriodPreset, "custom">; label: string }> = [
  { value: "yesterday", label: "Вчера" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

const detailOptions: Array<{ value: DetailGrouping; label: string }> = [
  { value: "day", label: "По дням" },
  { value: "week", label: "По неделям" },
  { value: "month", label: "По месяцам" },
];

const detailLabels: Record<DetailGrouping, string> = {
  day: "по дням",
  week: "по неделям",
  month: "по месяцам",
};

type RevenuePoint = {
  date: string;
  revenue: number;
  transactions: number;
  customers: number;
  averageCheck: number;
};

type RevenueMetrics = {
  totalRevenue: number;
  averageCheck: number;
  transactionCount: number;
  revenueGrowth?: number;
  hourlyDistribution: Array<{ hour: number; revenue: number; transactions: number }>;
  dailyRevenue: RevenuePoint[];
  seriesGrouping?: DetailGrouping;
};

type LoyaltyPoint = {
  date: string;
  accrued: number;
  redeemed: number;
  burned: number;
  balance: number;
};

type LoyaltyMetrics = {
  pointsSeries: LoyaltyPoint[];
  pointsGrouping?: DetailGrouping;
};

function parseBucketDate(value: string) {
  const [y, m, d] = value.split("-").map((part) => Number(part));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function formatCurrency(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value || 0);
}

function formatNumber(value: number) {
  return Math.round(value || 0).toLocaleString("ru-RU");
}

type SegmentedProps = {
  value: DetailGrouping;
  onChange: (val: DetailGrouping) => void;
  disabledWhen?: (val: DetailGrouping) => boolean;
};

function SegmentedControl({ value, onChange, disabledWhen }: SegmentedProps) {
  return (
    <div className="dynamics-segmented">
      {detailOptions.map((option) => {
        const disabled = disabledWhen?.(option.value) ?? false;
        return (
          <button
            key={option.value}
            className={`dynamics-segment ${value === option.value ? "active" : ""}`}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const ChartSkeleton = () => (
  <div className="dynamics-chart-skeleton">
    <div className="dynamics-chart-skeleton__head">
      <Skeleton className="h-4 w-28 rounded-full" />
      <Skeleton className="h-4 w-16 rounded-full" />
    </div>
    <div className="dynamics-chart-skeleton__body">
      {Array.from({ length: 14 }).map((_, idx) => (
        <div key={idx} className="dynamics-chart-skeleton__bar" style={{ height: 40 + (idx % 5) * 18 }} />
      ))}
    </div>
    <div className="dynamics-chart-skeleton__foot">
      <Skeleton className="h-3 w-20 rounded-full" />
      <Skeleton className="h-3 w-16 rounded-full" />
      <Skeleton className="h-3 w-24 rounded-full" />
    </div>
  </div>
);

export default function AnalyticsDynamicsPage() {
  const [preset, setPreset] = React.useState<PeriodPreset>("week");
  const [pointsDetail, setPointsDetail] = React.useState<DetailGrouping>("day");
  const [checkDetail, setCheckDetail] = React.useState<DetailGrouping>("day");
  const [customDraft, setCustomDraft] = React.useState<{ from: string; to: string }>({ from: "", to: "" });
  const [customApplied, setCustomApplied] = React.useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [revenue, setRevenue] = React.useState<RevenueMetrics | null>(null);
  const [loyalty, setLoyalty] = React.useState<LoyaltyMetrics | null>(null);
  const timezone = useTimezone();

  const monthFormatter = React.useMemo(
    () => new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric", timeZone: timezone.iana }),
    [timezone],
  );
  const dayFormatter = React.useMemo(
    () => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: timezone.iana }),
    [timezone],
  );

  const formatBucketLabel = React.useCallback(
    (date: string, grouping: DetailGrouping) => {
      const parsed = parseBucketDate(date);
      if (!parsed || Number.isNaN(parsed.getTime())) return date;
      if (grouping === "month") {
        return monthFormatter.format(parsed);
      }
      if (grouping === "week") {
        const end = new Date(parsed.getTime() + 6 * 86400000);
        return `${dayFormatter.format(parsed)} – ${dayFormatter.format(end)}`;
      }
      return dayFormatter.format(parsed);
    },
    [monthFormatter, dayFormatter],
  );

  const handlePresetChange = React.useCallback((value: Exclude<PeriodPreset, "custom">) => {
    setPreset(value);
    setCustomApplied(null);
    setMsg("");
  }, []);

  const applyCustomRange = React.useCallback(() => {
    if (!customDraft.from || !customDraft.to) {
      setMsg("Укажите даты начала и окончания");
      return;
    }
    const fromDate = new Date(customDraft.from);
    const toDate = new Date(customDraft.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      setMsg("Некорректные даты");
      return;
    }
    if (fromDate.getTime() > toDate.getTime()) {
      setMsg("Дата начала не может быть позже даты окончания");
      return;
    }
    setCustomApplied({ from: customDraft.from, to: customDraft.to });
    setPreset("custom");
    setMsg("");
  }, [customDraft]);

  React.useEffect(() => {
    if (preset !== "yesterday") return;
    if (pointsDetail !== "day") setPointsDetail("day");
    if (checkDetail !== "day") setCheckDetail("day");
  }, [preset, pointsDetail, checkDetail]);

  React.useEffect(() => {
    if (preset === "custom" && !customApplied) {
      return;
    }
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setMsg("");

    const baseParams = new URLSearchParams();
    if (preset === "custom" && customApplied) {
      baseParams.set("from", customApplied.from);
      baseParams.set("to", customApplied.to);
    } else {
      baseParams.set("period", preset);
    }

    const revenueParams = new URLSearchParams(baseParams);
    const loyaltyParams = new URLSearchParams(baseParams);
    revenueParams.set("group", checkDetail);
    loyaltyParams.set("group", pointsDetail);

    Promise.all([
      fetch(`/api/portal/analytics/revenue?${revenueParams.toString()}`, { signal: controller.signal }),
      fetch(`/api/portal/analytics/loyalty?${loyaltyParams.toString()}`, { signal: controller.signal }),
    ])
      .then(async ([revenueRes, loyaltyRes]) => {
        const [revenueJson, loyaltyJson] = await Promise.all([
          revenueRes.json().catch(() => ({} as RevenueMetrics)),
          loyaltyRes.json().catch(() => ({} as LoyaltyMetrics)),
        ]);
        if (!revenueRes.ok) {
          throw new Error((revenueJson as any)?.message || "Не удалось загрузить данные выручки");
        }
        if (!loyaltyRes.ok) {
          throw new Error((loyaltyJson as any)?.message || "Не удалось загрузить данные по баллам");
        }
        return [revenueJson as RevenueMetrics, loyaltyJson as LoyaltyMetrics] as const;
      })
      .then(([revenueData, loyaltyData]) => {
        if (cancelled) return;
        setRevenue(revenueData);
        setLoyalty(loyaltyData);
      })
      .catch((error: any) => {
        if (cancelled || error?.name === "AbortError") return;
        setRevenue(null);
        setLoyalty(null);
        setMsg(String(error?.message || error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [preset, pointsDetail, checkDetail, customApplied]);

  const revenueGrouping: DetailGrouping = React.useMemo(() => {
    const grouping = revenue?.seriesGrouping;
    if (grouping === "week" || grouping === "month") return grouping;
    return checkDetail;
  }, [revenue?.seriesGrouping, checkDetail]);

  const pointsGrouping: DetailGrouping = React.useMemo(() => {
    const grouping = loyalty?.pointsGrouping;
    if (grouping === "week" || grouping === "month") return grouping;
    if (grouping === "day") return "day";
    return pointsDetail;
  }, [loyalty?.pointsGrouping, pointsDetail]);

  const averageCheckOption = React.useMemo(() => {
    const points = revenue?.dailyRevenue ?? [];
    if (!points.length) {
      return {
        grid: { left: 30, right: 18, top: 30, bottom: 44 },
        xAxis: { type: "category", data: [], boundaryGap: false },
        yAxis: { type: "value" },
        series: [],
      } as const;
    }
    const labels = points.map((point) => formatBucketLabel(point.date, revenueGrouping));
    const values = points.map((point) => Math.round(point.averageCheck * 100) / 100);
    return {
      tooltip: {
        trigger: "axis",
        valueFormatter: (val: number) =>
          `${Number(val || 0).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`,
      },
      grid: { left: 30, right: 18, top: 30, bottom: 44 },
      xAxis: { type: "category", data: labels, boundaryGap: false },
      yAxis: { type: "value", name: "₽", nameLocation: "end", nameGap: 14 },
      series: [
        {
          name: "Средний чек",
          type: "line",
          smooth: true,
          data: values,
          lineStyle: { width: 3, color: "#22c55e" },
          itemStyle: { color: "#22c55e" },
          areaStyle: { opacity: 0.12, color: "#22c55e" },
        },
      ],
    } as const;
  }, [revenue?.dailyRevenue, revenueGrouping]);

  const pointsOption = React.useMemo(() => {
    const series = loyalty?.pointsSeries ?? [];
    if (!series.length) {
      return {
        grid: { left: 30, right: 18, top: 40, bottom: 54 },
        xAxis: { type: "category", data: [] },
        yAxis: { type: "value" },
        series: [],
      } as const;
    }
    const labels = series.map((point) => formatBucketLabel(point.date, pointsGrouping));
    const accrued = series.map((point) => point.accrued);
    const redeemed = series.map((point) => -point.redeemed);
    const burned = series.map((point) => -point.burned);
    const balance = series.map((point) => point.balance);
    return {
      tooltip: {
        trigger: "axis",
        valueFormatter: (val: number) =>
          `${Math.abs(Number(val || 0)).toLocaleString("ru-RU")} б.`,
      },
      legend: { data: ["Начислено", "Списано", "Сгорело", "Баланс"], top: 0 },
      grid: { left: 30, right: 18, top: 40, bottom: 54 },
      xAxis: { type: "category", data: labels },
      yAxis: { type: "value", name: "Баллы", nameLocation: "end", nameGap: 32 },
      series: [
        {
          name: "Начислено",
          type: "bar",
          stack: "points",
          data: accrued,
          itemStyle: { color: "#38bdf8" },
        },
        {
          name: "Списано",
          type: "bar",
          stack: "points",
          data: redeemed,
          itemStyle: { color: "#f97316" },
        },
        {
          name: "Сгорело",
          type: "bar",
          stack: "points",
          data: burned,
          itemStyle: { color: "#f87171" },
        },
        {
          name: "Баланс",
          type: "line",
          smooth: true,
          data: balance,
          lineStyle: { width: 2, color: "#a855f7" },
          itemStyle: { color: "#a855f7" },
        },
      ],
    } as const;
  }, [loyalty?.pointsSeries, pointsGrouping]);

  const presetLabel = React.useMemo(() => {
    if (preset === "custom") return "Свой период";
    return presetOptions.find((item) => item.value === preset)?.label || "";
  }, [preset]);

  const pointsBalance = React.useMemo(() => {
    const series = loyalty?.pointsSeries;
    if (!series?.length) return null;
    const last = series[series.length - 1];
    return last?.balance ?? null;
  }, [loyalty?.pointsSeries]);

  const revenueGrowth = revenue?.revenueGrowth ?? null;

  return (
    <div className="dynamics-page animate-in">
      <section className="dynamics-hero">
        <div className="dynamics-hero-grid">
          <div className="dynamics-hero-intro">
            <div className="dynamics-eyebrow">
              <Sparkles size={16} />
              Pulse mode
            </div>
            <div className="dynamics-title-row">
              <h1 className="dynamics-title">Динамика</h1>
            </div>
            <p className="dynamics-subtitle">
              Динамика выручки, среднего чека и баллов программы лояльности. Видно, где бизнес ускоряется, а где
              теряет темп.
            </p>
            <div className="dynamics-pill-grid">
              <div className="dynamics-pill">
                <div className="pill-head">
                  <LineChart size={16} />
                  <span>Общая выручка</span>
                </div>
                {loading && !revenue ? (
                  <Skeleton className="h-6 w-32 rounded-md" />
                ) : (
                  <div className="pill-value">{formatCurrency(revenue?.totalRevenue || 0)}</div>
                )}
                <div className="pill-hint">за выбранный период ({presetLabel.toLowerCase()})</div>
              </div>
              <div className="dynamics-pill">
                <div className="pill-head">
                  <Coins size={16} />
                  <span>Средний чек</span>
                </div>
                {loading && !revenue ? (
                  <Skeleton className="h-6 w-28 rounded-md" />
                ) : (
                  <div className="pill-value">{formatCurrency(revenue?.averageCheck || 0, 0)}</div>
                )}
                <div className="pill-hint">как менялась корзина клиента</div>
              </div>
              <div className="dynamics-pill">
                <div className="pill-head">
                  <Clock4 size={16} />
                  <span>Транзакций</span>
                </div>
                {loading && !revenue ? (
                  <Skeleton className="h-6 w-24 rounded-md" />
                ) : (
                  <div className="pill-value">{formatNumber(revenue?.transactionCount || 0)}</div>
                )}
                <div className="pill-hint">все покупки клиентов</div>
              </div>
              <div className="dynamics-pill muted">
                <div className="pill-head">
                  <RefreshCw size={16} />
                  <span>Баланс баллов</span>
                </div>
                {loading && !loyalty ? (
                  <Skeleton className="h-6 w-24 rounded-md" />
                ) : (
                  <div className="pill-value">
                    {pointsBalance === null ? "—" : `${formatNumber(pointsBalance)} б.`}
                  </div>
                )}
                <div className="pill-hint">последнее значение за период</div>
              </div>
            </div>
          </div>

          <div className="dynamics-control-card">
            <div className="dynamics-control-head">
              <div>
                <div className="control-label">Быстрые отрезки</div>
                <div className="control-hint">Одним нажатием переключайтесь между периодами</div>
              </div>
              {loading && <div className="control-status">Обновляем данные…</div>}
            </div>
            <div className="dynamics-chip-row">
              {presetOptions.map((option) => (
                <button
                  key={option.value}
                  className={`dynamics-chip ${preset === option.value ? "active" : ""}`}
                  onClick={() => handlePresetChange(option.value)}
                  disabled={loading && preset === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="dynamics-control-head split">
              <div>
                <div className="control-label">Свой диапазон</div>
                <div className="control-hint">Глубокая выборка по нужным датам</div>
              </div>
            </div>
            <div className="dynamics-date-grid">
              <label className="dynamics-date-field">
                <span>С</span>
                <input
                  type="date"
                  value={customDraft.from}
                  onChange={(event) => setCustomDraft((prev) => ({ ...prev, from: event.target.value }))}
                  className="dynamics-date-input"
                />
              </label>
              <label className="dynamics-date-field">
                <span>По</span>
                <input
                  type="date"
                  value={customDraft.to}
                  onChange={(event) => setCustomDraft((prev) => ({ ...prev, to: event.target.value }))}
                  className="dynamics-date-input"
                />
              </label>
              <button
                className={`dynamics-apply ${preset === "custom" ? "active" : ""}`}
                onClick={applyCustomRange}
                disabled={loading || !customDraft.from || !customDraft.to}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      </section>

      {msg && <div className="dynamics-alert">{msg}</div>}

      <div className="dynamics-panels">
        <Card className="dynamics-card" hover>
          <CardBody className="dynamics-card-body">
            <div className="dynamics-card-head">
              <div className="dynamics-headline">
                <LineChart size={20} />
                <div>
                  <div className="title">Средний чек</div>
                  <div className="subtitle">Детализация и волатильность среднего чека</div>
                </div>
              </div>
              <SegmentedControl
                value={revenueGrouping}
                onChange={(val) => {
                  setCheckDetail(val);
                  setMsg("");
                }}
                disabledWhen={(val) => preset === "yesterday" && val !== "day"}
              />
            </div>
            <div className="dynamics-meta">
              <span className="meta-chip">Детализация {detailLabels[revenueGrouping]}</span>
              {typeof revenueGrowth === "number" && (
                <span className={`meta-chip ${revenueGrowth >= 0 ? "success" : "warning"}`}>
                  {revenueGrowth >= 0 ? "Рост" : "Падение"} {revenueGrowth > 0 ? "+" : ""}
                  {revenueGrowth.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%
                </span>
              )}
              <span className="meta-chip subtle">Период: {presetLabel.toLowerCase()}</span>
            </div>
            <div className="dynamics-chart-shell">
              {loading && !revenue ? (
                <ChartSkeleton />
              ) : (
                <Chart option={averageCheckOption as any} height={360} />
              )}
            </div>
          </CardBody>
        </Card>

        <Card className="dynamics-card" hover>
          <CardBody className="dynamics-card-body">
            <div className="dynamics-card-head">
              <div className="dynamics-headline">
                <Coins size={20} />
                <div>
                  <div className="title">Баллы программы лояльности</div>
                  <div className="subtitle">Начисление, списание, сгорание и баланс</div>
                </div>
              </div>
              <SegmentedControl
                value={pointsGrouping}
                onChange={(val) => {
                  setPointsDetail(val);
                  setMsg("");
                }}
                disabledWhen={(val) => preset === "yesterday" && val !== "day"}
              />
            </div>
            <div className="dynamics-meta">
              <span className="meta-chip">Группировка {detailLabels[pointsGrouping]}</span>
              <span className="meta-chip subtle">Баланс: {pointsBalance === null ? "—" : `${formatNumber(pointsBalance)} б.`}</span>
            </div>
            <div className="dynamics-chart-shell">
              {loading && !loyalty ? <ChartSkeleton /> : <Chart option={pointsOption as any} height={360} />}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
