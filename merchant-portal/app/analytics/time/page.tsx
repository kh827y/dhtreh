"use client";

import React from "react";
import { Card, CardHeader, CardBody } from "@loyalty/ui";
import { ColumnChart, Heatmap, LineChart } from "../../../components/Charts";

const periods = ["7 дней", "30 дней", "90 дней", "180 дней"];
const lastPurchaseWeeks = Array.from({ length: 12 }).map((_, idx) => `Неделя ${idx + 1}`);
const lastPurchaseValues = lastPurchaseWeeks.map((_, idx) => 140 - idx * 7 + (idx % 3) * 9);

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const hours = Array.from({ length: 24 }).map((_, idx) => `${idx}:00`);

const byWeekSeries = [
  {
    name: "Средний чек",
    color: "#f97316",
    values: weekDays.map((_, idx) => 680 + idx * 35 + (idx % 2 === 0 ? 40 : 0)),
  },
  {
    name: "Количество продаж",
    color: "#38bdf8",
    values: weekDays.map((_, idx) => 46 + Math.abs(3 - idx) * 9),
  },
  {
    name: "Сумма",
    color: "#22c55e",
    values: weekDays.map((_, idx) => 9200 + idx * 620 + (idx % 2 === 1 ? 540 : 0)),
  },
];

const byHourSeries = [
  {
    name: "Средний чек",
    color: "#f97316",
    values: hours.map((_, idx) => 580 + Math.round(120 * Math.abs(Math.sin(idx / 4)))),
  },
  {
    name: "Количество продаж",
    color: "#38bdf8",
    values: hours.map((_, idx) => {
      const base = idx >= 9 && idx <= 20 ? 64 : 18;
      return base + Math.round(22 * Math.abs(Math.cos(idx / 3.6)));
    }),
  },
  {
    name: "Сумма",
    color: "#22c55e",
    values: hours.map((_, idx) => 4200 + Math.round(1500 * Math.abs(Math.sin((idx + 1) / 3)))),
  },
];

const heatmapValues = weekDays.map((_, dayIdx) =>
  hours.map((_, hourIdx) => 12 + Math.round(86 * Math.abs(Math.sin((dayIdx + 1) * (hourIdx + 1) / 10))))
);

export default function TimeDistributionPage() {
  const [period, setPeriod] = React.useState("30 дней");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Распределение по времени</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Распределение активности клиентов во времени за выбранный период</div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <span style={{ opacity: 0.75 }}>Период</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }}
          >
            {periods.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </header>

      <Card>
        <CardHeader title="Время с последней покупки" subtitle="Распределение клиентов по неделям" />
        <CardBody>
          <LineChart labels={lastPurchaseWeeks} series={[{ name: "Доля клиентов", color: "#818cf8", values: lastPurchaseValues }]} height={220} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="По дням недели" subtitle="Сравнение среднего чека, количества и суммы" />
        <CardBody>
          <ColumnChart categories={weekDays} series={byWeekSeries} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="По часам" subtitle="Динамика внутри суток" />
        <CardBody>
          <ColumnChart categories={hours} series={byHourSeries} height={260} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Подробно по дням-часам" subtitle="Тепловая карта активности" />
        <CardBody>
          <Heatmap rows={weekDays} cols={hours} values={heatmapValues} />
        </CardBody>
      </Card>

      <footer style={{ display: "grid", gap: 12 }}>
        <label style={{ fontSize: 12, opacity: 0.7, display: "grid", gap: 4 }}>
          <span>Регулируйте видимый диапазон:</span>
          <input type="range" min={0} max={100} defaultValue={75} aria-label="Диапазон времени" />
        </label>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, opacity: 0.72 }}>
          <LegendItem color="#f97316" label="Средний чек" />
          <LegendItem color="#38bdf8" label="Количество продаж" />
          <LegendItem color="#22c55e" label="Сумма" />
        </div>
      </footer>
    </div>
  );
}

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 12, height: 12, borderRadius: 999, background: color }} />
    {label}
  </span>
);
