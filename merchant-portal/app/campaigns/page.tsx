"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

export default function CampaignsPage() {
  type Campaign = {
    id: string;
    name: string;
    status: string;
    type: string;
    startDate?: string | null;
    endDate?: string | null;
    budget?: number | null;
    _count?: { usages?: number };
  };
  const [items, setItems] = React.useState<Campaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const res = await fetch('/api/portal/campaigns');
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
          <div style={{ fontSize: 18, fontWeight: 700 }}>Кампании</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Правила акций, сегменты, расписание</div>
        </div>
        <Button variant="primary" disabled>Новая кампания</Button>
      </div>
      <Card>
        <CardHeader title="Список кампаний" />
        <CardBody>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display:'grid', gap: 8 }}>
              {items.map(c => (
                <div key={c.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 140px 1fr 120px', gap: 8, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{c.name||c.id}</div>
                    <div style={{ opacity:.7, fontSize:12 }}>{c.id}</div>
                  </div>
                  <div><span style={{ padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,.06)' }}>{c.type}</span></div>
                  <div style={{ opacity:.9 }}>{c.status}</div>
                  <div style={{ opacity:.8 }}>{(c.startDate||c.endDate) ? `${c.startDate?new Date(c.startDate).toLocaleDateString():''} - ${c.endDate?new Date(c.endDate).toLocaleDateString():''}` : 'без периода'}</div>
                  <div style={{ textAlign:'right', opacity:.8 }}>{c._count?.usages ?? 0} использ.</div>
                </div>
              ))}
              {!items.length && <div style={{ opacity:.7 }}>Нет кампаний</div>}
              {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
