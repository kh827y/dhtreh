"use client";

import React from "react";
import { Card, CardBody, Chart, Skeleton } from "@loyalty/ui";
import {
  Repeat,
  Sparkles,
  Target,
  Gauge,
  MapPin,
  SlidersHorizontal,
  EyeOff,
  BarChart3,
  RefreshCw,
} from "lucide-react";

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

const numberFormatter = new Intl.NumberFormat("ru-RU");

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

const formatNumber = (value: number) =>
  Number.isFinite(value) ? numberFormatter.format(Math.round(value)) : "—";

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
            label:
              (typeof item.name === "string" && item.name.trim().length > 0
                ? item.name.trim()
                : item.id) as string,
          }));
        return mapped;
      })
      .then((mapped) => {
        if (cancelled) return;
        const withDefault = [defaultOutletOption, ...mapped];
        setOutletOptions(withDefault);
        setOutletValue((current) => {
          if (current === defaultOutletOption.value) return current;
          return withDefault.some((option) => option.value === current)
            ? current
            : defaultOutletOption.value;
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
  const hideLowPercentNumber = clampPercentValue(hideLowPercent);

  const chartOption = React.useMemo(() => {
    const categories = histogram.map((point) => String(point.purchases));
    const values = histogram.map((point) => Number(point.percent.toFixed(2)));
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15,23,42,0.9)",
        borderColor: "rgba(148,163,184,0.25)",
        textStyle: { color: "#e2e8f0" },
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
      grid: { left: 40, right: 20, top: 40, bottom: 50 },
      xAxis: {
        type: "category",
        data: categories,
        name: "Покупок",
        nameLocation: "center",
        nameGap: 32,
        axisLine: { lineStyle: { color: "#94a3b8" } },
        axisLabel: { color: "#94a3b8" },
      },
      yAxis: {
        type: "value",
        name: "Клиентов, %",
        nameLocation: "center",
        nameGap: 45,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.25)" } },
        axisLabel: { formatter: (value: number) => `${value}%`, color: "#94a3b8" },
        max: 100,
      },
      series: [
        {
          name: "Клиентов",
          type: "bar",
          data: values,
          itemStyle: {
            borderRadius: 12,
            shadowColor: "rgba(56, 189, 248, 0.35)",
            shadowBlur: 14,
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#7dd3fc" },
                { offset: 1, color: "#38bdf8" },
              ],
            },
          },
        },
      ],
    } as const;
  }, [histogram]);

  const averagePurchases = React.useMemo(() => {
    if (!rawHistogram.length) return 0;
    const totals = rawHistogram.reduce(
      (acc, bucket) => {
        acc.count += bucket.customers;
        acc.weighted += bucket.purchases * bucket.customers;
        return acc;
      },
      { count: 0, weighted: 0 },
    );
    if (!totals.count) return 0;
    return totals.weighted / totals.count;
  }, [rawHistogram]);

  const topBucket = React.useMemo(() => {
    if (!rawHistogram.length) return null;
    return rawHistogram.reduce<HistogramBucket | null>((best, current) => {
      if (!best) return current;
      return current.percent > best.percent ? current : best;
    }, null);
  }, [rawHistogram]);

  const totalUnique = data?.uniqueBuyers || 0;
  const repeatShare = totalUnique > 0 ? ((data?.repeatBuyers || 0) / totalUnique) * 100 : 0;
  const newShare = totalUnique > 0 ? ((data?.newBuyers || 0) / totalUnique) * 100 : 0;

  const statCards = React.useMemo(
    () => [
      {
        key: "repeat",
        title: "Повторные покупатели",
        value: data ? formatNumber(data.repeatBuyers) : "—",
        hint: data ? `${formatPercentLabel(repeatShare)} от уникальных` : "Ждем данные",
        accent: "sky" as const,
        icon: <Repeat size={18} />,
        progress: repeatShare,
      },
      {
        key: "new",
        title: "Новые покупатели",
        value: data ? formatNumber(data.newBuyers) : "—",
        hint: data ? `${formatPercentLabel(newShare)} впервые за период` : "Ждем данные",
        accent: "violet" as const,
        icon: <Sparkles size={18} />,
        progress: newShare,
      },
      {
        key: "unique",
        title: "Уникальных покупателей",
        value: data ? formatNumber(totalUnique) : "—",
        hint: "База для распределения",
        accent: "emerald" as const,
        icon: <Target size={18} />,
      },
      {
        key: "avg",
        title: "Средняя частота покупок",
        value: averagePurchases ? `${averagePurchases.toFixed(1)}×` : "—",
        hint: topBucket
          ? `Чаще всего: ${topBucket.purchases} покуп${topBucket.purchases === 1 ? "ка" : "ок"} · ${formatPercentLabel(topBucket.percent)} клиентов`
          : "Как только появятся данные — покажем лидеров",
        accent: "amber" as const,
        icon: <Gauge size={18} />,
      },
    ],
    [averagePurchases, data, newShare, repeatShare, topBucket, totalUnique],
  );

  const histogramList = React.useMemo(
    () => (histogram.length ? histogram : rawHistogram).slice(0, 6),
    [histogram, rawHistogram],
  );

  const isInitialLoading = loading && !data;
  const isRefreshing = loading && Boolean(data);

  return (
    <div className="repeat-page">
      <div className="repeat-gradient" />
      <section className="repeat-hero animate-in">
        <div className="repeat-hero-copy">
          <div className="repeat-eyebrow">Возвратность и LTV</div>
          <div className="repeat-title-row">
            <h1 className="repeat-title">Повторные продажи</h1>
            <div className={`repeat-live-pill${isRefreshing ? " pulse" : ""}`}>
              <span className="repeat-dot" />
              {isRefreshing ? "Обновляем данные…" : "Живые метрики"}
            </div>
          </div>
          <p className="repeat-subtitle">
            Отслеживайте, сколько клиентов возвращаются, какой объём дают новые покупатели и где
            сосредоточена основная выручка. Настраивайте фильтры и порог видимости, чтобы не
            потерять редкие, но важные сегменты.
          </p>
          <div className="repeat-chip-row">
            <span className="repeat-chip glow">Retention</span>
            <span className="repeat-chip muted">Периоды и точки</span>
            <span className="repeat-chip gradient">Фильтр мелких сегментов</span>
          </div>
        </div>
        <div className="repeat-controls">
          <div className="repeat-filter">
            <div className="repeat-filter-label">Период</div>
            <div className="repeat-pill-group">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`repeat-pill-btn${periodValue === option.value ? " active" : ""}`}
                  onClick={() => setPeriodValue(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="repeat-filter">
            <div className="repeat-filter-label">Торговая точка</div>
            {outletsLoading ? (
              <Skeleton height={44} />
            ) : (
              <div className="repeat-select">
                <MapPin size={14} />
                <select
                  value={outletValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    const exists = outletOptions.some((option) => option.value === nextValue);
                    setOutletValue(exists ? nextValue : defaultOutletOption.value);
                  }}
                  disabled={outletsLoading && outletOptions.length <= 1}
                >
                  {outletOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={`repeat-filter-hint${outletsError ? " error" : ""}`}>
              {outletsError
                ? outletsError
                : outletsLoading
                  ? "Загружаем активные точки…"
                  : outletValue === defaultOutletOption.value
                    ? "Сводка по всем торговым точкам"
                    : `Фокус на локации: ${outletOptions.find((item) => item.value === outletValue)?.label || ""}`}
            </div>
          </div>
        </div>
      </section>

      <section className="repeat-stats-grid">
        {isInitialLoading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx} className="repeat-stat-card">
                <CardBody>
                  <Skeleton height={96} />
                </CardBody>
              </Card>
            ))
          : statCards.map((card) => (
              <RepeatStatCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                accent={card.accent}
                icon={card.icon}
                progress={card.progress}
              />
            ))}
      </section>

      <Card className="repeat-panel" hover>
        <div className="repeat-panel-head">
          <div>
            <div className="panel-legend">Распределение повторных продаж</div>
            <div className="panel-title">Покупок на покупателя</div>
            <div className="panel-subtitle">
              Доля клиентов по числу покупок за выбранный период. Наведите курсор, чтобы увидеть
              точные значения и клиентов в сегменте.
            </div>
          </div>
          <div className="panel-actions">
            <span className="panel-pill">
              <BarChart3 size={14} />
              {periodOptions.find((item) => item.value === periodValue)?.label || "Период"}
            </span>
            {isRefreshing && (
              <span className="panel-pill soft">
                <RefreshCw size={14} className="spin" /> обновляем
              </span>
            )}
          </div>
        </div>
        <CardBody className="repeat-panel-body">
          <div className="repeat-panel-grid">
            <div className="repeat-chart-shell">
              {loading ? (
                <div className="repeat-chart-loading">
                  <Skeleton height={320} />
                </div>
              ) : histogram.length > 0 ? (
                <Chart option={chartOption as any} height={360} />
              ) : (
                <div className="repeat-empty">
                  <div className="repeat-empty-title">
                    {hiddenByThreshold ? "Все значения скрыты выбранным порогом" : "Нет данных за период"}
                  </div>
                  <p className="repeat-empty-text">
                    {hiddenByThreshold
                      ? "Сдвиньте ползунок порога или отключите фильтр, чтобы увидеть редкие сегменты."
                      : "Попробуйте выбрать другой период или точку продаж."}
                  </p>
                  {hiddenByThreshold && (
                    <button
                      type="button"
                      className="repeat-ghost-btn"
                      onClick={() => {
                        setHideLowEnabled(false);
                        setHideLowPercent("0");
                      }}
                    >
                      Показать все значения
                    </button>
                  )}
                  {msg && <div className="repeat-error">{msg}</div>}
                </div>
              )}
              {msg && histogram.length > 0 && !loading && <div className="repeat-error inline">{msg}</div>}
            </div>

            <div className="repeat-side">
              <div className="repeat-threshold-card">
                <div className="threshold-head">
                  <div>
                    <div className="threshold-title">Порог видимости</div>
                    <div className="threshold-hint">
                      Скрываем сегменты с долей ниже выбранного процента
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`repeat-switch${hideLowEnabled ? " active" : ""}`}
                    onClick={() => setHideLowEnabled((prev) => !prev)}
                    aria-pressed={hideLowEnabled}
                  >
                    <span />
                  </button>
                </div>
                <div className="threshold-controls">
                  <div className="threshold-slider">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.1}
                      value={hideLowPercentNumber}
                      onChange={(event) => {
                        const next = clampPercentValue(event.target.value);
                        setHideLowPercent(formatPercentInput(next));
                      }}
                      disabled={!hideLowEnabled}
                    />
                    <div className="threshold-scale">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                  <div className="threshold-number">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={hideLowPercent}
                      onChange={(event) => setHideLowPercent(event.target.value)}
                      onBlur={handlePercentBlur}
                      disabled={!hideLowEnabled}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="threshold-footer">
                  <div className="threshold-pill">
                    <EyeOff size={14} />
                    {hiddenByThreshold
                      ? "Сейчас скрыты все сегменты"
                      : hideLowEnabled
                        ? `Скрываем долю ниже ${formatPercentLabel(hideLowPercentNumber)}`
                        : "Фильтр отключен"}
                  </div>
                  <div className="threshold-pill soft">
                    <SlidersHorizontal size={14} />
                    Рекомендация: 3%
                  </div>
                </div>
              </div>

              <div className="repeat-mini-card">
                <div className="mini-head">
                  <div>
                    <div className="mini-title">Топ сегментов</div>
                    <div className="mini-subtitle">
                      {histogram.length ? "После применения порога" : "До фильтрации"}
                    </div>
                  </div>
                  <div className="mini-badge">
                    {histogramList.length} / {rawHistogram.length || 0}
                  </div>
                </div>
                <div className="mini-list">
                  {isInitialLoading ? (
                    Array.from({ length: 4 }).map((_, idx) => (
                      <Skeleton key={idx} height={52} />
                    ))
                  ) : histogramList.length ? (
                    histogramList.map((bucket, idx) => (
                      <div key={bucket.purchases} className="mini-row">
                        <div className="mini-left">
                          <div className="mini-rank">{idx + 1}</div>
                          <div>
                            <div className="mini-label">
                              {bucket.purchases} покуп{bucket.purchases === 1 ? "ка" : "ок"}
                            </div>
                            <div className="mini-hint">
                              {formatNumber(bucket.customers)} клиентов
                            </div>
                          </div>
                        </div>
                        <div className="mini-progress">
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(6, bucket.percent))}%`,
                            }}
                          />
                        </div>
                        <div className="mini-value">{formatPercentLabel(bucket.percent)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="mini-empty">Нет данных для отображения</div>
                  )}
                </div>
                {hiddenByThreshold && rawHistogram.length > 0 && (
                  <div className="mini-note">
                    Скрыто {rawHistogram.length - histogram.length} сегм. из-за порога
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

const RepeatStatCard: React.FC<{
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent: "sky" | "violet" | "emerald" | "amber";
  progress?: number;
}> = ({ title, value, hint, icon, accent, progress }) => (
  <Card className={`repeat-stat-card accent-${accent}`} hover>
    <CardBody className="repeat-stat-body">
      <div className="repeat-stat-icon">{icon}</div>
      <div className="repeat-stat-meta">
        <div className="repeat-stat-title">{title}</div>
        <div className="repeat-stat-value">{value}</div>
        <div className="repeat-stat-hint">{hint}</div>
        {typeof progress === "number" && (
          <div className="repeat-progress">
            <div className="repeat-progress-track">
              <div
                className="repeat-progress-bar"
                style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
              />
            </div>
            <span>{formatPercentLabel(progress)}</span>
          </div>
        )}
      </div>
    </CardBody>
  </Card>
);
