"use client";
import { useState } from 'react';
import { ttlReconciliation, type TtlRecon } from '../../lib/ttl';

export default function TtlPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [cutoff, setCutoff] = useState<string>(new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10));
  const [data, setData] = useState<TtlRecon | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await ttlReconciliation(merchantId, cutoff);
      setData(d); setMsg('');
    } catch (e:any) { setMsg(String(e?.message||e)); }
    finally { setLoading(false); }
  };

  const csvUrl = `/api/admin/merchants/${encodeURIComponent(merchantId)}/ttl/reconciliation.csv?cutoff=${encodeURIComponent(cutoff)}`;

  return (
    <div>
      <h2>TTL Reconciliation</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <label>Cutoff (ISO date): <input value={cutoff} onChange={e=>setCutoff(e.target.value)} /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Построить</button>
        {data && <a href={csvUrl} download style={{ color: '#89b4fa' }}>Скачать CSV</a>}
      </div>
      {msg && <div style={{ color: '#f38ba8' }}>{msg}</div>}
      {data && (
        <div style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
          <div style={{ marginBottom: 8 }}>Итоги: expiredRemain=<b>{data.totals.expiredRemain}</b>, burned=<b>{data.totals.burned}</b>, diff=<b>{data.totals.diff}</b></div>
          <div style={{ display: 'grid', gap: 6 }}>
            {data.items.slice(0, 200).map(it => (
              <div key={it.customerId} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, background: '#101828', padding: 8, borderRadius: 6 }}>
                <div style={{ opacity: 0.8 }}>{it.customerId}</div>
                <div>expiredRemain: <b>{it.expiredRemain}</b></div>
                <div>burned: <b>{it.burned}</b></div>
                <div>diff: <b style={{ color: it.diff !== 0 ? '#f9e2af' : '#a6e3a1' }}>{it.diff}</b></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

