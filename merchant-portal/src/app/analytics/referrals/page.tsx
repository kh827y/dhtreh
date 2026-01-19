"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Calendar,
  Crown,
  Gift,
  Settings,
  Share2,
  TrendingUp,
  UserPlus,
  X as CloseIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  computeBonusProgress,
  computeDeltaPercent,
  formatCurrency,
  formatNumber,
  formatShortDate,
  hasTimelineData,
  normalizeTimeline,
  type ReferralTimelinePoint,
} from "./utils";
import { normalizeErrorMessage } from "lib/portal-errors";

type PeriodPreset = "yesterday" | "week" | "month" | "quarter" | "year";
type TopRef = {
  rank: number;
  name: string;
  customerId: string;
  invited: number;
  conversions?: number;
  revenue?: number;
};

type Resp = {
  registeredViaReferral: number;
  purchasedViaReferral: number;
  referralRevenue: number;
  bonusesIssued?: number;
  timeline?: ReferralTimelinePoint[];
  topReferrers: TopRef[];
   previous?: {
    registeredViaReferral: number;
    purchasedViaReferral: number;
    referralRevenue: number;
    bonusesIssued: number;
  };
};

type LeaderboardResponse = {
  items: TopRef[];
};

type PortalPermissions = Record<string, string[]>;

const periodOptions: Array<{ value: PeriodPreset; label: string }> = [
  { value: "yesterday", label: "Вчера" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

const LEADERBOARD_PAGE_SIZE = 50;
const READ_IMPLIED_ACTIONS = new Set(["create", "update", "delete", "manage", "*"]);

const normalizePermissions = (payload: unknown): PortalPermissions => {
  const out: PortalPermissions = {};
  if (!payload || typeof payload !== "object") return out;
  const raw = payload as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (Array.isArray(value)) {
      out[key] = Array.from(
        new Set(
          value
            .map((item) => String(item || "").toLowerCase().trim())
            .filter(Boolean),
        ),
      );
    }
  }
  return out;
};

const hasPermission = (
  permissions: PortalPermissions,
  resource: string,
  action: "read" | "create" | "update" | "delete" | "manage" | "*" = "read",
) => {
  if (!permissions) return false;
  const all = permissions.__all__ || [];
  if (all.includes("*") || all.includes("manage")) return true;
  const actions = permissions[resource] || [];
  if (!actions.length) return false;
  if (actions.includes("*") || actions.includes("manage")) return true;
  if (action === "read") {
    if (actions.includes("read")) return true;
    return actions.some((value) => READ_IMPLIED_ACTIONS.has(value));
  }
  return actions.includes(action);
};

const CardSkeleton = () => (
  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-32 animate-pulse" />
);

const ChartSkeleton = () => (
  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-[350px] animate-pulse" />
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
    {message}
  </div>
);

export default function AnalyticsReferralsPage() {
  const [period, setPeriod] = React.useState<PeriodPreset>("month");
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [leaderboardItems, setLeaderboardItems] = React.useState<TopRef[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = React.useState(false);
  const [leaderboardError, setLeaderboardError] = React.useState("");
  const [leaderboardHasMore, setLeaderboardHasMore] = React.useState(true);
  const [canConfigure, setCanConfigure] = React.useState(true);
  const leaderboardOffsetRef = React.useRef(0);
  const leaderboardLoadingRef = React.useRef(false);
  const leaderboardHasMoreRef = React.useRef(true);
  const router = useRouter();

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    leaderboardLoadingRef.current = leaderboardLoading;
  }, [leaderboardLoading]);
  React.useEffect(() => {
    leaderboardHasMoreRef.current = leaderboardHasMore;
  }, [leaderboardHasMore]);

  React.useEffect(() => {
    let active = true;
    const loadPermissions = async () => {
      try {
        const res = await fetch("/api/portal/me");
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        const actor = String(data?.actor ?? data?.role ?? "MERCHANT").toUpperCase();
        if (actor !== "STAFF") {
          setCanConfigure(true);
          return;
        }
        const permissions = normalizePermissions(data?.permissions);
        setCanConfigure(hasPermission(permissions, "mechanic_referral", "read"));
      } catch {
        setCanConfigure(true);
      }
    };
    loadPermissions();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/portal/analytics/referral?period=${period}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Не удалось загрузить аналитику");
        if (!cancelled) setData(json);
      } catch (err: any) {
        if (cancelled || err?.name === "AbortError") return;
        setError(normalizeErrorMessage(err, "Не удалось загрузить реферальную аналитику"));
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [period]);

  const loadLeaderboardPage = React.useCallback(
    async (reset = false) => {
      if (leaderboardLoadingRef.current) return;
      if (!reset && !leaderboardHasMoreRef.current) return;
      const offset = reset ? 0 : leaderboardOffsetRef.current;
      leaderboardLoadingRef.current = true;
      setLeaderboardLoading(true);
      setLeaderboardError("");
      try {
        const params = new URLSearchParams({
          period,
          offset: String(offset),
          limit: String(LEADERBOARD_PAGE_SIZE),
        });
        const res = await fetch(`/api/portal/analytics/referral/leaderboard?${params.toString()}`);
        const json = (await res.json()) as LeaderboardResponse;
        if (!res.ok) throw new Error((json as any)?.message || "Не удалось загрузить полный отчёт");
        const items = Array.isArray(json?.items) ? json.items : [];
        leaderboardOffsetRef.current = offset + items.length;
        setLeaderboardItems((prev) => (reset ? items : [...prev, ...items]));
        const hasMore = items.length === LEADERBOARD_PAGE_SIZE;
        leaderboardHasMoreRef.current = hasMore;
        setLeaderboardHasMore(hasMore);
      } catch (err: any) {
        setLeaderboardError(normalizeErrorMessage(err, "Не удалось загрузить полный отчёт"));
      } finally {
        leaderboardLoadingRef.current = false;
        setLeaderboardLoading(false);
      }
    },
    [period],
  );

  React.useEffect(() => {
    if (!isModalOpen) return;
    leaderboardOffsetRef.current = 0;
    leaderboardLoadingRef.current = false;
    leaderboardHasMoreRef.current = true;
    setLeaderboardItems([]);
    setLeaderboardHasMore(true);
    setLeaderboardError("");
    loadLeaderboardPage(true);
  }, [isModalOpen, period, loadLeaderboardPage]);

  const handleLeaderboardScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      if (leaderboardLoadingRef.current || !leaderboardHasMoreRef.current) return;
      if (target.scrollHeight - target.scrollTop - target.clientHeight < 120) {
        loadLeaderboardPage();
      }
    },
    [loadLeaderboardPage],
  );

  const timeline = React.useMemo(
    () => normalizeTimeline(data?.timeline),
    [data?.timeline],
  );
  const bonusProgress = React.useMemo(
    () => computeBonusProgress(data?.bonusesIssued, data?.referralRevenue),
    [data?.bonusesIssued, data?.referralRevenue],
  );

  const conversionRate = React.useMemo(() => {
    if (!data?.registeredViaReferral) return null;
    return (100 * (data.purchasedViaReferral || 0)) / data.registeredViaReferral;
  }, [data?.registeredViaReferral, data?.purchasedViaReferral]);

  const registrationsDelta = React.useMemo(
    () =>
      computeDeltaPercent(
        data?.registeredViaReferral,
        data?.previous?.registeredViaReferral,
      ),
    [data?.registeredViaReferral, data?.previous?.registeredViaReferral],
  );

  const revenueDelta = React.useMemo(
    () =>
      computeDeltaPercent(
        data?.referralRevenue,
        data?.previous?.referralRevenue,
      ),
    [data?.referralRevenue, data?.previous?.referralRevenue],
  );

  const renderDelta = (delta: number | null) => (
    <div className="flex items-center text-sm">
      {delta === null ? (
        <span className="text-gray-400">—</span>
      ) : (
        <>
          <span
            className={`font-medium flex items-center ${
              delta >= 0 ? "text-green-600" : "text-rose-600"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
          <span className="text-gray-400 ml-2">к прошл. периоду</span>
        </>
      )}
    </div>
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <div className="flex items-center space-x-2">
            <Share2 size={24} className="text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-900">Реферальная программа</h2>
          </div>
          <p className="text-gray-500 mt-1">
            Отслеживание вирусного роста и эффективности реферальных кампаний.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
            <Calendar size={16} className="text-gray-400" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodPreset)}
              className="bg-transparent text-sm text-gray-700 font-medium focus:outline-none cursor-pointer pr-4"
            >
              {periodOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {canConfigure && (
            <button
              className="flex items-center space-x-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors shadow-sm"
              onClick={() => router.push("/referrals/program")}
            >
              <Settings size={16} />
              <span>Настроить</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <UserPlus size={64} className="text-blue-600" />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Регистрации</span>
                <h3 className="text-3xl font-bold text-gray-900 mt-2">
                  {formatNumber(data?.registeredViaReferral)}
                </h3>
              </div>
              {renderDelta(registrationsDelta)}
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Gift size={64} className="text-purple-600" />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Первые покупки</span>
                <h3 className="text-3xl font-bold text-gray-900 mt-2">
                  {formatNumber(data?.purchasedViaReferral)}
                </h3>
              </div>
              <div className="flex items-center text-sm">
                <span className="text-purple-600 font-medium bg-purple-50 px-2 py-0.5 rounded">
                  {conversionRate === null ? "—" : `${conversionRate.toFixed(1)}%`} Конверсия
                </span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingUp size={64} className="text-green-600" />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Выручка (Реф.)</span>
                <h3 className="text-3xl font-bold text-gray-900 mt-2">
                  {formatCurrency(data?.referralRevenue)}
                </h3>
              </div>
              {renderDelta(revenueDelta)}
            </div>

            <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
              <div>
                <span className="text-sm font-medium text-slate-500">Выплачено бонусов</span>
                <h3 className="text-2xl font-bold text-slate-700 mt-2">
                  {formatNumber(data?.bonusesIssued)} баллов
                </h3>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                <div
                  className="bg-slate-400 h-1.5 rounded-full transition-all"
                  style={{ width: `${bonusProgress}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900">Динамика привлечения</h3>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span className="w-3 h-3 rounded-full bg-blue-400" />
                <span>Регистрации</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span className="w-3 h-3 rounded-full bg-purple-500" />
                <span>Первая покупка</span>
              </div>
            </div>
          </div>
          <div className="h-[350px]">
            {loading ? (
              <ChartSkeleton />
            ) : hasTimelineData(timeline) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={timeline}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#60A5FA" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPur" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#F3F4F6"
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#9CA3AF", fontSize: 12 }}
                    tickFormatter={formatShortDate}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#9CA3AF", fontSize: 12 }}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    formatter={(value?: number) => formatNumber(value ?? 0)}
                    labelFormatter={(label) => formatShortDate(String(label))}
                    contentStyle={{
                      borderRadius: 8,
                      border: "none",
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="registrations"
                    stroke="#60A5FA"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorReg)"
                  />
                  <Area
                    type="monotone"
                    dataKey="firstPurchases"
                    stroke="#8B5CF6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPur)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Недостаточно данных для графика" />
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-[450px]">
          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white">
            <div className="flex items-center space-x-2">
              <Crown className="text-yellow-500" size={20} />
              <h3 className="font-bold text-gray-900">Топ амбассадоров</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">Клиенты, приносящие наибольшую пользу.</p>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
            {loading ? (
              <div className="p-4">
                <ChartSkeleton />
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="sticky top-0 bg-white shadow-sm z-10 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 bg-gray-50">Ранг</th>
                    <th className="px-4 py-3 bg-gray-50">Пользователь</th>
                    <th className="px-4 py-3 bg-gray-50 text-right">Пригласил</th>
                    <th className="px-4 py-3 bg-gray-50 text-right">Выручка</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(data?.topReferrers || []).map((user) => (
                    <tr key={user.rank} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-400 w-12 text-center">
                        {user.rank <= 3 ? (
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                              user.rank === 1
                                ? "bg-yellow-400"
                                : user.rank === 2
                                  ? "bg-gray-400"
                                  : "bg-orange-400"
                            }`}
                          >
                            {user.rank}
                          </div>
                        ) : (
                          <span>#{user.rank}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {user.name || user.customerId}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-gray-900">{formatNumber(user.invited)}</span>
                        <span className="text-xs text-gray-400 ml-1">
                          ({formatNumber(user.conversions || 0)})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">
                        {formatCurrency(user.revenue || 0)}
                      </td>
                    </tr>
                  ))}
                  {!data?.topReferrers?.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                        Нет данных
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 text-center">
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-sm text-purple-600 font-medium hover:text-purple-700 disabled:opacity-50"
              disabled={!data?.topReferrers?.length}
            >
              Полный отчет
            </button>
          </div>
        </div>
      </div>

      {mounted && isModalOpen
        ? createPortal(
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 ">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative z-[101]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Полный рейтинг рефералов</h3>
                    <p className="text-sm text-gray-500">
                      Полный список рефералов и сгенерированная выручка.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-2 rounded-lg transition-colors"
                  >
                    <CloseIcon size={24} />
                  </button>
                </div>

                {leaderboardError && (
                  <div className="px-6 py-3 text-sm text-red-600 border-b border-red-100 bg-red-50">
                    {leaderboardError}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-0" onScroll={handleLeaderboardScroll}>
                  <table className="w-full text-sm text-left">
                    <thead className="sticky top-0 bg-white shadow-sm z-10 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-6 py-4 bg-gray-50">Ранг</th>
                        <th className="px-6 py-4 bg-gray-50">Пользователь</th>
                        <th className="px-6 py-4 bg-gray-50 text-right">Пригласил</th>
                        <th className="px-6 py-4 bg-gray-50 text-right">Конверсия</th>
                        <th className="px-6 py-4 bg-gray-50 text-right">Выручка</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {leaderboardItems.map((user) => {
                        const conversion =
                          user.invited > 0 && (user.conversions || 0) >= 0
                            ? Math.min(100, ((user.conversions || 0) / user.invited) * 100)
                            : 0;
                        return (
                          <tr key={`${user.rank}-${user.customerId}`} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-gray-400 w-16 text-center">
                              {user.rank <= 3 ? (
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                                    user.rank === 1
                                      ? "bg-yellow-400"
                                      : user.rank === 2
                                        ? "bg-gray-400"
                                        : "bg-orange-400"
                                  }`}
                                >
                                  {user.rank}
                                </div>
                              ) : (
                                <span>#{user.rank}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-medium text-gray-900 text-base">
                              {user.name || user.customerId}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="font-bold text-gray-900">
                                {formatNumber(user.invited)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-gray-600">{formatNumber(user.conversions || 0)}</span>
                              <span className="text-xs text-gray-400 ml-1">
                                ({conversion.toFixed(0)}%)
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-green-600 font-medium">
                              {formatCurrency(user.revenue || 0)}
                            </td>
                          </tr>
                        );
                      })}
                      {!leaderboardLoading && !leaderboardItems.length && (
                        <tr>
                          <td colSpan={5} className="px-6 py-6 text-center text-gray-500">
                            Нет данных
                          </td>
                        </tr>
                      )}
                      {leaderboardLoading && (
                        <tr>
                          <td colSpan={5} className="px-6 py-6 text-center text-gray-400">
                            Загрузка...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
