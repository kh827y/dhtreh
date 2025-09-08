'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || '';

type Receipt = { id: string; orderId: string; customerId: string; total: number; eligibleTotal: number; redeemApplied: number; earnApplied: number; createdAt: string; outletId?: string|null; deviceId?: string|null; staffId?: string|null };

export default function ReceiptsPage() {
  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [limit, setLimit] = useState(50);
  const [orderId, setOrderId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [before, setBefore] = useState<string>('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const url = new URL(`${API}/merchants/${MERCHANT}/receipts`);
      if (limit) url.searchParams.set('limit', String(limit));
      if (orderId) url.searchParams.set('orderId', orderId);
      if (customerId) url.searchParams.set('customerId', customerId);
      if (before) url.searchParams.set('before', before);
      const r = await fetch(url.toString(), { headers: { 'x-admin-key': ADMIN_KEY } });
      if (!r.ok) throw new Error(await r.text());
      setItems(await r.json());
    } catch (e: any) { setMsg('Ошибка: ' + e?.message); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Чеки</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <a href="/">← Настройки</a>
        <a href="/outbox">Outbox</a>
        <a href="/outlets">Outlets</a>
        <a href="/devices">Devices</a>
        <a href="/staff">Staff</a>
        <a href="/txns">Txns</a>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>orderId: <input value={orderId} onChange={(e) => setOrderId(e.target.value)} /></label>
        <label>customerId: <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} /></label>
        <label>Limit: <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value)||50)} style={{ width: 80 }} /></label>
        <label>Before: <input type="datetime-local" value={before} onChange={(e) => setBefore(e.target.value)} /></label>
        <a href={`${API}/merchants/${MERCHANT}/receipts.csv`} target="_blank" rel="noreferrer">Экспорт CSV</a>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
      </div>
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {items.map(r => (
          <div key={r.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>Заказ <a href={`/receipts/${r.id}`}>{r.orderId}</a></b>
              <span>{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <div>Клиент: <code>{r.customerId}</code> · Итого: {r.total} ₽ · База: {r.eligibleTotal} ₽ · Списано: {r.redeemApplied} · Начислено: {r.earnApplied}</div>
            <div style={{ color: '#666' }}>Outlet: {r.outletId||'-'} · Device: {r.deviceId||'-'} · Staff: {r.staffId||'-'}</div>
          </div>
        ))}
        {(!items.length && !loading) && <div style={{ color: '#666' }}>Нет чеков</div>}
      </div>
    </main>
  );
}
