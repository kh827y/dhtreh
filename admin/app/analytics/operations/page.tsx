"use client";

import { useEffect, useState } from "react";
import { getOperationalMetrics } from "../../../lib/admin";
import TopBar from "../../../components/TopBar";
import Card from "../../../components/ui/Card";
import Skeleton from "../../../components/ui/Skeleton";

export default function OperationsAnalyticsPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const [period, setPeriod] = useState<string>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [customRange, setCustomRange] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const load = async () => {
    setBusy(true); setError(null);
    try {
      const qp: any = customRange ? { from: fromDate || undefined, to: toDate || undefined } : { period };
      setData(await getOperationalMetrics(merchantId, qp));
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-5">
      <TopBar
        merchantId={merchantId}
        onMerchantIdChange={setMerchantId}
        period={period}
        onPeriodChange={setPeriod as any}
        onRefresh={load}
        busy={busy}
        error={error}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card title="Активность торговых точек">
          {busy && !data ? (
            <Skeleton className="h-60" />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-max border-collapse">
                <thead>
                  <tr>
                    <th className="border border-[#1e2a44] p-2 text-left">Точка</th>
                    <th className="border border-[#1e2a44] p-2">Выручка</th>
                    <th className="border border-[#1e2a44] p-2">Транзакций</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.topOutlets || []).map((o: any) => (
                    <tr key={o.id}>
                      <td className="border border-[#1e2a44] p-2 text-left">{o.name || o.id}</td>
                      <td className="border border-[#1e2a44] p-2 text-center">{o.revenue}</td>
                      <td className="border border-[#1e2a44] p-2 text-center">{o.transactions}</td>
                    </tr>
                  ))}
                  {(data?.topOutlets || []).length === 0 && (
                    <tr><td colSpan={3} className="p-3 text-sm text-[#7f8ea3]">Нет данных</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Активность сотрудников">
          {busy && !data ? (
            <Skeleton className="h-60" />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-max border-collapse">
                <thead>
                  <tr>
                    <th className="border border-[#1e2a44] p-2 text-left">Сотрудник</th>
                    <th className="border border-[#1e2a44] p-2">Выручка</th>
                    <th className="border border-[#1e2a44] p-2">Транзакций</th>
                    <th className="border border-[#1e2a44] p-2">Средний чек</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.topStaff || []).map((s: any) => (
                    <tr key={s.id}>
                      <td className="border border-[#1e2a44] p-2 text-left">{s.name || s.id}</td>
                      <td className="border border-[#1e2a44] p-2 text-center">{s.revenue}</td>
                      <td className="border border-[#1e2a44] p-2 text-center">{s.transactions}</td>
                      <td className="border border-[#1e2a44] p-2 text-center">{Math.round(s.averageCheck)}</td>
                    </tr>
                  ))}
                  {(data?.topStaff || []).length === 0 && (
                    <tr><td colSpan={4} className="p-3 text-sm text-[#7f8ea3]">Нет данных</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Пиковые часы и устройства">
        {busy && !data ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {(data?.peakHours || []).map((h: string, i: number) => (
                <span key={i} className="px-2 py-1 rounded bg-[#111c31] text-[#9fb0c9] border border-[#1e2a44] text-xs">{h}</span>
              ))}
              {(data?.peakHours || []).length === 0 && (
                <span className="text-sm text-[#7f8ea3]">Нет данных по пиковым часам</span>
              )}
            </div>
            <div className="overflow-auto">
              <table className="min-w-max border-collapse">
                <thead>
                  <tr>
                    <th className="border border-[#1e2a44] p-2">Устройство</th>
                    <th className="border border-[#1e2a44] p-2">Тип</th>
                    <th className="border border-[#1e2a44] p-2">Транзакций</th>
                    <th className="border border-[#1e2a44] p-2">Последняя активность</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.deviceUsage || []).map((d: any) => (
                    <tr key={d.deviceId}>
                      <td className="border border-[#1e2a44] p-2">{d.deviceId}</td>
                      <td className="border border-[#1e2a44] p-2">{d.type}</td>
                      <td className="border border-[#1e2a44] p-2 text-center">{d.transactions}</td>
                      <td className="border border-[#1e2a44] p-2">{d.lastActive ? new Date(d.lastActive).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                  {(data?.deviceUsage || []).length === 0 && (
                    <tr><td colSpan={4} className="p-3 text-sm text-[#7f8ea3]">Нет данных</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
