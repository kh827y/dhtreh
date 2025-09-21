"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type Found = { customerId: string; phone?: string|null; balance: number } | null;

export default function CustomersPage() {
  const [phone, setPhone] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [found, setFound] = React.useState<Found>(null);
  const [msg, setMsg] = React.useState('');

  async function search() {
    setLoading(true); setMsg(''); setFound(null);
    try {
      const p = phone.replace(/\D+/g, '');
      const res = await fetch(`/api/portal/customer/search?phone=${encodeURIComponent(p)}`);
      const data = await res.json();
      setFound(data || null);
      if (!data) setMsg('Клиент не найден');
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <Card>
        <CardHeader title="Клиенты" subtitle="Поиск по телефону, краткая сводка" />
        <CardBody>
          <div style={{ display:'grid', gap: 12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap: 8 }}>
              <input placeholder="Телефон" value={phone} onChange={e=>setPhone(e.target.value)} style={{ padding:8 }} />
              <Button onClick={search} disabled={!phone.trim() || loading}>{loading ? 'Поиск...' : 'Найти'}</Button>
            </div>
            {loading ? (
              <Skeleton height={120} />
            ) : found ? (
              <div style={{ display:'grid', gap: 6 }}>
                <div><b>ID клиента:</b> {found.customerId}</div>
                <div><b>Телефон:</b> {found.phone || '—'}</div>
                <div><b>Баланс:</b> {found.balance}</div>
              </div>
            ) : (
              <div style={{ opacity:.7 }}>Введите телефон и нажмите «Найти»</div>
            )}
            {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
