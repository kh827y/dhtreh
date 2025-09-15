'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

type Device = { id: string; type: string; outletId?: string|null; label?: string|null; createdAt: string };
type Outlet = { id: string; name: string };

export default function DevicesPage() {
  const [items, setItems] = useState<Device[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [type, setType] = useState('VIRTUAL');
  const [label, setLabel] = useState('');
  const [outletId, setOutletId] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [lastSecret, setLastSecret] = useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const [rd, ro] = await Promise.all([
        fetch(`/api/admin/merchants/${MERCHANT}/devices`),
        fetch(`/api/admin/merchants/${MERCHANT}/outlets`),
      ]);
      if (!rd.ok) throw new Error(await rd.text());
      if (!ro.ok) throw new Error(await ro.text());
      setItems(await rd.json());
      setOutlets(await ro.json());
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); } finally { setLoading(false); }
  }
  async function create() {
    setMsg('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/devices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, outletId: outletId||undefined, label }) });
      if (!r.ok) throw new Error(await r.text());
      setType('VIRTUAL'); setLabel(''); setOutletId('');
      await load();
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); }
  }
  async function save(d: Device) {
    const r = await fetch(`/api/admin/merchants/${MERCHANT}/devices/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outletId: d.outletId||undefined, label: d.label||undefined }) });
    if (!r.ok) alert(await r.text());
  }
  async function del(id: string) {
    if (!confirm('Удалить устройство?')) return;
    const r = await fetch(`/api/admin/merchants/${MERCHANT}/devices/${id}`, { method: 'DELETE' });
    if (!r.ok) return alert(await r.text());
    load();
  }
  async function issueSecret(id: string) {
    setMsg(''); setLastSecret('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/devices/${id}/secret`, { method: 'POST' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setLastSecret(data.secret || '');
      await load();
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); }
  }
  async function revokeSecret(id: string) {
    setMsg(''); setLastSecret('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/devices/${id}/secret`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await r.text());
      await load();
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Устройства</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <Link href="/">← Настройки</Link>
        <Link href="/outbox">Outbox</Link>
        <Link href="/outlets">Outlets</Link>
        <Link href="/staff">Staff</Link>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: 8 }}>
          <option value="VIRTUAL">VIRTUAL</option>
          <option value="PC_POS">PC_POS</option>
          <option value="SMART">SMART</option>
        </select>
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)} style={{ padding: 8 }}>
          <option value="">(без точки)</option>
          {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Метка" style={{ padding: 8, flex: 1 }} />
        <button onClick={create} style={{ padding: '8px 12px' }}>Добавить</button>
      </div>
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      {lastSecret && <div style={{ marginTop: 8, color: '#0a0' }}>Bridge Secret: <code>{lastSecret}</code> (сохраните сейчас — повторно не показывается)</div>}
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {items.map(d => (
          <div key={d.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 120 }}><b>{d.type}</b></div>
              <select value={d.outletId||''} onChange={(e) => setItems(prev => prev.map(x => x.id===d.id?{...x,outletId: e.target.value||null }:x))} style={{ padding: 8 }}>
                <option value="">(без точки)</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <input value={d.label||''} onChange={(e) => setItems(prev => prev.map(x => x.id===d.id?{...x,label:e.target.value||null}:x))} style={{ padding: 8, flex: 1 }} />
              <button onClick={() => save(d)} style={{ padding: '6px 10px' }}>Сохранить</button>
              <button onClick={() => issueSecret(d.id)} style={{ padding: '6px 10px' }}>Выдать секрет</button>
              <button onClick={() => revokeSecret(d.id)} style={{ padding: '6px 10px' }}>Отозвать</button>
              <button onClick={() => del(d.id)} style={{ padding: '6px 10px' }}>Удалить</button>
            </div>
            <div style={{ color: '#666' }}>Создано: {new Date(d.createdAt).toLocaleString()}</div>
          </div>
        ))}
        {(!items.length && !loading) && <div style={{ color: '#666' }}>Пока нет устройств</div>}
      </div>
    </main>
  );
}
