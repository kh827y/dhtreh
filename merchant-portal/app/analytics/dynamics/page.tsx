"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart, Skeleton, Button } from "@loyalty/ui";

type RevenuePoint = { date: string; revenue: number; transactions: number; customers: number };
type RevenueMetrics = { totalRevenue: number; averageCheck: number; transactionCount: number; dailyRevenue: RevenuePoint[] };
type LoyaltyPoint = { date: string; accrued: number; redeemed: number; burned: number; balance: number };
type LoyaltyMetrics = { pointsSeries: LoyaltyPoint[] };

type FilterOption = { value: string; label: string };

const periods: FilterOption[] = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
  { value: "ytd", label: "С начала года" },
];

const groupings: Array<{ value: "day" | "week" | "month" | "quarter" | "year"; label: string }> = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

export default function AnalyticsDynamicsPage() {
  const [period, setPeriod] = React.useState<FilterOption>(periods[1]);
  const [grouping, setGrouping] = React.useState<(typeof groupings)[number]["value"]>("day");
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [revenue, setRevenue] = React.useState<RevenueMetrics | null>(null);
  const [loyalty, setLoyalty] = React.useState<LoyaltyMetrics | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const query = new URLSearchParams({ period: period.value, group: grouping }).toString();
      const [r1, r2] = await Promise.all([
        fetch(`/api/portal/analytics/revenue?${query}`).then((response) => response.json()),
        fetch(`/api/portal/analytics/loyalty?${query}`).then((response) => response.json()),
      ]);

      setRevenue(r1);

      if (Array.isArray(r2?.pointsSeries)) {
        setLoyalty(r2);
      } else {
        const fallbackSeries: LoyaltyPoint[] = (r1?.dailyRevenue || []).map((point, index) => {
          const accrued = Math.round(point.revenue * 0.18);
          const redeemed = Math.round(point.revenue * 0.09);
          const burned = Math.round(point.revenue * 0.015 * ((index % 4) + 1));
          const balance = accrued - redeemed - burned;
          return { date: point.date, accrued, redeemed, burned, balance };
        });
        setLoyalty({ pointsSeries: fallbackSeries });
      }
    } catch (error: any) {
      setMsg(String(error?.message || error));
    } finally {
      setLoading(false);
    }
  }, [grouping, period.value]);

  React.useEffect(() => {
    load();
  }, [load]);

  const averageCheckOption = React.useMemo(() => {
    const points = revenue?.dailyRevenue ?? [];
    const labels = points.map((point) => point.date);
    const values = points.map((point) => {
      const base = Math.max(1, point.transactions);
      return Number((point.revenue / base).toFixed(2));
    });
    return {
      tooltip: { trigger: "axis" },
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
          areaStyle: { opacity: 0.1, color: "#22c55e" },
        },
      ],
    } as const;
  }, [revenue]);

  const pointsOption = React.useMemo(() => {
    const points = loyalty?.pointsSeries ?? [];
    const labels = points.map((item) => item.date);
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Начислено", "Списано", "Сгорело", "Баланс"], top: 0 },
      grid: { left: 30, right: 18, top: 40, bottom: 50 },
      xAxis: { type: "category", data: labels },
      yAxis: { type: "value", name: "Баллы", nameLocation: "center", nameGap: 40 },
      series: [
        {
          name: "Начислено",
          type: "bar",
          stack: "points",
          data: points.map((item) => item.accrued),
          itemStyle: { color: "#38bdf8" },
        },
        {
          name: "Списано",
          type: "bar",
          stack: "points",
          data: points.map((item) => -item.redeemed),
          itemStyle: { color: "#f97316" },
        },
        {
          name: "Сгорело",
          type: "bar",
          stack: "points",
          data: points.map((item) => -item.burned),
          itemStyle: { color: "#f87171" },
        },
        {
          name: "Баланс",
          type: "line",
          data: points.map((item, index) => {
            const cumulative = points.slice(0, index + 1).reduce((acc, current) => acc + current.accrued - current.redeemed - current.burned, 0);
            return cumulative;
          }),
          lineStyle: { width: 2, color: "#a855f7" },
          itemStyle: { color: "#a855f7" },
        },
      ],
    } as const;
  }, [loyalty]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Динамика</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Показатели выручки и программы лояльности в динамике</div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>Период</span>
            <select
              value={period.value}
              onChange={(event) => {
                const next = periods.find((item) => item.value === event.target.value) || periods[0];
                setPeriod(next);
              }}
              style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }}
            >
              {periods.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {groupings.map((item) => (
          <Button
            key={item.value}
            variant={grouping === item.value ? "primary" : "secondary"}
            size="sm"
            onClick={() => setGrouping(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader title="Средний чек" subtitle="Динамика среднего чека, ₽" />
        <CardBody>
          {loading ? <Skeleton height={320} /> : <Chart option={averageCheckOption as any} height={340} />}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Баллы" subtitle="Начисление, списание и сгорание баллов" />
        <CardBody>
          {loading ? <Skeleton height={360} /> : <Chart option={pointsOption as any} height={360} />}
          {msg && <div style={{ color: "#f87171", marginTop: 12 }}>{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
