"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart, Skeleton } from "@loyalty/ui";

const periods = [
  { value: "7d", label: "Последние 7 дней" },
  { value: "30d", label: "Последние 30 дней" },
  { value: "90d", label: "Последние 90 дней" },
  { value: "ytd", label: "С начала года" },
];

const PERIOD_QUERY: Record<string, string> = {
  "7d": "week",
  "30d": "month",
  "90d": "quarter",
  ytd: "year",
};

type DailyPoint = {
  date: string;
  revenue: number;
  transactions: number;
  customers: number;
};

type DashboardResponse = {
  revenue?: {
    totalRevenue?: number;
    averageCheck?: number;
    transactionCount?: number;
    dailyRevenue?: DailyPoint[];
  };
  customers?: {
    totalCustomers?: number;
    newCustomers?: number;
    activeCustomers?: number;
    churnRate?: number;
    retentionRate?: number;
    averageVisitsPerCustomer?: number;
    customerLifetimeValue?: number;
  };
  loyalty?: {
    totalPointsIssued?: number;
    totalPointsRedeemed?: number;
    pointsRedemptionRate?: number;
    activeWallets?: number;
  };
};

function formatNumber(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatCurrency(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export default function AnalyticsDashboardPage() {
  const [period, setPeriod] = React.useState("30d");
  const [data, setData] = React.useState<DashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = PERIOD_QUERY[period] || "month";
      const res = await fetch(`/api/portal/analytics/dashboard?period=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as DashboardResponse;
      setData(json);
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось загрузить отчёт"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  React.useEffect(() => {
    load();
  }, [load]);

  const daily = React.useMemo(() => data?.revenue?.dailyRevenue ?? [], [data]);

  const chartOption = React.useMemo(() => {
    if (!daily.length) {
      return {
        grid: { left: 28, right: 18, top: 36, bottom: 48 },
        xAxis: { type: "category", data: [], axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } } },
        yAxis: { type: "value", axisLabel: { color: "#cbd5f5" } },
        series: [],
      } as const;
    }
    const labels = daily.map((point) => point.date.slice(5));
    const revenues = daily.map((point) => point.revenue);
    const transactions = daily.map((point) => point.transactions);
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Выручка", "Транзакции"], textStyle: { color: "#cbd5f5" } },
      grid: { left: 28, right: 18, top: 36, bottom: 48 },
      xAxis: {
        type: "category",
        data: labels,
        name: "Дни",
        nameLocation: "center",
        nameGap: 32,
        axisLabel: { color: "#cbd5f5" },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } },
      },
      yAxis: {
        type: "value",
        name: "Выручка",
        nameLocation: "center",
        nameGap: 44,
        axisLabel: { color: "#cbd5f5" },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
      },
      series: [
        {
          name: "Выручка",
          type: "line",
          smooth: true,
          symbol: "circle",
          lineStyle: { width: 2, color: "#38bdf8" },
          itemStyle: { color: "#38bdf8" },
          areaStyle: { opacity: 0.12, color: "#38bdf8" },
          data: revenues,
        },
        {
          name: "Транзакции",
          type: "bar",
          yAxisIndex: 0,
          itemStyle: { color: "rgba(148,163,184,0.55)" },
          data: transactions,
        },
      ],
    } as const;
  }, [daily]);

  const metrics = React.useMemo(() => {
    return [
      {
        title: "Выручка",
        value: formatCurrency(data?.revenue?.totalRevenue),
        description: "за выбранный период",
      },
      {
        title: "Средний чек",
        value: formatCurrency(data?.revenue?.averageCheck),
        description: "средняя сумма покупки",
      },
      {
        title: "Новые клиенты",
        value: formatNumber(data?.customers?.newCustomers),
        description: "зарегистрировались",
      },
      {
        title: "Активные клиенты",
        value: formatNumber(data?.customers?.activeCustomers),
        description: "совершили покупку",
      },
    ];
  }, [data]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Сводный отчёт</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Глобальная сводка ключевых показателей за выбранный период</div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <span style={{ opacity: 0.75 }}>Период</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }}
          >
            {periods.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardBody>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{metric.title}</div>
              <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>
                {loading ? <Skeleton height={28} /> : metric.value}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{metric.description}</div>
            </CardBody>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader title="Динамика показателей" subtitle="Выручка и число транзакций по дням" />
        <CardBody>
          {loading ? (
            <Skeleton height={360} />
          ) : daily.length ? (
            <Chart height={360} option={chartOption as any} />
          ) : (
            <div style={{ padding: 24, textAlign: "center", opacity: 0.7 }}>Нет данных за выбранный период</div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Дополнительные метрики" subtitle="Retenion, отток и показатели программы лояльности" />
        <CardBody>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <InfoBlock
              title="Удержание"
              value={loading ? "—" : formatPercent(data?.customers?.retentionRate)}
              description="Доля клиентов, вернувшихся за 30 дней"
            />
            <InfoBlock
              title="Отток"
              value={loading ? "—" : formatPercent(data?.customers?.churnRate)}
              description="Неактивные клиенты"
            />
            <InfoBlock
              title="Средние визиты"
              value={
                loading
                  ? "—"
                  : data?.customers?.averageVisitsPerCustomer !== undefined && data?.customers?.averageVisitsPerCustomer !== null
                    ? `${data.customers.averageVisitsPerCustomer.toFixed(1)} / клиент`
                    : "—"
              }
              description="Среднее число покупок"
            />
            <InfoBlock
              title="Активные кошельки"
              value={loading ? "—" : formatNumber(data?.loyalty?.activeWallets)}
              description="С ненулевым балансом"
            />
            <InfoBlock
              title="Начислено баллов"
              value={loading ? "—" : formatNumber(data?.loyalty?.totalPointsIssued)}
              description="За период"
            />
            <InfoBlock
              title="Доля погашения"
              value={loading ? "—" : formatPercent(data?.loyalty?.pointsRedemptionRate)}
              description="Redeem vs earn"
            />
          </div>
        </CardBody>
      </Card>

      {error ? (
        <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(248,113,113,0.4)", color: "#fecaca" }}>{error}</div>
      ) : null}
    </div>
  );
}

const InfoBlock: React.FC<{ title: string; value: string; description: string }> = ({ title, value, description }) => (
  <div
    style={{
      minWidth: 220,
      padding: "16px 20px",
      border: "1px solid rgba(148,163,184,0.25)",
      borderRadius: 16,
      background: "linear-gradient(140deg, rgba(15,23,42,0.34), rgba(15,23,42,0.08))",
      color: "#e2e8f0",
      display: "grid",
      gap: 8,
    }}
  >
    <div style={{ fontSize: 13, opacity: 0.75 }}>{title}</div>
    <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    <div style={{ fontSize: 12, opacity: 0.65 }}>{description}</div>
  </div>
);
