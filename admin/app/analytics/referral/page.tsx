"use client";

import { useEffect, useState } from "react";
import { getReferralSummaryAnalytics } from "../../../lib/admin";
import KpiCard from "../../../components/KpiCard";
import { UserPlus, ShoppingCart, Banknote } from "lucide-react";
import TopBar from "../../../components/TopBar";
import Card from "../../../components/ui/Card";
import Skeleton from "../../../components/ui/Skeleton";

export default function ReferralAnalyticsPage() {
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
      setData(await getReferralSummaryAnalytics(merchantId, qp));
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

      {busy && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Зарегистрировано по реф." value={data?.registeredViaReferral ?? '—'} icon={<UserPlus size={18} />} />
          <KpiCard title="Совершили покупку" value={data?.purchasedViaReferral ?? '—'} icon={<ShoppingCart size={18} />} />
          <KpiCard title="Выручка по привлеченным" value={data?.referralRevenue ?? '—'} icon={<Banknote size={18} />} />
        </div>
      )}

      <Card title="Пользователи пригласившие больше всех за период">
        {busy && !data ? (
          <Skeleton className="h-60" />
        ) : (
          <div className="overflow-auto">
            <table className="min-w-max border-collapse">
              <thead>
                <tr>
                  <th className="border border-[#1e2a44] p-2">№</th>
                  <th className="border border-[#1e2a44] p-2 text-left">Имя</th>
                  <th className="border border-[#1e2a44] p-2">Приглашено</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topReferrers || []).map((r: any) => (
                  <tr key={r.customerId}>
                    <td className="border border-[#1e2a44] p-2 text-center">{r.rank}</td>
                    <td className="border border-[#1e2a44] p-2 text-left">{r.name}</td>
                    <td className="border border-[#1e2a44] p-2 text-center">{r.invited}</td>
                  </tr>
                ))}
                {(!data || (data?.topReferrers || []).length === 0) && (
                  <tr><td colSpan={3} className="p-3 text-sm text-[#7f8ea3]">Нет данных</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
