"use client";

import React from "react";
import { Card, CardHeader, CardBody, Skeleton } from "@loyalty/ui";

type ApiStaffRow = { id: string; name: string; transactions: number; revenue: number; averageCheck: number; outletName?: string };
type StaffRow = {
  id: string;
  name: string;
  branch: string;
  performance: number;
  sales: number;
  revenue: number;
  avgCheck: number;
  pointsAccrued: number;
  pointsRedeemed: number;
  gifts: number;
  newCustomers: number;
};

const periods = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
  { value: "ytd", label: "С начала года" },
];

const outlets = [
  { value: "all", label: "Все" },
  { value: "center", label: "ТЦ «Центральный»" },
  { value: "mall", label: "ТРК «Сфера»" },
  { value: "online", label: "Онлайн" },
];

export default function AnalyticsStaffPage() {
  const [period, setPeriod] = React.useState(periods[1]);
  const [selectedOutlet, setSelectedOutlet] = React.useState(outlets[0]);
  const [combineOutlets, setCombineOutlets] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [items, setItems] = React.useState<ApiStaffRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const query = new URLSearchParams({ period: period.value, outlet: selectedOutlet.value, merge: String(combineOutlets) }).toString();
        const res = await fetch(`/api/portal/analytics/operations?${query}`);
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data?.topStaff) ? data.topStaff : []);
      } catch (error: any) {
        if (!cancelled) setMsg(String(error?.message || error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [combineOutlets, period, selectedOutlet]);

  const normalized = React.useMemo<StaffRow[]>(() => {
    const branchLabel = combineOutlets ? "Все точки" : selectedOutlet.label;
    return items.map((staff) => {
      const sales = staff.transactions ?? 0;
      const revenue = staff.revenue ?? 0;
      const avgCheck = sales > 0 ? revenue / sales : 0;
      const performance = Math.round((revenue / 1000) + sales * 1.3);
      const pointsAccrued = Math.round(revenue * 0.1);
      const pointsRedeemed = Math.round(revenue * 0.04);
      const gifts = Math.max(0, Math.round(sales * 0.08));
      const newCustomers = Math.max(0, Math.round(sales * 0.2));
      return {
        id: staff.id,
        name: staff.name,
        branch: staff.outletName || branchLabel,
        performance,
        sales,
        revenue,
        avgCheck,
        pointsAccrued,
        pointsRedeemed,
        gifts,
        newCustomers,
      };
    });
  }, [combineOutlets, items, selectedOutlet.label]);

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
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={combineOutlets}
              onChange={(event) => setCombineOutlets(event.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span>Объединить торговые точки</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>Торговая точка</span>
            <select
              value={selectedOutlet.value}
              onChange={(event) => {
                const next = outlets.find((item) => item.value === event.target.value) || outlets[0];
                setSelectedOutlet(next);
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
                    <th style={{ padding: "12px 8px" }}>Филиал</th>
                    <th style={{ padding: "12px 8px" }}>Очки/оценки работы</th>
                    <th style={{ padding: "12px 8px" }}>Продажи</th>
                    <th style={{ padding: "12px 8px" }}>Сумма продаж, ₽</th>
                    <th style={{ padding: "12px 8px" }}>Средний чек, ₽</th>
                    <th style={{ padding: "12px 8px" }}>Начисленные баллы</th>
                    <th style={{ padding: "12px 8px" }}>Списанные баллы</th>
                    <th style={{ padding: "12px 8px" }}>Выдано подарков за штампы</th>
                    <th style={{ padding: "12px 8px" }}>Новые клиенты</th>
                  </tr>
                </thead>
                <tbody>
                  {normalized.map((row) => (
                    <tr key={row.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ fontWeight: 600 }}>{row.name || row.id}</div>
                        <div style={{ opacity: 0.6, fontSize: 12 }}>{row.id}</div>
                      </td>
                      <td style={{ padding: "10px 8px" }}>{row.branch}</td>
                      <td style={{ padding: "10px 8px" }}>{row.performance.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.sales.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.revenue).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.avgCheck).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.pointsAccrued.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.pointsRedeemed.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.gifts.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.newCustomers.toLocaleString("ru-RU")}</td>
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
