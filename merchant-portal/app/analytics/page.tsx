"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart } from "@loyalty/ui";

const periods = [
  { value: "7d", label: "Последние 7 дней" },
  { value: "30d", label: "Последние 30 дней" },
  { value: "90d", label: "Последние 90 дней" },
  { value: "ytd", label: "С начала года" },
];

const labels = Array.from({ length: 21 }).map((_, idx) => `День ${idx + 1}`);
const registrations = [12, 18, 16, 22, 24, 26, 18, 17, 21, 24, 27, 29, 31, 28, 30, 34, 35, 38, 36, 33, 37];
const salesCount = [40, 42, 45, 46, 51, 54, 49, 52, 58, 63, 61, 65, 72, 68, 74, 78, 81, 79, 83, 86, 90];
const salesAmount = salesCount.map((value, idx) => Math.round(value * (520 + idx * 18)));

export default function AnalyticsDashboardPage() {
  const [period, setPeriod] = React.useState("30d");
  const [hasFrequency] = React.useState(true);

  const chartOption = React.useMemo(() => {
    const legend = ["Регистрации", "Количество продаж", "Сумма продаж"];
    return {
      tooltip: { trigger: "axis" },
      legend: { data: legend },
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
        name: "Метрики",
        nameLocation: "center",
        nameGap: 44,
        axisLabel: { color: "#cbd5f5" },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
      },
      series: [
        {
          name: "Регистрации",
          type: "line",
          smooth: true,
          symbol: "circle",
          lineStyle: { width: 2, color: "#22c55e" },
          itemStyle: { color: "#22c55e" },
          areaStyle: { opacity: 0.12, color: "#22c55e" },
          data: registrations,
        },
        {
          name: "Количество продаж",
          type: "line",
          smooth: true,
          symbol: "circle",
          lineStyle: { width: 2, color: "#38bdf8" },
          itemStyle: { color: "#38bdf8" },
          areaStyle: { opacity: 0.12, color: "#38bdf8" },
          data: salesCount,
        },
        {
          name: "Сумма продаж",
          type: "line",
          smooth: true,
          symbol: "circle",
          lineStyle: { width: 2, color: "#f97316" },
          itemStyle: { color: "#f97316" },
          areaStyle: { opacity: 0.12, color: "#f97316" },
          data: salesAmount,
        },
      ],
    } as const;
  }, []);

  const metrics = React.useMemo(
    () => [
      { title: "Регистрации", value: "432", description: "За выбранный период" },
      { title: "Продажи", value: "1 248", description: "Количество чеков" },
      { title: "Сумма продаж", value: "12 420 000 ₽", description: "Выручка за период" },
    ],
    []
  );

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
              <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>{metric.value}</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{metric.description}</div>
            </CardBody>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader title="Динамика показателей" subtitle="Регистрации, количество продаж и сумма по дням" />
        <CardBody>
          <Chart height={360} option={chartOption as any} />
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>Используйте ползунок, чтобы уточнить диапазон наблюдения</div>
          <input type="range" min={0} max={100} defaultValue={80} style={{ width: "100%", marginTop: 12 }} aria-label="Диапазон временного окна" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Бизнес-метрики" subtitle="Средние значения за всё время использования программы" />
        <CardBody>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <InfoBlock title="Средний чек" value="1 850 ₽" description="По всем операциям" />
            {hasFrequency ? (
              <InfoBlock title="Частота визитов" value="1.9" description="Для клиентов с ≥3 покупками" />
            ) : (
              <InfoBlock title="Частота визитов" value="—" description="Недостаточно данных для расчёта" />
            )}
          </div>
        </CardBody>
      </Card>

      <footer style={{ fontSize: 12, opacity: 0.6, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <span>Ось X — дни отчётного периода</span>
        <span>Ось Y — абсолютные значения</span>
        <span>Легенда отвечает за выделенную серию</span>
      </footer>
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
