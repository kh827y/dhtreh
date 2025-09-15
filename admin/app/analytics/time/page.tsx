"use client";

import { useEffect, useMemo, useState } from "react";
import { getRevenueMetrics } from "../../../lib/admin";
import SimpleLineChart, { type Series } from "../../../components/SimpleLineChart";
import TopBar from "../../../components/TopBar";
import Card from "../../../components/ui/Card";
import Skeleton from "../../../components/ui/Skeleton";

export default function TimeAnalyticsPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const [period, setPeriod] = useState<string>("week");
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seriesEnabled, setSeriesEnabled] = useState<Record<string, boolean>>({ revenue: true, transactions: true });
  const [customRange, setCustomRange] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const load = async () => {
    setBusy(true); setError(null);
    try {
      const qp: any = customRange ? { from: fromDate || undefined, to: toDate || undefined } : { period };
      setData(await getRevenueMetrics(merchantId, qp));
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  const chart = useMemo(() => {
    const hourly = data?.hourlyDistribution || [];
    const labels = hourly.map((h: any) => `${String(h.hour).padStart(2,'0')}:00`);
    const s: Series[] = [
      { key: 'revenue', color: '#22c55e', points: hourly.map((h: any, i: number) => ({ x: i, y: h.revenue })), enabled: !!seriesEnabled.revenue },
      { key: 'transactions', color: '#60a5fa', points: hourly.map((h: any, i: number) => ({ x: i, y: h.transactions })), enabled: !!seriesEnabled.transactions },
    ];
    return { labels, s };
  }, [data, seriesEnabled]);

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

      <Card title="По времени суток" actions={
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={seriesEnabled.revenue} onChange={e=>setSeriesEnabled(v=>({ ...v, revenue: e.target.checked }))} /> Выручка</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={seriesEnabled.transactions} onChange={e=>setSeriesEnabled(v=>({ ...v, transactions: e.target.checked }))} /> Продажи</label>
        </div>
      }>
        {busy && !data ? (
          <Skeleton className="h-72" />
        ) : (
          <SimpleLineChart width={860} height={260} series={chart.s} xLabels={chart.labels} />
        )}
      </Card>
    </div>
  );
}
