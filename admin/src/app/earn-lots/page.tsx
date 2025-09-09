'use client';

import { useEffect, useState } from 'react';

const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

type Lot = {
  id: string;
  customerId: string;
  points: number;
  consumedPoints: number;
  earnedAt: string;
  expiresAt?: string|null;
  orderId?: string|null;
  receiptId?: string|null;
  outletId?: string|null;
  deviceId?: string|null;
  staffId?: string|null;
};

export default function EarnLotsPage() {
  const [items, setItems] = useState<Lot[]>([]);
  const [limit, setLimit] = useState(50);
  const [before, setBefore] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const url = new URL(`/api/admin/merchants/${MERCHANT}/earn-lots`, window.location.origin);
      url.searchParams.set('limit', String(limit));
      if (before) url.searchParams.set('before', before);
      if (customerId) url.searchParams.set('customerId', customerId);
      if (activeOnly) url.searchParams.set('activeOnly', '1');
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error(await r.text());
      setItems(await r.json());
    } catch (e:any) { setMsg('Ошибка: ' + e?.message); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const csvHref = (() => {
    const p = new URLSearchParams();
    p.set('limit', String(limit));
    if (before) p.set('before', before);
    if (customerId) p.set('customerId', customerId);
    if (activeOnly) p.set('activeOnly', '1');
    return `/api/admin/merchants/${MERCHANT}/earn-lots.csv?` + p.toString();
  })();

  return (
    <main style={{ maxWidth: 980, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Earn Lots</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <a href="/">← Настройки</a>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Limit: <input type="number" value={limit} onChange={(e)=>setLimit(Number(e.target.value)||50)} style={{ width: 90 }} /></label>
        <label>Before: <input type="datetime-local" value={before} onChange={(e)=>setBefore(e.target.value)} /></label>
        <label>CustomerId: <input value={customerId} onChange={(e)=>setCustomerId(e.target.value)} /></label>
        <label style={{ display: 'flex', alignItems:'center', gap: 6 }}>
          <input type="checkbox" checked={activeOnly} onChange={(e)=>setActiveOnly(e.target.checked)} /> Только активные
        </label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
        <a href={csvHref} target="_blank">CSV</a>
      </div>
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {items.map(l => (
          <div key={l.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div><b>{l.points - (l.consumedPoints||0)} / {l.points}</b> баллов</div>
              <div style={{ color: '#666' }}>{new Date(l.earnedAt).toLocaleString()} {l.expiresAt?`→ до ${new Date(l.expiresAt).toLocaleString()}`:''}</div>
            </div>
            <div style={{ color: '#555', marginTop: 4 }}>
              Customer: <code>{l.customerId}</code>
              {l.orderId ? <> · Order: <code>{l.orderId}</code></> : null}
              {l.receiptId ? <> · Receipt: <code>{l.receiptId}</code></> : null}
            </div>
          </div>
        ))}
        {(!items.length && !loading) && <div style={{ color: '#666' }}>Нет данных</div>}
      </div>
    </main>
  );
}

