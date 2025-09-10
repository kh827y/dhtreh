"use client";
import { useEffect, useState } from 'react';
import { listAudit, type AuditItem } from '../../lib/audit';

export default function AuditPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || '');
  const [items, setItems] = useState<AuditItem[]>([]);
  const [limit, setLimit] = useState<number>(50);
  const [before, setBefore] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  async function load() {
    setLoading(true);
    try {
      const r = await listAudit({ merchantId: merchantId || undefined, limit, before: before || undefined });
      setItems(r);
      setMsg('');
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load().catch(()=>{}); }, []);

  return (
    <div>
      <h2>Admin Audit</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} style={{ marginLeft: 8 }} placeholder="опц." /></label>
        <label>Лимит: <input type="number" value={limit} onChange={e=>setLimit(parseInt(e.target.value||'50',10))} style={{ marginLeft: 8, width: 90 }} /></label>
        <label>До (ISO): <input value={before} onChange={e=>setBefore(e.target.value)} style={{ marginLeft: 8, width: 220 }} placeholder="2025-09-01T00:00:00Z" /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
      </div>
      {msg && <div style={{ color: '#f38ba8', marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(it => (
          <div key={it.id} style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div><b>{new Date(it.createdAt).toLocaleString()}</b> • {it.actor} • {it.method}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>path: {it.path} {it.merchantId ? `• merchantId: ${it.merchantId}` : ''}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{it.id}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

