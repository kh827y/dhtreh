"use client";

import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Calendar, Coins, MinusCircle } from "lucide-react";
import { useTimezone } from "../../../components/TimezoneProvider";
import { formatRangeLabel, TimeGrouping } from "../../../lib/format-range";
import { normalizeErrorMessage } from "lib/portal-errors";

type DetailGrouping = "day" | "week" | "month";
type PeriodPreset = "yesterday" | "week" | "month" | "quarter" | "year";

const periodOptions: Array<{ value: PeriodPreset; label: string }> = [
  { value: "yesterday", label: "Вчера" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

const granularityOptions: Array<{ value: DetailGrouping; label: string }> = [
  { value: "day", label: "дни" },
  { value: "week", label: "недели" },
  { value: "month", label: "месяцы" },
];

type RevenuePoint = {
  date: string;
  revenue: number;
  transactions: number;
  customers: number;
  averageCheck: number;
};

type RevenueMetrics = {
  totalRevenue: number;
  averageCheck: number;
  transactionCount: number;
  revenueGrowth?: number;
  hourlyDistribution: Array<{ hour: number; revenue: number; transactions: number }>;
  dailyRevenue: RevenuePoint[];
  seriesGrouping?: DetailGrouping;
};

type LoyaltyPoint = {
  date: string;
  accrued: number;
  redeemed: number;
  burned: number;
  balance: number;
};

type LoyaltyMetrics = {
  pointsSeries: LoyaltyPoint[];
  pointsGrouping?: DetailGrouping;
};

const moneyFormatter = new Intl.NumberFormat("ru-RU");
const formatCurrency = (value: number) => `₽${moneyFormatter.format(Math.round(value || 0))}`;
const formatNumber = (value: number) => moneyFormatter.format(Math.round(value || 0));

export default function AnalyticsDynamicsPage() {
  const timezone = useTimezone();
  const [period, setPeriod] = React.useState<PeriodPreset>("month");
  const [granularity, setGranularity] = React.useState<DetailGrouping>("day");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [revenue, setRevenue] = React.useState<RevenueMetrics | null>(null);
  const [loyalty, setLoyalty] = React.useState<LoyaltyMetrics | null>(null);
  const [visibleMetrics, setVisibleMetrics] = React.useState({
    accrued: true,
    redeemedVis: true,
    expiredVis: true,
    balance: true,
  });

  React.useEffect(() => {
    if (period === "yesterday" && granularity !== "day") {
      setGranularity("day");
    }
  }, [period, granularity]);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    const baseParams = new URLSearchParams({ period, group: granularity });
    const qs = baseParams.toString();

    Promise.all([
      fetch(`/api/portal/analytics/revenue?${qs}`, { signal: controller.signal, cache: "no-store" }),
      fetch(`/api/portal/analytics/loyalty?${qs}`, { signal: controller.signal, cache: "no-store" }),
    ])
      .then(async ([revenueRes, loyaltyRes]) => {
        const [revenueJson, loyaltyJson] = await Promise.all([
          revenueRes.json().catch(() => ({} as RevenueMetrics)),
          loyaltyRes.json().catch(() => ({} as LoyaltyMetrics)),
        ]);
        if (!revenueRes.ok) {
          throw new Error((revenueJson as any)?.message || "Не удалось загрузить данные выручки");
        }
        if (!loyaltyRes.ok) {
          throw new Error((loyaltyJson as any)?.message || "Не удалось загрузить данные по баллам");
        }
        return [revenueJson as RevenueMetrics, loyaltyJson as LoyaltyMetrics] as const;
      })
      .then(([revenueData, loyaltyData]) => {
        if (cancelled) return;
        setRevenue(revenueData);
        setLoyalty(loyaltyData);
      })
      .catch((err: any) => {
        if (cancelled || err?.name === "AbortError") return;
        setRevenue(null);
        setLoyalty(null);
        setError(normalizeErrorMessage(err, "Не удалось загрузить данные"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [period, granularity]);

  const revenueGrouping: TimeGrouping = (revenue?.seriesGrouping || granularity) as TimeGrouping;
  const pointsGrouping: TimeGrouping = (loyalty?.pointsGrouping || granularity) as TimeGrouping;

  const averageCheckData = React.useMemo(
    () =>
      (revenue?.dailyRevenue || []).map((point) => ({
        label: formatRangeLabel(point.date, revenueGrouping, timezone.iana),
        avgCheck: Math.max(0, Math.round(point.averageCheck)),
      })),
    [revenue?.dailyRevenue, revenueGrouping, timezone.iana],
  );

  const pointsSeries = React.useMemo(() => loyalty?.pointsSeries || [], [loyalty?.pointsSeries]);

  const pointsTotals = React.useMemo(() => {
    return pointsSeries.reduce(
      (acc, curr) => ({
        accrued: acc.accrued + Math.max(0, curr.accrued || 0),
        redeemed: acc.redeemed + Math.max(0, curr.redeemed || 0),
        expired: acc.expired + Math.max(0, curr.burned || 0),
        balance: curr.balance,
      }),
      { accrued: 0, redeemed: 0, expired: 0, balance: 0 },
    );
  }, [pointsSeries]);

  const pointsData = React.useMemo(
    () =>
      pointsSeries.map((point) => ({
        label: formatRangeLabel(point.date, pointsGrouping, timezone.iana),
        accrued: Math.max(0, point.accrued || 0),
        redeemedVis: -Math.max(0, point.redeemed || 0),
        expiredVis: -Math.max(0, point.burned || 0),
        balance: Math.round(point.balance || 0),
      })),
    [pointsSeries, pointsGrouping, timezone.iana],
  );

  const toggleMetric = React.useCallback(
    (key: keyof typeof visibleMetrics) => {
      setVisibleMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [],
  );

  const hasAverageData = averageCheckData.some((point) => point.avgCheck > 0);
  const hasPointsData = pointsData.some(
    (point) => point.accrued > 0 || point.redeemedVis !== 0 || point.expiredVis !== 0 || point.balance !== 0,
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center space-y-4 xl:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Динамика</h2>
          <p className="text-gray-500">Отслеживание изменения ключевых показателей.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
            <Calendar size={16} className="text-gray-400" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodPreset)}
              className="bg-transparent text-sm text-gray-700 font-medium focus:outline-none cursor-pointer pr-4"
            >
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-gray-100 p-1 rounded-lg flex text-sm">
            {granularityOptions.map((g) => (
              <button
                key={g.value}
                onClick={() => setGranularity(g.value)}
                className={`px-4 py-1.5 rounded-md capitalize transition-all ${
                  granularity === g.value ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900">Динамика среднего чека</h3>
          <p className="text-xs text-gray-500 mt-1">Тенденция изменения среднего чека на одного клиента.</p>
        </div>

        <div className="h-[300px] w-full overflow-x-auto">
          <div className="h-full min-w-[720px]">
            {loading && !revenue ? (
              <div className="h-full rounded-xl bg-gray-50 animate-pulse" />
            ) : hasAverageData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={averageCheckData}>
                  <defs>
                    <linearGradient id="colorAvgCheck" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} unit="₽" />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                      formatter={(val?: number) => [formatCurrency(val ?? 0), "Ср. чек"]}
                    />
                  <Area
                    type="monotone"
                    dataKey="avgCheck"
                    stroke="#8B5CF6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorAvgCheck)"
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500 text-center px-8">
                {error || "Нет данных за выбранный период"}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Coins className="text-yellow-500" size={24} />
          <h3 className="text-xl font-bold text-gray-900">Экономика баллов</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <PointsCard
            label="Начислено"
            value={pointsTotals.accrued > 0 ? `+${formatNumber(pointsTotals.accrued)}` : "0"}
            colorClass="text-green-600"
            bgClass="bg-green-100"
            icon={<ArrowUpRight size={16} className="text-green-600" />}
            dimmed={!visibleMetrics.accrued}
          />
          <PointsCard
            label="Списано"
            value={pointsTotals.redeemed > 0 ? `-${formatNumber(pointsTotals.redeemed)}` : "0"}
            colorClass="text-orange-500"
            bgClass="bg-orange-100"
            icon={<ArrowDownRight size={16} className="text-orange-500" />}
            dimmed={!visibleMetrics.redeemedVis}
          />
          <PointsCard
            label="Сгорело"
            value={formatNumber(pointsTotals.expired)}
            colorClass="text-gray-500"
            bgClass="bg-gray-100"
            icon={<MinusCircle size={16} className="text-gray-500" />}
            dimmed={!visibleMetrics.expiredVis}
          />
          <div
            className={`bg-gradient-to-br from-purple-600 to-indigo-700 p-5 rounded-xl shadow-md text-white transition-opacity ${
              !visibleMetrics.balance ? "opacity-50" : ""
            }`}
          >
            <span className="text-sm font-medium text-purple-100">Общий баланс</span>
            <div className="mt-2">
              <span className="text-2xl font-bold">{formatNumber(pointsTotals.balance)}</span>
            </div>
            <div className="mt-2 text-xs text-purple-200">Текущие активные баллы</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h4 className="text-lg font-bold text-gray-900 mb-6">Движение баллов</h4>
          <div className="h-[400px] w-full overflow-x-auto">
            <div className="h-full min-w-[820px]">
              {loading && !loyalty ? (
                <div className="h-full rounded-xl bg-gray-50 animate-pulse" />
              ) : hasPointsData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={pointsData} stackOffset="sign">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} />
                    <Tooltip
                      cursor={{ fill: "#F9FAFB", opacity: 0.5 }}
                      contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                      formatter={(value?: number, name?: string) => {
                        const absValue = Math.abs(value ?? 0);
                        const label = name ?? "";
                        if (label === "Списано" || label === "Сгорело") return [absValue.toLocaleString("ru-RU"), label];
                        return [Math.round(value ?? 0).toLocaleString("ru-RU"), label];
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      onClick={(e) => toggleMetric(e.dataKey as keyof typeof visibleMetrics)}
                      formatter={(value, entry: any) => {
                        const key = entry.dataKey as keyof typeof visibleMetrics;
                        const isHidden = !visibleMetrics[key];
                        return (
                          <span
                            style={{
                              color: isHidden ? "#9CA3AF" : "#374151",
                              textDecoration: isHidden ? "line-through" : "none",
                              cursor: "pointer",
                            }}
                          >
                            {value}
                          </span>
                        );
                      }}
                    />
                    <ReferenceLine yAxisId="left" y={0} stroke="#E5E7EB" strokeWidth={2} />

                    <Bar
                      yAxisId="left"
                      dataKey="accrued"
                      name="Начислено"
                      stackId="stack"
                      fill="#34D399"
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                      hide={!visibleMetrics.accrued}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="redeemedVis"
                      name="Списано"
                      stackId="stack"
                      fill="#FB923C"
                      radius={[0, 0, 4, 4]}
                      barSize={20}
                      hide={!visibleMetrics.redeemedVis}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="expiredVis"
                      name="Сгорело"
                      stackId="stack"
                      fill="#F87171"
                      radius={[0, 0, 4, 4]}
                      barSize={20}
                      hide={!visibleMetrics.expiredVis}
                    />

                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="balance"
                      name="Баланс"
                      stroke="#A855F7"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#fff", strokeWidth: 2, stroke: "#A855F7" }}
                      activeDot={{ r: 6, fill: "#A855F7", stroke: "#fff", strokeWidth: 2 }}
                      hide={!visibleMetrics.balance}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500 text-center px-8">
                  {error || "Нет данных за выбранный период"}
                </div>
              )}
            </div>
          </div>
        </div>
        {error && <div className="text-sm text-amber-600">{error}</div>}
      </div>
    </div>
  );
}

function PointsCard({
  label,
  value,
  colorClass,
  bgClass,
  icon,
  dimmed,
}: {
  label: string;
  value: string;
  colorClass: string;
  bgClass: string;
  icon: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div className={`bg-white p-5 rounded-xl border border-gray-100 shadow-sm transition-opacity ${dimmed ? "opacity-50" : ""}`}>
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <div className="mt-2 flex items-baseline justify-between">
        <span className={`text-2xl font-bold ${colorClass}`}>{value}</span>
        <div className={`${bgClass} p-1.5 rounded-full`}>{icon}</div>
      </div>
    </div>
  );
}
