"use client";

import React from "react";
import { Card, CardHeader, CardBody, Skeleton } from "@loyalty/ui";

type ApiStaffRow = { id: string; name: string; transactions: number; revenue: number; averageCheck: number };
type StaffRow = { id: string; name: string; sales: number; revenue: number; avgCheck: number };

const periods = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

export default function AnalyticsStaffPage() {
  const [period, setPeriod] = React.useState(periods[2]);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [items, setItems] = React.useState<ApiStaffRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const res = await fetch(`/api/portal/analytics/operations?period=${period.value}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || data?.error || "Не удалось получить данные");
        if (!cancelled) setItems(Array.isArray(data?.topStaff) ? data.topStaff : []);
      } catch (error: any) {
        if (!cancelled) {
          setItems([]);
          setMsg(String(error?.message || error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const normalized = React.useMemo<StaffRow[]>(() => {
    return items.map((staff) => {
      const sales = Number(staff.transactions ?? 0);
      const revenue = Number(staff.revenue ?? 0);
      const avgCheck = sales > 0 ? revenue / sales : 0;
      return {
        id: staff.id,
        name: staff.name,
        sales,
        revenue,
        avgCheck,
      };
    });
  }, [items]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Активность сотрудников</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Показатели персонала по продажам и вовлечённости</div>
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

      <Card>
        <CardHeader title="Сводная таблица" subtitle="Показатели сотрудников" />
        <CardBody>
          {loading ? (
            <Skeleton height={280} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.7 }}>
                    <th style={{ padding: "12px 8px" }}>Сотрудник</th>
                    <th style={{ padding: "12px 8px" }}>Продажи</th>
                    <th style={{ padding: "12px 8px" }}>Сумма продаж, ₽</th>
                    <th style={{ padding: "12px 8px" }}>Средний чек, ₽</th>
                  </tr>
                </thead>
                <tbody>
                  {normalized.map((row) => (
                    <tr key={row.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ fontWeight: 600 }}>{row.name || row.id}</div>
                        <div style={{ opacity: 0.6, fontSize: 12 }}>{row.id}</div>
                      </td>
                      <td style={{ padding: "10px 8px" }}>{row.sales.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.revenue).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.avgCheck).toLocaleString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!normalized.length && <div style={{ marginTop: 12, opacity: 0.7 }}>Нет данных</div>}
              {msg && <div style={{ marginTop: 12, color: "#f87171" }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
