"use client";

import { useEffect, useMemo, useState } from "react";
import { getRevenueMetrics, getCustomerMetrics, getLoyaltyMetrics, getBusinessMetricsAnalytics } from "../../../lib/admin";
import KpiCard from "../../../components/KpiCard";
import SimpleLineChart, { type Series } from "../../../components/SimpleLineChart";
import TopBar from "../../../components/TopBar";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Skeleton from "../../../components/ui/Skeleton";
import { TrendingUp, Users, ShoppingBag, Coins } from "lucide-react";

export default function AnalyticsSummaryPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const [period, setPeriod] = useState<string>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revenue, setRevenue] = useState<any | null>(null);
  const [customers, setCustomers] = useState<any | null>(null);
  const [loyalty, setLoyalty] = useState<any | null>(null);

  const [seriesEnabled, setSeriesEnabled] = useState<Record<string, boolean>>({
    revenue: true,
    transactions: true,
    customers: true,
  });

  const [minPurchases, setMinPurchases] = useState<number>(3);
  const [biz, setBiz] = useState<any | null>(null);

  const load = async () => {
    setBusy(true); setError(null);
    try {
      const [r, c, l] = await Promise.all([
        getRevenueMetrics(merchantId, { period }),
        getCustomerMetrics(merchantId, { period }),
        getLoyaltyMetrics(merchantId, { period }),
      ]);
      setRevenue(r); setCustomers(c); setLoyalty(l);
      const bm = await getBusinessMetricsAnalytics(merchantId, { period, minPurchases });
      setBiz(bm);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const chartData = useMemo(() => {
    const labels: string[] = revenue?.dailyRevenue?.map((d: any) => d.date) || [];
    const revenuePoints = revenue?.dailyRevenue?.map((d: any, i: number) => ({ x: i, y: d.revenue })) || [];
    const txPoints = revenue?.dailyRevenue?.map((d: any, i: number) => ({ x: i, y: d.transactions })) || [];
    const custPoints = revenue?.dailyRevenue?.map((d: any, i: number) => ({ x: i, y: d.customers })) || [];
    const s: Series[] = [
      { key: 'revenue', color: '#22c55e', points: revenuePoints, enabled: !!seriesEnabled.revenue },
      { key: 'transactions', color: '#60a5fa', points: txPoints, enabled: !!seriesEnabled.transactions },
      { key: 'customers', color: '#f59e0b', points: custPoints, enabled: !!seriesEnabled.customers },
    ];
    return { labels, s };
  }, [revenue, seriesEnabled]);

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
      />

      {busy && !revenue && !customers && !loyalty ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard title="Новые регистрации" value={customers?.newCustomers ?? '—'} subtitle="за период" icon={<Users size={18} />} />
          <KpiCard title="Продажи (чеков)" value={revenue?.transactionCount ?? '—'} subtitle="кол-во" icon={<ShoppingBag size={18} />} />
          <KpiCard title="Выручка" value={revenue?.totalRevenue ?? '—'} subtitle="за период" icon={<TrendingUp size={18} />} />
          <KpiCard title="Активные кошельки" value={loyalty?.activeWallets ?? '—'} subtitle="баланс > 0" icon={<Coins size={18} />} />
        </div>
      )}

      <Card title="Графики по метрикам" actions={
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={seriesEnabled.revenue} onChange={e=>setSeriesEnabled(v=>({ ...v, revenue: e.target.checked }))} /> Выручка</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={seriesEnabled.transactions} onChange={e=>setSeriesEnabled(v=>({ ...v, transactions: e.target.checked }))} /> Продажи</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={seriesEnabled.customers} onChange={e=>setSeriesEnabled(v=>({ ...v, customers: e.target.checked }))} /> Клиенты</label>
        </div>
      }>
        {busy && !revenue ? (
          <Skeleton className="h-72" />
        ) : (
          <SimpleLineChart width={860} height={260} series={chartData.s} xLabels={chartData.labels} />
        )}
      </Card>

      <Card title="Бизнес‑метрики" subtitle="Средний чек покупателей, совершивших ≥ N покупок">
        <div className="flex items-center gap-2 text-sm mb-3">
          <Input label="N" type="number" min={1} max={100} value={minPurchases} onChange={e=>setMinPurchases(Math.max(1, Math.min(100, parseInt(e.target.value||'3',10))))} className="w-20" />
          <Button variant="outline" onClick={async()=>{ setBiz(await getBusinessMetricsAnalytics(merchantId, { period, minPurchases })); }}>Рассчитать</Button>
        </div>
        {busy && !biz ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : biz ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KpiCard title="Средний чек" value={biz.averageCheck} subtitle={`при N ≥ ${biz.minPurchases}`} />
            <KpiCard title="Клиентов" value={biz.customers} />
            <KpiCard title="Транзакций" value={biz.transactions} />
            <KpiCard title="Выручка" value={biz.revenue} />
          </div>
        ) : (
          <div className="text-sm text-[#7f8ea3]">Нет данных. Выберите период и нажмите Рассчитать.</div>
        )}
      </Card>
    </div>
  );
}
