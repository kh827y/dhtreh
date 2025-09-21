"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type Integration = { id: string; type: string; provider: string; isActive: boolean; lastSync?: string|null; errorCount: number };

export default function IntegrationsPage() {
  const [items, setItems] = React.useState<Integration[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const res = await fetch('/api/portal/integrations');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Интеграции</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Bridge / POS / CRM / Payments</div>
        </div>
        <Button variant="primary" disabled>Подключить интеграцию</Button>
      </div>
      <Card>
        <CardHeader title="Подключённые интеграции" />
        <CardBody>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display:'grid', gap: 8 }}>
              {items.map(it => (
                <div key={it.id} style={{ display:'grid', gridTemplateColumns:'1fr 160px 160px 160px 120px', gap: 8, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{it.provider}</div>
                    <div style={{ opacity:.8, fontSize:12 }}>{it.type}</div>
                  </div>
                  <div style={{ opacity:.9 }}>{it.isActive ? 'Активна' : 'Отключена'}</div>
                  <div style={{ opacity:.9 }}>{it.lastSync ? new Date(it.lastSync).toLocaleString() : '—'}</div>
                  <div style={{ opacity:.9 }}>Ошибки: {it.errorCount}</div>
                  <div style={{ display:'flex', justifyContent:'flex-end' }}>
                    <Button size="sm" disabled>Подробнее</Button>
                  </div>
                </div>
              ))}
              {!items.length && <div style={{ opacity:.7 }}>Интеграции не подключены</div>}
              {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
