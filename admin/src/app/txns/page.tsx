'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || '';

type Txn = { id: string; type: string; amount: number; orderId?: string|null; customerId: string; createdAt: string; outletId?: string|null; deviceId?: string|null; staffId?: string|null };

export default function TxnsPage() {
  const [items, setItems] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [limit, setLimit] = useState(50);
  const [type, setType] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [outletId, setOutletId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [before, setBefore] = useState<string>('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const url = new URL(`${API}/merchants/${MERCHANT}/transactions`);
      if (limit) url.searchParams.set('limit', String(limit));
      if (type) url.searchParams.set('type', type);
      if (customerId) url.searchParams.set('customerId', customerId);
      if (outletId) url.searchParams.set('outletId', outletId);
      if (deviceId) url.searchParams.set('deviceId', deviceId);
      if (staffId) url.searchParams.set('staffId', staffId);
      if (before) url.searchParams.set('before', before);
      const r = await fetch(url.toString(), { headers: { 'x-admin-key': ADMIN_KEY } });
      if (!r.ok) throw new Error(await r.text());
      setItems(await r.json());
    } catch (e: any) { setMsg('Ошибка: ' + e?.message); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Транзакции</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <a href="/">← Настройки</a>
        <a href="/outbox">Outbox</a>
        <a href="/outlets">Outlets</a>
        <a href="/devices">Devices</a>
        <a href="/staff">Staff</a>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Тип: <input value={type} onChange={(e) => setType(e.target.value)} placeholder="EARN/REDEEM/REFUND" /></label>
        <label>Клиент: <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="customerId" /></label>
        <label>Outlet: <input value={outletId} onChange={(e) => setOutletId(e.target.value)} placeholder="outletId" /></label>
        <label>Device: <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="deviceId" /></label>
        <label>Staff: <input value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="staffId" /></label>
        <label>Limit: <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value)||50)} style={{ width: 80 }} /></label>
        <label>Before: <input type="datetime-local" value={before} onChange={(e) => setBefore(e.target.value)} /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
      </div>
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {items.map(tx => (
          <div key={tx.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>{tx.type}</b>
              <span>{new Date(tx.createdAt).toLocaleString()}</span>
            </div>
            <div>Клиент: <code>{tx.customerId}</code> · Сумма: <b>{tx.amount>0?'+':''}{tx.amount}</b> ₽ {tx.orderId ? `· Заказ: ${tx.orderId}` : ''}</div>
            <div style={{ color: '#666' }}>Outlet: {tx.outletId||'-'} · Device: {tx.deviceId||'-'} · Staff: {tx.staffId||'-'}</div>
          </div>
        ))}
        {(!items.length && !loading) && <div style={{ color: '#666' }}>Нет транзакций</div>}
      </div>
    </main>
  );
}

