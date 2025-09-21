"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type Device = { id: string; type: string; outletId?: string|null; label?: string|null; lastSeenAt?: string|null; createdAt?: string };

export default function DevicesPage() {
  React.useEffect(() => { try { window.location.replace('/outlets'); } catch {} }, []);
  const [items, setItems] = React.useState<Device[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [type, setType] = React.useState('SMART');
  const [outletId, setOutletId] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [msg, setMsg] = React.useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const res = await fetch('/api/portal/devices');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);

  async function createDevice() {
    setCreating(true); setMsg('');
    try {
      const r = await fetch('/api/portal/devices', { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ type, outletId: outletId || undefined, label: label || undefined }) });
      if (!r.ok) throw new Error(await r.text());
      setType('SMART'); setOutletId(''); setLabel('');
      await load();
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setCreating(false); }
  }

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Устройства (устарело)</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Раздел объединён с «Точками». Вы будете перенаправлены автоматически.</div>
        </div>
      </div>
      <Card>
        <CardHeader title="Раздел устарел" />
        <CardBody>
          <div style={{ opacity:.8 }}>Используйте раздел «Точки» для управления оборудованием.</div>
        </CardBody>
      </Card>
    </div>
  );
}
