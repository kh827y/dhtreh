"use client";

import { useState } from "react";
import { getRfmHeatmap } from "../../../lib/admin";

type Heat = { grid: number[][]; totals: { count: number } };

export default function RfmHeatmapPage() {
  const [merchantId, setMerchantId] = useState("");
  const [data, setData] = useState<Heat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|undefined>();

  const load = async () => {
    if (!merchantId) { setError("Укажите merchantId"); return; }
    setLoading(true); setError(undefined);
    try {
      const res = await getRfmHeatmap(merchantId);
      setData(res);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  // Градиент: чем больше count от max, тем насыщеннее цвет
  const cellBg = (v: number, max: number) => {
    const ratio = max > 0 ? v / max : 0;
    const alpha = Math.max(0.06, Math.min(1, ratio));
    return `rgba(59, 130, 246, ${alpha})`; // blue-500 alpha
  };

  const maxVal = data ? Math.max(1, ...data.grid.flat()) : 1;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">RFM Heatmap (R x F)</h1>
      <p className="text-sm text-[#9fb0c9]">RFM — это метод сегментации клиентов по трем осям: R (Recency — давность покупки), F (Frequency — частота покупок), M (Monetary — денежная ценность). На тепловой карте ниже показаны группы по R×F: чем выше значение, тем насыщеннее цвет. Это помогает быстро выявить «ядро» лояльных клиентов и группы для ре‑активации.</p>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-sm text-gray-500">merchantId</label>
          <input className="border rounded p-2" placeholder="MERCHANT-ID" value={merchantId} onChange={e=>setMerchantId(e.target.value)} />
        </div>
        <button disabled={loading} onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">{loading?"Загрузка...":"Загрузить"}</button>
        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>

      {data && (
        <div className="space-y-2">
          <div className="text-sm text-gray-500">Всего клиентов: {data.totals.count}</div>
          <div className="overflow-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="border p-2">R\F</th>
                  {[1,2,3,4,5].map(f => <th key={f} className="border p-2 text-center">F{f}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.grid.map((row, ri) => (
                  <tr key={ri}>
                    <td className="border p-2 font-semibold">R{5-ri}</td>
                    {row.map((v, ci) => (
                      <td key={ci} className="border p-2 text-center" style={{ backgroundColor: cellBg(v, maxVal) }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
