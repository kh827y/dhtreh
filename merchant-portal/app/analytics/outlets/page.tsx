"use client";

import React from "react";
import { Card, CardHeader, CardBody, Skeleton, Button } from "@loyalty/ui";

type ApiOutletRow = {
  id: string;
  name: string;
  revenue: number;
  transactions: number;
  averageCheck: number;
  pointsIssued: number;
  pointsRedeemed: number;
  customers: number;
  newCustomers: number;
};

type OperationsResponse = {
  outletMetrics?: ApiOutletRow[];
};

type DateRange = { from: string; to: string };

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultRange(): DateRange {
  const today = new Date();
  const to = formatDateInput(today);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 29);
  const from = formatDateInput(fromDate);
  return { from, to };
}

export default function AnalyticsOutletsPage() {
  const initialRange = React.useMemo(() => getDefaultRange(), []);
  const [rangeDraft, setRangeDraft] = React.useState<DateRange>(initialRange);
  const [appliedRange, setAppliedRange] = React.useState<DateRange>(initialRange);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [items, setItems] = React.useState<ApiOutletRow[]>([]);

  const applyRange = React.useCallback(() => {
    if (!rangeDraft.from || !rangeDraft.to) {
      setMsg("Укажите даты начала и окончания");
      return;
    }
    const fromDate = new Date(rangeDraft.from);
    const toDate = new Date(rangeDraft.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      setMsg("Некорректные даты");
      return;
    }
    if (fromDate.getTime() > toDate.getTime()) {
      setMsg("Дата начала не может быть позже даты окончания");
      return;
    }
    setAppliedRange({ ...rangeDraft });
    setMsg("");
  }, [rangeDraft]);

  React.useEffect(() => {
    if (!appliedRange.from || !appliedRange.to) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setMsg("");
    const params = new URLSearchParams({ from: appliedRange.from, to: appliedRange.to });
    fetch(`/api/portal/analytics/operations?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as OperationsResponse | { message?: string };
        if (!res.ok) {
          throw new Error((data as any)?.message || "Не удалось загрузить аналитику по точкам");
        }
        return data as OperationsResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.outletMetrics) ? data.outletMetrics : []);
      })
      .catch((error: any) => {
        if (cancelled || error?.name === "AbortError") return;
        setMsg(String(error?.message || error));
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [appliedRange.from, appliedRange.to]);

  const totals = React.useMemo(() => {
    return items.reduce(
      (acc, row) => {
        acc.sales += row.transactions || 0;
        acc.revenue += row.revenue || 0;
        acc.pointsIssued += row.pointsIssued || 0;
        acc.pointsRedeemed += row.pointsRedeemed || 0;
        acc.buyers += row.customers || 0;
        acc.newCustomers += row.newCustomers || 0;
        return acc;
      },
      { sales: 0, revenue: 0, pointsIssued: 0, pointsRedeemed: 0, buyers: 0, newCustomers: 0 }
    );
  }, [items]);

  const totalAvgCheck = totals.sales > 0 ? totals.revenue / totals.sales : 0;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Активность торговых точек</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Эффективность точек продаж за выбранный период</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ opacity: 0.75 }}>С</span>
            <input
              type="date"
              value={rangeDraft.from}
              onChange={(event) => setRangeDraft((prev) => ({ ...prev, from: event.target.value }))}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.35)",
                color: "#e2e8f0",
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ opacity: 0.75 }}>По</span>
            <input
              type="date"
              value={rangeDraft.to}
              onChange={(event) => setRangeDraft((prev) => ({ ...prev, to: event.target.value }))}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.35)",
                color: "#e2e8f0",
              }}
            />
          </label>
          <Button
            variant="primary"
            size="sm"
            onClick={applyRange}
            disabled={loading || !rangeDraft.from || !rangeDraft.to}
          >
            Применить
          </Button>
        </div>
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
                  {items.map((row, index) => (
                    <tr key={row.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                      <td style={{ padding: "10px 8px" }}>{index + 1}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ fontWeight: 600 }}>{row.name || row.id}</div>
                        <div style={{ opacity: 0.6 }}>{row.id}</div>
                      </td>
                      <td style={{ padding: "10px 8px" }}>{(row.transactions || 0).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.revenue || 0).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.averageCheck || 0).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.pointsIssued || 0).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.pointsRedeemed || 0).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.customers || 0).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{row.newCustomers.toLocaleString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(148,163,184,0.25)", fontWeight: 600 }}>
                    <td style={{ padding: "12px 8px" }} colSpan={2}>ИТОГО</td>
                    <td style={{ padding: "12px 8px" }}>{totals.sales.toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{Math.round(totals.revenue).toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{items.length ? Math.round(totalAvgCheck).toLocaleString("ru-RU") : "—"}</td>
                    <td style={{ padding: "12px 8px" }}>{totals.pointsIssued.toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{totals.pointsRedeemed.toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{totals.buyers.toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>{totals.newCustomers.toLocaleString("ru-RU")}</td>
                  </tr>
                </tfoot>
              </table>
              {!items.length && <div style={{ marginTop: 12, opacity: 0.7 }}>Нет данных за выбранный период</div>}
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                ИТОГО: продажи — {totals.sales.toLocaleString("ru-RU")}, сумма продаж — {Math.round(totals.revenue).toLocaleString("ru-RU")} ₽,
                средний чек — {items.length ? Math.round(totalAvgCheck).toLocaleString("ru-RU") : "—"} ₽,
                покупатели — {totals.buyers.toLocaleString("ru-RU")}, новые клиенты — {totals.newCustomers.toLocaleString("ru-RU")}.
              </div>
              {msg && <div style={{ color: "#f87171", marginTop: 12 }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
