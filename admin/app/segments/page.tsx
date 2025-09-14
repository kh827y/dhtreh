"use client";

import { useEffect, useState } from "react";
import { createDefaultSegments, getSegmentsAdmin, recalcSegment, segmentCustomersCsvUrl, type SegmentInfo } from "../../lib/admin";

export default function SegmentsPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const [items, setItems] = useState<SegmentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  const load = async () => {
    if (!merchantId) return;
    setLoading(true); setMessage("");
    try {
      const rows = await getSegmentsAdmin(merchantId);
      setItems(rows);
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const doDefaults = async () => {
    setLoading(true); setMessage("");
    try { await createDefaultSegments(merchantId); await load(); }
    catch (e: any) { setMessage(e?.message || String(e)); }
    finally { setLoading(false); }
  };
  const doRecalc = async (segmentId: string) => {
    setLoading(true); setMessage("");
    try { await recalcSegment(segmentId); setMessage("Сегмент пересчитан"); }
    catch (e: any) { setMessage(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display:'grid', gap:12 }}>
      <h2>Сегменты клиентов</h2>
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <button onClick={load} disabled={loading} style={{ padding:'6px 10px' }}>{loading? 'Загрузка...' : 'Обновить'}</button>
        <button onClick={doDefaults} disabled={loading} style={{ padding:'6px 10px' }}>Создать стандартные сегменты</button>
        {message && <span style={{ color:'#a6e3a1' }}>{message}</span>}
      </div>

      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom:'1px solid #1e2a44', textAlign:'left', padding:8 }}>ID</th>
              <th style={{ borderBottom:'1px solid #1e2a44', textAlign:'left', padding:8 }}>Название</th>
              <th style={{ borderBottom:'1px solid #1e2a44', textAlign:'left', padding:8 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map(s => (
              <tr key={s.id}>
                <td style={{ borderBottom:'1px solid #1e2a44', padding:8 }}>{s.id}</td>
                <td style={{ borderBottom:'1px solid #1e2a44', padding:8 }}>{s.name}</td>
                <td style={{ borderBottom:'1px solid #1e2a44', padding:8, display:'flex', gap:8, flexWrap:'wrap' }}>
                  <a href={segmentCustomersCsvUrl(merchantId, s.id)} download style={{ color:'#89b4fa' }}>Экспорт CSV</a>
                  <button onClick={()=>doRecalc(s.id)} disabled={loading} style={{ padding:'4px 8px' }}>Пересчитать</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding:8, opacity:0.8 }}>Нет сегментов</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
