"use client";

import React from "react";
import { Button, Card, CardBody, CardHeader, Chart, Skeleton } from "@loyalty/ui";
import { buildChartOption, buildMetricCards, hasTimelineData, DashboardResponse } from "./summary-utils";

const quickRanges = [
  { label: "Вчера", value: "yesterday" },
  { label: "Неделя", value: "week" },
  { label: "Месяц", value: "month" },
  { label: "Квартал", value: "quarter" },
  { label: "Год", value: "year" },
] as const;

type QuickRange = (typeof quickRanges)[number];

export default function AnalyticsDashboardPage() {
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

  const chartOption = React.useMemo(() => buildChartOption(timeline), [timeline]);

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
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Сводный отчёт</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Продажи и клиенты за выбранный период. Возвраты и отмены не учитываются.
          </div>
        </div>
      </header>

      <Card>
        <CardBody style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: active ? "1px solid transparent" : "1px solid rgba(148,163,184,0.35)",
                    background: active ? "var(--brand-primary)" : "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "nowrap",
              marginLeft: "auto",
              minWidth: 340,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.6)",
                color: "#e2e8f0",
                minWidth: 260,
                flex: "0 1 360px",
              }}
            >
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
                  color: "inherit",
                  outline: "none",
                  fontSize: 14,
                  flex: 1,
                }}
              />
              <span style={{ opacity: 0.6 }}>—</span>
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
                  color: "inherit",
                  outline: "none",
                  fontSize: 14,
                  flex: 1,
                }}
              />
            </div>

            <Button
              onClick={applyCustomRange}
              disabled={!canApplyCustom || loading}
              style={{ height: 44, padding: "10px 14px", display: "inline-flex", alignItems: "center" }}
            >
              Применить даты
            </Button>
            {appliedCustom ? (
              <button
                type="button"
                onClick={resetCustomRange}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--brand-primary)",
                  cursor: "pointer",
                  padding: "6px 10px",
                }}
              >
                Сбросить даты
              </button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardBody>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{metric.title}</div>
              <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>
                {loading ? <Skeleton height={28} /> : metric.value}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{metric.description}</div>
            </CardBody>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader title="Динамика показателей" subtitle="Регистрации, количество продаж и сумма продаж по дням" />
        <CardBody>
          {loading ? (
            <Skeleton height={360} />
          ) : timelineHasData ? (
            <Chart height={360} option={chartOption as any} />
          ) : (
            <div style={{ padding: 24, textAlign: "center", opacity: 0.7 }}>Нет данных за выбранный период</div>
          )}
        </CardBody>
      </Card>

      {error ? (
        <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(248,113,113,0.4)", color: "#fecaca" }}>{error}</div>
      ) : null}
    </div>
  );
}
