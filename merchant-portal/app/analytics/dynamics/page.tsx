"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart, Skeleton, Button } from "@loyalty/ui";
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

export default function AnalyticsDynamicsPage() {
  const [preset, setPreset] = React.useState<PeriodPreset>("week");
  const [detail, setDetail] = React.useState<DetailGrouping>("day");
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
    if (preset === "yesterday" && detail !== "day") {
      setDetail("day");
    }
  }, [preset, detail]);

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
    loyaltyParams.set("group", detail);

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
  }, [preset, detail, customApplied]);

  const revenueGrouping: DetailGrouping = React.useMemo(() => {
    const grouping = revenue?.seriesGrouping;
    if (grouping === "week" || grouping === "month") return grouping;
    return "day";
  }, [revenue?.seriesGrouping]);

  const pointsGrouping: DetailGrouping = React.useMemo(() => {
    const grouping = loyalty?.pointsGrouping;
    if (grouping === "week" || grouping === "month") return grouping;
    return grouping === "day" ? "day" : detail;
  }, [loyalty?.pointsGrouping, detail]);

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

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Динамика</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Показатели выручки и программы лояльности в динамике</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>Все даты указаны по {timezone.label}</div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {presetOptions.map((option) => (
              <Button
                key={option.value}
                variant={preset === option.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => handlePresetChange(option.value)}
                disabled={loading && preset === option.value}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>Кастомный период</span>
            <input
              type="date"
              value={customDraft.from}
              onChange={(event) => setCustomDraft((prev) => ({ ...prev, from: event.target.value }))}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.35)",
                color: "#e2e8f0",
              }}
            />
            <input
              type="date"
              value={customDraft.to}
              onChange={(event) => setCustomDraft((prev) => ({ ...prev, to: event.target.value }))}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.35)",
                color: "#e2e8f0",
              }}
            />
            <Button
              variant={preset === "custom" ? "primary" : "secondary"}
              size="sm"
              onClick={applyCustomRange}
              disabled={loading || !customDraft.from || !customDraft.to}
            >
              Применить
            </Button>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader title="Средний чек" subtitle="Динамика среднего чека, ₽" />
        <CardBody>
          {loading && !revenue ? <Skeleton height={340} /> : <Chart option={averageCheckOption as any} height={340} />}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Баллы" subtitle="Начисление, списание, сгорание и баланс" />
        <CardBody>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {detailOptions.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={pointsGrouping === option.value ? "primary" : "secondary"}
                onClick={() => {
                  setDetail(option.value);
                  setMsg("");
                }}
                disabled={loading && detail === option.value}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {loading && !loyalty ? <Skeleton height={360} /> : <Chart option={pointsOption as any} height={360} />}
          {msg && (
            <div style={{ color: "#f87171", marginTop: 12 }}>
              {msg}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
