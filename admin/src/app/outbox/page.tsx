'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || '';

type Ev = {
  id: string;
  merchantId: string;
  eventType: string;
  payload: any;
  status: 'PENDING'|'SENDING'|'SENT'|'FAILED'|string;
  retries: number;
  nextRetryAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export default function OutboxPage() {
  const [items, setItems] = useState<Ev[]>([]);
  const [status, setStatus] = useState<string>('');
  const [limit, setLimit] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const url = new URL(`${API}/merchants/${MERCHANT}/outbox`);
      if (status) url.searchParams.set('status', status);
      if (limit) url.searchParams.set('limit', String(limit));
      const r = await fetch(url.toString(), { headers: { 'x-admin-key': ADMIN_KEY } });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setItems(data);
    } catch (e: any) {
      setMsg('Ошибка загрузки: ' + e?.message);
    } finally { setLoading(false); }
  }

  async function retry(ev: Ev) {
    setMsg('');
    try {
      const r = await fetch(`${API}/merchants/${MERCHANT}/outbox/${ev.id}/retry`, { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } });
      if (!r.ok) throw new Error(await r.text());
      await load();
      setMsg('Отправка поставлена в очередь');
    } catch (e: any) {
      setMsg('Ошибка ретрая: ' + e?.message);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Outbox событий</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <a href="/">← Настройки</a>
        <a href="/outlets">Outlets</a>
        <a href="/devices">Devices</a>
        <a href="/staff">Staff</a>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <label>Статус: <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="PENDING/SENT/…" /></label>
        <label>Limit: <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value)||50)} style={{ width: 80 }} /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
      </div>

      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {items.map(ev => (
          <div key={ev.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div><b>{ev.eventType}</b> · <code>{ev.status}</code> · попыток: {ev.retries}</div>
              <div style={{ color: '#666' }}>{new Date(ev.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ marginTop: 6 }}>
              <pre style={{ whiteSpace: 'pre-wrap', overflow: 'auto', background: '#fafafa', padding: 8 }}>{JSON.stringify(ev.payload, null, 2)}</pre>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {ev.lastError && <div style={{ color: '#b00' }}>Ошибка: {ev.lastError}</div>}
              <div style={{ flex: 1 }} />
              <button onClick={() => retry(ev)} style={{ padding: '6px 10px' }}>Ретрай</button>
            </div>
          </div>
        ))}
        {(!items.length && !loading) && <div style={{ color: '#666' }}>Нет событий</div>}
      </div>
    </main>
  );
}

