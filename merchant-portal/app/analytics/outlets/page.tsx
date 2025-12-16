"use client";

import React from "react";
import "./outlets.css";
import { Calendar, Store, Award, TrendingUp, Users, ShoppingBag } from "lucide-react";

type ApiOutletRow = {
  id: string;
  name?: string | null;
  revenue?: number;
  transactions?: number;
  averageCheck?: number;
  pointsIssued?: number;
  pointsRedeemed?: number;
  customers?: number;
  newCustomers?: number;
};

type OperationsResponse = { outletMetrics?: ApiOutletRow[] };
type PeriodValue = "yesterday" | "week" | "month" | "quarter" | "year";

type OutletDisplayRow = {
  id: string;
  name: string;
  salesCount: number;
  revenue: number;
  avgCheck: number;
  accruedPoints: number;
  redeemedPoints: number;
  customerCount: number;
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

const safeNumber = (value: number | null | undefined) =>
  typeof value === "number" && !Number.isNaN(value) ? value : 0;

const formatCurrency = (value: number) => `₽${moneyFormatter.format(Math.round(value))}`;
const formatNumber = (value: number) => numberFormatter.format(Math.round(value));

export default function OutletsActivityPage() {
  const [period, setPeriod] = React.useState<PeriodValue>("month");
  const [items, setItems] = React.useState<ApiOutletRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError("");

    const params = new URLSearchParams({ period });
    fetch(`/api/portal/analytics/operations?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as any)?.message || "Не удалось загрузить аналитику по точкам");
        return data as OperationsResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.outletMetrics) ? data.outletMetrics : []);
      })
      .catch((err: any) => {
        if (cancelled || err?.name === "AbortError") return;
        setError(String(err?.message || err));
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

  const rows = React.useMemo<OutletDisplayRow[]>(() => {
    if (!items.length) return [];
    return items
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
          salesCount: Math.round(salesCount),
          revenue: Math.round(revenue),
          avgCheck,
          accruedPoints: Math.round(safeNumber(row.pointsIssued)),
          redeemedPoints: Math.round(Math.abs(safeNumber(row.pointsRedeemed))),
          customerCount: Math.round(safeNumber(row.customers)),
          newClients: Math.round(safeNumber(row.newCustomers)),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [items]);

  const totals = React.useMemo(() => {
    if (!rows.length) {
      return {
        salesCount: 0,
        revenue: 0,
        accruedPoints: 0,
        redeemedPoints: 0,
        customerCount: 0,
        newClients: 0,
      };
    }

    const sum = rows.reduce(
      (acc, row) => {
        acc.salesCount += row.salesCount;
        acc.revenue += row.revenue;
        acc.accruedPoints += row.accruedPoints;
        acc.redeemedPoints += row.redeemedPoints;
        acc.customerCount += row.customerCount;
        acc.newClients += row.newClients;
        return acc;
      },
      {
        salesCount: 0,
        revenue: 0,
        accruedPoints: 0,
        redeemedPoints: 0,
        customerCount: 0,
        newClients: 0,
      }
    );

    return {
      salesCount: sum.salesCount,
      revenue: sum.revenue,
      accruedPoints: sum.accruedPoints,
      redeemedPoints: sum.redeemedPoints,
      customerCount: sum.customerCount,
      newClients: sum.newClients,
      avgCheck: sum.salesCount > 0 ? Math.round(sum.revenue / Math.max(1, sum.salesCount)) : 0,
    };
  }, [rows]);

  const leaders = React.useMemo(() => {
    if (!rows.length) return null;
    const byRevenue = [...rows].sort((a, b) => b.revenue - a.revenue)[0];
    const byNewClients = [...rows].sort((a, b) => b.newClients - a.newClients)[0];
    const byTraffic = [...rows].sort((a, b) => b.salesCount - a.salesCount)[0];
    return { revenue: byRevenue, newClients: byNewClients, traffic: byTraffic };
  }, [rows]);

  const periodLabel = React.useMemo(
    () => periodOptions.find((option) => option.value === period)?.label ?? "Период",
    [period]
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Активность точек</h2>
          <p className="text-gray-500">Показатели эффективности по локациям и точкам продаж.</p>
        </div>

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
      ) : leaders ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-white to-purple-50 p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Store size={64} className="text-purple-600" />
            </div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                <Award size={20} />
              </div>
              <span className="text-sm font-semibold text-purple-900">Лидер по выручке</span>
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-bold text-gray-900">{leaders.revenue?.name}</h3>
              <p className="text-2xl font-bold text-purple-700 mt-1">{formatCurrency(leaders.revenue?.revenue ?? 0)}</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-blue-50 p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Users size={64} className="text-blue-600" />
            </div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                <TrendingUp size={20} />
              </div>
              <span className="text-sm font-semibold text-blue-900">Лидер роста</span>
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-bold text-gray-900">{leaders.newClients?.name}</h3>
              <p className="text-2xl font-bold text-blue-700 mt-1">
                +{formatNumber(leaders.newClients?.newClients ?? 0)} <span className="text-sm font-normal text-blue-600">новых клиентов</span>
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-green-50 p-5 rounded-xl border border-green-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <ShoppingBag size={64} className="text-green-600" />
            </div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="bg-green-100 p-2 rounded-lg text-green-600">
                <Store size={20} />
              </div>
              <span className="text-sm font-semibold text-green-900">Макс. трафик</span>
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-bold text-gray-900">{leaders.traffic?.name}</h3>
              <p className="text-2xl font-bold text-green-700 mt-1">
                {formatNumber(leaders.traffic?.salesCount ?? 0)} <span className="text-sm font-normal text-green-600">транзакций</span>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-gray-500 border border-gray-100 rounded-xl bg-white">Нет данных за выбранный период</div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Эффективность точек</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Точка</th>
                <th className="px-6 py-4 font-semibold text-right">Чеков</th>
                <th className="px-6 py-4 font-semibold text-right">Выручка</th>
                <th className="px-6 py-4 font-semibold text-right">Ср. чек</th>
                <th className="px-6 py-4 font-semibold text-right">Начисл.</th>
                <th className="px-6 py-4 font-semibold text-right">Списано</th>
                <th className="px-6 py-4 font-semibold text-right">Клиентов</th>
                <th className="px-6 py-4 font-semibold text-right">Новые</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading
                ? Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      {Array.from({ length: 8 }).map((__, cellIdx) => (
                        <td key={cellIdx} className="px-6 py-4">
                          <div className="h-4 bg-gray-100 rounded w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((outlet) => (
                    <tr key={outlet.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900 flex items-center">
                        <Store size={16} className="text-gray-400 mr-2" />
                        {outlet.name}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">{formatNumber(outlet.salesCount)}</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(outlet.revenue)}</td>
                      <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(outlet.avgCheck)}</td>
                      <td className="px-6 py-4 text-right text-green-600">+{formatNumber(outlet.accruedPoints)}</td>
                      <td className="px-6 py-4 text-right text-red-500">-{formatNumber(outlet.redeemedPoints)}</td>
                      <td className="px-6 py-4 text-right text-gray-600">{formatNumber(outlet.customerCount)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          +{formatNumber(outlet.newClients)}
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="font-bold text-gray-900">
                <td className="px-6 py-4">ИТОГО</td>
                <td className="px-6 py-4 text-right">{loading ? "—" : formatNumber(totals.salesCount)}</td>
                <td className="px-6 py-4 text-right">{loading ? "—" : formatCurrency(totals.revenue)}</td>
                <td className="px-6 py-4 text-right text-purple-700">{loading ? "—" : formatCurrency(totals.avgCheck)}</td>
                <td className="px-6 py-4 text-right text-green-700">
                  {loading ? "—" : `+${formatNumber(totals.accruedPoints)}`}
                </td>
                <td className="px-6 py-4 text-right text-red-700">
                  {loading ? "—" : `-${formatNumber(totals.redeemedPoints)}`}
                </td>
                <td className="px-6 py-4 text-right">{loading ? "—" : formatNumber(totals.customerCount)}</td>
                <td className="px-6 py-4 text-right">{loading ? "—" : `+${formatNumber(totals.newClients)}`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!loading && !rows.length && (
          <div className="p-6 text-center text-sm text-gray-500 border-t border-gray-100">Нет данных за выбранный период</div>
        )}
        {error && <div className="px-6 pb-6 text-sm text-red-600 font-medium">{error}</div>}
      </div>
    </div>
  );
}
