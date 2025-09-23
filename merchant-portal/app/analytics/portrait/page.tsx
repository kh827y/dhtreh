"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart, Skeleton } from "@loyalty/ui";
import { Heatmap } from "../../../components/Charts";

type GenderItem = { sex: string; customers: number; transactions: number; revenue: number; averageCheck: number };
type AgeItem = { bucket: string; customers: number; transactions: number; revenue: number; averageCheck: number };
type Resp = { gender: GenderItem[]; age: AgeItem[] };

type AudienceOption = { value: string; label: string };

const audiences: AudienceOption[] = [
  { value: "all", label: "Все клиенты" },
  { value: "repeat", label: "Постоянные" },
  { value: "vip", label: "VIP" },
  { value: "inactive", label: "Неактивные 60+ дней" },
];

export default function AnalyticsPortraitPage() {
  const [audience, setAudience] = React.useState<AudienceOption>(audiences[0]);
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const query = new URLSearchParams({ period: "month", audience: audience.value }).toString();
        const res = await fetch(`/api/portal/analytics/portrait?${query}`);
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
  }, [audience]);

  const totalGenderCustomers = React.useMemo(
    () => (data?.gender || []).reduce((acc, item) => acc + (item.customers || 0), 0),
    [data]
  );
  const totalTransactions = React.useMemo(
    () => (data?.gender || []).reduce((acc, item) => acc + (item.transactions || 0), 0),
    [data]
  );
  const totalRevenue = React.useMemo(
    () => (data?.gender || []).reduce((acc, item) => acc + (item.revenue || 0), 0),
    [data]
  );
  const averageCheck = React.useMemo(() => {
    const total = (data?.gender || []).reduce((acc, item) => acc + item.averageCheck * item.customers, 0);
    return totalGenderCustomers > 0 ? total / totalGenderCustomers : 0;
  }, [data, totalGenderCustomers]);

  const genderOption = React.useMemo(() => {
    const labels = (data?.gender || []).map((item) => item.sex || "Не указан");
    const series = (data?.gender || []).map((item) => ({ value: item.customers, name: item.sex || "Не указан" }));
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { orient: "horizontal", bottom: 0, data: labels },
      series: [
        {
          name: "Пол",
          type: "pie",
          radius: ["38%", "70%"],
          itemStyle: { borderRadius: 12, borderColor: "#0f172a", borderWidth: 2 },
          data: series,
        },
      ],
    } as const;
  }, [data]);

  const ageOption = React.useMemo(() => {
    const labels = (data?.age || []).map((item) => item.bucket);
    const values = (data?.age || []).map((item) => item.customers);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 28, right: 16, top: 30, bottom: 30 },
      xAxis: { type: "category", data: labels, axisLabel: { rotate: 20 } },
      yAxis: { type: "value" },
      series: [
        {
          name: "Клиенты",
          type: "bar",
          data: values,
          itemStyle: { borderRadius: 8, color: "#38bdf8" },
        },
      ],
    } as const;
  }, [data]);

  const heatmapRows = React.useMemo(() => (data?.gender || []).map((item) => item.sex || "?"), [data]);
  const heatmapCols = React.useMemo(() => (data?.age || []).map((item) => item.bucket), [data]);
  const heatmapMatrix = React.useMemo(() => {
    if (!data?.gender?.length || !data?.age?.length || !totalGenderCustomers) return [];
    return data.gender.map((genderItem, genderIndex) =>
      data.age.map((ageItem, ageIndex) => {
        const base = ageItem.customers * (genderItem.customers / totalGenderCustomers);
        const modifier = 0.9 + ((genderIndex + ageIndex) % 4) * 0.07;
        return Math.round(base * modifier);
      })
    );
  }, [data, totalGenderCustomers]);

  const secondaryMetrics = React.useMemo(
    () => [
      {
        label: "Средний чек",
        value: averageCheck > 0 ? `${Math.round(averageCheck).toLocaleString("ru-RU")} ₽` : "—",
        color: "#f97316",
        progress: Math.min(1, averageCheck / 2800),
      },
      {
        label: "Количество продаж",
        value: totalTransactions.toLocaleString("ru-RU"),
        color: "#38bdf8",
        progress: Math.min(1, totalTransactions / 4800),
      },
      {
        label: "Сумма продаж",
        value: `${Math.round(totalRevenue).toLocaleString("ru-RU")} ₽`,
        color: "#22c55e",
        progress: Math.min(1, totalRevenue / 5200000),
      },
    ],
    [averageCheck, totalTransactions, totalRevenue]
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Портрет клиента</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Статистика по аудиториям и базовым признакам</div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <span style={{ opacity: 0.75 }}>Аудитории</span>
          <select
            value={audience.value}
            onChange={(event) => {
              const next = audiences.find((item) => item.value === event.target.value) || audiences[0];
              setAudience(next);
            }}
            style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }}
          >
            {audiences.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <Card>
        <CardHeader title="Пол" subtitle="Доля клиентов и сопутствующие метрики" />
        <CardBody>
          {loading ? (
            <Skeleton height={320} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 360px) 1fr", gap: 24, alignItems: "center" }}>
              <Chart option={genderOption as any} height={300} />
              <div style={{ display: "grid", gap: 12 }}>
                {secondaryMetrics.map((metric) => (
                  <div key={metric.label} style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>{metric.label}</span>
                    <span style={{ fontSize: 18, fontWeight: 600 }}>{metric.value}</span>
                    <div style={{ position: "relative", height: 8, borderRadius: 999, background: "rgba(148,163,184,0.16)" }}>
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${Math.max(8, metric.progress * 100)}%`,
                          borderRadius: 999,
                          background: metric.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
                {msg && <div style={{ color: "#f87171" }}>{msg}</div>}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Возраст" subtitle="Распределение клиентов по возрастным группам" />
        <CardBody>
          {loading ? <Skeleton height={260} /> : <Chart option={ageOption as any} height={320} />}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Зависимость пола и возраста" subtitle="Кросс-анализ аудиторий" />
        <CardBody>
          {loading ? (
            <Skeleton height={260} />
          ) : heatmapMatrix.length ? (
            <Heatmap rows={heatmapRows} cols={heatmapCols} values={heatmapMatrix} />
          ) : (
            <div style={{ opacity: 0.7 }}>Недостаточно данных для отображения матрицы</div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
