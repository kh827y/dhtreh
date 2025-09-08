'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || '';

type Outlet = { id: string; name: string; address?: string|null; createdAt: string };

export default function OutletsPage() {
  const [items, setItems] = useState<Outlet[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`${API}/merchants/${MERCHANT}/outlets`, { headers: { 'x-admin-key': ADMIN_KEY } });
      if (!r.ok) throw new Error(await r.text());
      setItems(await r.json());
    } catch (e: any) { setMsg('Ошибка: ' + e?.message); } finally { setLoading(false); }
  }
  async function create() {
    setMsg('');
    try {
      const r = await fetch(`${API}/merchants/${MERCHANT}/outlets`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY }, body: JSON.stringify({ name, address }) });
      if (!r.ok) throw new Error(await r.text());
      setName(''); setAddress('');
      await load();
    } catch (e: any) { setMsg('Ошибка: ' + e?.message); }
  }
  async function save(o: Outlet) {
    const r = await fetch(`${API}/merchants/${MERCHANT}/outlets/${o.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY }, body: JSON.stringify({ name: o.name, address: o.address||'' }) });
    if (!r.ok) alert(await r.text());
  }
  async function del(id: string) {
    if (!confirm('Удалить точку?')) return;
    const r = await fetch(`${API}/merchants/${MERCHANT}/outlets/${id}`, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } });
    if (!r.ok) return alert(await r.text());
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Торговые точки</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <a href="/">← Настройки</a>
        <a href="/outbox">Outbox</a>
        <a href="/devices">Devices</a>
        <a href="/staff">Staff</a>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" style={{ padding: 8, flex: 1 }} />
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Адрес" style={{ padding: 8, flex: 2 }} />
        <button onClick={create} style={{ padding: '8px 12px' }}>Добавить</button>
      </div>
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {items.map(o => (
          <div key={o.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={o.name} onChange={(e) => setItems(prev => prev.map(x => x.id===o.id?{...x,name:e.target.value}:x))} style={{ padding: 8, flex: 1 }} />
              <input value={o.address||''} onChange={(e) => setItems(prev => prev.map(x => x.id===o.id?{...x,address:e.target.value}:x))} style={{ padding: 8, flex: 2 }} />
              <button onClick={() => save(o)} style={{ padding: '6px 10px' }}>Сохранить</button>
              <button onClick={() => del(o.id)} style={{ padding: '6px 10px' }}>Удалить</button>
            </div>
            <div style={{ color: '#666' }}>Создано: {new Date(o.createdAt).toLocaleString()}</div>
          </div>
        ))}
        {(!items.length && !loading) && <div style={{ color: '#666' }}>Пока нет точек</div>}
      </div>
    </main>
  );
}

