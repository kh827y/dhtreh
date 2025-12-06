"use client";

import React from "react";
import { Button, Card, CardBody, CardHeader, Chart, Skeleton, StatCard } from "@loyalty/ui";
import { useTheme } from "../../components/ThemeProvider";
import { buildChartOption, buildMetricCards, hasTimelineData, DashboardResponse } from "./summary-utils";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  ShoppingCart,
  DollarSign,
  Calendar,
  RefreshCw,
} from "lucide-react";

const quickRanges = [
  { label: "Вчера", value: "yesterday" },
  { label: "Неделя", value: "week" },
  { label: "Месяц", value: "month" },
  { label: "Квартал", value: "quarter" },
  { label: "Год", value: "year" },
] as const;

type QuickRange = (typeof quickRanges)[number];

const metricIcons: Record<string, React.ReactNode> = {
  revenue: <DollarSign size={20} />,
  transactions: <ShoppingCart size={20} />,
  customers: <Users size={20} />,
  average: <BarChart3 size={20} />,
};

export default function AnalyticsDashboardPage() {
  const { theme } = useTheme();
  const [range, setRange] = React.useState<QuickRange>(quickRanges[2]);
  const [customRangeDraft, setCustomRangeDraft] = React.useState<{ from: string; to: string }>({ from: "", to: "" });
  const [appliedCustom, setAppliedCustom] = React.useState<{ from: string; to: string } | null>(null);
  const [data, setData] = React.useState<DashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (appliedCustom) {
        params.set("from", appliedCustom.from);
        params.set("to", appliedCustom.to);
      } else {
        params.set("period", range.value);
      }
      const qs = params.toString();
      const res = await fetch(`/api/portal/analytics/dashboard${qs ? `?${qs}` : ""}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось загрузить отчёт");
      }
      setData(json as DashboardResponse);
    } catch (err: any) {
      setError(String(err?.message || err || "Не удалось загрузить отчёт"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [appliedCustom, range.value]);

  React.useEffect(() => {
    load();
  }, [load]);

  const timeline = data?.timeline ?? [];
  const timelineHasData = hasTimelineData(timeline);

  const chartOption = React.useMemo(() => buildChartOption(timeline, theme), [timeline, theme]);

  const canApplyCustom =
    Boolean(customRangeDraft.from) &&
    Boolean(customRangeDraft.to) &&
    !Number.isNaN(new Date(customRangeDraft.from).getTime()) &&
    !Number.isNaN(new Date(customRangeDraft.to).getTime()) &&
    new Date(customRangeDraft.from).getTime() <= new Date(customRangeDraft.to).getTime();

  const applyCustomRange = React.useCallback(() => {
    if (!canApplyCustom) return;
    setAppliedCustom({ from: customRangeDraft.from, to: customRangeDraft.to });
  }, [canApplyCustom, customRangeDraft.from, customRangeDraft.to]);

  const resetCustomRange = React.useCallback(() => {
    setCustomRangeDraft({ from: "", to: "" });
    setAppliedCustom(null);
  }, []);

  const metrics = React.useMemo(() => buildMetricCards(data?.metrics), [data?.metrics]);

  return (
    <div className="animate-in" style={{ display: "grid", gap: 24 }}>
      {/* Page Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-lg)",
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.1))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--brand-primary-light)",
          }}>
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 style={{ 
              fontSize: 28, 
              fontWeight: 800, 
              margin: 0,
              letterSpacing: "-0.02em",
            }}>
              Сводный отчёт
            </h1>
            <p style={{ 
              fontSize: 14, 
              color: "var(--fg-muted)", 
              margin: "6px 0 0",
            }}>
              Продажи и клиенты за выбранный период
            </p>
          </div>
        </div>
        
        <div style={{ display: "flex", gap: 8 }}>
          <Button 
            variant="ghost" 
            onClick={load}
            disabled={loading}
            style={{ gap: 6 }}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Обновить
          </Button>
        </div>
      </header>

      {/* Filters Card */}
      <Card>
        <CardBody style={{ padding: 16 }}>
          <div style={{ 
            display: "flex", 
            gap: 16, 
            alignItems: "center", 
            flexWrap: "wrap",
            justifyContent: "space-between"
          }}>
            {/* Period Selector */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {quickRanges.map((item) => {
                const active = !appliedCustom && range.value === item.value;
                return (
                  <button
                    type="button"
                    key={item.value}
                    onClick={() => {
                      setRange(item);
                      setAppliedCustom(null);
                    }}
                    className={`quick-filter-btn ${active ? "active" : ""}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Range */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="date-range-wrapper">
                <Calendar size={16} style={{ color: "var(--fg-muted)" }} />
                <input
                  type="date"
                  value={customRangeDraft.from}
                  onChange={(event) =>
                    setCustomRangeDraft((prev) => ({
                      ...prev,
                      from: event.target.value,
                      to: prev.to && prev.to < event.target.value ? event.target.value : prev.to,
                    }))
                  }
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--fg)",
                    outline: "none",
                    fontSize: 13,
                    width: 110,
                  }}
                />
                <span style={{ color: "var(--fg-dim)" }}>→</span>
                <input
                  type="date"
                  value={customRangeDraft.to}
                  onChange={(event) =>
                    setCustomRangeDraft((prev) => ({
                      ...prev,
                      to: event.target.value,
                    }))
                  }
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--fg)",
                    outline: "none",
                    fontSize: 13,
                    width: 110,
                  }}
                />
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={applyCustomRange}
                disabled={!canApplyCustom || loading}
              >
                Применить
              </Button>
              
              {appliedCustom && (
                <button
                  type="button"
                  onClick={resetCustomRange}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--fg-muted)",
                    cursor: "pointer",
                    padding: "6px 10px",
                    fontSize: 13,
                  }}
                >
                  Сбросить
                </button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Stats Grid */}
      <section style={{ 
        display: "grid", 
        gap: 16, 
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" 
      }}>
        {metrics.map((metric, index) => (
          <StatCard
            key={metric.title}
            title={metric.title}
            value={loading ? "" : metric.value}
            subtitle={metric.description}
            icon={metricIcons[metric.key] || <BarChart3 size={20} />}
            loading={loading}
            className="animate-in"
            style={{ animationDelay: `${index * 0.1}s` }}
          />
        ))}
      </section>

      {/* Chart Card */}
      <Card className="animate-in" style={{ animationDelay: "0.3s" }}>
        <CardHeader 
          title="Динамика показателей"
          subtitle="Регистрации, количество продаж и сумма продаж по дням"
          icon={<TrendingUp size={20} />}
        />
        <CardBody style={{ padding: 0 }}>
          <div style={{ padding: "0 20px 20px" }}>
            {loading ? (
              <div style={{ padding: 20 }}>
                <Skeleton height={360} />
              </div>
            ) : timelineHasData ? (
              <Chart height={360} option={chartOption as any} />
            ) : (
              <div style={{ 
                padding: 64, 
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}>
                <div className="state-empty-icon">
                  <BarChart3 size={28} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    Нет данных
                  </div>
                  <div style={{ fontSize: 14, color: "var(--fg-muted)" }}>
                    За выбранный период данные отсутствуют
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Error Message */}
      {error && (
        <div style={{ 
          padding: 16, 
          borderRadius: "var(--radius-md)", 
          border: "1px solid rgba(239, 68, 68, 0.3)",
          background: "rgba(239, 68, 68, 0.1)",
          color: "var(--danger-light)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <TrendingDown size={20} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
