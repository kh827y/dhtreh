"use client";

import { useEffect, useState } from "react";
import { getBirthdaysAnalytics } from "../../../lib/admin";
import TopBar from "../../../components/TopBar";
import Card from "../../../components/ui/Card";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import Skeleton from "../../../components/ui/Skeleton";

export default function BirthdaysPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const [withinDays, setWithinDays] = useState<number>(30);
  const [limit, setLimit] = useState<number>(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    setBusy(true); setError(null);
    try { setRows(await getBirthdaysAnalytics(merchantId, withinDays, limit)); } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-5">
      <TopBar
        merchantId={merchantId}
        onMerchantIdChange={setMerchantId}
        period={"month"}
        onPeriodChange={() => {}}
        onRefresh={load}
        busy={busy}
        error={error}
        rightSlot={
          <div className="flex items-end gap-2">
            <Input label="В пределах дней" type="number" min={1} max={365} value={withinDays} onChange={e=>setWithinDays(Math.max(1, Math.min(365, parseInt(e.target.value||'30',10))))} className="w-28" />
            <Input label="Лимит" type="number" min={1} max={1000} value={limit} onChange={e=>setLimit(Math.max(1, Math.min(1000, parseInt(e.target.value||'100',10))))} className="w-28" />
            <Button variant="outline" onClick={load} disabled={busy}>Применить</Button>
          </div>
        }
      />

      <Card title="Ближайшие дни рождения">
        {busy && rows.length === 0 ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="overflow-auto">
            <table className="min-w-max border-collapse">
              <thead>
                <tr>
                  <th className="border border-[#1e2a44] p-2">Дата</th>
                  <th className="border border-[#1e2a44] p-2">Клиент</th>
                  <th className="border border-[#1e2a44] p-2">Телефон</th>
                  <th className="border border-[#1e2a44] p-2">Возраст</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="border border-[#1e2a44] p-2">{new Date(r.nextBirthday).toLocaleDateString()}</td>
                    <td className="border border-[#1e2a44] p-2">{r.name || r.customerId}</td>
                    <td className="border border-[#1e2a44] p-2">{r.phone || '—'}</td>
                    <td className="border border-[#1e2a44] p-2 text-center">{r.age}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="p-3 text-sm text-[#7f8ea3]">Нет данных</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
