"use client";

import React from "react";
import "./staff.css";
import { Calendar, Store, Users, Medal, TrendingUp, UserPlus, BadgeCheck, Star } from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";

type ApiStaffRow = {
  id: string;
  name?: string | null;
  outletId?: string | null;
  outletName?: string | null;
  transactions?: number;
  revenue?: number;
  averageCheck?: number;
  pointsIssued?: number;
  pointsRedeemed?: number;
  newCustomers?: number;
  performanceScore?: number;
};

type OperationsResponse = { staffMetrics?: ApiStaffRow[] };
type OutletOption = { value: string; label: string };
type PeriodValue = "yesterday" | "week" | "month" | "quarter" | "year";

type StaffDisplayRow = {
  id: string;
  name: string;
  branch: string;
  performanceScore: number;
  salesCount: number;
  revenue: number;
  avgCheck: number;
  accruedPoints: number;
  redeemedPoints: number;
  newClients: number;
};

const periodOptions: Array<{ value: PeriodValue; label: string }> = [
  { value: "yesterday", label: "Вчера" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

const moneyFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("ru-RU");

const formatCurrency = (value: number) => `₽${moneyFormatter.format(Math.round(value))}`;
const formatNumber = (value: number) => numberFormatter.format(Math.round(value));
const safeNumber = (value: number | null | undefined) =>
  typeof value === "number" && !Number.isNaN(value) ? value : 0;

const initialsFromName = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export default function StaffActivityPage() {
  const [period, setPeriod] = React.useState<PeriodValue>("month");
  const [selectedOutlet, setSelectedOutlet] = React.useState<string>("all");
  const [groupByEmployee, setGroupByEmployee] = React.useState(false);
  const [outletOptions, setOutletOptions] = React.useState<OutletOption[]>([{ value: "all", label: "Все точки" }]);
  const [items, setItems] = React.useState<ApiStaffRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [outletsLoading, setOutletsLoading] = React.useState(false);
  const [outletsError, setOutletsError] = React.useState("");

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
        return data as { items?: Array<{ id: string; name?: string | null }> };
      })
      .then((data) => {
        if (cancelled) return;
        const dynamic =
          Array.isArray(data.items) && data.items.length
            ? data.items
                .filter((row): row is { id: string; name?: string | null } => Boolean(row?.id))
                .map((row) => ({ value: row.id, label: row.name || row.id }))
            : [];
        setOutletOptions([{ value: "all", label: "Все точки" }, ...dynamic]);
      })
      .catch((err: any) => {
        if (!cancelled) setOutletsError(normalizeErrorMessage(err, "Не удалось загрузить точки"));
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
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError("");

    const params = new URLSearchParams({ period });
    fetch(`/api/portal/analytics/operations?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as any)?.message || "Не удалось загрузить аналитику персонала");
        return data as OperationsResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.staffMetrics) ? data.staffMetrics : []);
      })
      .catch((err: any) => {
        if (cancelled || err?.name === "AbortError") return;
        setError(normalizeErrorMessage(err, "Не удалось загрузить аналитику персонала"));
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [period]);

  const staffRows = React.useMemo<StaffDisplayRow[]>(() => {
    if (!items.length) return [];

    const withOutlet = selectedOutlet === "all" ? items : items.filter((row) => row.outletId === selectedOutlet);

    if (groupByEmployee) {
      const aggregated = new Map<string, StaffDisplayRow & { branches: Set<string> }>();
      withOutlet.forEach((row) => {
        if (!row.id) return;
        if (!aggregated.has(row.id)) {
          aggregated.set(row.id, {
            id: row.id,
            name: row.name || row.id,
            branch: "",
            performanceScore: 0,
            salesCount: 0,
            revenue: 0,
            avgCheck: 0,
            accruedPoints: 0,
            redeemedPoints: 0,
            newClients: 0,
            branches: new Set<string>(),
          });
        }
        const entry = aggregated.get(row.id)!;
        entry.branches.add(row.outletName || row.outletId || "Все точки");
        entry.performanceScore += safeNumber(row.performanceScore);
        entry.salesCount += safeNumber(row.transactions);
        entry.revenue += safeNumber(row.revenue);
        entry.accruedPoints += safeNumber(row.pointsIssued);
        entry.redeemedPoints += safeNumber(row.pointsRedeemed);
        entry.newClients += safeNumber(row.newCustomers);
      });

      return Array.from(aggregated.values())
        .map((entry) => {
          const avgCheck = entry.salesCount > 0 ? Math.round(entry.revenue / Math.max(1, entry.salesCount)) : 0;
          return {
            ...entry,
            branch: Array.from(entry.branches).join(", "),
            avgCheck,
            revenue: Math.round(entry.revenue),
            salesCount: Math.round(entry.salesCount),
            accruedPoints: Math.round(entry.accruedPoints),
            redeemedPoints: Math.round(Math.abs(entry.redeemedPoints)),
            newClients: Math.round(entry.newClients),
            performanceScore: Math.round(entry.performanceScore),
          };
        })
        .sort((a, b) => (b.revenue === a.revenue ? b.performanceScore - a.performanceScore : b.revenue - a.revenue));
    }

    return withOutlet
      .map((row) => {
        const salesCount = safeNumber(row.transactions);
        const revenue = safeNumber(row.revenue);
        const avgCheck =
          typeof row.averageCheck === "number" && !Number.isNaN(row.averageCheck)
            ? Math.round(row.averageCheck)
            : salesCount > 0
              ? Math.round(revenue / Math.max(1, salesCount))
              : 0;
        return {
          id: row.id,
          name: row.name || row.id,
          branch: row.outletName || row.outletId || "—",
          performanceScore: Math.round(safeNumber(row.performanceScore)),
          salesCount: Math.round(salesCount),
          revenue: Math.round(revenue),
          avgCheck,
          accruedPoints: Math.round(safeNumber(row.pointsIssued)),
          redeemedPoints: Math.round(Math.abs(safeNumber(row.pointsRedeemed))),
          newClients: Math.round(safeNumber(row.newCustomers)),
        };
      })
      .sort((a, b) => (b.revenue === a.revenue ? b.performanceScore - a.performanceScore : b.revenue - a.revenue));
  }, [items, groupByEmployee, selectedOutlet]);

  const totals = React.useMemo(() => {
    if (!staffRows.length) {
      return {
        salesCount: 0,
        revenue: 0,
        accruedPoints: 0,
        redeemedPoints: 0,
        newClients: 0,
        performanceScore: 0,
      };
    }

    const sum = staffRows.reduce(
      (acc, row) => {
        acc.salesCount += row.salesCount;
        acc.revenue += row.revenue;
        acc.accruedPoints += row.accruedPoints;
        acc.redeemedPoints += row.redeemedPoints;
        acc.newClients += row.newClients;
        acc.performanceScore += row.performanceScore;
        return acc;
      },
      {
        salesCount: 0,
        revenue: 0,
        accruedPoints: 0,
        redeemedPoints: 0,
        newClients: 0,
        performanceScore: 0,
      }
    );

    return {
      salesCount: sum.salesCount,
      revenue: sum.revenue,
      accruedPoints: sum.accruedPoints,
      redeemedPoints: sum.redeemedPoints,
      newClients: sum.newClients,
      avgCheck: sum.salesCount > 0 ? Math.round(sum.revenue / Math.max(1, sum.salesCount)) : 0,
      performanceScore: Math.round(sum.performanceScore / staffRows.length),
    };
  }, [staffRows]);

  const hasActivity = React.useMemo(
    () =>
      staffRows.some(
        (row) =>
          row.revenue > 0 ||
          row.salesCount > 0 ||
          row.newClients > 0 ||
          row.performanceScore > 0,
      ),
    [staffRows],
  );

  const leaders = React.useMemo(() => {
    if (!staffRows.length) return null;
    const byScore = [...staffRows].sort((a, b) =>
      b.performanceScore === a.performanceScore ? b.revenue - a.revenue : b.performanceScore - a.performanceScore
    )[0];
    const byRevenue = [...staffRows].sort((a, b) => (b.revenue === a.revenue ? b.salesCount - a.salesCount : b.revenue - a.revenue))[0];
    const byAcquisition = [...staffRows].sort((a, b) =>
      b.newClients === a.newClients ? b.revenue - a.revenue : b.newClients - a.newClients
    )[0];
    return { score: byScore, revenue: byRevenue, acquisition: byAcquisition };
  }, [staffRows]);

  const scoreClasses = React.useMemo(() => {
    if (!staffRows.length) return new Map<string, string>();
    const sorted = [...staffRows].sort((a, b) => b.performanceScore - a.performanceScore);
    const total = sorted.length;
    const map = new Map<string, string>();
    sorted.forEach((row, index) => {
      const ratio = total > 1 ? index / (total - 1) : 0;
      let color = "text-blue-600";
      if (ratio <= 0.33) color = "text-green-600";
      else if (ratio <= 0.66) color = "text-orange-500";
      map.set(`${row.id}::${row.branch}`, color);
    });
    return map;
  }, [staffRows]);

  const leaderScoreClass = React.useMemo(() => {
    if (!leaders?.score) return "text-gray-600";
    if (!hasActivity) return "text-gray-600";
    return scoreClasses.get(`${leaders.score.id}::${leaders.score.branch}`) ?? "text-gray-600";
  }, [hasActivity, leaders, scoreClasses]);

  const getScoreClass = React.useCallback(
    (staff: StaffDisplayRow) => scoreClasses.get(`${staff.id}::${staff.branch}`) ?? "text-blue-600",
    [scoreClasses],
  );

  const periodLabel = React.useMemo(
    () => periodOptions.find((option) => option.value === period)?.label ?? "Период",
    [period]
  );

  const uniqueOutlets = React.useMemo(() => outletOptions.filter((opt) => opt.value !== "all"), [outletOptions]);

  const handleToggleGroup = () => {
    if (!groupByEmployee && selectedOutlet !== "all") {
      setSelectedOutlet("all");
    }
    setGroupByEmployee((prev) => !prev);
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Активность персонала</h2>
          <p className="text-gray-500">Показатели эффективности сотрудников и KPI.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
            <Calendar size={16} className="text-gray-400" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodValue)}
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
              value={selectedOutlet}
              onChange={(e) => setSelectedOutlet(e.target.value)}
              disabled={outletsLoading}
              className="bg-transparent text-sm text-gray-700 font-medium focus:outline-none cursor-pointer pr-4"
            >
              <option value="all">Все точки</option>
              {uniqueOutlets.map((outlet) => (
                <option key={outlet.value} value={outlet.value}>
                  {outlet.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleToggleGroup}
            className={`flex items-center space-x-2 border rounded-lg px-3 py-2 shadow-sm text-sm font-medium transition-colors ${
              groupByEmployee
                ? "bg-purple-50 border-purple-200 text-purple-700"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            title="Объединить статистику сотрудника по всем точкам"
          >
            <Users size={16} />
            <span>Объединить торговые точки</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden animate-pulse"
            >
              <div className="h-4 bg-gray-100 rounded w-28 mb-4" />
              <div className="h-6 bg-gray-100 rounded w-1/2 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-2/5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-white to-amber-50 p-5 rounded-xl border border-amber-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Star size={64} className="text-amber-500" />
            </div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                <Medal size={20} />
              </div>
              <span className="text-sm font-semibold text-amber-900">Лучший сотрудник</span>
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-bold text-gray-900">
                {hasActivity ? leaders?.score?.name : "Нет данных"}
              </h3>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className={`text-2xl font-bold ${leaderScoreClass}`}>
                  {hasActivity ? formatNumber(leaders?.score?.performanceScore ?? 0) : "—"}
                </span>
                <span className="text-sm text-gray-500">очков</span>
              </div>
              <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                {hasActivity ? leaders?.score?.branch : "—"}
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-purple-50 p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <TrendingUp size={64} className="text-purple-600" />
            </div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                <BadgeCheck size={20} />
              </div>
              <span className="text-sm font-semibold text-purple-900">Лучший продавец</span>
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-bold text-gray-900">
                {hasActivity ? leaders?.revenue?.name : "Нет данных"}
              </h3>
              <p className="text-2xl font-bold text-purple-700 mt-1">
                {hasActivity ? formatCurrency(leaders?.revenue?.revenue ?? 0) : "—"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {hasActivity ? `${formatNumber(leaders?.revenue?.salesCount ?? 0)} транзакций` : "—"}
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-blue-50 p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <UserPlus size={64} className="text-blue-600" />
            </div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                <UserPlus size={20} />
              </div>
              <span className="text-sm font-semibold text-blue-900">Лидер привлечения</span>
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-bold text-gray-900">
                {hasActivity ? leaders?.acquisition?.name : "Нет данных"}
              </h3>
              <p className="text-2xl font-bold text-blue-700 mt-1">
                {hasActivity ? `+${formatNumber(leaders?.acquisition?.newClients ?? 0)}` : "—"}{" "}
                <span className="text-sm font-normal text-blue-600">новых клиентов</span>
              </p>
              <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                {hasActivity ? leaders?.acquisition?.branch : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Детальная эффективность</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Сотрудник</th>
                <th className="px-6 py-4 font-semibold">Филиал</th>
                <th className="px-6 py-4 font-semibold text-center">Очки</th>
                <th className="px-6 py-4 font-semibold text-right">Чеков</th>
                <th className="px-6 py-4 font-semibold text-right">Выручка</th>
                <th className="px-6 py-4 font-semibold text-right">Ср. чек</th>
                <th className="px-6 py-4 font-semibold text-right">Начисл.</th>
                <th className="px-6 py-4 font-semibold text-right">Списано</th>
                <th className="px-6 py-4 font-semibold text-right">Новые</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading
                ? Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      {Array.from({ length: 9 }).map((__, cellIdx) => (
                        <td key={cellIdx} className="px-6 py-4">
                          <div className="h-4 bg-gray-100 rounded w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                : staffRows.map((staff) => (
                    <tr key={`${staff.id}-${staff.branch}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900 flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 mr-3 text-xs font-bold flex-shrink-0">
                          {initialsFromName(staff.name)}
                        </div>
                        {staff.name}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        <span
                          className="inline-block px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 max-w-[150px] truncate"
                          title={staff.branch}
                        >
                          {staff.branch}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`font-bold ${getScoreClass(staff)}`}>
                          {formatNumber(staff.performanceScore)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">{formatNumber(staff.salesCount)}</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(staff.revenue)}</td>
                      <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(staff.avgCheck)}</td>
                      <td className="px-6 py-4 text-right text-green-600">+{formatNumber(staff.accruedPoints)}</td>
                      <td className="px-6 py-4 text-right text-red-500">-{formatNumber(staff.redeemedPoints)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          +{formatNumber(staff.newClients)}
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="font-bold text-gray-900">
                <td className="px-6 py-4" colSpan={2}>
                  ИТОГО / СРЕДНЕЕ
                </td>
                <td className="px-6 py-4 text-center">{loading ? "—" : formatNumber(totals.performanceScore)}</td>
                <td className="px-6 py-4 text-right">{loading ? "—" : formatNumber(totals.salesCount)}</td>
                <td className="px-6 py-4 text-right">{loading ? "—" : formatCurrency(totals.revenue)}</td>
                <td className="px-6 py-4 text-right text-purple-700">{loading ? "—" : formatCurrency(totals.avgCheck)}</td>
                <td className="px-6 py-4 text-right text-green-700">{loading ? "—" : `+${formatNumber(totals.accruedPoints)}`}</td>
                <td className="px-6 py-4 text-right text-red-700">{loading ? "—" : `-${formatNumber(totals.redeemedPoints)}`}</td>
                <td className="px-6 py-4 text-right">{loading ? "—" : `+${formatNumber(totals.newClients)}`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!loading && !staffRows.length && (
          <div className="p-6 text-center text-sm text-gray-500 border-t border-gray-100">Нет данных за выбранный период</div>
        )}
        {(error || outletsError) && (
          <div className="px-6 pb-6 text-sm text-red-600 font-medium">
            {error || outletsError}
          </div>
        )}
      </div>
    </div>
  );
}
