"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart, Skeleton } from "@loyalty/ui";

type HistogramPoint = { purchases: number; customers: number };
type Resp = { uniqueBuyers: number; newBuyers: number; repeatBuyers: number; histogram: HistogramPoint[] };

type FilterOption = { value: string; label: string };

const periods: FilterOption[] = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
  { value: "ytd", label: "С начала года" },
];

const outlets: FilterOption[] = [
  { value: "all", label: "Все торговые точки" },
  { value: "center", label: "ТЦ «Центральный»" },
  { value: "mall", label: "ТРК «Сфера»" },
  { value: "online", label: "Онлайн" },
];

export default function AnalyticsRepeatPage() {
  const [period, setPeriod] = React.useState<FilterOption>(periods[1]);
  const [outlet, setOutlet] = React.useState<FilterOption>(outlets[0]);
  const [hideNoise, setHideNoise] = React.useState(true);
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const query = new URLSearchParams({ period: period.value, outlet: outlet.value }).toString();
        const res = await fetch(`/api/portal/analytics/repeat?${query}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Ошибка загрузки");
        if (!cancelled) setData(json);
      } catch (error: any) {
        if (!cancelled) setMsg(String(error?.message || error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period, outlet]);

  const histogram = React.useMemo(() => {
    if (!data) return [] as HistogramPoint[];
    if (!hideNoise) return data.histogram;
    return data.histogram.filter((point) => point.customers >= 5);
  }, [data, hideNoise]);

  const option = React.useMemo(() => {
    const categories = histogram.map((point) => `${point.purchases}`);
    const values = histogram.map((point) => point.customers);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 28, right: 16, top: 30, bottom: 40 },
      xAxis: { type: "category", data: categories, name: "Покупок", nameLocation: "center", nameGap: 28 },
      yAxis: { type: "value", name: "Клиентов", nameLocation: "center", nameGap: 42 },
      series: [
        {
          name: "Клиентов",
          type: "bar",
          data: values,
          itemStyle: { borderRadius: 10, color: "#38bdf8" },
        },
      ],
    } as const;
  }, [histogram]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Повторные продажи</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Отслеживание уникальных, новых и повторных покупателей</div>
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
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>Торговая точка</span>
            <select
              value={outlet.value}
              onChange={(event) => {
                const next = outlets.find((item) => item.value === event.target.value) || outlets[0];
                setOutlet(next);
              }}
              style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }}
            >
              {outlets.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <StatCard title="Уникальных покупателей" value={data ? data.uniqueBuyers.toLocaleString("ru-RU") : "—"} />
        <StatCard title="Новых покупателей" value={data ? data.newBuyers.toLocaleString("ru-RU") : "—"} />
        <StatCard title="Повторных покупателей" value={data ? data.repeatBuyers.toLocaleString("ru-RU") : "—"} />
      </section>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={hideNoise}
            onChange={(event) => setHideNoise(event.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Скрывать статистически недостоверные данные</span>
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "rgba(148,163,184,0.25)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              cursor: "help",
            }}
            title="Скрывает данные, которые превышают статистическую погрешность в 1%."
          >
            ?
          </span>
        </label>
      </div>

      <Card>
        <CardHeader title="Покупок на покупателя" subtitle="Распределение числа покупок на одного клиента" />
        <CardBody>
          {loading ? <Skeleton height={320} /> : <Chart option={option as any} height={340} />}
          {msg && <div style={{ color: "#f87171", marginTop: 12 }}>{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}

const StatCard: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <Card>
    <CardBody>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </CardBody>
  </Card>
);
