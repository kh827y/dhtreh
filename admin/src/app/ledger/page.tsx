'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

type Entry = {
  id: string;
  customerId?: string|null;
  debit: string;
  credit: string;
  amount: number;
  orderId?: string|null;
  receiptId?: string|null;
  createdAt: string;
  outletId?: string|null;
  outletPosType?: string|null;
  outletLastSeenAt?: string|null;
  staffId?: string|null;
};

export default function LedgerPage() {
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [limit, setLimit] = useState(50);
  const [before, setBefore] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const url = new URL(`/api/admin/merchants/${MERCHANT}/ledger`, window.location.origin);
      url.searchParams.set('limit', String(limit));
      if (before) url.searchParams.set('before', before);
      if (from) url.searchParams.set('from', from);
      if (to) url.searchParams.set('to', to);
      if (type) url.searchParams.set('type', type);
      if (customerId) url.searchParams.set('customerId', customerId);
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error(await r.text());
      setItems(await r.json());
    } catch (e: unknown) { setMsg('Ошибка: ' + (e instanceof Error ? e.message : String(e))); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 980, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Ledger Entries</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <Link href="/">← Настройки</Link>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Limit: <input type="number" value={limit} onChange={(e)=>setLimit(Number(e.target.value)||50)} style={{ width: 90 }} /></label>
        <label>Before: <input type="datetime-local" value={before} onChange={(e)=>setBefore(e.target.value)} /></label>
        <label>From: <input type="datetime-local" value={from} onChange={(e)=>setFrom(e.target.value)} /></label>
        <label>To: <input type="datetime-local" value={to} onChange={(e)=>setTo(e.target.value)} /></label>
        <label>CustomerId: <input value={customerId} onChange={(e)=>setCustomerId(e.target.value)} /></label>
        <label>Type: 
          <select value={type} onChange={(e)=>setType(e.target.value)}>
            <option value="">(любая)</option>
            <option value="earn">earn</option>
            <option value="redeem">redeem</option>
            <option value="refund_restore">refund_restore</option>
            <option value="refund_revoke">refund_revoke</option>
          </select>
        </label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
        <a href={`/api/admin/merchants/${MERCHANT}/ledger.csv?${new URLSearchParams({ customerId: customerId||'', from: from||'', to: to||'', type: type||'' }).toString()}`} target="_blank">CSV</a>
      </div>
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {items.map(e => (
          <div key={e.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div><b>{e.debit} → {e.credit}</b> · {e.amount} ₽</div>
              <div style={{ color: '#666' }}>{new Date(e.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ color: '#555', marginTop: 4 }}>
              {[
                e.customerId ? <>Customer: <code>{e.customerId}</code></> : null,
                e.orderId ? <>Order: <code>{e.orderId}</code></> : null,
                e.receiptId ? <>Receipt: <code>{e.receiptId}</code></> : null,
                e.staffId ? <>Staff: <code>{e.staffId}</code></> : null,
                e.outletId ? <>Outlet: <code>{e.outletId}</code></> : null,
                e.outletPosType ? <>POS: <code>{e.outletPosType}</code></> : null,
                e.outletLastSeenAt ? <>Last seen: {new Date(e.outletLastSeenAt).toLocaleString()}</> : null,
              ]
                .filter(Boolean)
                .map((node, idx) => <span key={idx}>{idx > 0 ? ' · ' : null}{node}</span>)}
            </div>
          </div>
        ))}
        {(!items.length && !loading) && <div style={{ color: '#666' }}>Нет записей</div>}
      </div>
    </main>
  );
}
