"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type Outlet = { id: string; name: string; address?: string|null; createdAt?: string };

export default function OutletsPage() {
  const [items, setItems] = React.useState<Outlet[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [msg, setMsg] = React.useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const res = await fetch('/api/portal/outlets');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);

  async function createOutlet() {
    setCreating(true); setMsg('');
    try {
      const r = await fetch('/api/portal/outlets', { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name, address: address || undefined }) });
      if (!r.ok) throw new Error(await r.text());
      setName(''); setAddress('');
      await load();
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setCreating(false); }
  }

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Точки</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Список торговых точек</div>
        </div>
      </div>
      <Card>
        <CardHeader title="Добавить точку" />
        <CardBody>
          <div style={{ display:'grid', gap: 8, gridTemplateColumns:'1fr 1fr auto' }}>
            <input placeholder="Название" value={name} onChange={e=>setName(e.target.value)} style={{ padding:8 }} />
            <input placeholder="Адрес (опц.)" value={address} onChange={e=>setAddress(e.target.value)} style={{ padding:8 }} />
            <Button variant="primary" onClick={createOutlet} disabled={!name.trim() || creating}>{creating ? 'Создание...' : 'Создать'}</Button>
          </div>
          {msg && <div style={{ marginTop: 8, color: '#f87171' }}>{msg}</div>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Список точек" />
        <CardBody>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display:'grid', gap: 8 }}>
              {items.map(o => (
                <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 160px', gap: 8, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <div>{o.name}</div>
                  <div style={{ opacity:.9 }}>{o.address || <span style={{ opacity:.6 }}>—</span>}</div>
                  <div style={{ opacity:.8 }}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</div>
                </div>
              ))}
              {!items.length && <div style={{ opacity:.7 }}>Нет точек</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
