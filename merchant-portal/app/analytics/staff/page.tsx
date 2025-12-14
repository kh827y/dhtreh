"use client";

import React from "react";
import "./staff.css";
import { Card, CardHeader, CardBody, Skeleton, Button, StatCard, Progress } from "@loyalty/ui";
import { CalendarRange, MapPin, Sparkles, Users, Star, Zap, TrendingUp } from "lucide-react";

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

type StaffSummary = {
  totalRevenue: number;
  totalTransactions: number;
  averageCheck: number;
  pointsIssued: number;
  pointsRedeemed: number;
  newCustomers: number;
  averagePerformance: number;
  averageRating?: number;
  topPerformer?: DisplayRow;
};

const numberFormatter = new Intl.NumberFormat("ru-RU");
const moneyFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" });

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRangeForDays(days: number): DateRange {
  const today = new Date();
  const to = formatDateInput(today);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  const from = formatDateInput(fromDate);
  return { from, to };
}

function formatDateLabel(input?: string) {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return shortDateFormatter.format(date);
}

function formatRangeLabel(range: DateRange) {
  const from = formatDateLabel(range.from);
  const to = formatDateLabel(range.to);
  if (!from || !to) return "Период не выбран";
  return `${from} — ${to}`;
}

const quickRanges = [
  { label: "7 дней", days: 7 },
  { label: "30 дней", days: 30 },
  { label: "90 дней", days: 90 },
  { label: "180 дней", days: 180 },
];

const initialsFromName = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "◎";

export default function AnalyticsStaffPage() {
  const initialRange = React.useMemo(() => getRangeForDays(30), []);
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
  const [activePreset, setActivePreset] = React.useState<number | null>(30);

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
    setActivePreset(null);
    setMsg("");
  }, [rangeDraft]);

  const applyPresetRange = React.useCallback((days: number) => {
    const nextRange = getRangeForDays(days);
    setRangeDraft(nextRange);
    setAppliedRange(nextRange);
    setActivePreset(days);
    setMsg("");
  }, []);

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

    const aggregated = new Map<string, DisplayRow & { ratingWeighted: number }>();
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

  const staffSummary = React.useMemo<StaffSummary>(() => {
    if (!staffRows.length) {
      return {
        totalRevenue: 0,
        totalTransactions: 0,
        averageCheck: 0,
        pointsIssued: 0,
        pointsRedeemed: 0,
        newCustomers: 0,
        averagePerformance: 0,
        averageRating: undefined,
        topPerformer: undefined,
      };
    }

    const totals = staffRows.reduce(
      (acc, row) => {
        acc.revenue += row.revenue;
        acc.transactions += row.transactions;
        acc.pointsIssued += row.pointsIssued;
        acc.pointsRedeemed += Math.abs(row.pointsRedeemed);
        acc.newCustomers += row.newCustomers;
        acc.performanceScore += row.performanceScore;
        if (typeof row.averageRating === "number" && typeof row.reviewsCount === "number") {
          const reviews = Math.max(0, row.reviewsCount);
          acc.ratingWeighted += row.averageRating * reviews;
          acc.reviews += reviews;
        }
        return acc;
      },
      { revenue: 0, transactions: 0, pointsIssued: 0, pointsRedeemed: 0, newCustomers: 0, performanceScore: 0, ratingWeighted: 0, reviews: 0 }
    );

    const averageCheck = totals.transactions > 0 ? totals.revenue / Math.max(1, totals.transactions) : 0;
    const averageRating = totals.reviews > 0 ? totals.ratingWeighted / totals.reviews : undefined;
    const averagePerformance = totals.performanceScore / staffRows.length;

    return {
      totalRevenue: totals.revenue,
      totalTransactions: totals.transactions,
      averageCheck,
      pointsIssued: totals.pointsIssued,
      pointsRedeemed: totals.pointsRedeemed,
      newCustomers: totals.newCustomers,
      averagePerformance,
      averageRating,
      topPerformer: staffRows[0],
    };
  }, [staffRows]);

  const daysInRange = React.useMemo(() => {
    if (!appliedRange.from || !appliedRange.to) return null;
    const fromDate = new Date(appliedRange.from);
    const toDate = new Date(appliedRange.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;
    const diff = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    return Math.max(1, diff);
  }, [appliedRange.from, appliedRange.to]);

  const acquisitionPerDay = React.useMemo(() => {
    if (!daysInRange) return null;
    return staffSummary.newCustomers / daysInRange;
  }, [daysInRange, staffSummary.newCustomers]);

  const maxRevenue = React.useMemo(
    () => staffRows.reduce((max, row) => Math.max(max, row.revenue), 0),
    [staffRows]
  );

  const rangeLabel = formatRangeLabel(appliedRange);

  return (
    <div className="staff-analytics-page">
      <section className="staff-hero animate-in">
        <div className="staff-hero__content">
          <div className="hero-eyebrow">Персонал · вовлеченность</div>
          <h1 className="hero-title">Активность сотрудников</h1>
          <p className="hero-description">
            Следите за вкладом команды в продажи и удержание клиентов. Страница объединяет финансы, бонусы и отзывы
            в одном потоке и показывает лидеров периода.
          </p>
          <div className="hero-chips">
            <span className="hero-chip">
              <CalendarRange size={16} />
              {rangeLabel}
            </span>
            <span className="hero-chip">
              <MapPin size={16} />
              {selectedOutletLabel}
            </span>
            <span className={`hero-chip ${combineOutlets ? "chip-active" : ""}`}>
              <TrendingUp size={16} />
              {combineOutlets ? "Объединённая статистика" : "По каждой точке"}
            </span>
          </div>
        </div>

        <div className="staff-hero__badges">
          <div className="hero-score glass-card">
            <div className="muted-label">Скорость привлечения</div>
            {loading ? (
              <Skeleton height={46} width="70%" />
            ) : (
              <div className="hero-score__value">
                {acquisitionPerDay != null
                  ? numberFormatter.format(Math.max(0, Math.round(acquisitionPerDay)))
                  : "—"}
                <span className="hero-score__suffix">нов./день</span>
              </div>
            )}
            <div className="muted-label">За выбранный период</div>
          </div>
          <div className="hero-highlight">
            <div className="muted-label">Лидер периода</div>
            {loading ? (
              <Skeleton height={38} />
            ) : staffSummary.topPerformer ? (
              <div className="hero-highlight__content">
                <div className="hero-highlight__name">{staffSummary.topPerformer.name}</div>
                <div className="hero-highlight__meta">
                  <Sparkles size={14} />
                  {moneyFormatter.format(Math.round(staffSummary.topPerformer.revenue))} ₽ ·{" "}
                  {numberFormatter.format(Math.round(staffSummary.topPerformer.transactions))} чеков
                </div>
              </div>
            ) : (
              <div className="hero-highlight__empty">Данных пока нет</div>
            )}
          </div>
        </div>
      </section>

      <Card className="staff-filters animate-in animate-in-delay-1">
        <CardHeader
          title="Фильтры периода"
          subtitle="Выберите даты, точку продаж и режим агрегации — интерфейс мгновенно перестроится."
          actions={
            <Button variant="secondary" size="sm" onClick={applyRange} disabled={loading || !rangeDraft.from || !rangeDraft.to}>
              Применить период
            </Button>
          }
        />
        <CardBody>
          <div className="filters-grid">
            <div className="filter-control filter-control--wide">
              <div className="control-label">Быстрый выбор</div>
              <div className="preset-chips">
                {quickRanges.map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    className={`preset-btn ${activePreset === preset.days ? "active" : ""}`}
                    onClick={() => applyPresetRange(preset.days)}
                    disabled={loading}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-control">
              <div className="control-label">С даты</div>
              <input
                type="date"
                className="control-input"
                value={rangeDraft.from}
                onChange={(event) => {
                  setActivePreset(null);
                  setRangeDraft((prev) => ({ ...prev, from: event.target.value }));
                }}
              />
            </div>

            <div className="filter-control">
              <div className="control-label">По дату</div>
              <input
                type="date"
                className="control-input"
                value={rangeDraft.to}
                onChange={(event) => {
                  setActivePreset(null);
                  setRangeDraft((prev) => ({ ...prev, to: event.target.value }));
                }}
              />
            </div>

            <div className="filter-control">
              <div className="control-label">Режим агрегации</div>
              <label className={`switch ${combineOutlets ? "checked" : ""}`}>
                <input
                  type="checkbox"
                  checked={combineOutlets}
                  onChange={(event) => setCombineOutlets(event.target.checked)}
                />
                <span className="switch-track">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">Объединить торговые точки</span>
              </label>
            </div>

            <div className="filter-control">
              <div className="control-label">Торговая точка</div>
              <select
                className="control-input"
                value={selectedOutlet}
                onChange={(event) => setSelectedOutlet(event.target.value)}
                disabled={outletsLoading}
              >
                {outletOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {outletsError && <div className="alert alert-error">{outletsError}</div>}
          {msg && !loading && <div className="alert alert-error">{msg}</div>}
        </CardBody>
      </Card>

      <div className="staff-metrics-grid animate-in animate-in-delay-2">
        <StatCard
          title="Ø Выручка на сотрудника"
          value={`${moneyFormatter.format(Math.round(staffRows.length ? staffSummary.totalRevenue / staffRows.length : 0))} ₽`}
          subtitle={`Всего: ${moneyFormatter.format(Math.round(staffSummary.totalRevenue))} ₽`}
          icon={<Zap size={18} />}
          loading={loading}
          className="metric-card metric-card--revenue"
        />
        <StatCard
          title="Ø Продаж на сотрудника"
          value={`${numberFormatter.format(Math.round(staffRows.length ? staffSummary.totalTransactions / staffRows.length : 0))}`}
          subtitle={`Всего чеков: ${numberFormatter.format(Math.round(staffSummary.totalTransactions))}`}
          icon={<Users size={18} />}
          loading={loading}
          className="metric-card metric-card--clients"
        />
        <StatCard
          title="Ø Новых клиентов на сотрудника"
          value={`${numberFormatter.format(Math.round(staffRows.length ? staffSummary.newCustomers / staffRows.length : 0))}`}
          subtitle={`Всего новых: ${numberFormatter.format(Math.round(staffSummary.newCustomers))}`}
          icon={<Sparkles size={18} />}
          loading={loading}
          className="metric-card metric-card--loyalty"
        />
        <StatCard
          title="Средняя оценка"
          value={
            staffSummary.averageRating
              ? `${staffSummary.averageRating.toFixed(2)} / 5`
              : staffRows.length
                ? "Нет оценок"
                : "—"
          }
          subtitle={`Перфоманс: ${numberFormatter.format(Math.round(staffSummary.averagePerformance || 0))} очков`}
          icon={<Star size={18} />}
          loading={loading}
          className="metric-card metric-card--feedback"
        />
      </div>

      <Card className="staff-table-card animate-in animate-in-delay-3">
        <CardHeader
          title="Команда и вклад в период"
          subtitle="Детализация по каждому сотруднику: продажи, бонусы, отзывы и новые клиенты."
        />
        <CardBody>
          <div className="table-meta">
            <span className="meta-pill">
              <Sparkles size={14} />
              {staffRows.length ? `${staffRows.length} сотрудников` : "Ожидаем данные"}
            </span>
            <span className="meta-pill">
              <CalendarRange size={14} />
              {rangeLabel}
            </span>
            <span className="meta-pill">
              <MapPin size={14} />
              {selectedOutletLabel}
            </span>
          </div>

          {loading ? (
            <div className="table-skeleton">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="table-skeleton__row">
                  <div className="skeleton skeleton-avatar" />
                  <div className="skeleton" style={{ height: 14, width: "28%" }} />
                  <div className="skeleton" style={{ height: 12, width: "18%" }} />
                  <div className="skeleton" style={{ height: 12, width: "16%" }} />
                  <div className="skeleton" style={{ height: 12, width: "14%" }} />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="table-scroll">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Филиал</th>
                      <th>Оценка работы</th>
                      <th>Продажи и чеки</th>
                      <th>Лояльность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffRows.map((row, index) => {
                      const share = maxRevenue > 0 ? (row.revenue / maxRevenue) * 100 : 0;
                      return (
                        <tr key={`${row.id}-${row.branch}`} className="staff-row">
                          <td>
                            <div className="staff-cell staff-cell__person">
                              <div className="staff-avatar">{initialsFromName(row.name || row.id)}</div>
                              <div className="staff-person">
                                <div className="staff-name">
                                  {row.name || row.id}
                                  {index === 0 && <span className="chip chip--gold">Лидер</span>}
                                </div>
                                <div className="staff-id">{row.id}</div>
                                <div className="staff-performance">
                                  <span className="score-pill">
                                    {numberFormatter.format(Math.round(row.performanceScore))} очков
                                  </span>
                                  {typeof row.averageRating === "number" && (
                                    <span className="rating-pill">
                                      <Star size={14} />
                                      {row.averageRating.toFixed(2)}
                                      {typeof row.reviewsCount === "number" && row.reviewsCount > 0 && (
                                        <span className="rating-muted">
                                          · {row.reviewsCount} отзывов
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="staff-cell">
                              <span className="branch-pill">{row.branch}</span>
                              <div className="muted-label">Точка продаж</div>
                            </div>
                          </td>

                          <td>
                            <div className="staff-cell">
                              <div className="kpi-block">
                                <div className="kpi-value">
                                  {typeof row.averageRating === "number" ? row.averageRating.toFixed(2) : "—"}
                                </div>
                                <div className="muted-label">Средняя оценка</div>
                              </div>
                              <div className="kpi-block">
                                <div className="kpi-value">{numberFormatter.format(Math.round(row.newCustomers))}</div>
                                <div className="muted-label">Новые клиенты</div>
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="staff-cell staff-cell__grid">
                              <div className="kpi-block">
                                <div className="kpi-label">Выручка</div>
                                <div className="kpi-value">{moneyFormatter.format(Math.round(row.revenue))} ₽</div>
                                <Progress value={row.revenue} max={Math.max(1, maxRevenue)} size="sm" />
                              </div>
                              <div className="kpi-block">
                                <div className="kpi-label">Чеки</div>
                                <div className="kpi-value">{numberFormatter.format(Math.round(row.transactions))}</div>
                                <div className="muted-label">Средний чек: {moneyFormatter.format(Math.round(row.averageCheck || 0))} ₽</div>
                              </div>
                              <div className="kpi-share">
                                <TrendingUp size={14} />
                                Вклад: {share.toFixed(1)}%
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="staff-cell staff-cell__grid">
                              <div className="kpi-block">
                                <div className="kpi-label">Начислено</div>
                                <div className="kpi-value">{numberFormatter.format(Math.round(row.pointsIssued))}</div>
                                <div className="muted-label">баллов</div>
                              </div>
                              <div className="kpi-block">
                                <div className="kpi-label">Списано</div>
                                <div className="kpi-value">{numberFormatter.format(Math.round(Math.abs(row.pointsRedeemed)))}</div>
                                <div className="muted-label">баллов</div>
                              </div>
                              <div className="kpi-block">
                                <div className="kpi-label">Новые</div>
                                <div className="kpi-value">{numberFormatter.format(Math.round(row.newCustomers))}</div>
                                <div className="muted-label">клиенты</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!staffRows.length && <div className="empty-state-compact">Нет данных за выбранный период</div>}
              {msg && <div className="alert alert-error">{msg}</div>}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
