"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Users, ChevronDown, Filter } from "lucide-react";
import {
  AGE_RANGES,
  AgeRangeStats,
  GenderBucket,
  PortraitResponse,
  aggregateAgeRanges,
  buildCombinedDemography,
  normalizeGenderBuckets,
  SEX_LABELS,
} from "./utils";
import { normalizeErrorMessage } from "lib/portal-errors";

type AudienceOption = { value: string; label: string };

const defaultAudience: AudienceOption = { value: "", label: "Все клиенты" };

const genderColors: Record<string, string> = {
  M: "#60A5FA",
  F: "#F472B6",
  U: "#9CA3AF",
};

const formatNumber = (value: number) =>
  Math.round(value || 0).toLocaleString("ru-RU");
const formatCurrency = (value: number) =>
  `₽${Math.round(value || 0).toLocaleString("ru-RU")}`;

const ChartSkeleton = ({ className }: { className?: string }) => (
  <div
    className={`w-full h-full rounded-lg border border-gray-100 bg-gray-50 animate-pulse ${className || ""}`}
  />
);

const ComparisonSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full animate-pulse">
    {[0, 1, 2].map((idx) => (
      <div
        key={idx}
        className="bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-4"
      >
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="space-y-3">
          {[0, 1].map((barIdx) => (
            <div key={barIdx} className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="h-3 w-20 bg-gray-200 rounded" />
                <div className="h-4 w-16 bg-gray-200 rounded" />
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-gray-300 rounded-full"
                  style={{ width: `${barIdx === 0 ? 70 : 90}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="h-full w-full rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-500 text-sm px-4">
    {message}
  </div>
);

const ErrorBox = ({ message }: { message: string }) => (
  <div className="w-full rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
    {message}
  </div>
);

export default function ClientPortraitPage() {
  const [selectedAudience, setSelectedAudience] = React.useState<string>(
    defaultAudience.value,
  );
  const [audienceOptions, setAudienceOptions] = React.useState<AudienceOption[]>([
    defaultAudience,
  ]);
  const [audiencesLoading, setAudiencesLoading] = React.useState(true);
  const [audiencesError, setAudiencesError] = React.useState("");

  const [data, setData] = React.useState<PortraitResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [combinedMetric, setCombinedMetric] = React.useState<
    "clients" | "avg_check" | "revenue"
  >("clients");

  React.useEffect(() => {
    let cancelled = false;
    setAudiencesLoading(true);
    setAudiencesError("");
    (async () => {
      try {
        const res = await fetch(
          `/api/portal/audiences?includeSystem=1&limit=200`,
          { cache: "no-store" },
        );
        const text = await res.text();
        const json = text ? JSON.parse(text) : [];
        if (!res.ok) {
          throw new Error(
            (json && typeof json === "object" && (json as any).message) ||
              "Не удалось загрузить аудитории",
          );
        }
        const options: AudienceOption[] = [defaultAudience];
        for (const item of Array.isArray(json) ? json : []) {
          const archivedAt = (item as any)?.archivedAt ?? (item as any)?.archived_at;
          if (archivedAt) continue;
          const value =
            item?.id ?? item?.segmentId ?? item?.segmentID ?? item?.value;
          const label = item?.name || item?.title || value;
          const normalizedLabel = String(label || "").trim();
          const normalizedValue = String(value || "").trim();
          if (!normalizedValue || !normalizedLabel) continue;
          const isDefaultLabel =
            normalizedLabel.toLowerCase() ===
            defaultAudience.label.toLowerCase();
          const duplicate = options.some(
            (opt) =>
              opt.value === normalizedValue ||
              opt.label.toLowerCase() === normalizedLabel.toLowerCase(),
          );
          if (!duplicate && !isDefaultLabel) {
            options.push({ value: normalizedValue, label: normalizedLabel });
          }
        }
        if (!cancelled) setAudienceOptions(options);
      } catch (err: any) {
        if (!cancelled)
          setAudiencesError(
            normalizeErrorMessage(err, "Не удалось загрузить аудитории"),
          );
      } finally {
        if (!cancelled) setAudiencesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.set("period", "all");
    if (selectedAudience) params.set("segmentId", selectedAudience);

    fetch(`/api/portal/analytics/portrait?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || "Ошибка загрузки");
        return json as PortraitResponse;
      })
      .then((resp) => {
        if (!cancelled) setData(resp);
      })
      .catch((err: any) => {
        if (cancelled || err?.name === "AbortError") return;
        setData(null);
        setError(normalizeErrorMessage(err, "Ошибка загрузки"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedAudience]);

  const genderBuckets = React.useMemo<GenderBucket[]>(
    () => normalizeGenderBuckets(data?.gender || []),
    [data],
  );
  const totalGenderCustomers = React.useMemo(
    () => genderBuckets.reduce((acc, item) => acc + (item.customers || 0), 0),
    [genderBuckets],
  );
  const genderChartData = React.useMemo(
    () =>
      genderBuckets.map((bucket) => ({
        name: bucket.label,
        value: bucket.share,
        customers: bucket.customers,
        color: genderColors[bucket.key] || "#9CA3AF",
      })),
    [genderBuckets],
  );
  const genderMap = React.useMemo(
    () => new Map(genderBuckets.map((bucket) => [bucket.key, bucket])),
    [genderBuckets],
  );

  const ageStats: AgeRangeStats[] = React.useMemo(
    () => aggregateAgeRanges(data?.age || [], AGE_RANGES),
    [data],
  );

  const combinedData = React.useMemo(
    () => buildCombinedDemography(data?.sexAge || []),
    [data],
  );

  const maleBucket = genderMap.get("M");
  const femaleBucket = genderMap.get("F");
  const avgCheckMax = Math.max(
    maleBucket?.averageCheck || 0,
    femaleBucket?.averageCheck || 0,
    1,
  );
  const salesMax = Math.max(
    maleBucket?.transactions || 0,
    femaleBucket?.transactions || 0,
    1,
  );
  const revenueMax = Math.max(
    maleBucket?.revenue || 0,
    femaleBucket?.revenue || 0,
    1,
  );

  const hasGenderData = totalGenderCustomers > 0;
  const hasAgeData = ageStats.some((item) => item.clients || item.avgCheck);
  const hasCombinedData = combinedData.length > 0;

  const combinedMetricKey =
    combinedMetric === "clients"
      ? "clients"
      : combinedMetric === "avg_check"
        ? "avg_check"
        : "revenue";
  const maleKey = `male_${combinedMetricKey}`;
  const femaleKey = `female_${combinedMetricKey}`;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Портрет клиента</h2>
          <p className="text-gray-500">Демографический анализ и сегментация.</p>
        </div>

        <div className="flex items-center space-x-3 bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
          <Filter size={18} className="text-purple-600" />
          <span className="text-sm font-medium text-gray-500">Аудитория:</span>
          <div className="relative">
            <select
              value={selectedAudience}
              onChange={(e) => setSelectedAudience(e.target.value)}
              className="appearance-none bg-transparent pr-8 text-sm font-semibold text-gray-900 focus:outline-none cursor-pointer"
              disabled={audiencesLoading}
            >
              {audienceOptions.map((option) => (
                <option key={option.value || "__all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
        </div>
      </div>

      {audiencesError && <ErrorBox message={audiencesError} />}
      {error && !loading && <ErrorBox message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
          <h3 className="text-lg font-bold text-gray-900 self-start mb-4">
            Распределение по полу
          </h3>
          <div className="h-48 w-full relative">
            {loading && !data ? (
              <ChartSkeleton />
            ) : hasGenderData ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {genderChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, _name, item) => {
                      const customers = (item?.payload as any)?.customers || 0;
                      return [
                        `${value}% · ${formatNumber(customers)} клиентов`,
                        item?.payload?.name || "",
                      ];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Нет данных по полу" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <Users size={24} className="text-gray-400 mb-1" />
              <span className="text-sm font-semibold text-gray-500">Всего</span>
            </div>
          </div>
          <div className="flex w-full justify-around mt-4">
            {genderChartData.map((g) => (
              <div key={g.name} className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: g.color }}
                />
                <span className="text-sm font-medium text-gray-700">
                  {g.name}{" "}
                  <span className="text-gray-400">
                    ({g.value?.toFixed ? g.value.toFixed(1) : g.value}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">
            Сравнение по полу
          </h3>
          {loading && !data ? (
            <ComparisonSkeleton />
          ) : hasGenderData ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                  Средний чек
                </span>
                <div className="mt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-blue-600">
                      Мужчины
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(maleBucket?.averageCheck || 0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-400 h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(
                          6,
                          Math.round(
                            ((maleBucket?.averageCheck || 0) / avgCheckMax) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-pink-500">
                      Женщины
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(femaleBucket?.averageCheck || 0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-pink-400 h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(
                          6,
                          Math.round(
                            ((femaleBucket?.averageCheck || 0) / avgCheckMax) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                  Кол-во продаж
                </span>
                <div className="mt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-blue-600">
                      Мужчины
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatNumber(maleBucket?.transactions || 0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-400 h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(
                          6,
                          Math.round(
                            ((maleBucket?.transactions || 0) / salesMax) * 100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-pink-500">
                      Женщины
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatNumber(femaleBucket?.transactions || 0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-pink-400 h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(
                          6,
                          Math.round(
                            ((femaleBucket?.transactions || 0) / salesMax) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                  Общая выручка
                </span>
                <div className="mt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-blue-600">
                      Мужчины
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(maleBucket?.revenue || 0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-400 h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(
                          6,
                          Math.round(
                            ((maleBucket?.revenue || 0) / revenueMax) * 100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-pink-500">
                      Женщины
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(femaleBucket?.revenue || 0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-pink-400 h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(
                          6,
                          Math.round(
                            ((femaleBucket?.revenue || 0) / revenueMax) * 100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState message="Недостаточно данных по полу" />
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-6">
          Аналитика по возрасту
        </h3>
        <div className="h-[300px]">
          {loading && !data ? (
            <ChartSkeleton />
          ) : hasAgeData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageStats} barSize={40}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#F3F4F6"
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6B7280" }}
                />
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6B7280" }}
                  tickFormatter={formatNumber}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6B7280" }}
                  tickFormatter={formatCurrency}
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow:
                      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  }}
                  formatter={(value: number, name) =>
                    name === "Ср. чек"
                      ? formatCurrency(value)
                      : formatNumber(value)
                  }
                />
                <Legend iconType="circle" />
                <Bar
                  yAxisId="left"
                  dataKey="clients"
                  name="Клиенты"
                  fill="#A78BFA"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  yAxisId="right"
                  dataKey="avgCheck"
                  name="Ср. чек"
                  fill="#34D399"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Нет данных по возрасту" />
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              Детальная демография (Пол x Возраст)
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Гранулярная разбивка по возрасту и полу.
            </p>
          </div>

          <div className="bg-gray-100 p-1 rounded-lg flex text-sm">
            <button
              onClick={() => setCombinedMetric("clients")}
              className={`px-4 py-1.5 rounded-md transition-all ${
                combinedMetric === "clients"
                  ? "bg-white shadow-sm text-purple-700 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Клиенты
            </button>
            <button
              onClick={() => setCombinedMetric("avg_check")}
              className={`px-4 py-1.5 rounded-md transition-all ${
                combinedMetric === "avg_check"
                  ? "bg-white shadow-sm text-purple-700 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Ср. чек
            </button>
            <button
              onClick={() => setCombinedMetric("revenue")}
              className={`px-4 py-1.5 rounded-md transition-all ${
                combinedMetric === "revenue"
                  ? "bg-white shadow-sm text-purple-700 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Выручка
            </button>
          </div>
        </div>

        <div className="h-[400px]">
          {loading && !data ? (
            <ChartSkeleton />
          ) : hasCombinedData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={combinedData} barGap={2}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#F3F4F6"
                />
                <XAxis
                  dataKey="age"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6B7280" }}
                  label={{
                    value: "Возраст",
                    position: "insideBottom",
                    offset: -5,
                    fontSize: 12,
                    fill: "#9CA3AF",
                  }}
                  interval={combinedData.length > 20 ? 2 : 0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6B7280" }}
                  tickFormatter={
                    combinedMetric === "clients"
                      ? formatNumber
                      : formatCurrency
                  }
                />
                <Tooltip
                  cursor={{ fill: "#F3F4F6" }}
                  contentStyle={{ borderRadius: "8px" }}
                  formatter={(value: number) =>
                    combinedMetric === "clients"
                      ? formatNumber(value)
                      : formatCurrency(value)
                  }
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar
                  dataKey={maleKey}
                  name={SEX_LABELS.M}
                  fill={genderColors.M}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey={femaleKey}
                  name={SEX_LABELS.F}
                  fill={genderColors.F}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Недостаточно данных для отображения графика" />
          )}
        </div>
      </div>
    </div>
  );
}
