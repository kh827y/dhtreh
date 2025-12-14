"use client";

import React from "react";
import "./outlets.css";
import { Card, CardHeader, CardBody, Skeleton, Button } from "@loyalty/ui";
import { CalendarRange, Sparkles, Store, TrendingUp, Gauge, Users, ArrowUpRight, RefreshCw } from "lucide-react";

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

type QuickPreset = {
  id: string;
  label: string;
  days: number;
};

const quickPresets: QuickPreset[] = [
  { id: "7", label: "7 дней", days: 7 },
  { id: "30", label: "30 дней", days: 30 },
  { id: "90", label: "90 дней", days: 90 },
  { id: "365", label: "Год", days: 365 },
];

const numberFormatter = new Intl.NumberFormat("ru-RU");
const ratioFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const rangeFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" });

function safeNumber(value: number | null | undefined) {
  return typeof value === "number" && !Number.isNaN(value) ? value : 0;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildRangeByDays(days: number): DateRange {
  const today = new Date();
  const to = formatDateInput(today);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  const from = formatDateInput(fromDate);
  return { from, to };
}

function getDefaultRange(): DateRange {
  return buildRangeByDays(30);
}

function readableRange(range: DateRange) {
  const fromDate = new Date(range.from);
  const toDate = new Date(range.to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return "Диапазон не выбран";
  }
  return `${rangeFormatter.format(fromDate)} — ${rangeFormatter.format(toDate)}`;
}

function formatCurrency(amount: number) {
  return `${currencyFormatter.format(Math.round(amount))} ₽`;
}

function formatNumber(amount: number) {
  return numberFormatter.format(Math.round(amount));
}

function formatRatio(value: number) {
  return ratioFormatter.format(Math.round(value * 10) / 10);
}

function computeAverageCheck(row: ApiOutletRow) {
  if (typeof row.averageCheck === "number" && !Number.isNaN(row.averageCheck)) {
    return row.averageCheck;
  }
  const sales = safeNumber(row.transactions);
  return sales > 0 ? safeNumber(row.revenue) / sales : 0;
}

export default function AnalyticsOutletsPage() {
  const initialRange = React.useMemo(() => getDefaultRange(), []);
  const [rangeDraft, setRangeDraft] = React.useState<DateRange>(initialRange);
  const [appliedRange, setAppliedRange] = React.useState<DateRange>(initialRange);
  const [activePreset, setActivePreset] = React.useState<string>("30");
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [items, setItems] = React.useState<ApiOutletRow[]>([]);
  const [refreshTick, setRefreshTick] = React.useState(0);

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
    setActivePreset("custom");
    setMsg("");
  }, [rangeDraft]);

  const applyPreset = React.useCallback((preset: QuickPreset) => {
    const range = buildRangeByDays(preset.days);
    setRangeDraft(range);
    setAppliedRange(range);
    setActivePreset(preset.id);
    setMsg("");
  }, []);

  React.useEffect(() => {
    if (!appliedRange.from || !appliedRange.to) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setMsg("");
    const params = new URLSearchParams({ from: appliedRange.from, to: appliedRange.to, _r: String(refreshTick) });
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
  }, [appliedRange.from, appliedRange.to, refreshTick]);

  const totals = React.useMemo(() => {
    return items.reduce(
      (acc, row) => {
        acc.sales += safeNumber(row.transactions);
        acc.revenue += safeNumber(row.revenue);
        acc.pointsIssued += safeNumber(row.pointsIssued);
        acc.pointsRedeemed += safeNumber(row.pointsRedeemed);
        acc.buyers += safeNumber(row.customers);
        acc.newCustomers += safeNumber(row.newCustomers);
        return acc;
      },
      { sales: 0, revenue: 0, pointsIssued: 0, pointsRedeemed: 0, buyers: 0, newCustomers: 0 }
    );
  }, [items]);

  const totalAvgCheck = totals.sales > 0 ? totals.revenue / totals.sales : 0;
  const averagePerOutlet = items.length ? totals.revenue / items.length : 0;
  const newCustomersShare = totals.buyers > 0 ? (totals.newCustomers / totals.buyers) * 100 : 0;

  const leaders = React.useMemo(() => {
    if (!items.length) return null;
    const byRevenue = [...items].sort((a, b) => safeNumber(b.revenue) - safeNumber(a.revenue));
    const byNew = [...items].sort((a, b) => safeNumber(b.newCustomers) - safeNumber(a.newCustomers));
    const revenueLeader = byRevenue[0];
    if (!revenueLeader) return null;
    const revenueShare = totals.revenue > 0 ? (safeNumber(revenueLeader.revenue) / totals.revenue) * 100 : 0;
    return {
      revenue: revenueLeader,
      revenueShare,
      newCustomers: byNew[0],
    };
  }, [items, totals.revenue]);

  const metrics = React.useMemo(
    () => {
      const count = Math.max(1, items.length);
      const repeatRate = totals.buyers > 0 ? totals.sales / totals.buyers : 0;
      return [
      {
        key: "revenue",
        title: "Ø Выручка на точку",
        value: formatCurrency(totals.revenue / count),
        hint: `Общая: ${formatCurrency(totals.revenue)}`,
        icon: <TrendingUp size={18} />,
        accent: "primary",
      },
      {
        key: "sales",
        title: "Ø Продаж на точку",
        value: formatNumber(totals.sales / count),
        hint: `Всего: ${formatNumber(totals.sales)} чеков`,
        icon: <Store size={18} />,
        accent: "violet",
      },
      {
        key: "avg",
        title: "Средний чек",
        value: totals.sales ? formatCurrency(totalAvgCheck) : "—",
        hint: "По всей сети",
        icon: <Gauge size={18} />,
        accent: "blue",
      },
      {
        key: "repeat",
        title: "Покупок на клиента",
        value: totals.buyers > 0 ? formatRatio(repeatRate) : "—",
        hint: totals.buyers > 0 ? `Всего клиентов: ${formatNumber(totals.buyers)}` : "Нет данных по клиентам",
        icon: <Gauge size={18} />,
        accent: "amber",
      },
      {
        key: "customers",
        title: "Ø Клиентов на точку",
        value: formatNumber(totals.buyers / count),
        hint: `Новых: ${formatNumber(totals.newCustomers / count)} (avg)`,
        icon: <Users size={18} />,
        accent: "teal",
      },
    ]},
    [averagePerOutlet, newCustomersShare, totalAvgCheck, totals.buyers, totals.newCustomers, totals.pointsIssued, totals.pointsRedeemed, totals.revenue, totals.sales, items.length]
  );

  return (
    <div className="outlets-page">
      <section className="outlets-hero">
        <div className="outlets-hero__spark">
          <div className="pill pill-ghost"><Sparkles size={14} /> Отчёты по точкам</div>
          <div className="pill pill-ghost subtle">Готово к светлой и тёмной теме</div>
        </div>
        <div className="outlets-hero__content">
          <div className="outlets-hero__text">
            <h1>Активность торговых точек</h1>
            <p>Глубокая аналитика эффективности продаж и лояльности по каждому филиалу за выбранный период.</p>
            <div className="outlets-hero__meta">
              <div className="hero-meta-chip">
                <CalendarRange size={16} />
                <span>{readableRange(appliedRange)}</span>
              </div>
              <div className="hero-meta-chip ghost">
                <Store size={16} />
                <span>{loading ? "Загрузка точек…" : `${items.length} точек в отчёте`}</span>
              </div>
            </div>
          </div>
          <div className="outlets-hero__badge">
            {loading ? (
              <div className="hero-badge__skeleton">
                <Skeleton height={20} width={160} />
                <Skeleton height={32} width={200} />
              </div>
            ) : (
              <>
                <div className="hero-badge__label">Сейчас в фокусе</div>
                <div className="hero-badge__value">{formatCurrency(totals.revenue)}</div>
                <div className="hero-badge__hint">Выручка за период, средний чек {totals.sales ? formatCurrency(totalAvgCheck) : "—"}</div>
                <div className="hero-badge__trend">
                  <ArrowUpRight size={16} />
                  <span>Средний оборот на точку {items.length ? formatCurrency(averagePerOutlet) : "—"}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <Card className="outlets-card">
        <CardBody>
          <div className="filters-grid">
            <div className="filters-presets">
              <div className="filter-label">Быстрый период</div>
              <div className="preset-row">
                {quickPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`preset-btn ${activePreset === preset.id ? "active" : ""}`}
                    onClick={() => applyPreset(preset)}
                    disabled={loading}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filters-range">
              <div className="filter-label">Свои даты</div>
              <div className="range-controls">
                <label className="range-input">
                  <span>С</span>
                  <input
                    type="date"
                    value={rangeDraft.from}
                    onChange={(event) => {
                      setActivePreset("custom");
                      setRangeDraft((prev) => ({ ...prev, from: event.target.value }));
                    }}
                  />
                </label>
                <label className="range-input">
                  <span>По</span>
                  <input
                    type="date"
                    value={rangeDraft.to}
                    onChange={(event) => {
                      setActivePreset("custom");
                      setRangeDraft((prev) => ({ ...prev, to: event.target.value }));
                    }}
                  />
                </label>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={applyRange}
                  disabled={loading || !rangeDraft.from || !rangeDraft.to}
                  style={{ whiteSpace: "nowrap" }}
                >
                  Применить
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRefreshTick((tick) => tick + 1)}
                  disabled={loading}
                  style={{ gap: 6 }}
                >
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                  Обновить
                </Button>
              </div>
            </div>
          </div>
          {msg && <div className="inline-warning">{msg}</div>}
        </CardBody>
      </Card>

      <section className="metrics-grid">
        {loading
          ? Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="metric-card skeleton">
                <Skeleton height={16} width={120} />
                <Skeleton height={32} width={160} />
                <Skeleton height={12} width={140} />
              </div>
            ))
          : metrics.map((metric) => (
              <div key={metric.key} className={`metric-card accent-${metric.accent}`}>
                <div className="metric-icon">{metric.icon}</div>
                <div className="metric-title">{metric.title}</div>
                <div className="metric-value">{metric.value}</div>
                <div className="metric-hint">{metric.hint}</div>
              </div>
            ))}
      </section>

      <Card className="outlets-card">
        <CardHeader title="Сводка по точкам" subtitle="Лидеры, динамика и распределение объёмов" />
        <CardBody>
          <div className="outlets-highlight">
            <div className="highlight-block">
              <div className="highlight-title">Лидирует по выручке</div>
              {loading ? (
                <Skeleton height={18} width={200} />
              ) : leaders?.revenue ? (
                <div className="highlight-value">
                  <Store size={16} />
                  <div>
                    <div className="highlight-name">{leaders.revenue.name || leaders.revenue.id}</div>
                    <div className="highlight-sub">
                      {formatCurrency(safeNumber(leaders.revenue.revenue))} · {formatNumber(leaders.revenue.transactions)} продаж · {leaders.revenueShare.toFixed(0)}% оборота
                    </div>
                  </div>
                </div>
              ) : (
                <div className="highlight-empty">Нет данных</div>
              )}
            </div>
            <div className="highlight-block">
              <div className="highlight-title">Активнее всего привлекает новых</div>
              {loading ? (
                <Skeleton height={18} width={180} />
              ) : leaders?.newCustomers ? (
                <div className="highlight-value">
                  <Users size={16} />
                  <div>
                    <div className="highlight-name">{leaders.newCustomers.name || leaders.newCustomers.id}</div>
                    <div className="highlight-sub">{formatNumber(leaders.newCustomers.newCustomers)} новых клиентов за период</div>
                  </div>
                </div>
              ) : (
                <div className="highlight-empty">Нет данных</div>
              )}
            </div>
            <div className="highlight-block">
              <div className="highlight-title">Средний оборот точки</div>
              {loading ? <Skeleton height={18} width={120} /> : <div className="highlight-number">{items.length ? formatCurrency(averagePerOutlet) : "—"}</div>}
              <div className="highlight-sub muted">Основано на {items.length || 0} точках</div>
            </div>
          </div>

          {loading ? (
            <div className="table-skeleton">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="table-skeleton-row">
                  <Skeleton height={14} width={30} />
                  <Skeleton height={14} width={120} />
                  <Skeleton height={14} width={80} />
                  <Skeleton height={14} width={100} />
                  <Skeleton height={14} width={80} />
                  <Skeleton height={14} width={100} />
                  <Skeleton height={14} width={100} />
                  <Skeleton height={14} width={90} />
                  <Skeleton height={14} width={90} />
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="outlets-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Торговая точка</th>
                    <th>Продажи</th>
                    <th>Сумма продаж</th>
                    <th>Средний чек</th>
                    <th>Начисленные баллы</th>
                    <th>Списанные баллы</th>
                    <th>Покупателей</th>
                    <th>Новые клиенты</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, index) => {
                    const avgCheck = computeAverageCheck(row);
                    const share = totals.revenue > 0 ? (safeNumber(row.revenue) / totals.revenue) * 100 : 0;
                    const isLeader = leaders?.revenue?.id === row.id;
                    return (
                      <tr key={row.id} className={isLeader ? "leader" : ""}>
                        <td>{index + 1}</td>
                        <td>
                          <div className="cell-name">{row.name || row.id}</div>
                          <div className="cell-id">ID: {row.id}</div>
                        </td>
                        <td>{formatNumber(safeNumber(row.transactions))}</td>
                        <td>
                          <div className="cell-value">{formatCurrency(safeNumber(row.revenue))}</div>
                          {share > 0 && <div className="cell-sub">{share.toFixed(0)}% оборота</div>}
                        </td>
                        <td>{formatCurrency(avgCheck)}</td>
                        <td>{formatNumber(safeNumber(row.pointsIssued))}</td>
                        <td>{formatNumber(safeNumber(row.pointsRedeemed))}</td>
                        <td>{formatNumber(safeNumber(row.customers))}</td>
                        <td>{formatNumber(safeNumber(row.newCustomers))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>ИТОГО</td>
                    <td>{formatNumber(totals.sales)}</td>
                    <td>{formatCurrency(totals.revenue)}</td>
                    <td>{items.length ? formatCurrency(totalAvgCheck) : "—"}</td>
                    <td>{formatNumber(totals.pointsIssued)}</td>
                    <td>{formatNumber(totals.pointsRedeemed)}</td>
                    <td>{formatNumber(totals.buyers)}</td>
                    <td>{formatNumber(totals.newCustomers)}</td>
                  </tr>
                </tfoot>
              </table>
              {!items.length && (
                <div className="table-empty">
                  <div className="table-empty__title">Нет данных за выбранный период</div>
                  <div className="table-empty__text">Попробуйте другой диапазон или обновите фильтры</div>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
