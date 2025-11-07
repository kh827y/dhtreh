"use client";

import React from "react";
import { Card, CardHeader, CardBody, Skeleton, Button } from "@loyalty/ui";

type ApiStaffRow = {
  id: string;
  name: string;
  outletId?: string | null;
  outletName?: string | null;
  transactions?: number;
  revenue?: number;
  averageCheck?: number;
  pointsIssued?: number;
  pointsRedeemed?: number;
  newCustomers?: number;
  performanceScore?: number;
  averageRating?: number | null;
  reviewsCount?: number;
};

type OperationsResponse = { staffMetrics?: ApiStaffRow[] };
type OutletOption = { value: string; label: string };
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

type DisplayRow = {
  id: string;
  name: string;
  branch: string;
  transactions: number;
  revenue: number;
  averageCheck: number;
  pointsIssued: number;
  pointsRedeemed: number;
  newCustomers: number;
  performanceScore: number;
  averageRating?: number;
  reviewsCount?: number;
};

export default function AnalyticsStaffPage() {
  const initialRange = React.useMemo(() => getDefaultRange(), []);
  const [rangeDraft, setRangeDraft] = React.useState<DateRange>(initialRange);
  const [appliedRange, setAppliedRange] = React.useState<DateRange>(initialRange);
  const [selectedOutlet, setSelectedOutlet] = React.useState<string>("all");
  const [combineOutlets, setCombineOutlets] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [items, setItems] = React.useState<ApiStaffRow[]>([]);
  const [outletOptions, setOutletOptions] = React.useState<OutletOption[]>([{ value: "all", label: "Все" }]);
  const [outletsLoading, setOutletsLoading] = React.useState(false);
  const [outletsError, setOutletsError] = React.useState("");

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
    let cancelled = false;
    setOutletsLoading(true);
    setOutletsError("");
    fetch("/api/portal/outlets?status=active")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as any)?.message || "Не удалось загрузить точки");
        }
        return data as { items?: Array<{ id: string; name: string }> };
      })
      .then((data) => {
        if (cancelled) return;
        const dynamic = Array.isArray(data.items)
          ? data.items
              .filter((o) => o && typeof o.id === "string")
              .map((o) => ({ value: o.id, label: o.name || o.id }))
          : [];
        setOutletOptions([{ value: "all", label: "Все" }, ...dynamic]);
      })
      .catch((error: any) => {
        if (!cancelled) setOutletsError(String(error?.message || error));
      })
      .finally(() => {
        if (!cancelled) setOutletsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (outletOptions.find((opt) => opt.value === selectedOutlet)) return;
    setSelectedOutlet("all");
  }, [outletOptions, selectedOutlet]);

  React.useEffect(() => {
    if (!appliedRange.from || !appliedRange.to) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setMsg("");
    const params = new URLSearchParams({ from: appliedRange.from, to: appliedRange.to });
    fetch(`/api/portal/analytics/operations?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as any)?.message || "Не удалось загрузить аналитику сотрудников");
        return data as OperationsResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.staffMetrics) ? data.staffMetrics : []);
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

  const selectedOutletLabel = React.useMemo(() => {
    if (selectedOutlet === "all") return "Все точки";
    return outletOptions.find((opt) => opt.value === selectedOutlet)?.label || "Выбранная точка";
  }, [selectedOutlet, outletOptions]);

  const staffRows = React.useMemo<DisplayRow[]>(() => {
    if (!items.length) return [];

    const formatRow = (row: ApiStaffRow, branch: string): DisplayRow => {
      const sales = Number(row.transactions ?? 0);
      const revenue = Number(row.revenue ?? 0);
      const avgCheck =
        typeof row.averageCheck === "number"
          ? row.averageCheck
          : sales > 0
            ? revenue / Math.max(1, sales)
            : 0;
      return {
        id: row.id,
        name: row.name || row.id,
        branch,
        transactions: sales,
        revenue,
        averageCheck: avgCheck,
        pointsIssued: Number(row.pointsIssued ?? 0),
        pointsRedeemed: Number(row.pointsRedeemed ?? 0),
        newCustomers: Number(row.newCustomers ?? 0),
        performanceScore: Number(row.performanceScore ?? 0),
        averageRating: typeof row.averageRating === "number" ? row.averageRating : undefined,
        reviewsCount: typeof row.reviewsCount === "number" ? Number(row.reviewsCount) : undefined,
      };
    };

    if (!combineOutlets) {
      const applyOutletFilter = selectedOutlet !== "all";
      const filtered = applyOutletFilter ? items.filter((row) => row.outletId === selectedOutlet) : items;
      return filtered
        .map((row) => formatRow(row, row.outletName || row.outletId || "—"))
        .sort((a, b) => {
          if (b.revenue === a.revenue) return b.performanceScore - a.performanceScore;
          return b.revenue - a.revenue;
        });
    }

    const aggregated = new Map<
      string,
      DisplayRow & { ratingWeighted: number }
    >();
    items.forEach((row) => {
      if (selectedOutlet !== "all" && row.outletId !== selectedOutlet) {
        return;
      }
      const key = row.id;
      if (!aggregated.has(key)) {
        aggregated.set(key, {
          id: row.id,
          name: row.name || row.id,
          branch: selectedOutletLabel,
          transactions: 0,
          revenue: 0,
          averageCheck: 0,
          pointsIssued: 0,
          pointsRedeemed: 0,
          newCustomers: 0,
          performanceScore: 0,
          averageRating: undefined,
          reviewsCount: 0,
          ratingWeighted: 0,
        });
      }
      const entry = aggregated.get(key)!;
      entry.transactions += Number(row.transactions ?? 0);
      entry.revenue += Number(row.revenue ?? 0);
      entry.pointsIssued += Number(row.pointsIssued ?? 0);
      entry.pointsRedeemed += Number(row.pointsRedeemed ?? 0);
      entry.newCustomers += Number(row.newCustomers ?? 0);
      entry.performanceScore += Number(row.performanceScore ?? 0);
      if (typeof row.averageRating === "number" && typeof row.reviewsCount === "number") {
        const reviews = Math.max(0, Number(row.reviewsCount));
        entry.ratingWeighted += row.averageRating * reviews;
        entry.reviewsCount = (entry.reviewsCount ?? 0) + reviews;
      }
    });

    return Array.from(aggregated.values())
      .map((entry) => {
        const avg = entry.transactions > 0 ? entry.revenue / Math.max(1, entry.transactions) : 0;
        const averageRating =
          entry.reviewsCount && entry.reviewsCount > 0 ? entry.ratingWeighted / entry.reviewsCount : undefined;
        return {
          id: entry.id,
          name: entry.name,
          branch: entry.branch,
          transactions: entry.transactions,
          revenue: entry.revenue,
          averageCheck: avg,
          pointsIssued: entry.pointsIssued,
          pointsRedeemed: entry.pointsRedeemed,
          newCustomers: entry.newCustomers,
          performanceScore: entry.performanceScore,
          averageRating,
          reviewsCount: entry.reviewsCount,
        };
      })
      .sort((a, b) => {
        if (b.revenue === a.revenue) return b.performanceScore - a.performanceScore;
        return b.revenue - a.revenue;
      });
  }, [items, combineOutlets, selectedOutlet, selectedOutletLabel]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Активность сотрудников</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Показатели персонала по продажам и вовлечённости</div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
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
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
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
              value={selectedOutlet}
              onChange={(event) => setSelectedOutlet(event.target.value)}
              disabled={outletsLoading}
              style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }}
            >
              {outletOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {outletsError && <div style={{ width: "100%", fontSize: 12, color: "#f87171" }}>{outletsError}</div>}
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
                    <th style={{ padding: "12px 8px" }}>Очки</th>
                    <th style={{ padding: "12px 8px" }}>Оценки работы</th>
                    <th style={{ padding: "12px 8px" }}>Продажи</th>
                    <th style={{ padding: "12px 8px" }}>Сумма продаж, ₽</th>
                    <th style={{ padding: "12px 8px" }}>Средний чек, ₽</th>
                    <th style={{ padding: "12px 8px" }}>Начисленные баллы</th>
                    <th style={{ padding: "12px 8px" }}>Списанные баллы</th>
                    <th style={{ padding: "12px 8px" }}>Новые клиенты</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((row) => (
                    <tr key={`${row.id}-${row.branch}`} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ fontWeight: 600 }}>{row.name || row.id}</div>
                        <div style={{ opacity: 0.6, fontSize: 12 }}>{row.id}</div>
                      </td>
                      <td style={{ padding: "10px 8px" }}>{row.branch}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.performanceScore).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>
                        {typeof row.averageRating === "number" ? `${row.averageRating.toFixed(2)} ⭐️` : "—"}
                      </td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.transactions).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.revenue).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.averageCheck).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.pointsIssued).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(Math.abs(row.pointsRedeemed)).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "10px 8px" }}>{Math.round(row.newCustomers).toLocaleString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!staffRows.length && <div style={{ marginTop: 12, opacity: 0.7 }}>Нет данных</div>}
              {msg && <div style={{ marginTop: 12, color: "#f87171" }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
