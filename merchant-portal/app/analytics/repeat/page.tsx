"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart, Skeleton } from "@loyalty/ui";

type HistogramPoint = { purchases: number; customers: number };
type Resp = { uniqueBuyers: number; newBuyers: number; repeatBuyers: number; histogram: HistogramPoint[] };
type SelectOption = { value: string; label: string };
type HistogramBucket = HistogramPoint & { percent: number };

const periodOptions: SelectOption[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

const defaultOutletOption: SelectOption = { value: "all", label: "Все торговые точки" };

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(148,163,184,0.35)",
  color: "#e2e8f0",
};

const clampPercentValue = (value: string): number => {
  if (typeof value !== "string") return 0;
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(parsed, 100));
};

const formatPercentInput = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const formatPercentLabel = (value: number) => {
  if (!Number.isFinite(value)) return "0%";
  if (value >= 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
};

export default function AnalyticsRepeatPage() {
  const [periodValue, setPeriodValue] = React.useState(periodOptions[1]?.value ?? "month");
  const [outletOptions, setOutletOptions] = React.useState<SelectOption[]>([defaultOutletOption]);
  const [outletValue, setOutletValue] = React.useState(defaultOutletOption.value);
  const [outletsLoading, setOutletsLoading] = React.useState(true);
  const [outletsError, setOutletsError] = React.useState("");

  const [hideLowEnabled, setHideLowEnabled] = React.useState(true);
  const [hideLowPercent, setHideLowPercent] = React.useState("3");

  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");

  const handlePercentBlur = React.useCallback(() => {
    setHideLowPercent((current) => formatPercentInput(clampPercentValue(current)));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setOutletsLoading(true);
    setOutletsError("");

    fetch(`/api/portal/outlets?status=active`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const text = await res.text().catch(() => "");
        let payload: any = {};
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch (error) {
            console.error("Failed to parse outlets response", error);
          }
        }
        if (!res.ok) {
          const message =
            (payload && typeof payload === "object" && "message" in payload
              ? String(payload.message)
              : null) || "Не удалось загрузить торговые точки";
          throw new Error(message);
        }
        const itemsSource: any[] = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];
        const mapped = itemsSource
          .filter((item) => item && typeof item === "object" && typeof item.id === "string")
          .map((item) => ({
            value: item.id,
            label: (typeof item.name === "string" && item.name.trim().length > 0 ? item.name.trim() : item.id) as string,
          }));
        return mapped;
      })
      .then((mapped) => {
        if (cancelled) return;
        const withDefault = [defaultOutletOption, ...mapped];
        setOutletOptions(withDefault);
        setOutletValue((current) => {
          if (current === defaultOutletOption.value) return current;
          return withDefault.some((option) => option.value === current) ? current : defaultOutletOption.value;
        });
        setOutletsError("");
      })
      .catch((error: any) => {
        if (cancelled || error?.name === "AbortError") return;
        setOutletOptions([defaultOutletOption]);
        setOutletValue(defaultOutletOption.value);
        setOutletsError(String(error?.message || "Не удалось загрузить торговые точки"));
      })
      .finally(() => {
        if (!cancelled) setOutletsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setMsg("");

    const params = new URLSearchParams({ period: periodValue });
    if (outletValue && outletValue !== defaultOutletOption.value) {
      params.set("outletId", outletValue);
    }
    const query = params.toString();

    fetch(`/api/portal/analytics/repeat?${query}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const text = await res.text().catch(() => "");
        let payload: any = {};
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch (error) {
            console.error("Failed to parse repeat analytics response", error);
          }
        }
        if (!res.ok) {
          const message =
            (payload && typeof payload === "object" && "message" in payload
              ? String(payload.message)
              : null) || "Ошибка загрузки";
          throw new Error(message);
        }
        return payload as Resp;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((error: any) => {
        if (cancelled || error?.name === "AbortError") return;
        setMsg(String(error?.message || error));
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [periodValue, outletValue]);

  const histogramData = React.useMemo(() => {
    if (!data) return { base: [] as HistogramBucket[], filtered: [] as HistogramBucket[] };
    const total = data.uniqueBuyers || 0;
    const sorted = [...data.histogram].sort((a, b) => a.purchases - b.purchases);
    const base = sorted.map((point) => ({
      ...point,
      percent: total > 0 ? (point.customers / total) * 100 : 0,
    }));
    if (!hideLowEnabled) return { base, filtered: base };
    const threshold = clampPercentValue(hideLowPercent);
    const filtered = base.filter((point) => point.percent > threshold);
    return { base, filtered };
  }, [data, hideLowEnabled, hideLowPercent]);

  const histogram = histogramData.filtered;
  const rawHistogram = histogramData.base;
  const hiddenByThreshold = hideLowEnabled && rawHistogram.length > 0 && histogram.length === 0;

  const chartOption = React.useMemo(() => {
    const categories = histogram.map((point) => String(point.purchases));
    const values = histogram.map((point) => Number(point.percent.toFixed(2)));
    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          const first = params?.[0];
          if (!first) return "";
          const bucket = histogram[first.dataIndex];
          if (!bucket) return "";
          const percent = formatPercentLabel(bucket.percent);
          const clients = bucket.customers.toLocaleString("ru-RU");
          return `${first.axisValue} покупок<br/>${percent} клиентов (${clients})`;
        },
      },
      grid: { left: 36, right: 16, top: 30, bottom: 40 },
      xAxis: { type: "category", data: categories, name: "Покупок", nameLocation: "center", nameGap: 28 },
      yAxis: {
        type: "value",
        name: "Клиентов, %",
        nameLocation: "center",
        nameGap: 42,
        axisLabel: { formatter: (value: number) => `${value}%` },
        max: 100,
      },
      series: [
        {
          name: "Клиентов",
          type: "bar",
          data: values,
          itemStyle: { borderRadius: 10, color: "#38bdf8" },
        },
      ],
    } as const;
  }, [histogram]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Повторные продажи</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Отслеживание уникальных, новых и повторных покупателей</div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>Период</span>
            <select
              value={periodValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                const exists = periodOptions.some((option) => option.value === nextValue);
                setPeriodValue(exists ? nextValue : (periodOptions[0]?.value ?? "month"));
              }}
              style={selectStyle}
            >
              {periodOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>Торговая точка</span>
            <select
              value={outletValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                const exists = outletOptions.some((option) => option.value === nextValue);
                setOutletValue(exists ? nextValue : defaultOutletOption.value);
              }}
              style={selectStyle}
              disabled={outletsLoading && outletOptions.length <= 1}
            >
              {outletOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {outletsError && <div style={{ fontSize: 12, color: "#f87171" }}>{outletsError}</div>}
      {!outletsError && outletsLoading && <div style={{ fontSize: 12, opacity: 0.65 }}>Загружаем торговые точки…</div>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <StatCard title="Уникальных покупателей" value={data ? data.uniqueBuyers.toLocaleString("ru-RU") : "—"} />
        <StatCard title="Новых покупателей" value={data ? data.newBuyers.toLocaleString("ru-RU") : "—"} />
        <StatCard title="Повторных покупателей" value={data ? data.repeatBuyers.toLocaleString("ru-RU") : "—"} />
      </section>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={hideLowEnabled}
            onChange={(event) => setHideLowEnabled(event.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Не показывать значения меньше</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={hideLowPercent}
            onChange={(event) => setHideLowPercent(event.target.value)}
            onBlur={handlePercentBlur}
            disabled={!hideLowEnabled}
            style={{
              width: 64,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.35)",
              background: hideLowEnabled ? "rgba(15,23,42,0.6)" : "rgba(15,23,42,0.25)",
              color: "#e2e8f0",
            }}
          />
          <span>процентов</span>
        </label>
        {hideLowEnabled && (
          <span style={{ fontSize: 12, opacity: 0.65 }}>Стандартное значение — 3%</span>
        )}
      </div>

      <Card>
        <CardHeader title="Покупок на покупателя" subtitle="Доля клиентов по числу покупок за период" />
        <CardBody>
          {loading ? (
            <Skeleton height={340} />
          ) : histogram.length > 0 ? (
            <Chart option={chartOption as any} height={340} />
          ) : (
            <div style={{ padding: "60px 0", textAlign: "center", fontSize: 14, opacity: 0.7 }}>
              {hiddenByThreshold
                ? "Все значения скрыты выбранным порогом. Уменьшите процент, чтобы увидеть данные."
                : "Нет данных за выбранный период."}
            </div>
          )}
          {msg && <div style={{ color: "#f87171", marginTop: 12 }}>{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}

const StatCard: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <Card>
    <CardBody>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </CardBody>
  </Card>
);
