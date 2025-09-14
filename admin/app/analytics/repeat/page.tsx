"use client";

import { useEffect, useMemo, useState } from "react";
import { getRepeatPurchasesAnalytics } from "../../../lib/admin";
import KpiCard from "../../../components/KpiCard";
import TopBar from "../../../components/TopBar";
import Card from "../../../components/ui/Card";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import Skeleton from "../../../components/ui/Skeleton";

export default function RepeatPurchasesPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const [period, setPeriod] = useState<string>("month");
  const [outletId, setOutletId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  const load = async () => {
    setBusy(true); setError(null);
    try { setData(await getRepeatPurchasesAnalytics(merchantId, { period, outletId: outletId || undefined })); } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  const bars = useMemo(() => (data?.histogram || []).slice(0, 20), [data]);

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
        rightSlot={
          <div className="flex items-end gap-2">
            <Input label="Торговая точка" placeholder="outletId (необязательно)" value={outletId} onChange={e=>setOutletId(e.target.value)} />
            <Button variant="outline" onClick={load} disabled={busy}>Применить</Button>
          </div>
        }
      />

      {busy && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Уникальных покупателей" value={data?.uniqueBuyers ?? '—'} />
          <KpiCard title="Новые покупатели" value={data?.newBuyers ?? '—'} />
          <KpiCard title="Повторные покупатели" value={data?.repeatBuyers ?? '—'} />
        </div>
      )}

      <Card title="Сколько покупок приходится на одного покупателя">
        {busy && !data ? (
          <Skeleton className="h-48" />
        ) : bars.length === 0 ? (
          <div className="text-sm text-[#7f8ea3]">Нет данных</div>
        ) : (
          <div className="flex items-end gap-4">
            {bars.map((b: any) => (
              <div key={b.purchases} className="text-center">
                <div className="mx-auto w-8 bg-[#22c55e] rounded" style={{ height: Math.max(4, Math.min(140, b.customers)) }} />
                <div className="text-xs mt-1 text-[#9fb0c9]">{b.purchases}</div>
                <div className="text-xs mt-1 text-[#7f8ea3]">{b.customers}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
