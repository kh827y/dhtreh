'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

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
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/outlets`);
      if (!r.ok) throw new Error(await r.text());
      setItems(await r.json());
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); } finally { setLoading(false); }
  }
  async function create() {
    setMsg('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/outlets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, address }) });
      if (!r.ok) throw new Error(await r.text());
      setName(''); setAddress('');
      await load();
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); }
  }
  async function save(o: Outlet) {
    const r = await fetch(`/api/admin/merchants/${MERCHANT}/outlets/${o.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: o.name, address: o.address||'' }) });
    if (!r.ok) alert(await r.text());
  }
  async function del(id: string) {
    if (!confirm('Удалить точку?')) return;
    const r = await fetch(`/api/admin/merchants/${MERCHANT}/outlets/${id}`, { method: 'DELETE' });
    if (!r.ok) return alert(await r.text());
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Торговые точки</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <Link href="/">← Настройки</Link>
        <Link href="/outbox">Outbox</Link>
        <Link href="/devices">Devices</Link>
        <Link href="/staff">Staff</Link>
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
