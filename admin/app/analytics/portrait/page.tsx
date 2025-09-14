"use client";

import { useEffect, useMemo, useState } from "react";
import { getCustomerPortraitAnalytics } from "../../../lib/admin";
import KpiCard from "../../../components/KpiCard";
import TopBar from "../../../components/TopBar";
import Card from "../../../components/ui/Card";
import Skeleton from "../../../components/ui/Skeleton";

export default function CustomerPortraitPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const [period, setPeriod] = useState<string>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  const load = async () => {
    setBusy(true); setError(null);
    try { setData(await getCustomerPortraitAnalytics(merchantId, { period })); } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  const genders = useMemo(() => data?.gender || [], [data]);
  const ages = useMemo(() => data?.age || [], [data]);
  const bySexBucket = useMemo(() => data?.sexAge || [], [data]);

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

      <Card title="Пол — средний чек, количество и выручка">
        {busy && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : genders.length === 0 ? (
          <div className="text-sm text-[#7f8ea3]">Нет данных</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {genders.map((g: any) => (
              <div key={g.sex} className="rounded-lg border border-[#1e2a44] p-4">
                <div className="text-sm text-[#9fb0c9] mb-1">{g.sex === 'M' ? 'Мужчины' : g.sex === 'F' ? 'Женщины' : 'Не указан'}</div>
                <div className="text-2xl font-semibold mb-1">{g.averageCheck}</div>
                <div className="text-xs text-[#7f8ea3]">Средний чек</div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <KpiCard title="Клиенты" value={g.customers} />
                  <KpiCard title="Выручка" value={g.revenue} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Возраст — распределение">
        {busy && !data ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid grid-cols-7 gap-3 items-end">
            {ages.map((a: any) => (
              <div key={a.bucket} className="text-center">
                <div className="mx-auto w-10 bg-[#60a5fa] rounded" style={{ height: Math.max(4, Math.min(140, a.customers)) }} />
                <div className="text-xs mt-1 text-[#9fb0c9]">{a.bucket}</div>
                <div className="text-xs mt-1 text-[#7f8ea3]">{a.customers} клиентов</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Пол × Возраст">
        {busy && !data ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="overflow-auto">
            <table className="min-w-max border-collapse">
              <thead>
                <tr>
                  <th className="border border-[#1e2a44] p-2">Пол</th>
                  <th className="border border-[#1e2a44] p-2">Возраст</th>
                  <th className="border border-[#1e2a44] p-2">Клиенты</th>
                  <th className="border border-[#1e2a44] p-2">Покупки</th>
                  <th className="border border-[#1e2a44] p-2">Выручка</th>
                  <th className="border border-[#1e2a44] p-2">Средний чек</th>
                </tr>
              </thead>
              <tbody>
                {bySexBucket.map((r: any, idx: number) => (
                  <tr key={idx}>
                    <td className="border border-[#1e2a44] p-2">{r.sex}</td>
                    <td className="border border-[#1e2a44] p-2">{r.bucket}</td>
                    <td className="border border-[#1e2a44] p-2">{r.customers}</td>
                    <td className="border border-[#1e2a44] p-2">{r.transactions}</td>
                    <td className="border border-[#1e2a44] p-2">{r.revenue}</td>
                    <td className="border border-[#1e2a44] p-2">{r.averageCheck}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
