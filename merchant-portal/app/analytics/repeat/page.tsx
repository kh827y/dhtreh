"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart2, Calendar, EyeOff, Store, TrendingUp, User, Wallet } from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";

type HistogramPoint = { purchases: number; customers: number };
type Resp = { uniqueBuyers: number; newBuyers: number; repeatBuyers: number; histogram: HistogramPoint[] };
type SelectOption = { value: string; label: string };
type HistogramBucket = HistogramPoint & { share: number; purchasesLabel: string };

const periodOptions = [
  { value: "yesterday", label: "Вчера" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
] as const;

const defaultOutletOption: SelectOption = { value: "all", label: "Все точки" };

const numberFormatter = new Intl.NumberFormat("ru-RU");

const formatNumber = (value: number) => (Number.isFinite(value) ? numberFormatter.format(Math.round(value)) : "—");

const clampThreshold = (value: number) => Math.max(0, Math.min(10, Number.isFinite(value) ? value : 0));

export default function AnalyticsRepeatPage() {
  const [periodValue, setPeriodValue] = React.useState<(typeof periodOptions)[number]["value"]>("month");
  const [outletOptions, setOutletOptions] = React.useState<SelectOption[]>([defaultOutletOption]);
  const [outletValue, setOutletValue] = React.useState(defaultOutletOption.value);
  const [outletsLoading, setOutletsLoading] = React.useState(true);
  const [outletsError, setOutletsError] = React.useState("");

  const [hideThreshold, setHideThreshold] = React.useState(3);

  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setOutletsLoading(true);
    setOutletsError("");

    fetch(`/api/portal/outlets?status=all`, { method: "GET", cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const text = await res.text().catch(() => "");
        const payload = text ? (JSON.parse(text) as any) : {};
        if (!res.ok) {
          const message =
            (payload && typeof payload === "object" && "message" in payload ? String(payload.message) : null) ||
            "Не удалось загрузить торговые точки";
          throw new Error(message);
        }
        const itemsSource: any[] = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];
        return itemsSource
          .filter((item) => item && typeof item === "object" && typeof item.id === "string")
          .map((item) => ({
            value: item.id,
            label:
              (typeof item.name === "string" && item.name.trim().length > 0
                ? item.name.trim()
                : item.id) as string,
          }));
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
      })
      .catch((error: any) => {
        if (cancelled || error?.name === "AbortError") return;
        setOutletOptions([defaultOutletOption]);
        setOutletValue(defaultOutletOption.value);
        setOutletsError(normalizeErrorMessage(error, "Не удалось загрузить торговые точки"));
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
        const payload = text ? (JSON.parse(text) as Resp) : ({} as Resp);
        if (!res.ok) {
          const message =
            (payload && typeof payload === "object" && "message" in payload
              ? String((payload as any).message)
              : null) || "Ошибка загрузки";
          throw new Error(message);
        }
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((error: any) => {
        if (cancelled || error?.name === "AbortError") return;
        setMsg(normalizeErrorMessage(error, "Ошибка загрузки"));
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

  const histogram = React.useMemo<HistogramBucket[]>(() => {
    if (!data) return [];
    const total = data.uniqueBuyers || 0;
    const base = [...(data.histogram || [])]
      .filter((item) => typeof item.purchases === "number" && item.purchases > 0)
      .map((item) => ({
        ...item,
        share: total > 0 ? (item.customers / total) * 100 : 0,
        purchasesLabel: item.purchases >= 10 ? `${item.purchases}+` : String(item.purchases),
      }))
      .sort((a, b) => a.purchases - b.purchases);
    return base;
  }, [data]);

  const filteredHistogram = React.useMemo(
    () => histogram.filter((item) => item.share >= clampThreshold(hideThreshold)),
    [histogram, hideThreshold],
  );

  const hiddenByThreshold = histogram.length > 0 && filteredHistogram.length === 0;

  const stats = React.useMemo(
    () => [
      { label: "Повторные покупатели", value: formatNumber(data?.repeatBuyers ?? NaN), iconType: "user" as const },
      { label: "Новые покупатели", value: formatNumber(data?.newBuyers ?? NaN), iconType: "user" as const },
      { label: "Уникальные покупатели", value: formatNumber(data?.uniqueBuyers ?? NaN), iconType: "bar" as const },
    ],
    [data?.repeatBuyers, data?.newBuyers, data?.uniqueBuyers],
  );

  const maxShare = React.useMemo(() => {
    const values = filteredHistogram.map((item) => item.share);
    const max = values.length ? Math.max(...values) : 0;
    if (max === 0) return 10;
    return Math.min(100, Math.ceil(max + 5));
  }, [filteredHistogram]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center space-y-4 xl:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Повторные продажи</h2>
          <p className="text-gray-500">Анализ удержания клиентов и частоты покупок.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
            <Calendar size={16} className="text-gray-400" />
            <select
              value={periodValue}
              onChange={(e) => setPeriodValue(e.target.value as (typeof periodOptions)[number]["value"])}
              className="bg-transparent text-sm text-gray-700 font-medium focus:outline-none cursor-pointer pr-4"
            >
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
            <Store size={16} className="text-gray-400" />
            <select
              value={outletValue}
              onChange={(event) => {
                const next = event.target.value;
                const exists = outletOptions.some((option) => option.value === next);
                setOutletValue(exists ? next : defaultOutletOption.value);
              }}
              disabled={outletsLoading}
              className="bg-transparent text-sm text-gray-700 font-medium focus:outline-none cursor-pointer pr-4"
            >
              {outletOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((kpi, idx) => (
          <StatCard key={idx} label={kpi.label} value={kpi.value} iconType={kpi.iconType} loading={loading && !data} />
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Частота покупок</h3>
            <p className="text-xs text-gray-500 mt-1">Доля клиентов по количеству покупок за выбранный период.</p>
          </div>

          <div className="flex items-center space-x-4 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-600">
              <EyeOff size={16} />
              <span className="text-xs font-medium uppercase tracking-wide">Скрыть долю ниже</span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={hideThreshold}
              onChange={(e) => setHideThreshold(clampThreshold(Number(e.target.value)))}
              className="w-32 h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <span className="text-sm font-bold text-purple-700 w-12 text-right">{clampThreshold(hideThreshold).toFixed(1)}%</span>
          </div>
        </div>

        <div className="h-[400px] w-full overflow-x-auto">
          <div className="h-full min-w-[720px]">
            {loading ? (
              <div className="h-full rounded-xl bg-gray-50 animate-pulse" />
            ) : filteredHistogram.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredHistogram} margin={{ top: 20, right: 30, left: 0, bottom: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis
                    dataKey="purchasesLabel"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6B7280", fontSize: 13 }}
                    label={{ value: "Количество покупок", position: "insideBottom", offset: -12, fill: "#9CA3AF", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6B7280", fontSize: 12 }}
                    unit="%"
                    domain={[0, maxShare]}
                  />
                  <Tooltip
                    cursor={{ fill: "#F3F4F6", radius: 4 }}
                    contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                    formatter={(value?: number, _name?: string, props?: any) => [
                      <div className="flex flex-col" key="content">
                        <span className="font-bold text-gray-900">{Number(value ?? 0).toFixed(1)}%</span>
                        <span className="text-xs text-gray-500 font-normal">
                          {props?.payload?.customers?.toLocaleString("ru-RU") || 0} клиентов
                        </span>
                      </div>,
                      "",
                    ]}
                    labelFormatter={(label) => `Покупок: ${label}`}
                  />
                  <Bar dataKey="share" radius={[6, 6, 0, 0]} maxBarSize={64}>
                    {filteredHistogram.map((entry, index) => (
                      <Cell key={`cell-${entry.purchases}-${index}`} fill={index === 0 ? "#60A5FA" : "#8B5CF6"} />
                    ))}
                    <LabelList
                      dataKey="share"
                      position="top"
                      formatter={(val: number | string | boolean | null | undefined) => `${Number(val ?? 0).toFixed(1)}%`}
                      fill="#6B7280"
                      fontSize={12}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500 text-center px-8">
                {hiddenByThreshold
                  ? `Все сегменты скрыты порогом ${clampThreshold(hideThreshold).toFixed(1)}%. Уменьшите значение, чтобы увидеть редкие группы.`
                  : "Нет данных за выбранный период"}
              </div>
            )}
          </div>
        </div>
        {msg && <div className="mt-4 text-sm text-amber-600">{msg}</div>}
        {outletsError && <div className="mt-2 text-xs text-amber-600">{outletsError}</div>}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  iconType,
  loading,
}: {
  label: string;
  value: string;
  iconType: "chart" | "user" | "bar" | "currency";
  loading?: boolean;
}) {
  const icon = React.useMemo(() => {
    if (iconType === "user") return <User size={20} className="text-blue-500" />;
    if (iconType === "bar") return <BarChart2 size={20} className="text-green-500" />;
    if (iconType === "currency") return <Wallet size={20} className="text-purple-500" />;
    return <TrendingUp size={20} className="text-purple-500" />;
  }, [iconType]);

  const iconBg =
    iconType === "user" ? "bg-blue-50" : iconType === "bar" ? "bg-green-50" : iconType === "currency" ? "bg-purple-50" : "bg-gray-50";

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <span className="text-sm font-medium text-gray-600">{label}</span>
        <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
      </div>
      {loading ? (
        <div className="h-6 rounded-md bg-gray-100 animate-pulse" />
      ) : (
        <div>
          <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
        </div>
      )}
    </div>
  );
}
