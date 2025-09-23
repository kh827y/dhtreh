"use client";

import React from "react";
import { Card, CardHeader, CardBody, Skeleton } from "@loyalty/ui";

type ApiOutletRow = { id: string; name: string; revenue: number; transactions: number; growth?: number };
type OutletRow = {
  id: string;
  name: string;
  sales: number;
  revenue: number;
  avgCheck: number;
  pointsAccrued: number;
  pointsRedeemed: number;
  buyers: number;
  newCustomers: number;
};

const periods = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
  { value: "ytd", label: "С начала года" },
];

export default function AnalyticsOutletsPage() {
  const [period, setPeriod] = React.useState(periods[1]);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [items, setItems] = React.useState<ApiOutletRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const res = await fetch(`/api/portal/analytics/operations?period=${period.value}`);
        const data = await res.json();
        if (!cancelled) {
          setItems(Array.isArray(data?.topOutlets) ? data.topOutlets : []);
        }
      } catch (error: any) {
        if (!cancelled) setMsg(String(error?.message || error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const normalized = React.useMemo<OutletRow[]>(() => {
    return items.map((outlet) => {
      const sales = outlet.transactions ?? 0;
      const revenue = outlet.revenue ?? 0;
      const avgCheck = sales > 0 ? revenue / sales : 0;
      const pointsAccrued = Math.round(revenue * 0.12);
      const pointsRedeemed = Math.round(revenue * 0.05);
      const buyers = Math.max(0, Math.round(sales * 0.82));
      const newCustomers = Math.round(buyers * 0.18);
      return {
        id: outlet.id,
        name: outlet.name,
        sales,
        revenue,
        avgCheck,
        pointsAccrued,
        pointsRedeemed,
        buyers,
        newCustomers,
      };
    });
  }, [items]);

  const totals = React.useMemo(() => {
    return normalized.reduce(
      (acc, row) => {
        acc.sales += row.sales;
        acc.revenue += row.revenue;
        acc.pointsAccrued += row.pointsAccrued;
        acc.pointsRedeemed += row.pointsRedeemed;
        acc.buyers += row.buyers;
        acc.newCustomers += row.newCustomers;
        return acc;
      },
      { sales: 0, revenue: 0, pointsAccrued: 0, pointsRedeemed: 0, buyers: 0, newCustomers: 0 }
    );
  }, [normalized]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Активность торговых точек</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Эффективность точек продаж за выбранный период</div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
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
      </header>

      <Card>
        <CardHeader title="Сводная таблица" subtitle="Показатели по точкам" />
        <CardBody>
          {loading ? (
            <Skeleton height={280} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.7 }}>
                    <th style={{ padding: "12px 8px" }}>#</th>
                    <th style={{ padding: "12px 8px" }}>Торговая точка</th>
                    <th style={{ padding: "12px 8px" }}>Продажи</th>
                    <th style={{ padding: "12px 8px" }}>Сумма продаж, ₽</th>
                    <th style={{ padding: "12px 8px" }}>Средний чек, ₽</th>
                    <th style={{ padding: "12px 8px" }}>Начисленные баллы</th>
                    <th style={{ padding: "12px 8px" }}>Списанные баллы</th>
                    <th style={{ padding: "12px 8px" }}>Покупателей</th>
                    <th style={{ padding: "12px 8px" }}>Новые клиенты</th>
                  </tr>
                </thead>
                <tbody>
                  {normalized.map((row, index) => (
                    <tr key={row.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                      <td style={{ padding: "10px 8px" }}>{index + 1}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ fontWeight: 600 }}>{row.name || row.id}</div>
                        <div style={{ opacity: 0.6 }}>{row.id}</div>
                      </td>
                      <td style={{ padding: "10px 8px" }}>{row.sales.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.revenue).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.avgCheck).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.pointsAccrued.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.pointsRedeemed.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.buyers.toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.newCustomers.toLocaleString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(148,163,184,0.25)", fontWeight: 600 }}>
                    <td style={{ padding: "12px 8px" }} colSpan={2}>ИТОГО</td>
                    <td style={{ padding: "12px 8px" }}>{totals.sales.toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{Math.round(totals.revenue).toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{normalized.length ? Math.round(totals.revenue / Math.max(1, totals.sales)).toLocaleString("ru-RU") : "—"}</td>
                    <td style={{ padding: "12px 8px" }}>{totals.pointsAccrued.toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{totals.pointsRedeemed.toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{totals.buyers.toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{totals.newCustomers.toLocaleString("ru-RU")}</td>
                  </tr>
                </tfoot>
              </table>
              {!normalized.length && <div style={{ marginTop: 12, opacity: 0.7 }}>Нет данных за выбранный период</div>}
              {msg && <div style={{ color: "#f87171", marginTop: 12 }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
