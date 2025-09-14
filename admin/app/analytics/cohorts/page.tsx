"use client";

import { useEffect, useMemo, useState } from "react";
import { getRetentionCohorts } from "../../../lib/admin";

type CohortRow = { cohort: string; from: string; to: string; size: number; retention: number[] };

export default function CohortsPage() {
  const [merchantId, setMerchantId] = useState("");
  const [groupBy, setGroupBy] = useState<"month"|"week">("month");
  const [limit, setLimit] = useState(6);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [error, setError] = useState<string|undefined>(undefined);

  const maxShifts = useMemo(() => rows.reduce((m, r) => Math.max(m, r.retention.length), 0), [rows]);

  const load = async () => {
    if (!merchantId) { setError("Укажите merchantId"); return; }
    setLoading(true); setError(undefined);
    try {
      const data = await getRetentionCohorts(merchantId, groupBy, limit);
      setRows(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // no auto load
  }, []);

  const cellColor = (v: number) => {
    // 0..100 -> light..dark green
    const alpha = Math.min(1, Math.max(0.05, v / 100));
    return `rgba(16, 185, 129, ${alpha})`; // emerald-500 with variable alpha
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Когорты удержания</h1>
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-sm text-gray-500">merchantId</label>
          <input className="border rounded p-2" placeholder="MERCHANT-ID" value={merchantId} onChange={e=>setMerchantId(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm text-gray-500">Группировка</label>
          <select className="border rounded p-2" value={groupBy} onChange={e=>setGroupBy(e.target.value as any)}>
            <option value="month">По месяцам</option>
            <option value="week">По неделям</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-500">К-во когорт</label>
          <input type="number" className="border rounded p-2 w-24" value={limit} onChange={e=>setLimit(Math.max(1, Math.min(24, parseInt(e.target.value||"6", 10)||6)))} />
        </div>
        <button disabled={loading} onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">{loading?"Загрузка...":"Загрузить"}</button>
        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>

      {rows.length > 0 && (
        <div className="overflow-auto">
          <table className="min-w-max border-collapse">
            <thead>
              <tr>
                <th className="border p-2 sticky left-0 bg-white">Когорта</th>
                <th className="border p-2 sticky left-[120px] bg-white">Размер</th>
                {Array.from({ length: maxShifts }).map((_, i) => (
                  <th key={i} className="border p-2">+{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cohort}>
                  <td className="border p-2 sticky left-0 bg-white whitespace-nowrap">{r.cohort}</td>
                  <td className="border p-2 sticky left-[120px] bg-white">{r.size}</td>
                  {Array.from({ length: maxShifts }).map((_, j) => {
                    const v = r.retention[j] ?? 0;
                    return (
                      <td key={j} className="border p-2 text-center" style={{ backgroundColor: cellColor(v) }}>{v.toFixed(1)}%</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
